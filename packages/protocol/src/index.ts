/**
 * Mensagens trocadas entre cliente e servidor pelo WebSocket, nos dois sentidos, e o snapshot da sala que cada pessoa
 * recebe. Cliente e servidor importam daqui; nada é duplicado.
 */
import { NICKNAME_MAX } from '@guess/rules';

/** O cliente manda `ping` neste intervalo; o servidor derruba quem fica o dobro em silêncio (e o cliente derruba um socket que não responde nada por um intervalo inteiro). */
export const PING_INTERVAL = 15_000;
export const SOCKET_IDLE_TIMEOUT = 30_000;

/** Token por aba (ADR 0003): o que identifica a pessoa entre conexões. */
export const TOKEN_RE = /^[A-Za-z0-9_-]{8,64}$/;
/** Código de sala: quatro letras, sem I nem O (não se confundem com 1 e 0). */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const CODE_LENGTH = 4;
export const CODE_RE = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

/** Códigos de fechamento do WebSocket que o cliente sabe explicar (4xxx = da aplicação, sem reconectar). */
export const CLOSE_ROOM_NOT_FOUND = 4404;
export const CLOSE_ROOM_ENDED = 4410;
export const CLOSE_REPLACED = 4409;

/** Uma mensagem de texto do cliente não passa disto. */
const MESSAGE_MAX = 4096;

// cliente → servidor
export type ClientMessage =
  /** entra na turma com um apelido (repetido ganha sufixo); quem já está na turma só troca o apelido */
  | { type: 'join'; nickname: string }
  /** troca o próprio apelido */
  | { type: 'nickname'; nickname: string }
  | { type: 'ping' };

/** Por que um pedido foi recusado: a sala já tem `MAX_MEMBERS`. */
export type RoomError = 'roomFull';

// servidor → cliente
export type ServerMessage =
  | { type: 'snapshot'; snapshot: RoomSnapshot }
  /** pedido recusado, só para quem pediu; o snapshot que a pessoa tem continua valendo */
  | { type: 'error'; error: RoomError }
  | { type: 'pong' };

/** Uma pessoa da turma como todo mundo a vê. */
export interface MemberView {
  /** id público, `m` e um número; o token nunca sai do servidor */
  id: string;
  nickname: string;
  connected: boolean;
}

/** A sala como uma pessoa a vê. Inteira a cada mudança: o cliente nunca faz diff. */
export interface RoomSnapshot {
  code: string;
  phase: 'lobby';
  /** o id de quem recebe; null = ainda não entrou com apelido (visitante) */
  you: string | null;
  /** o id do moderador; null = turma vazia */
  moderator: string | null;
  /** a turma, na ordem em que entrou */
  members: MemberView[];
}

/** Lê uma mensagem crua do socket; qualquer coisa fora do formato vira null (o servidor descarta e registra). */
export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (typeof raw !== 'string' || raw.length > MESSAGE_MAX) return null;
  let v: unknown;
  try { v = JSON.parse(raw); } catch { return null; }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const m = v as Record<string, unknown>;
  switch (m.type) {
    case 'ping': return { type: 'ping' };
    case 'join':
    case 'nickname':
      if (typeof m.nickname !== 'string' || m.nickname.length > NICKNAME_MAX * 4) return null;
      return { type: m.type, nickname: m.nickname };
    default: return null;
  }
}
