import { BOT_ID_RE, CHAT_INTERVAL, CLOSE_KICKED, CLOSE_REPLACED, CLOSE_ROOM_ENDED, CLOSE_TOO_MANY, IMAGE_BYTES_MAX, isWebp, parseClientMessage, PRESENCE_INTERVAL, SOCKET_IDLE_TIMEOUT, type PlayerStats, type Presence, type RoomInit, type StatName } from '@guess/protocol';
import { FALL_Y, inShoveReach, RESPAWN_MS, SHOVE_COOLDOWN_MS } from '@guess/world';
import { CHARACTERS } from '@guess/rules';
import attackMs from './attacks.json';
import { BotWorld, type Seen } from './bots';
import type { ServerWebSocket } from 'bun';
import { TokenBucket } from './limits';
import type { Log } from './log';
import { createRoom, referencedImages, ROOM_TTL, step, timerKey, type RoomInput, type RoomState } from './room';

/** Uma imagem que nenhum post-it usa ainda espera este tempo pelo `write` que a usa; depois, morre. */
export const IMAGE_GRACE = 2 * 60_000;
/** Imagens soltas (que nenhum post-it usa) por pessoa: além disto, a mais velha morre. */
export const IMAGES_PER_UPLOADER = 2;

/**
 * `now`: hora de nascimento; `ttl`: quanto a sala vive sem atividade; `silence`: quanto um socket pode ficar sem
 * mandar nada antes de ser derrubado (os testes apressam os dois). `clock`: a hora (os testes fixam); `dev`: a sala
 * aceita jogadores falsos; `rng`: o sorteio da sala; `presenceInterval`: o mínimo entre duas presenças repassadas da mesma
 * pessoa; `init`: o que o pré-lobby escolheu ao criar a sala; `botTick`: de quanto em quanto tempo os bots engraçados dão
 * um passo, ms; `chatInterval`: o mínimo entre duas falas da mesma pessoa.
 */
export interface HostOptions { now?: number; ttl?: number; silence?: number; clock?: () => number; dev?: boolean; rng?: () => number; presenceInterval?: number; init?: RoomInit; botTick?: number; chatInterval?: number }

/**
 * O limite por socket (issue #72): toda mensagem menos a presença gasta uma ficha; cabem `MESSAGE_BURST` de uma vez e
 * `MESSAGE_RATE` por segundo depois. Gente de verdade fica bem abaixo: o editor do post-it manda no máximo 10 por segundo,
 * o empurrão uns 2, a fala 1. A que passa é descartada; quem segue estourando (`OVERFLOW_MAX` descartes, que voltam a
 * `OVERFLOW_RATE` por segundo) é fechado com `CLOSE_TOO_MANY`. A presença tem um balde só dela, bem mais largo, contado
 * antes de ler a mensagem (`ANY_BURST`, `ANY_RATE`, para todas): a aba manda ~15 por segundo, e uma enxurrada delas
 * custaria o parser de cada uma.
 */
export const MESSAGE_BURST = 40;
export const MESSAGE_RATE = 20;
export const ANY_BURST = 120;
export const ANY_RATE = 60;
const OVERFLOW_MAX = 60;
const OVERFLOW_RATE = 5;
/** Quantas abas sem apelido (visitantes) uma sala aceita ao mesmo tempo; quem é da turma sempre entra. */
export const VISITORS_MAX = 16;
/** Com o jogo rodando, a presença de alguém da turma conta como atividade, no máximo uma vez por isto (emenda do ADR 0005). */
export const PRESENCE_ACTIVITY_MS = 60_000;
/**
 * Empurrões de uma pessoa: o seguinte só vale `SHOVE_COOLDOWN_MS` menos esta folga (a rede pode juntar dois) depois do
 * anterior; os alvos de um mesmo golpe saem no mesmo quadro e chegam dentro de `VOLLEY_MS`.
 */
const SHOVE_SLACK_MS = 150;
const VOLLEY_MS = 100;

/** De quanto em quanto tempo os bots engraçados dão um passo, ms (30 por segundo); a presença deles sai a cada dois passos. */
export const BOT_TICK = 33;
/** Um bot parado ainda manda a presença dele de vez em quando (quem entra tarde, um pacote perdido). */
const BOT_HEARTBEAT = 1000;

/** O personagem do chefão numa sala de desenvolvimento, se `DEV_BOSS_CHARACTER` diz um lugar que existe. */
function devBossCharacter(): number | undefined {
  const n = Number(process.env.DEV_BOSS_CHARACTER ?? '');
  return process.env.DEV_BOSS_CHARACTER && Number.isInteger(n) && n >= 0 && n < CHARACTERS ? n : undefined;
}

interface StoredImage {
  bytes: Uint8Array<ArrayBuffer>;
  /** id do membro que subiu */
  uploader: string;
  at: number;
  /** algum post-it já usou: quando deixa de usar (trocada, expulso, jogar de novo), morre na hora */
  used: boolean;
}

export type AddImageResult = { ok: true; id: string } | { ok: false; error: 'notMember' | 'tooBig' | 'notWebp' };

/** `ip`: de quem é o socket (o servidor conta quantos cada IP tem aberto). */
export interface SocketData { code: string; token: string; ip: string }
export type Socket = ServerWebSocket<SocketData>;

/**
 * Adaptador de uma sala: guarda os sockets por token, entrega as mensagens que a sala manda e agenda
 * os timers que ela pede (`state.timers`), nunca os seus. Quando a sala morre, fecha todo mundo e avisa.
 * O único timer próprio é o de silêncio: um socket que não manda nada (nem `ping`) por `silence` ms é
 * derrubado como se tivesse caído, e a sala fica sabendo desde quando a pessoa está muda. A rede que morre
 * sem fechar o socket não chega de outro jeito; o `idleTimeout` do Bun é a rede de segurança abaixo deste.
 * Presença e empurrão (ADR 0005) não entram na sala: o host repassa a presença de cada membro aos outros no máximo uma
 * vez por `presenceInterval`, guardando só a mais recente, e entrega o empurrão só a quem foi empurrado.
 * A fala (chat) também passa por fora: o host a repassa na hora a todo mundo, inclusive a quem falou, no máximo uma por
 * `chatInterval` por pessoa (as a mais são descartadas); não guarda nenhuma e não conta como atividade.
 * Os bots engraçados (`bots.ts`, emenda do ADR 0005) são simulados aqui: com a opção ligada e o jogo rodando, um laço
 * dá passos neles, manda a presença de cada um como a de uma pessoa, entrega os empurrões deles e avisa a sala quando a
 * lista de quem está no telhado muda. Fora disso não há laço nenhum.
 * As estatísticas do jogo (issue #59) saem do que já passa por aqui, sem mensagem nova: cada empurrão entregue e cada
 * presença que cai abaixo de `FALL_Y` (uma queda) somam num contador daqui, só com o jogo rodando. Contar não passa pela
 * sala (seria um `step()` por empurrão): os números entram no estado dela antes de cada passo com o jogo rodando, então
 * o snapshot do fim os leva (issue #72).
 * Limites (issue #72): cada socket tem um balde de mensagens (`MESSAGE_BURST`), a presença fora; o empurrão só vale no
 * ritmo do empurrão e ao alcance de quem empurra, pelas últimas presenças; a sala aceita no máximo `VISITORS_MAX`
 * visitantes.
 */
export class RoomHost {
  state: RoomState;
  private readonly sockets = new Map<string, Socket>();
  private readonly handles = new Map<string, ReturnType<typeof setTimeout>>();
  /** por socket: o timer de silêncio */
  private readonly silences = new Map<Socket, ReturnType<typeof setTimeout>>();
  private readonly silence: number;
  private readonly clock: () => number;
  private readonly rng: () => number;
  /** as imagens dos post-its, em bytes; nunca entram no estado puro da sala (ADR 0003) */
  private readonly images = new Map<string, StoredImage>();
  private readonly presenceInterval: number;
  /** por token: a última presença recebida, quando a última foi repassada e o timer da próxima, se a janela ainda não abriu */
  private readonly presences = new Map<string, { latest: Presence; sentAt: number; handle?: ReturnType<typeof setTimeout> }>();
  private readonly chatInterval: number;
  /** por token: quando a última fala foi repassada */
  private readonly chats = new Map<string, number>();
  /** os bots engraçados: o mundo deles, o laço, a hora do último passo e a última presença mandada de cada um */
  private botWorld: BotWorld | null = null;
  private botTimer: ReturnType<typeof setInterval> | undefined;
  private botLast = 0;
  private botTicks = 0;
  private readonly botSent = new Map<string, { raw: string; at: number; presence: Presence }>();
  private readonly botTick: number;
  /** por pessoa: o que fez no telhado neste jogo (issue #59); vai para `state.stats` antes de cada passo da sala */
  private counters: Record<string, PlayerStats> = {};
  /** por token: o balde de toda mensagem, o dos pedidos (tudo menos a presença), o de descartes e quantas foram descartadas */
  private readonly buckets = new Map<string, { any: TokenBucket; requests: TokenBucket; overflow: TokenBucket; dropped: number }>();
  /** por token: o último golpe (quando começou e quem pegou) */
  private readonly shoveVolleys = new Map<string, { at: number; targets: Set<string> }>();
  /** por token: a hora da última queda contada */
  private readonly fallAt = new Map<string, number>();
  /** a última vez que uma presença contou como atividade */
  private aliveAt = -Infinity;

  constructor(code: string, private readonly log: Log, private readonly onDead: (code: string) => void, opts: HostOptions = {}) {
    this.clock = opts.clock ?? Date.now;
    this.rng = opts.rng ?? Math.random;
    const now = opts.now ?? this.clock();
    this.silence = opts.silence ?? SOCKET_IDLE_TIMEOUT;
    this.presenceInterval = opts.presenceInterval ?? PRESENCE_INTERVAL;
    this.botTick = opts.botTick ?? BOT_TICK;
    this.chatInterval = opts.chatInterval ?? CHAT_INTERVAL;
    this.state = createRoom(code, now, { ttl: opts.ttl ?? ROOM_TTL, dev: opts.dev ?? false, init: opts.init });
    this.syncTimers(now);
    log('room.created', { room: code });
  }

  get code() { return this.state.code; }
  get connections() { return this.sockets.size; }
  /** o que cada pessoa fez no telhado no jogo que roda agora (vazio fora dele) */
  get stats(): Record<string, PlayerStats> { return this.counters; }

  connect(ws: Socket) {
    // visitantes demais (uma enxurrada de abas sem apelido): cada um recebe toda presença e todo snapshot
    if (this.state.phase !== 'dead' && !this.memberByToken(ws.data.token) && !this.state.visitors.includes(ws.data.token) && this.state.visitors.length >= VISITORS_MAX) {
      ws.close(CLOSE_TOO_MANY, 'visitantes demais');
      return;
    }
    const prev = this.sockets.get(ws.data.token);
    this.sockets.set(ws.data.token, ws);
    // mesma pessoa, socket novo (aba duplicada, ou voltou antes de o servidor notar a queda): o velho sai sem avisar a sala
    if (prev && prev !== ws) { this.clearSilence(prev); prev.close(CLOSE_REPLACED, 'outra aba assumiu'); }
    this.resetSilence(ws);
    this.apply({ kind: 'connect', token: ws.data.token }); // para quem já está conectado, a sala só reenvia o snapshot
    // quem chega vê os outros onde estão agora, sem esperar a próxima presença de cada um
    if (this.sockets.get(ws.data.token) !== ws) return; // expulso: já fechado
    for (const [token, p] of this.presences) {
      const member = this.memberByToken(token);
      if (member && token !== ws.data.token) ws.send(JSON.stringify({ type: 'presence', member: member.id, presence: p.latest }));
    }
    for (const [id, sent] of this.botSent) ws.send(JSON.stringify({ type: 'presence', member: id, presence: sent.presence }));
  }

  /** O socket fechou (o Bun avisou). */
  disconnect(ws: Socket) { this.drop(ws); }

  message(ws: Socket, raw: string | Buffer) {
    if (this.sockets.get(ws.data.token) !== ws) return; // já substituído, derrubado ou fechado por enxurrada
    this.resetSilence(ws);
    if (!this.allow(ws, 'any')) return; // antes de ler: uma enxurrada de presenças não chega nem ao parser
    const message = parseClientMessage(typeof raw === 'string' ? raw : raw.toString());
    if (message?.type !== 'presence' && !this.allow(ws, 'requests')) return;
    if (!message) { this.log('room.badMessage', { room: this.code, token: ws.data.token.slice(0, 8) }); return; }
    if (message.type === 'presence') { this.relayPresence(ws.data.token, message.presence); return; }
    if (message.type === 'shove') { this.routeShove(ws.data.token, message.target, message.dir); return; }
    if (message.type === 'chat') { this.relayChat(ws.data.token, message.text); return; }
    // a imagem de um post-it tem de ter subido antes: a sala só guarda o id, e um id sem bytes seria um buraco na tela
    if (message.type === 'write' && message.image !== null && !this.images.has(message.image)) {
      ws.send(JSON.stringify({ type: 'error', error: 'refused' }));
      this.log('room.refused', { room: this.code, error: 'refused', action: 'write', reason: 'unknownImage' });
      return;
    }
    this.apply({ kind: 'message', token: ws.data.token, message });
  }

  /**
   * Gasta uma ficha do balde deste socket. Sem ficha, a mensagem é descartada; quem segue estourando é fechado com
   * `CLOSE_TOO_MANY` e sai da sala como se tivesse caído. O log ganha uma linha quando começa e outra quando fecha.
   */
  private allow(ws: Socket, which: 'any' | 'requests'): boolean {
    const now = this.clock();
    const token = ws.data.token;
    let b = this.buckets.get(token);
    if (!b) {
      b = { any: new TokenBucket(ANY_BURST, ANY_RATE, now), requests: new TokenBucket(MESSAGE_BURST, MESSAGE_RATE, now), overflow: new TokenBucket(OVERFLOW_MAX, OVERFLOW_RATE, now), dropped: 0 };
      this.buckets.set(token, b);
    }
    if (b[which].take(now)) return true;
    if (b.dropped++ === 0) this.log('room.flood', { room: this.code, token: token.slice(0, 8) });
    if (!b.overflow.take(now)) {
      this.log('room.flooded', { room: this.code, token: token.slice(0, 8), dropped: b.dropped });
      this.drop(ws);
      ws.close(CLOSE_TOO_MANY, 'mensagens demais');
    }
    return false;
  }

  /**
   * Guarda a imagem de um post-it, se quem manda é da turma, os bytes são WebP e cabem no limite. Devolve o id que o
   * `write` vai usar.
   */
  addImage(token: string, bytes: Uint8Array<ArrayBuffer>): AddImageResult {
    const member = this.state.phase === 'dead' ? undefined : this.state.members.find((m) => m.token === token);
    if (!member) return { ok: false, error: 'notMember' };
    if (bytes.length > IMAGE_BYTES_MAX) return { ok: false, error: 'tooBig' };
    if (!isWebp(bytes)) return { ok: false, error: 'notWebp' };
    let id: string;
    do { id = Buffer.from(crypto.getRandomValues(new Uint8Array(12))).toString('hex'); } while (this.images.has(id));
    this.images.set(id, { bytes, uploader: member.id, at: this.clock(), used: false });
    this.log('room.image', { room: this.code, id: member.id, bytes: bytes.length });
    this.collectImages();
    return { ok: true, id };
  }

  private memberByToken(token: string) {
    return this.state.phase === 'dead' ? undefined : this.state.members.find((m) => m.token === token);
  }

  /** Guarda a presença mais recente deste token e a repassa agora, se a janela abriu, ou quando abrir. */
  private relayPresence(token: string, presence: Presence) {
    if (!this.memberByToken(token)) return; // visitante (ainda sem apelido) não está no telhado
    let p = this.presences.get(token);
    const before = p?.latest;
    if (!p) { p = { latest: presence, sentAt: -Infinity }; this.presences.set(token, p); }
    p.latest = presence;
    const now = this.clock();
    // uma queda é passar para baixo da rua (`FALL_Y`): o corpo fica lá até voltar, e isso vale também para quem cai de
    // novo ainda piscando da volta anterior (o `blink` nem desliga). A primeira presença depois de conectar não tem
    // "antes" e não conta; e ninguém cai mais de uma vez por `RESPAWN_MS` (o tempo que se fica lá embaixo)
    if (before && presence.y < FALL_Y && before.y >= FALL_Y && now - (this.fallAt.get(token) ?? -Infinity) >= RESPAWN_MS) {
      this.fallAt.set(token, now);
      this.count([token, 'falls']);
    }
    // com o jogo rodando, gente no telhado é gente jogando: a sala não morre por inatividade (uma vez por minuto)
    if (this.playing() && now - this.aliveAt >= PRESENCE_ACTIVITY_MS) {
      this.aliveAt = now;
      this.apply({ kind: 'alive', token });
      if (!this.memberByToken(token)) return;
    }
    if (p.handle) return; // a mais recente sai quando o timer vencer
    const wait = p.sentAt + this.presenceInterval - this.clock();
    if (wait <= 0) { this.flushPresence(token); return; }
    const entry = p;
    p.handle = setTimeout(() => { entry.handle = undefined; this.flushPresence(token); }, wait);
  }

  private flushPresence(token: string) {
    const p = this.presences.get(token);
    const member = this.memberByToken(token);
    if (!p || !member) return;
    p.sentAt = this.clock();
    const raw = JSON.stringify({ type: 'presence', member: member.id, presence: p.latest });
    for (const [t, ws] of this.sockets) if (t !== token) ws.send(raw);
  }

  /** Esquece tudo o que o host guarda deste token: presença, fala, balde, golpe e queda. */
  private forgetPresence(token: string) {
    const p = this.presences.get(token);
    if (p?.handle) clearTimeout(p.handle);
    this.presences.delete(token);
    this.chats.delete(token);
    this.buckets.delete(token);
    this.shoveVolleys.delete(token);
    this.fallAt.delete(token);
  }

  private playing() { return this.state.phase !== 'dead' && this.state.game.phase === 'playing'; }

  /**
   * Entrega o empurrão à aba de quem foi empurrado; é ela que se joga para trás (ADR 0005). Só vale no ritmo do empurrão
   * (`SHOVE_COOLDOWN_MS`, com folga; os alvos de um mesmo golpe passam juntos) e com o alvo ao alcance pelas últimas
   * presenças (`inShoveReach`, com folga): quem está piscando (caído ou voltando) não é sólido e não leva.
   */
  private routeShove(token: string, target: string, dir: 1 | -1) {
    const from = this.memberByToken(token);
    if (!from) return;
    const now = this.clock();
    const v = this.shoveVolleys.get(token);
    if (v && now - v.at < VOLLEY_MS && !v.targets.has(target)) v.targets.add(target);
    else if (!v || now - v.at >= SHOVE_COOLDOWN_MS - SHOVE_SLACK_MS) this.shoveVolleys.set(token, { at: now, targets: new Set([target]) });
    else return;
    const me = this.presences.get(token)?.latest;
    if (!me) return;
    if (BOT_ID_RE.test(target)) {
      const bot = this.botWorld?.bots.find((b) => b.id === target);
      if (!bot || !inShoveReach(me, bot.body)) return;
      if (this.botWorld?.shoved(target, dir, from.id, now)) this.count([token, 'shoves']);
      return;
    }
    const to = this.state.members.find((m) => m.id === target);
    if (!to || to === from || to.token === null) return;
    const ws = this.sockets.get(to.token);
    const there = this.presences.get(to.token)?.latest;
    if (!ws || !there || there.blink || !inShoveReach(me, there)) return;
    ws.send(JSON.stringify({ type: 'shoved', by: from.id, dir }));
    this.count([token, 'shoves'], [to.token, 'shovedByPlayers']);
  }

  /** Soma um em cada estatística (token de quem, qual), se o jogo está rodando; fica aqui até o próximo passo da sala. */
  private count(...add: [token: string, stat: StatName][]) {
    if (!this.playing()) return;
    for (const [token, stat] of add) {
      const m = this.memberByToken(token);
      if (m) (this.counters[m.id] ??= { falls: 0, shoves: 0, shovedByPlayers: 0, shovedByBots: 0 })[stat]++;
    }
  }

  /**
   * Repassa a fala a todo mundo da sala, inclusive a quem falou (o balão sobre o próprio personagem é este eco). Só fala
   * quem é da turma e tem personagem (visitante não tem onde pôr o balão); a que chega antes de `chatInterval` da
   * anterior da mesma pessoa é descartada.
   */
  private relayChat(token: string, text: string) {
    const from = this.memberByToken(token);
    if (!from || this.state.phase === 'dead' || !(from.id in this.state.game.characters)) return;
    const now = this.clock();
    if (now - (this.chats.get(token) ?? -Infinity) < this.chatInterval) return;
    this.chats.set(token, now);
    const raw = JSON.stringify({ type: 'chat', member: from.id, text });
    for (const ws of this.sockets.values()) ws.send(raw);
  }

  /** Os bytes de uma imagem da sala, se existe. */
  image(id: string): Uint8Array<ArrayBuffer> | undefined { return this.images.get(id)?.bytes; }

  private apply(input: RoomInput) {
    const now = this.clock();
    // os números do telhado entram na sala antes do passo: se for o que acaba o jogo, o snapshot do fim já os leva
    if (this.playing()) this.state = { ...this.state, stats: structuredClone(this.counters) };
    const { state, out, events } = step(this.state, input, now, { rng: this.rng });
    this.state = state;
    // fora do jogo não se conta; quem saiu da turma (expulso) leva os números junto
    if (!this.playing()) this.counters = {};
    else for (const id of Object.keys(this.counters)) if (!state.members.some((m) => m.id === id)) delete this.counters[id];
    for (const o of out) {
      const ws = this.sockets.get(o.to);
      if (!ws) continue;
      if ('message' in o) { ws.send(JSON.stringify(o.message)); continue; }
      // expulso: o socket sai daqui antes de fechar, e o aviso de fechamento do Bun não chega à sala
      this.sockets.delete(o.to);
      this.forgetPresence(o.to);
      this.clearSilence(ws);
      ws.close(o.close, o.close === CLOSE_KICKED ? 'expulso da sala' : undefined);
    }
    for (const e of events) {
      const { type, ...fields } = e;
      this.log(`room.${type}`, { room: this.code, ...fields });
    }
    if (state.phase === 'dead') {
      for (const ws of this.sockets.values()) { this.clearSilence(ws); ws.close(CLOSE_ROOM_ENDED, 'sala encerrada por inatividade'); }
      this.sockets.clear();
      this.images.clear();
      for (const token of [...this.presences.keys()]) this.forgetPresence(token);
    } else {
      this.collectImages();
    }
    this.syncTimers(now);
    this.syncBots();
    if (state.phase === 'dead') this.onDead(this.code);
  }

  /** Liga o laço dos bots quando a opção está ligada e o jogo roda; fora do jogo, eles somem na hora e o laço para. */
  private syncBots() {
    const playing = this.state.phase !== 'dead' && this.state.game.phase === 'playing';
    if (!playing) { this.stopBots(); return; }
    if (!this.state.funnyBots || this.botTimer) return; // desligada com bots no telhado: o laço segue até fugirem (`runBots`)
    // numa sala de desenvolvimento o primeiro bot chega logo, para dar para ver sem esperar, e é um chefão
    // (`DEV_BOSS_CHARACTER=<lugar>` escolhe o personagem dele); em produção nada disso vale
    this.botWorld ??= new BotWorld(this.rng, { characters: CHARACTERS, attackMs, ...(this.state.dev ? { firstWithin: 3000, bossFirst: true, bossCharacter: devBossCharacter() } : {}) });
    this.botLast = this.clock();
    this.botTimer = setInterval(() => this.runBots(), this.botTick);
  }

  private stopBots() {
    if (this.botTimer) clearInterval(this.botTimer);
    this.botTimer = undefined;
    this.botWorld = null;
    this.botSent.clear();
  }

  /** Um passo dos bots: simula, entrega os empurrões, avisa a sala se a lista mudou e manda as presenças que mudaram. */
  private runBots() {
    const world = this.botWorld;
    if (!world || this.state.phase === 'dead') { this.stopBots(); return; }
    const now = this.clock();
    const dt = Math.min(0.05, Math.max(0, (now - this.botLast) / 1000));
    this.botLast = now;
    const players: Seen[] = [];
    for (const [token, p] of this.presences) {
      const m = this.memberByToken(token);
      if (m) players.push({ id: m.id, x: p.latest.x, y: p.latest.y, z: p.latest.z, vx: p.latest.vx, vy: p.latest.vy, vz: p.latest.vz, solid: !p.latest.blink });
    }
    const taken = new Set(Object.values(this.state.game.characters));
    const enabled = this.state.funnyBots;
    const r = world.tick(now, dt, players, { enabled, taken });
    const hit: [string, StatName][] = [];
    for (const s of r.shoves) {
      const to = this.state.members.find((m) => m.id === s.target);
      const ws = to?.token ? this.sockets.get(to.token) : undefined;
      if (!to?.token || !ws) continue;
      ws.send(JSON.stringify({ type: 'shoved', by: s.by, dir: s.dir }));
      hit.push([to.token, 'shovedByBots']);
    }
    if (hit.length) {
      this.count(...hit);
      if (this.botWorld !== world) return;
    }
    // o chefão derrubado: o raio cai na cidade em toda aba ao mesmo tempo
    for (const d of r.downs) {
      const raw = JSON.stringify({ type: 'bossDown', bot: d.id, x: Math.round(d.x * 10) / 10 });
      for (const ws of this.sockets.values()) ws.send(raw);
    }
    if (r.rosterChanged) {
      for (const id of [...this.botSent.keys()]) if (!world.bots.some((b) => b.id === id)) this.botSent.delete(id);
      this.apply({ kind: 'bots', bots: world.roster() }); // a sala manda o snapshot com a lista nova
      if (this.botWorld !== world) return; // a sala morreu ou o jogo acabou nesse meio
    }
    if (++this.botTicks % 2 === 0) {
      for (const bot of world.bots) {
        const presence = world.presence(bot, now);
        const raw = JSON.stringify({ type: 'presence', member: bot.id, presence });
        const sent = this.botSent.get(bot.id);
        if (sent && sent.raw === raw && now - sent.at < BOT_HEARTBEAT) continue;
        this.botSent.set(bot.id, { raw, at: now, presence });
        for (const ws of this.sockets.values()) ws.send(raw);
      }
    }
    // desligada e já sem ninguém no telhado: o laço para até ligarem de novo
    if (!enabled && world.bots.length === 0) this.stopBots();
  }

  /**
   * Solta as imagens que nenhum post-it usa: a que já foi usada morre na hora (trocada, dono expulso, jogar de novo); a
   * recém-subida espera `IMAGE_GRACE` pelo seu `write`, e cada pessoa guarda no máximo `IMAGES_PER_UPLOADER` soltas.
   */
  private collectImages() {
    const now = this.clock();
    const referenced = referencedImages(this.state);
    const loose = new Map<string, [string, StoredImage][]>();
    for (const [id, img] of this.images) {
      if (referenced.has(id)) { img.used = true; continue; }
      if (img.used || now - img.at > IMAGE_GRACE) { this.images.delete(id); continue; }
      const mine = loose.get(img.uploader) ?? [];
      mine.push([id, img]);
      loose.set(img.uploader, mine);
    }
    for (const mine of loose.values()) {
      mine.sort((a, b) => a[1].at - b[1].at);
      for (const [id] of mine.slice(0, Math.max(0, mine.length - IMAGES_PER_UPLOADER))) this.images.delete(id);
    }
  }

  /** Cancela todo timer e deixa a sala como está: para um teste (ou o processo) terminar sem nada pendente. */
  dispose() {
    for (const h of this.handles.values()) clearTimeout(h);
    this.handles.clear();
    this.stopBots();
    for (const ws of this.sockets.values()) this.clearSilence(ws);
    for (const token of [...this.presences.keys()]) this.forgetPresence(token);
  }

  /** Tira o socket da sala; `since` = desde quando ele estava mudo, quando foi o silêncio que o derrubou. */
  private drop(ws: Socket, since?: number) {
    this.clearSilence(ws);
    if (this.sockets.get(ws.data.token) !== ws) return; // já substituído por outra aba, ou já derrubado pelo silêncio
    this.sockets.delete(ws.data.token);
    this.forgetPresence(ws.data.token);
    this.apply(since === undefined ? { kind: 'disconnect', token: ws.data.token } : { kind: 'disconnect', token: ws.data.token, since });
  }

  /** Este socket deu sinal de vida: o silêncio dele recomeça a contar do zero. */
  private resetSilence(ws: Socket) {
    this.clearSilence(ws);
    const heardAt = this.clock();
    this.silences.set(ws, setTimeout(() => {
      this.silences.delete(ws);
      this.log('room.silent', { room: this.code, token: ws.data.token.slice(0, 8) });
      this.drop(ws, heardAt);
      ws.terminate();
    }, this.silence));
  }

  private clearSilence(ws: Socket) {
    const h = this.silences.get(ws);
    if (h) { clearTimeout(h); this.silences.delete(ws); }
  }

  /** Agenda o que a sala pede e cancela o que ela deixou de pedir; cada timer é identificado pelo seu conteúdo. */
  private syncTimers(now: number) {
    const wanted = new Map(this.state.timers.map((t) => [timerKey(t), t] as const));
    for (const [key, handle] of this.handles) if (!wanted.has(key)) { clearTimeout(handle); this.handles.delete(key); }
    for (const [key, timer] of wanted) {
      if (this.handles.has(key)) continue;
      this.handles.set(key, setTimeout(() => { this.handles.delete(key); this.apply({ kind: 'timer', timer }); }, Math.max(0, timer.at - now)));
    }
  }
}
