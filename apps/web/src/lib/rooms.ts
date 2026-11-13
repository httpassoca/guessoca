import { CODE_RE, type RoomInit, type RoomPeek } from '@guess/protocol';

/**
 * Pede uma sala nova ao servidor, com as configurações do pré-lobby no corpo (JSON), e devolve o código. `fetcher` é
 * injetável para o teste.
 */
export async function openRoom(init: RoomInit = {}, fetcher: (url: string, init?: RequestInit) => Promise<Response> = fetch): Promise<string> {
  const r = await fetcher('/api/rooms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(init) });
  if (!r.ok) throw new Error(`servidor respondeu ${r.status}`);
  const { code } = (await r.json()) as { code?: unknown };
  if (typeof code !== 'string' || !CODE_RE.test(code)) throw new Error('servidor mandou um código estranho');
  return code;
}

/**
 * O que o início sabe de uma sala antes de ir para ela: `missing` (código errado ou sala que acabou), `full` (cheia e eu
 * não sou da turma), `playing` (jogo em andamento: entro de fantasma), `ok`; `unknown` quando não deu para saber (rede, ou
 * um servidor antigo sem a rota, que responde o index.html): aí o início segue para a sala como sempre.
 */
export type RoomCheck = { kind: 'missing' } | { kind: 'full'; max: number } | { kind: 'playing' } | { kind: 'ok' } | { kind: 'unknown' };

/** A decisão a partir da resposta de `GET /api/rooms/CODE` (`status` e o corpo já lido como JSON, ou null). */
export function roomCheck(status: number, body: unknown): RoomCheck {
  if (status === 404 && body && typeof body === 'object' && (body as { found?: unknown }).found === false) return { kind: 'missing' };
  if (status !== 200 || !body || typeof body !== 'object') return { kind: 'unknown' };
  const p = body as Partial<RoomPeek>;
  if (typeof p.members !== 'number' || typeof p.maxPlayers !== 'number' || typeof p.phase !== 'string') return { kind: 'unknown' };
  if (!p.member && p.members >= p.maxPlayers) return { kind: 'full', max: p.maxPlayers };
  return !p.member && p.phase !== 'lobby' ? { kind: 'playing' } : { kind: 'ok' };
}

/** Pergunta ao servidor pela sala `code` (com o meu token, para saber se já sou da turma). Nunca lança: na dúvida, `unknown`. */
export async function peekRoom(code: string, token: string, fetcher: (url: string, init?: RequestInit) => Promise<Response> = fetch): Promise<RoomCheck> {
  try {
    const r = await fetcher(`/api/rooms/${encodeURIComponent(code)}?token=${encodeURIComponent(token)}`);
    let body: unknown = null;
    try { body = await r.json(); } catch { /* não é JSON: servidor antigo */ }
    return roomCheck(r.status, body);
  } catch { return { kind: 'unknown' }; }
}

/** Endereço do WebSocket na mesma origem (em dev o Vite faz proxy para o servidor). */
export const wsUrl = () => `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`;
