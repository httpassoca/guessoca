import type { ClientMessage, RoomError, RoomSnapshot, ServerMessage } from '@guess/protocol';
import { MAX_MEMBERS, uniqueNickname } from '@guess/rules';

/** A sala morre depois deste tempo sem atividade (ADR 0003). */
export const ROOM_TTL = 10 * 60_000;

export interface RoomMember {
  /** id público (vai no snapshot) */
  id: string;
  /** segredo da aba; identifica a pessoa entre conexões e nunca sai do servidor */
  token: string;
  nickname: string;
  connected: boolean;
  joinedAt: number;
}

/** Timers pendentes como dado: o adaptador agenda, e devolve como entrada quando vencem. */
export type RoomTimer = { kind: 'death'; at: number };

export interface RoomState {
  code: string;
  /** `lobby`: a turma se junta; `dead`: encerrada, não aceita mais nada */
  phase: 'lobby' | 'dead';
  createdAt: number;
  lastActivity: number;
  /** a turma, na ordem em que entrou; quem cai continua aqui até a sala morrer */
  members: RoomMember[];
  /** tokens conectados que ainda não entraram com apelido */
  visitors: string[];
  nextId: number;
  timers: RoomTimer[];
  /** id do moderador; null = turma vazia */
  moderator: string | null;
  /** quanto a sala vive sem atividade: `ROOM_TTL` (os testes do host apressam) */
  ttl: number;
}

export type RoomInput =
  | { kind: 'connect'; token: string }
  /** `since`: quando a pessoa deu o último sinal de vida, se a queda só foi notada pelo silêncio. Hoje a sala não usa: cair não é atividade */
  | { kind: 'disconnect'; token: string; since?: number }
  | { kind: 'message'; token: string; message: ClientMessage }
  | { kind: 'timer'; timer: RoomTimer };

export interface Outgoing { to: string; message: ServerMessage }

/** O que aconteceu de notável, para o log do servidor. */
export type RoomEvent =
  | { type: 'joined'; id: string; nickname: string }
  | { type: 'renamed'; id: string; from: string; to: string }
  | { type: 'disconnected'; id: string; nickname: string }
  | { type: 'reconnected'; id: string; nickname: string }
  | { type: 'refused'; error: RoomError }
  | { type: 'died' };

export interface RoomOutput { state: RoomState; out: Outgoing[]; events: RoomEvent[] }

/** `ttl`: quanto a sala vive sem atividade (os testes do host apressam). */
export function createRoom(code: string, now: number, ttl = ROOM_TTL): RoomState {
  return {
    code, phase: 'lobby', createdAt: now, lastActivity: now, members: [], visitors: [], nextId: 1,
    timers: [{ kind: 'death', at: now + ttl }], moderator: null, ttl,
  };
}

/**
 * Única porta da sala: estado atual + entrada + hora → estado novo, mensagens por destinatário e eventos.
 * Nunca mexe no estado recebido e nunca agenda nada; os timers ficam em `state.timers`.
 */
export function step(state: RoomState, input: RoomInput, now: number): RoomOutput {
  const s = structuredClone(state);
  const out: Outgoing[] = [];
  const events: RoomEvent[] = [];
  if (s.phase === 'dead') return { state: s, out, events };

  const member = (token: string) => s.members.find((m) => m.token === token);
  /** todo token conectado recebe a sala inteira, como ele a vê */
  const broadcast = () => { for (const t of connectedTokens(s)) out.push({ to: t, message: { type: 'snapshot', snapshot: snapshotFor(s, t) } }); };
  /** uma ação de alguém da turma: a morte volta a ficar a `ttl` dela */
  const touch = () => {
    s.lastActivity = now;
    s.timers = [{ kind: 'death', at: s.lastActivity + s.ttl }];
  };
  const othersNicknames = (self?: RoomMember) => s.members.filter((m) => m !== self).map((m) => m.nickname);

  switch (input.kind) {
    case 'connect': {
      // conectar e cair não são atividade (como no trucossoca): uma aba que cai e volta sem parar não segura a sala viva
      const m = member(input.token);
      if (m) {
        if (!m.connected) { m.connected = true; events.push({ type: 'reconnected', id: m.id, nickname: m.nickname }); }
        broadcast(); // para quem já estava conectado (aba que assumiu o lugar de outra), só reenvia o snapshot
      } else {
        if (!s.visitors.includes(input.token)) s.visitors.push(input.token);
        out.push({ to: input.token, message: { type: 'snapshot', snapshot: snapshotFor(s, input.token) } });
      }
      break;
    }
    case 'disconnect': {
      const m = member(input.token);
      if (m) {
        // o lugar fica guardado até a sala morrer: a pessoa só aparece desconectada
        if (!m.connected) break;
        m.connected = false;
        events.push({ type: 'disconnected', id: m.id, nickname: m.nickname });
        broadcast();
      } else if (s.visitors.includes(input.token)) {
        s.visitors = s.visitors.filter((t) => t !== input.token);
      }
      break;
    }
    case 'message': {
      const msg = input.message;
      const m = member(input.token);
      if (msg.type === 'ping') {
        // não é atividade: uma aba esquecida aberta não segura a sala viva
        if (m || s.visitors.includes(input.token)) out.push({ to: input.token, message: { type: 'pong' } });
        break;
      }
      if (msg.type === 'join' && !m) {
        if (!s.visitors.includes(input.token)) break;
        if (s.members.length >= MAX_MEMBERS) {
          out.push({ to: input.token, message: { type: 'error', error: 'roomFull' } });
          events.push({ type: 'refused', error: 'roomFull' });
          break;
        }
        s.visitors = s.visitors.filter((t) => t !== input.token);
        const created: RoomMember = { id: `m${s.nextId++}`, token: input.token, nickname: uniqueNickname(msg.nickname, othersNicknames()), connected: true, joinedAt: now };
        s.members.push(created);
        s.moderator ??= created.id;
        touch();
        events.push({ type: 'joined', id: created.id, nickname: created.nickname });
        broadcast();
        break;
      }
      if (!m) break;
      // `nickname`, ou `join` de quem já é membro: troca de apelido
      const to = uniqueNickname(msg.nickname, othersNicknames(m));
      touch();
      if (to !== m.nickname) {
        events.push({ type: 'renamed', id: m.id, from: m.nickname, to });
        m.nickname = to;
        broadcast();
      }
      break;
    }
    case 'timer': {
      if (!s.timers.some((t) => timerKey(t) === timerKey(input.timer))) break; // já cancelado ou substituído
      s.phase = 'dead';
      s.timers = [];
      events.push({ type: 'died' });
      break;
    }
  }
  return { state: s, out, events };
}

/** Quem deve receber snapshot: membros conectados e visitantes. */
export function connectedTokens(s: RoomState): string[] {
  return [...s.members.filter((m) => m.connected).map((m) => m.token), ...s.visitors];
}

/** A sala como este token a vê. Sem tokens; só ids públicos. Visitante (ainda sem apelido) tem `you` null. */
export function snapshotFor(s: RoomState, token: string): RoomSnapshot {
  return {
    code: s.code,
    phase: 'lobby',
    you: s.members.find((m) => m.token === token)?.id ?? null,
    moderator: s.moderator,
    members: s.members.map((m) => ({ id: m.id, nickname: m.nickname, connected: m.connected })),
  };
}

/** Identidade de um timer é o seu conteúdo: o adaptador usa a mesma chave para agendar e cancelar. */
export function timerKey(t: RoomTimer) { return `${t.kind}:${t.at}`; }
