import { CODE_RE } from '@guess/protocol';

/** Rotas: `/` início, `/sala/CODE` sala. O código vai na URL para o link funcionar; fora do formato, volta ao início. */
export type Route = { name: 'home' } | { name: 'sala'; code: string };

export function parseRoute(pathname: string): Route {
  const m = pathname.match(/^\/sala\/([^/]+)\/?$/);
  const code = m?.[1].toUpperCase();
  return code && CODE_RE.test(code) ? { name: 'sala', code } : { name: 'home' };
}

export const roomPath = (code: string) => `/sala/${code.toUpperCase()}`;
