/**
 * A fala dos bots engraçados (emenda do ADR 0005, "os bots falam"): o **cérebro da fala**, puro. Decide quais bots falam
 * (cada um sorteia ao chegar: `TALKABLE_CHANCE`), quando cada um quer falar (uma **vontade**: responder a quem o chamou,
 * reagir a um empurrão, a uma queda, ao jogo andar, ao chefão, a outro bot, ou puxar assunto num silêncio) e o que
 * mandar ao modelo de linguagem (o retrato do personagem, `personas.ts`, e a cena: quem está perto e de que personagem,
 * de quem é a vez, quem já acertou, o que aconteceu e o chat recente). Não fala com a rede: o `RoomHost` pede (`next`),
 * manda o pedido ao modelo (`groq.ts`) e devolve o que voltou (`done`), que sai arrumado, filtrado, ou descartado por
 * ter chegado tarde.
 *
 * **O post-it nunca entra.** A cena (`Scene`) só tem apelidos, personagens, posições e quem acertou ou desistiu; o chat
 * que chega aqui já vem tapado (`redact`), e a fala que volta e diz o post-it de alguém (`leaks`) é jogada fora. O texto
 * dos post-its só passa por `done` e por `redact`, para comparar, e nunca vai para um pedido.
 *
 * O ritmo é apertado de propósito (o plano grátis do modelo é pequeno e é um só para o servidor todo): um pedido por vez
 * na sala, um balde da sala (`ROOM_BURST`, um a cada `ROOM_REFILL_MS`), uma distância mínima entre duas falas do mesmo
 * bot, e a ordem de preferência: responder a uma pessoa, depois reagir, por último puxar assunto.
 */
import { CHAT_MAX } from '@guess/protocol';
import { TokenBucket } from './limits';
import { persona } from './personas';

/** A chance de um bot, ao chegar, ser dos que falam (o chefão também). */
export const TALKABLE_CHANCE = 0.3;
/** O balde da sala: até tantos pedidos de uma vez, e um a mais a cada tanto, ms (2 por minuto no máximo, seguido). */
export const ROOM_BURST = 3;
export const ROOM_REFILL_MS = 30_000;
/** Uma resposta que demora mais que isto (ms) desde o pedido já não cabe na conversa. */
export const STALE_MS = 12_000;
/** Quantas falas novas no chat, depois do pedido, fazem a resposta perder o sentido. */
const STALE_CHATS = 4;
/** Quantas falas de bot seguidas, sem uma pessoa no meio, antes de os bots pararem de se responder. */
const BOT_RUN_MAX = 3;
/** "Perto", em unidades do mundo (o telhado tem umas duas telas, ~1700 de largura). */
const NEAR = 160;
const SEEN = 260;

export type Priority = 'reply' | 'event' | 'idle';
const RANK: Record<Priority, number> = { reply: 2, event: 1, idle: 0 };

export interface ChatMessage { role: 'system' | 'user'; content: string }

/** Alguém ou algum bot no telhado, como o cérebro o vê. Nada aqui vem do post-it. */
export interface Figure {
  id: string;
  /** o apelido de uma pessoa; o nome do personagem de um bot */
  name: string;
  character: number;
  x: number;
  z: number;
  bot: boolean;
  boss?: boolean;
  /** só de pessoa: em que pé está no jogo (`playing` se ausente) */
  state?: 'playing' | 'guessed' | 'gaveUp' | 'ghost';
}

/** A cena agora: se o jogo roda, de quem é a vez, quem pediu "acertei", se o relógio parou, e quem está no telhado. */
export interface Scene { playing: boolean; turn: string | null; claim: string | null; paused: boolean; figures: Figure[] }

/** O que o host conta ao cérebro (ids de membro ou de bot). */
export type Heard =
  /** uma pessoa falou (o texto já tapado) */
  | { type: 'chat'; from: string; text: string }
  /** alguém (pessoa ou bot) empurrou o bot */
  | { type: 'shoved'; bot: string; by: string }
  /** o bot empurrou uma pessoa */
  | { type: 'shovedPlayer'; bot: string; target: string }
  /** alguém (pessoa ou bot) caiu do telhado */
  | { type: 'fell'; who: string }
  | { type: 'turn'; who: string }
  | { type: 'claim'; who: string }
  | { type: 'guessed'; who: string }
  | { type: 'missed'; who: string }
  | { type: 'gaveUp'; who: string };

/** Um pedido ao modelo: de qual bot, com que prioridade, as mensagens, quando saiu e quantas falas o chat tinha. */
export interface TalkRequest { id: number; bot: string; priority: Priority; messages: ChatMessage[]; at: number; chatSeq: number }

type Kind = 'addressed' | 'nearChat' | 'banter' | 'shoved' | 'shovedPlayer' | 'fell' | 'otherFell' | 'arrived' | 'boss' | 'bossSeen' | 'game' | 'idle';
const PRIORITY: Record<Kind, Priority> = {
  addressed: 'reply', nearChat: 'reply', banter: 'event', shoved: 'event', shovedPlayer: 'event', fell: 'event', otherFell: 'event',
  arrived: 'event', boss: 'event', bossSeen: 'event', game: 'event', idle: 'idle',
};
/** A distância mínima entre dois pedidos do mesmo bot, ms, pelo tipo do novo. */
const GAP: Record<Priority, number> = { reply: 4000, event: 10_000, idle: 30_000 };

/** A vontade de um bot falar: por quê, sobre quem, a partir de quando e até quando. */
interface Intent { kind: Kind; who?: string; text?: string; game?: Heard['type']; due: number; expires: number }

interface Speaker { character: number; boss: boolean; talkable: boolean; lastAsked: number }

/** O que aconteceu, para o contexto. */
interface Happened { at: number; e: Heard | { type: 'arrived' | 'boss'; who: string } }

// --- texto ------------------------------------------------------------------------------------------------------------

/** minúsculas e sem acento, para comparar nomes e post-its */
export const fold = (s: string): string => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
const WORD = /[\p{L}\p{M}\p{N}]+/gu;
const STOP = new Set(['o', 'a', 'os', 'as', 'um', 'uma', 'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'no', 'na', 'the', 'of', 'and', 'el', 'la', 'le']);

/** As palavras de um post-it que denunciam quem é: as de 3 letras ou mais que não são artigo; se não sobra nenhuma, todas. */
function secretWords(secrets: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const s of secrets) {
    const words = (fold(s).match(WORD) ?? []);
    const strong = words.filter((w) => w.length >= 3 && !STOP.has(w));
    for (const w of strong.length ? strong : words) out.add(w);
  }
  return out;
}

/** Tapa com `***` cada palavra de `text` que é de algum post-it (sem caixa nem acento). */
export function redact(text: string, secrets: readonly string[]): string {
  const words = secretWords(secrets);
  if (!words.size) return text;
  return text.replace(WORD, (w) => (words.has(fold(w)) ? '***' : w));
}

/** `text` diz alguma palavra de algum post-it? */
export const leaks = (text: string, secrets: readonly string[]): boolean => redact(text, secrets) !== text;

/** O filtro da saída: sexo, ódio e coisa pior. É de palavras, simples: o pedido já manda o modelo não ir por aí. */
const UNSAFE = [
  /\bsex/, /\bporn/, /\bnudes?\b/, /\bputa(ria|s)?\b/, /\bfod[aeiou]/, /\bfuck/, /\bcaralh/, /\bbuceta/, /\bpiroca/, /\bpenis\b/, /\bvagina/,
  /\btransa[rd]?\b/, /\bgostosa/, /\bpedof/, /\bpedo\b/, /\bestupr/, /\brap(e|ist)/, /\bmolest/, /\bviado/, /\bbichas?\b/, /\bsapatao/,
  /\bretardad/, /\bretard\b/, /\bmongol/, /\bfag/, /\bnigg/, /\bnazi/, /\bhitler/, /\bsuicid/, /\bse mat[ae]\b/, /\bkill yourself/, /\bkys\b/,
  /\bmenor(es)? de idade/, /\bcrianc/, /\bkids?\b/, /\bminors?\b/, /\bdroga/, /\bcocain/, /\bmaconha/,
];
export const unsafe = (text: string): boolean => { const t = fold(text); return UNSAFE.some((r) => r.test(t)); };

/** O que o modelo devolveu, como fala: a primeira linha, sem "Nome:" na frente, sem aspas em volta, no tamanho do balão. */
export function tidy(raw: string, name: string): string {
  let s = raw.split(/\r?\n/).map((l) => l.trim()).find((l) => l.length > 0) ?? '';
  const prefix = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[:\\-–]\\s*`, 'i');
  s = s.replace(prefix, '').replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 3; i++) s = s.replace(/^["'“”‘’«»]+|["'“”‘’«»]+$/g, '').trim();
  const chars = [...s];
  if (chars.length > CHAT_MAX) {
    const cut = chars.slice(0, CHAT_MAX).join('');
    const space = cut.lastIndexOf(' ');
    s = (space > CHAT_MAX / 2 ? cut.slice(0, space) : cut).trimEnd();
  }
  return s;
}

const EN = new Set(['the', 'you', 'what', 'is', 'are', 'this', 'that', 'so', 'at', 'doing', 'here', 'hey', 'going', 'on', 'my', 'it', 'and', 'why', 'who', 'how', 'lol', 'yes', 'no', 'not', 'i', 'im', 'me', 'your', 'do', 'dont', 'guys', 'bro']);
const PT = new Set(['voce', 'vc', 'nao', 'que', 'e', 'eu', 'ta', 'kkk', 'kkkk', 'mano', 'oi', 'gente', 'muito', 'isso', 'de', 'o', 'a', 'um', 'uma', 'pra', 'para', 'com', 'meu', 'sim', 'qual', 'quem', 'como', 'aqui', 'esse', 'essa', 'tu', 'ne', 'ai', 'mas']);

/** A língua da sala pelas últimas falas das pessoas: inglês só se ele ganha com folga; senão, português (o padrão). */
export function language(lines: readonly string[]): 'pt-BR' | 'en' {
  let en = 0, pt = 0;
  for (const l of lines) for (const w of fold(l).match(WORD) ?? []) { if (EN.has(w)) en++; if (PT.has(w)) pt++; }
  return en >= 3 && en > pt * 1.5 ? 'en' : 'pt-BR';
}

// --- o cérebro --------------------------------------------------------------------------------------------------------

export class TalkBrain {
  private readonly speakers = new Map<string, Speaker>();
  private readonly intents = new Map<string, Intent>();
  /** o chat recente (pessoas e bots), com a hora */
  private chats: { from: string; text: string; at: number }[] = [];
  private chatSeq = 0;
  private happened: Happened[] = [];
  private readonly bucket: TokenBucket;
  private inFlight: TalkRequest | null = null;
  private nextId = 1;
  /** falas de bot seguidas sem uma pessoa no meio */
  private botRun = 0;
  private nextIdleAt: number | null = null;
  private readonly chance: number;

  constructor(private readonly rng: () => number, opts: { chance?: number } = {}) {
    this.chance = opts.chance ?? TALKABLE_CHANCE;
    this.bucket = new TokenBucket(ROOM_BURST, 1000 / ROOM_REFILL_MS, 0);
  }

  /** O bot `id` é dos que falam? */
  talkable(id: string): boolean { return this.speakers.get(id)?.talkable ?? false; }

  /** A lista de bots no telhado agora: quem chega sorteia se fala (e talvez se anuncia); quem saiu é esquecido. */
  roster(bots: readonly { id: string; character: number; boss: boolean }[], now: number) {
    const ids = new Set(bots.map((b) => b.id));
    for (const id of [...this.speakers.keys()]) if (!ids.has(id)) { this.speakers.delete(id); this.intents.delete(id); }
    for (const b of bots) {
      if (this.speakers.has(b.id)) continue;
      const talkable = this.rng() < this.chance;
      this.speakers.set(b.id, { character: b.character, boss: b.boss, talkable, lastAsked: -Infinity });
      this.remember({ type: b.boss ? 'boss' : 'arrived', who: b.id }, now);
      const landing = 2500 + this.rng() * 2000;
      if (talkable && b.boss) { if (this.rng() < 0.9) this.want(b.id, { kind: 'boss' }, now, landing); }
      else if (talkable) { if (this.rng() < 0.35) this.want(b.id, { kind: 'arrived' }, now, landing); }
      if (b.boss && this.rng() < 0.4) {
        const other = this.pickTalkable((id) => id !== b.id);
        if (other) this.want(other, { kind: 'bossSeen', who: b.id }, now, landing + 800);
      }
    }
  }

  /** Algo aconteceu: entra no contexto e pode virar vontade de falar de algum bot. */
  hear(e: Heard, now: number, scene: Scene) {
    if (e.type === 'chat') {
      this.chats.push({ from: e.from, text: e.text, at: now });
      this.chats = this.chats.slice(-10);
      this.chatSeq++;
      this.botRun = 0;
      const called = this.mentioned(e.text, scene);
      if (called) { this.want(called, { kind: 'addressed', who: e.from, text: e.text }, now); return; }
      const near = this.nearestTalkable(e.from, scene, NEAR);
      if (near && this.rng() < 0.4) this.want(near, { kind: 'nearChat', who: e.from, text: e.text }, now);
      return;
    }
    this.remember(e, now);
    switch (e.type) {
      case 'shoved': {
        const byBot = this.speakers.has(e.by);
        if (this.talkable(e.bot) && this.rng() < (byBot ? 0.35 : 0.75)) this.want(e.bot, { kind: 'shoved', who: e.by }, now);
        return;
      }
      case 'shovedPlayer':
        if (this.talkable(e.bot) && this.rng() < 0.35) this.want(e.bot, { kind: 'shovedPlayer', who: e.target }, now);
        return;
      case 'fell': {
        if (this.speakers.has(e.who)) { if (this.talkable(e.who) && this.rng() < 0.5) this.want(e.who, { kind: 'fell' }, now, 1500 + this.rng() * 1500); return; }
        const near = this.nearestTalkable(e.who, scene, SEEN);
        if (near && this.rng() < 0.3) this.want(near, { kind: 'otherFell', who: e.who }, now);
        return;
      }
      default: {
        const chance = { turn: 0.12, claim: 0.3, guessed: 0.6, missed: 0.4, gaveUp: 0.5 }[e.type];
        if (this.rng() >= chance) return;
        const id = this.pickTalkable((b) => scene.figures.some((f) => f.id === b));
        if (id) this.want(id, { kind: 'game', who: e.who, game: e.type }, now);
      }
    }
  }

  /**
   * O próximo pedido, se há um para agora: a vontade vencida de maior prioridade, de um bot que está no telhado, longe
   * o bastante da última fala dele, com ficha no balde da sala e nenhum pedido no ar. `scene` só é montada se preciso.
   */
  next(now: number, scene: () => Scene): TalkRequest | null {
    if (this.inFlight) return null;
    this.nextIdleAt ??= now + 40_000 + this.rng() * 60_000;
    for (const [id, i] of this.intents) if (now > i.expires) this.intents.delete(id);
    const idle = now >= this.nextIdleAt;
    const due = [...this.intents.entries()].filter(([, i]) => i.due <= now);
    if (!due.length && !idle) return null;
    const s = scene();
    if (!s.playing) { this.intents.clear(); return null; }
    if (idle && !due.length) {
      this.nextIdleAt = now + 40_000 + this.rng() * 60_000;
      const id = this.pickTalkable((b) => s.figures.some((f) => f.id === b));
      if (id) { this.want(id, { kind: 'idle' }, now, 0); due.push([id, this.intents.get(id)!]); }
    }
    const level = this.bucket.level(now);
    const ready = due.filter(([id, i]) => {
      const sp = this.speakers.get(id);
      const p = PRIORITY[i.kind];
      const gap = i.kind === 'banter' ? GAP.reply : GAP[p];
      return sp?.talkable && s.figures.some((f) => f.id === id) && now - sp.lastAsked >= gap && level >= (p === 'idle' ? 2 : 1);
    });
    if (!ready.length) return null;
    ready.sort(([, a], [, b]) => RANK[PRIORITY[b.kind]] - RANK[PRIORITY[a.kind]] || a.due - b.due);
    const [bot, intent] = ready[0];
    this.intents.delete(bot);
    this.bucket.take(now);
    this.speakers.get(bot)!.lastAsked = now;
    const req: TalkRequest = { id: this.nextId++, bot, priority: PRIORITY[intent.kind], messages: this.prompt(bot, intent, s, now), at: now, chatSeq: this.chatSeq };
    this.inFlight = req;
    return req;
  }

  /**
   * O modelo respondeu (`text`) ou não (null) ao pedido `req`. Devolve a fala para o balão, ou null: sem resposta,
   * tarde demais, o bot já foi, o jogo parou, a conversa andou, imprópria ou com o post-it de alguém (`secrets`).
   */
  done(req: TalkRequest, text: string | null, now: number, scene: Scene, secrets: readonly string[]): string | null {
    if (this.inFlight?.id === req.id) this.inFlight = null;
    if (text === null) return null;
    const sp = this.speakers.get(req.bot);
    if (!sp || !scene.playing || !scene.figures.some((f) => f.id === req.bot)) return null;
    if (now - req.at > STALE_MS || this.chatSeq - req.chatSeq > STALE_CHATS) return null;
    const line = tidy(text, persona(sp.character).name);
    if (!line || unsafe(line) || leaks(line, secrets)) return null;
    this.chats.push({ from: req.bot, text: line, at: now });
    this.chats = this.chats.slice(-10);
    this.chatSeq++;
    this.botRun++;
    this.nextIdleAt = Math.max(this.nextIdleAt ?? 0, now + 40_000 + this.rng() * 60_000);
    // outro bot que fala, ali perto, às vezes responde: vira conversa, até `BOT_RUN_MAX`
    if (this.botRun < BOT_RUN_MAX && this.rng() < 0.5) {
      const other = this.nearestTalkable(req.bot, scene, SEEN);
      if (other) this.want(other, { kind: 'banter', who: req.bot, text: line }, now, 1500 + this.rng() * 2000);
    }
    return line;
  }

  // --- por dentro -----------------------------------------------------------------------------------------------------

  /** Um bot quer falar: substitui a vontade que ele tinha, se esta pesa pelo menos o mesmo. */
  private want(bot: string, what: Omit<Intent, 'due' | 'expires'>, now: number, delay?: number) {
    const p = PRIORITY[what.kind];
    const had = this.intents.get(bot);
    if (had && now <= had.expires && RANK[PRIORITY[had.kind]] > RANK[p]) return;
    const wait = delay ?? (p === 'reply' ? 700 + this.rng() * 1100 : 500 + this.rng() * 1500);
    this.intents.set(bot, { ...what, due: now + wait, expires: now + wait + (p === 'reply' ? 9000 : p === 'event' ? 7000 : 4000) });
  }

  private remember(e: Happened['e'], now: number) {
    this.happened.push({ at: now, e });
    this.happened = this.happened.slice(-8);
  }

  /** Um bot que fala, ao acaso, entre os que passam em `ok`. */
  private pickTalkable(ok: (id: string) => boolean): string | null {
    const ids = [...this.speakers.entries()].filter(([id, s]) => s.talkable && ok(id)).map(([id]) => id);
    return ids.length ? ids[Math.floor(this.rng() * ids.length)] : null;
  }

  /** O bot que fala mais perto de `of` (sem ser ele), até `within`. */
  private nearestTalkable(of: string, scene: Scene, within: number): string | null {
    const me = scene.figures.find((f) => f.id === of);
    if (!me) return null;
    let best: string | null = null, bestD = within;
    for (const f of scene.figures) {
      if (f.id === of || !this.talkable(f.id)) continue;
      const d = Math.abs(f.x - me.x);
      if (d <= bestD) { best = f.id; bestD = d; }
    }
    return best;
  }

  /** O bot que fala chamado pelo nome em `text` (o primeiro nome que aparece; com clones, o primeiro deles). */
  private mentioned(text: string, scene: Scene): string | null {
    const t = ` ${(fold(text).match(WORD) ?? []).join(' ')} `;
    let best: string | null = null, bestAt = Infinity;
    for (const f of scene.figures) {
      const sp = this.speakers.get(f.id);
      if (!sp?.talkable) continue;
      const p = persona(sp.character);
      for (const alias of [fold(p.name), ...p.aliases]) {
        const at = t.indexOf(` ${(alias.match(WORD) ?? []).join(' ')} `);
        if (at >= 0 && at < bestAt) { best = f.id; bestAt = at; }
      }
    }
    return best;
  }

  // --- o pedido -------------------------------------------------------------------------------------------------------

  private prompt(bot: string, intent: Intent, s: Scene, now: number): ChatMessage[] {
    const sp = this.speakers.get(bot)!;
    const me = persona(sp.character);
    const lang = language(this.chats.filter((c) => !this.speakers.has(c.from)).slice(-8).map((c) => c.text));
    const name = (id: string | undefined) => {
      if (id === bot) return 'você';
      const f = s.figures.find((x) => x.id === id);
      if (f) return f.name;
      const b = id ? this.speakers.get(id) : undefined;
      return b ? persona(b.character).name : 'alguém';
    };
    const system = [
      `You are ${me.name}, one of the "funny bots" wandering a neon rooftop in Guessoca, an online "Who am I?" party game that friends play on a voice call. You are not a player: you only joke around.`,
      `Who you are: ${me.who}`,
      `How you talk: ${me.tone} Style examples: ${me.lines.map((l) => `"${l}"`).join(' / ')}${sp.boss ? ' Right now you are the giant BOSS version of yourself: bigger ego, louder.' : ''}`,
      me.ties ? `Others on the cast: ${me.ties}` : '',
      `Rules: answer with ONE short line in character, at most ${CHAT_MAX} characters, in ${lang === 'en' ? 'English' : 'Brazilian Portuguese (informal)'}. No quotes, no name prefix, no hashtags, at most one emoji. Keep it PG-13: nothing sexual, no slurs, no hate, no real-world violence, drugs or serious politics; tease playfully, never cruelly. Each player has a hidden identity on a post-it: you do NOT know anyone's and never guess or hint at one; if asked, dodge in character. Never say you are an AI or a bot program.`,
    ].filter(Boolean).join('\n');

    const lines: string[] = [];
    const game = ['Jogo rodando'];
    if (s.turn) game.push(`vez de ${name(s.turn)}`);
    if (s.claim) game.push(`votação aberta: ${name(s.claim)} diz que acertou`);
    if (s.paused) game.push('relógio pausado');
    lines.push(`Cena: ${game.join('; ')}.`);
    const self = s.figures.find((f) => f.id === bot);
    const describe = (f: Figure) => {
      if (f.bot) return `${f.name} (bot${f.boss ? ' chefão' : ''}${this.talkable(f.id) ? '' : ', calado'})`;
      const st = f.state === 'guessed' ? ', já acertou' : f.state === 'gaveUp' ? ', desistiu' : f.state === 'ghost' ? ', só assistindo' : f.id === s.turn ? ', na vez' : '';
      const where = self ? `, ${Math.abs(f.x - self.x) < NEAR ? 'pertinho' : 'perto'} à ${f.x < self.x ? 'esquerda' : 'direita'}` : '';
      return `${f.name} (pessoa, de ${persona(f.character).name}${st}${where})`;
    };
    const others = s.figures.filter((f) => f.id !== bot);
    const near = self ? others.filter((f) => Math.abs(f.x - self.x) <= SEEN).sort((a, b) => Math.abs(a.x - self!.x) - Math.abs(b.x - self!.x)).slice(0, 6) : [];
    const far = others.filter((f) => !near.includes(f)).slice(0, 8);
    if (near.length) lines.push(`Perto de você: ${near.map(describe).join(', ')}.`);
    if (far.length) lines.push(`No telhado também: ${far.map((f) => (f.bot ? `${f.name} (bot)` : `${f.name} (de ${persona(f.character).name})`)).join(', ')}.`);
    const got = s.figures.filter((f) => !f.bot && f.state === 'guessed').map((f) => f.name);
    const gave = s.figures.filter((f) => !f.bot && f.state === 'gaveUp').map((f) => f.name);
    if (got.length) lines.push(`Já acertaram: ${got.join(', ')}.`);
    if (gave.length) lines.push(`Desistiram: ${gave.join(', ')}.`);
    const recent = this.happened.filter((h) => now - h.at < 45_000).slice(-5);
    if (recent.length) lines.push(`Aconteceu: ${recent.map((h) => `há ${Math.round((now - h.at) / 1000)}s ${this.event(h.e, name)}`).join('; ')}.`);
    const chat = this.chats.filter((c) => now - c.at < 90_000).slice(-6);
    if (chat.length) lines.push(`Chat recente:\n${chat.map((c) => `${c.from === bot ? `${me.name} (você)` : name(c.from)}: ${c.text}`).join('\n')}`);
    lines.push(`Agora: ${this.task(intent, name, sp.boss)}`);
    return [{ role: 'system', content: system }, { role: 'user', content: lines.join('\n') }];
  }

  private event(e: Happened['e'], name: (id: string | undefined) => string): string {
    switch (e.type) {
      case 'shoved': return `${name(e.by)} empurrou ${name(e.bot)}`;
      case 'shovedPlayer': return `${name(e.bot)} empurrou ${name(e.target)}`;
      case 'fell': return `${name(e.who)} caiu do telhado`;
      case 'turn': return `começou a vez de ${name(e.who)}`;
      case 'claim': return `${name(e.who)} disse que acertou e abriu votação`;
      case 'guessed': return `${name(e.who)} acertou quem é`;
      case 'missed': return `a turma votou que ${name(e.who)} errou`;
      case 'gaveUp': return `${name(e.who)} desistiu`;
      case 'arrived': return `${name(e.who)} chegou ao telhado`;
      case 'boss': return `${name(e.who)} caiu do céu como chefão`;
      case 'chat': return `${name(e.from)} falou`;
    }
  }

  private task(i: Intent, name: (id: string | undefined) => string, boss: boolean): string {
    const who = name(i.who);
    switch (i.kind) {
      case 'addressed': return `${who} falou com você: "${i.text}". Responda a ${who}.`;
      case 'nearChat': return `${who} falou perto de você: "${i.text}". Comente ou responda, se tiver graça.`;
      case 'banter': return `${who} (bot) acabou de dizer: "${i.text}". Responda no seu estilo, provocando ou brincando.`;
      case 'shoved': return `${who} acabou de te empurrar. Reaja: reclame, provoque ou ameace de brincadeira.`;
      case 'shovedPlayer': return `Você acabou de empurrar ${who}. Tire sarro.`;
      case 'fell': return 'Você acabou de cair do telhado e voltou. Reaja.';
      case 'otherFell': return `${who} acabou de cair do telhado. Comente.`;
      case 'arrived': return 'Você acabou de chegar ao telhado. Diga algo ao chegar.';
      case 'boss': return 'Você acabou de cair do céu como o chefão gigante (aguenta seis empurrões). Anuncie sua chegada, ameaçador e engraçado.';
      case 'bossSeen': return `O chefão ${who} acabou de cair do céu. Reaja.`;
      case 'game': {
        const what = { turn: `começou a vez de ${who}`, claim: `${who} disse que acertou e a turma está votando`, guessed: `${who} acertou quem é`, missed: `a turma votou que ${who} errou`, gaveUp: `${who} desistiu e viu o próprio post-it` }[i.game as 'turn'];
        return `No jogo: ${what}. Comente, torcendo, zoando ou provocando.`;
      }
      case 'idle': return `Ninguém fala com você há um tempo. Puxe assunto com alguém perto ou comente a cena${boss ? ', como chefão' : ''}.`;
    }
  }
}
