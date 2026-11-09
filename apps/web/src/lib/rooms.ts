import { CODE_RE, type RoomInit } from '@guess/protocol';

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

/** Endereço do WebSocket na mesma origem (em dev o Vite faz proxy para o servidor). */
export const wsUrl = () => `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`;
