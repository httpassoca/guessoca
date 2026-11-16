/**
 * As estatísticas de uso do sistema (`/sistema`, emenda do ADR 0009): quantas salas, jogos e pessoas, por dia, para o dono
 * ver como o jogo é usado e quanto do plano grátis do Groq os bots que falam gastam.
 *
 * - **Quem conta**: o servidor e o host (`server.ts`, `host.ts`) chamam `record` com um evento quando algo acontece; a
 *   sala (`room.ts`) continua pura e não sabe disto. `record` nunca joga exceção, não espera disco e não cresce sem fim.
 * - **Por dia**: um balde por dia de São Paulo (`TIME_ZONE`), os últimos `USAGE_DAYS`; os mais velhos somem.
 * - **No disco**: `<data>/stats.json` (o volume do Docker, sobrevive a deploy), escrito `saveDelay` ms depois da primeira
 *   mudança, num arquivo temporário renomeado por cima (nunca fica pela metade). Falhou ler ou escrever: começa do zero
 *   ou tenta na próxima, e o jogo segue.
 * - **O que nunca entra**: IP, apelido, texto de chat, palavra de post-it, token. Visitantes distintos do dia são contados
 *   por um resumo (SHA-256, cortado) do token da sala com um sal sorteado a cada dia; à meia-noite o sal e os resumos são
 *   jogados fora e só fica o número. Os resumos de hoje vão ao disco só para um deploy no meio do dia não contar todo mundo
 *   duas vezes.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Log } from './log';

/** Quantos dias ficam guardados. */
export const USAGE_DAYS = 90;
/** Quantos visitantes distintos um dia guarda (os resumos); acima disto, o número para de subir. */
export const VISITORS_PER_DAY_MAX = 20_000;
/** O dia é o do dono do jogo. */
export const TIME_ZONE = 'America/Sao_Paulo';
/** Quanto espera para gravar depois de uma mudança, ms. */
export const SAVE_DELAY = 15_000;
/** Um personagem que vale contar (o elenco é bem menor; o teto só protege o arquivo). */
const CHARACTER_MAX = 1000;

/** Os contadores de um dia. */
export const COUNTERS = [
  'roomsCreated', 'gamesStarted', 'gamesFinished', 'gamesAbandoned', 'players', 'gameMs', 'shoves', 'falls',
  'claims', 'guessed', 'gaveUp', 'ghosts', 'chats', 'bossesSpawned', 'bossesDown', 'floodKicks', 'limited',
  'groqRequests', 'groqTokens', 'groq429', 'groqTimeouts', 'groqErrors', 'botLines', 'botLinesDropped',
] as const;
export type Counter = (typeof COUNTERS)[number];
export type Counts = Partial<Record<Counter, number>>;

/** O que aconteceu. Nada aqui diz quem foi. */
export type UsageEvent =
  | { type: 'roomCreated' | 'chat' | 'claim' | 'guessed' | 'gaveUp' | 'ghost' | 'bossSpawned' | 'bossDown' | 'floodKick' | 'limited' }
  | { type: 'botLine' | 'botLineDropped' | 'groqRequest' | 'groq429' | 'groqTimeout' | 'groqError' }
  /** os personagens de quem joga (um por pessoa) */
  | { type: 'gameStarted'; characters: number[] }
  /** o jogo chegou ao fim: quanto durou e os números do telhado somados */
  | { type: 'gameFinished'; ms: number; shoves: number; falls: number }
  /** o jogo parou sem fim (sala morreu, todo mundo saiu) */
  | { type: 'gameAbandoned'; ms: number }
  | { type: 'groqTokens'; n: number }
  /** um socket entrou numa sala: o token só vira um resumo com o sal do dia */
  | { type: 'visit'; token: string }
  /** quantas pessoas estão conectadas agora, no servidor todo */
  | { type: 'online'; n: number };
export type Meter = (e: UsageEvent) => void;

export interface DayBucket { day: string; counts: Counts; visitors: number; peakOnline: number; characters: Record<string, number> }
export interface UsageFile { version: 1; days: DayBucket[]; today?: { day: string; salt: string; seen: string[] } }

/** Um dia como a página vê. */
export interface DayView { day: string; counts: Counts; visitors: number; peakOnline: number }
export interface UsageView { days: DayView[]; totals: Counts; topCharacters: { character: number; picks: number }[]; since: string | null; today: string }

const SIMPLE: Partial<Record<UsageEvent['type'], Counter>> = {
  roomCreated: 'roomsCreated', chat: 'chats', claim: 'claims', guessed: 'guessed', gaveUp: 'gaveUp', ghost: 'ghosts',
  bossSpawned: 'bossesSpawned', bossDown: 'bossesDown', floodKick: 'floodKicks', limited: 'limited', botLine: 'botLines',
  botLineDropped: 'botLinesDropped', groqRequest: 'groqRequests', groq429: 'groq429', groqTimeout: 'groqTimeouts', groqError: 'groqErrors',
};

const formats = new Map<string, Intl.DateTimeFormat>();
/** `2026-11-15`: o dia de `at` no fuso `timeZone`. */
export function dayKey(at: number, timeZone: string): string {
  let f = formats.get(timeZone);
  if (!f) { f = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }); formats.set(timeZone, f); }
  return f.format(at);
}
/** O dia mais velho que ainda fica, a partir de agora. */
const oldestKept = (now: number, timeZone: string) => dayKey(now - (USAGE_DAYS - 1) * 86_400_000, timeZone);

const count = (n: unknown): number | null => (typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.floor(n) : null);
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** O que veio do disco, conferido: o que não é número limpo some, dias demais e resumos demais são cortados. */
export function parseUsage(raw: unknown, now: number, timeZone: string): UsageFile {
  const out: UsageFile = { version: 1, days: [] };
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as { days?: unknown; today?: unknown };
  const cutoff = oldestKept(now, timeZone);
  if (Array.isArray(r.days)) {
    const seen = new Set<string>();
    for (const d of r.days as unknown[]) {
      const x = d as Partial<Record<keyof DayBucket, unknown>> | null;
      if (!x || typeof x.day !== 'string' || !DAY_RE.test(x.day) || x.day < cutoff || seen.has(x.day)) continue;
      seen.add(x.day);
      const counts: Counts = {};
      if (x.counts && typeof x.counts === 'object') {
        for (const k of COUNTERS) { const v = count((x.counts as Record<string, unknown>)[k]); if (v) counts[k] = v; }
      }
      const characters: Record<string, number> = {};
      if (x.characters && typeof x.characters === 'object') {
        for (const [k, v] of Object.entries(x.characters as Record<string, unknown>)) {
          const c = Number(k), n = count(v);
          if (/^\d+$/.test(k) && c < CHARACTER_MAX && n) characters[c] = n;
        }
      }
      out.days.push({ day: x.day, counts, visitors: count(x.visitors) ?? 0, peakOnline: count(x.peakOnline) ?? 0, characters });
    }
    out.days.sort((a, b) => a.day.localeCompare(b.day));
    out.days = out.days.slice(-USAGE_DAYS);
  }
  const t = r.today as { day?: unknown; salt?: unknown; seen?: unknown } | null | undefined;
  if (t && typeof t.day === 'string' && DAY_RE.test(t.day) && typeof t.salt === 'string' && t.salt.length <= 64 && Array.isArray(t.seen)) {
    const seen = [...new Set((t.seen as unknown[]).filter((s): s is string => typeof s === 'string' && s.length <= 32))].slice(0, VISITORS_PER_DAY_MAX);
    out.today = { day: t.day, salt: t.salt, seen };
  }
  return out;
}

export interface UsageOptions {
  /** a hora (os testes fixam) */
  clock?: () => number;
  /** onde gravar; sem isto, só na memória */
  file?: string;
  log?: Log;
  saveDelay?: number;
  timeZone?: string;
}

export class Usage {
  private readonly clock: () => number;
  private readonly timeZone: string;
  private readonly saveDelay: number;
  private days: DayBucket[] = [];
  /** os visitantes de hoje: o sal do dia e os resumos já vistos */
  private visit = { day: '', salt: '', seen: new Set<string>() };
  private timer: ReturnType<typeof setTimeout> | undefined;
  private failedAt = -Infinity;

  constructor(private readonly opts: UsageOptions = {}) {
    this.clock = opts.clock ?? Date.now;
    this.timeZone = opts.timeZone ?? TIME_ZONE;
    this.saveDelay = opts.saveDelay ?? SAVE_DELAY;
  }

  /** Lê o arquivo, se há; torto ou ausente, começa do zero. */
  load() {
    if (!this.opts.file) return;
    let raw: unknown;
    try { raw = JSON.parse(readFileSync(this.opts.file, 'utf8')); } catch { return; }
    const f = parseUsage(raw, this.clock(), this.timeZone);
    this.days = f.days;
    if (f.today && f.today.day === dayKey(this.clock(), this.timeZone)) this.visit = { day: f.today.day, salt: f.today.salt, seen: new Set(f.today.seen) };
  }

  /** Conta um evento. Nunca joga exceção. */
  record(e: UsageEvent) {
    try { this.apply(e); } catch (err) { this.opts.log?.('usage.error', { error: err instanceof Error ? err.message : String(err) }); }
  }

  private bucket(): DayBucket {
    const day = dayKey(this.clock(), this.timeZone);
    let b = this.days.at(-1);
    if (b?.day === day) return b;
    b = this.days.find((d) => d.day === day); // o relógio voltou (raro): soma no dia certo
    if (b) return b;
    b = { day, counts: {}, visitors: 0, peakOnline: 0, characters: {} };
    this.days.push(b);
    this.days.sort((x, y) => x.day.localeCompare(y.day));
    const cutoff = oldestKept(this.clock(), this.timeZone);
    this.days = this.days.filter((d) => d.day >= cutoff).slice(-USAGE_DAYS);
    return b;
  }

  private apply(e: UsageEvent) {
    const b = this.bucket();
    const add = (k: Counter, n = 1) => { const v = count(n); if (v) b.counts[k] = (b.counts[k] ?? 0) + v; };
    const simple = SIMPLE[e.type];
    if (simple) add(simple);
    else if (e.type === 'gameStarted') {
      add('gamesStarted');
      const valid = e.characters.filter((c) => Number.isInteger(c) && c >= 0 && c < CHARACTER_MAX);
      add('players', e.characters.length);
      for (const c of valid) b.characters[c] = (b.characters[c] ?? 0) + 1;
    } else if (e.type === 'gameFinished') { add('gamesFinished'); add('gameMs', e.ms); add('shoves', e.shoves); add('falls', e.falls); }
    else if (e.type === 'gameAbandoned') add('gamesAbandoned');
    else if (e.type === 'groqTokens') add('groqTokens', e.n);
    else if (e.type === 'online') { const n = count(e.n); if (n !== null && n > b.peakOnline) b.peakOnline = n; }
    else if (e.type === 'visit') {
      if (this.visit.day !== b.day) this.visit = { day: b.day, salt: Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('hex'), seen: new Set() };
      if (this.visit.seen.size >= VISITORS_PER_DAY_MAX) return;
      const h = new Bun.CryptoHasher('sha256').update(this.visit.salt).update(e.token).digest('hex').slice(0, 16);
      if (this.visit.seen.has(h)) return;
      this.visit.seen.add(h);
      b.visitors = this.visit.seen.size;
    } else return;
    this.schedule();
  }

  private schedule() {
    if (!this.opts.file || this.timer) return;
    this.timer = setTimeout(() => { this.timer = undefined; this.flush(); }, this.saveDelay);
    // não segura o processo vivo só para gravar
    (this.timer as { unref?: () => void }).unref?.();
  }

  /** O que vai para o disco. */
  toJSON(): UsageFile {
    const today = dayKey(this.clock(), this.timeZone);
    const visit = this.visit.day === today ? this.visit : { day: today, salt: '', seen: new Set<string>() };
    return { version: 1, days: this.days, today: { day: visit.day, salt: visit.salt, seen: [...visit.seen] } };
  }

  /** Grava agora (temporário + renomear). Falhou: registra no log no máximo uma vez por hora e segue. */
  flush() {
    if (this.timer) { clearTimeout(this.timer); this.timer = undefined; }
    const file = this.opts.file;
    if (!file) return;
    try {
      mkdirSync(dirname(file), { recursive: true });
      const tmp = `${file}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.toJSON()));
      renameSync(tmp, file);
    } catch (err) {
      const now = this.clock();
      if (now - this.failedAt > 3600_000) { this.failedAt = now; this.opts.log?.('usage.saveFailed', { error: err instanceof Error ? err.message : String(err) }); }
    }
  }

  /** Para o timer de gravar (sem gravar). */
  dispose() { if (this.timer) clearTimeout(this.timer); this.timer = undefined; }

  /** Os últimos `n` dias (zerados os sem nada, do mais velho ao de hoje), os totais de tudo o que está guardado e os personagens mais escolhidos. */
  snapshot(n = 30): UsageView {
    const now = this.clock();
    const today = dayKey(now, this.timeZone);
    const byDay = new Map(this.days.map((d) => [d.day, d]));
    const days: DayView[] = [];
    // de trás para a frente, um dia por vez, pelo meio-dia (longe de qualquer virada de horário)
    const keys: string[] = [];
    for (let at = now; keys.length < n; at -= 86_400_000) {
      const k = dayKey(at, this.timeZone);
      if (keys.at(-1) !== k) keys.push(k);
    }
    for (const k of keys.reverse()) {
      const d = byDay.get(k);
      days.push(d ? { day: k, counts: { ...d.counts }, visitors: d.visitors, peakOnline: d.peakOnline } : { day: k, counts: {}, visitors: 0, peakOnline: 0 });
    }
    const totals: Counts = {};
    const picks: Record<string, number> = {};
    for (const d of this.days) {
      for (const [k, v] of Object.entries(d.counts) as [Counter, number][]) totals[k] = (totals[k] ?? 0) + v;
      for (const [c, v] of Object.entries(d.characters)) picks[c] = (picks[c] ?? 0) + v;
    }
    const topCharacters = Object.entries(picks).map(([c, p]) => ({ character: Number(c), picks: p })).sort((a, b) => b.picks - a.picks || a.character - b.character);
    return { days, totals, topCharacters, since: this.days[0]?.day ?? null, today };
  }
}
