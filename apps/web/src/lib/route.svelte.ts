import { parseRoute } from './route';

export { roomPath, type Route } from './route';

/** A rota da hora, reativa; muda por `navigate` e pelo voltar/avançar do navegador. */
export const route = $state({ current: parseRoute(typeof location === 'undefined' ? '/' : location.pathname) });

export function navigate(path: string) {
  history.pushState(null, '', path);
  route.current = parseRoute(path);
}

if (typeof window !== 'undefined') window.addEventListener('popstate', () => { route.current = parseRoute(location.pathname); });
