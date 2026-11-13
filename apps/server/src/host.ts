import { BOT_ID_RE, CLOSE_KICKED, CLOSE_REPLACED, CLOSE_ROOM_ENDED, IMAGE_BYTES_MAX, isWebp, parseClientMessage, PRESENCE_INTERVAL, SOCKET_IDLE_TIMEOUT, type Presence, type RoomInit } from '@guess/protocol';
import { CHARACTERS } from '@guess/rules';
import attackMs from './attacks.json';
import { BotWorld, type Seen } from './bots';
import type { ServerWebSocket } from 'bun';
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
 * um passo, ms.
 */
export interface HostOptions { now?: number; ttl?: number; silence?: number; clock?: () => number; dev?: boolean; rng?: () => number; presenceInterval?: number; init?: RoomInit; botTick?: number }

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

export interface SocketData { code: string; token: string }
export type Socket = ServerWebSocket<SocketData>;

/**
 * Adaptador de uma sala: guarda os sockets por token, entrega as mensagens que a sala manda e agenda
 * os timers que ela pede (`state.timers`), nunca os seus. Quando a sala morre, fecha todo mundo e avisa.
 * O único timer próprio é o de silêncio: um socket que não manda nada (nem `ping`) por `silence` ms é
 * derrubado como se tivesse caído, e a sala fica sabendo desde quando a pessoa está muda. A rede que morre
 * sem fechar o socket não chega de outro jeito; o `idleTimeout` do Bun é a rede de segurança abaixo deste.
 * Presença e empurrão (ADR 0005) não entram na sala: o host repassa a presença de cada membro aos outros no máximo uma
 * vez por `presenceInterval`, guardando só a mais recente, e entrega o empurrão só a quem foi empurrado.
 * Os bots engraçados (`bots.ts`, emenda do ADR 0005) são simulados aqui: com a opção ligada e o jogo rodando, um laço
 * dá passos neles, manda a presença de cada um como a de uma pessoa, entrega os empurrões deles e avisa a sala quando a
 * lista de quem está no telhado muda. Fora disso não há laço nenhum.
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
  /** os bots engraçados: o mundo deles, o laço, a hora do último passo e a última presença mandada de cada um */
  private botWorld: BotWorld | null = null;
  private botTimer: ReturnType<typeof setInterval> | undefined;
  private botLast = 0;
  private botTicks = 0;
  private readonly botSent = new Map<string, { raw: string; at: number; presence: Presence }>();
  private readonly botTick: number;

  constructor(code: string, private readonly log: Log, private readonly onDead: (code: string) => void, opts: HostOptions = {}) {
    this.clock = opts.clock ?? Date.now;
    this.rng = opts.rng ?? Math.random;
    const now = opts.now ?? this.clock();
    this.silence = opts.silence ?? SOCKET_IDLE_TIMEOUT;
    this.presenceInterval = opts.presenceInterval ?? PRESENCE_INTERVAL;
    this.botTick = opts.botTick ?? BOT_TICK;
    this.state = createRoom(code, now, { ttl: opts.ttl ?? ROOM_TTL, dev: opts.dev ?? false, init: opts.init });
    this.syncTimers(now);
    log('room.created', { room: code });
  }

  get code() { return this.state.code; }
  get connections() { return this.sockets.size; }

  connect(ws: Socket) {
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
    this.resetSilence(ws);
    const message = parseClientMessage(typeof raw === 'string' ? raw : raw.toString());
    if (!message) { this.log('room.badMessage', { room: this.code, token: ws.data.token.slice(0, 8) }); return; }
    if (message.type === 'presence') { this.relayPresence(ws.data.token, message.presence); return; }
    if (message.type === 'shove') { this.routeShove(ws.data.token, message.target, message.dir); return; }
    // a imagem de um post-it tem de ter subido antes: a sala só guarda o id, e um id sem bytes seria um buraco na tela
    if (message.type === 'write' && message.image !== null && !this.images.has(message.image)) {
      ws.send(JSON.stringify({ type: 'error', error: 'refused' }));
      this.log('room.refused', { room: this.code, error: 'refused', action: 'write', reason: 'unknownImage' });
      return;
    }
    this.apply({ kind: 'message', token: ws.data.token, message });
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
    if (!p) { p = { latest: presence, sentAt: -Infinity }; this.presences.set(token, p); }
    p.latest = presence;
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

  private forgetPresence(token: string) {
    const p = this.presences.get(token);
    if (p?.handle) clearTimeout(p.handle);
    this.presences.delete(token);
  }

  /** Entrega o empurrão à aba de quem foi empurrado; é ela que se joga para trás (ADR 0005). */
  private routeShove(token: string, target: string, dir: 1 | -1) {
    const from = this.memberByToken(token);
    if (from && BOT_ID_RE.test(target)) { this.botWorld?.shoved(target, dir, from.id, this.clock()); return; }
    const to = this.state.members.find((m) => m.id === target);
    if (!from || !to || to === from || to.token === null) return;
    this.sockets.get(to.token)?.send(JSON.stringify({ type: 'shoved', by: from.id, dir }));
  }

  /** Os bytes de uma imagem da sala, se existe. */
  image(id: string): Uint8Array<ArrayBuffer> | undefined { return this.images.get(id)?.bytes; }

  private apply(input: RoomInput) {
    const now = this.clock();
    const { state, out, events } = step(this.state, input, now, { rng: this.rng });
    this.state = state;
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
    for (const s of r.shoves) {
      const to = this.state.members.find((m) => m.id === s.target);
      if (to?.token) this.sockets.get(to.token)?.send(JSON.stringify({ type: 'shoved', by: s.by, dir: s.dir }));
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
