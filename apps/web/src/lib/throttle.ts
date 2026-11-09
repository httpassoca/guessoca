import { realClock, type Clock } from './room/remote';

/**
 * Chama `fn` no máximo uma vez por `ms`: a primeira chamada sai na hora, as que chegam dentro do intervalo viram uma só,
 * com o último valor, no fim dele. É o post-it ao vivo: cada tecla manda o texto, sem afogar o socket.
 */
export function throttle<A extends unknown[]>(fn: (...args: A) => void, ms: number, clock: Clock = realClock) {
  let timer: unknown;
  let pending: A | null = null;
  const open = () => {
    timer = clock.setTimeout(() => {
      timer = undefined;
      if (pending) { const a = pending; pending = null; fn(...a); open(); }
    }, ms);
  };
  return {
    call(...args: A) {
      if (timer !== undefined) { pending = args; return; }
      fn(...args);
      open();
    },
    /** manda o pendente agora (ex.: "Pronto") */
    flush() {
      if (timer !== undefined) { clock.clearTimeout(timer); timer = undefined; }
      if (pending) { const a = pending; pending = null; fn(...a); }
    },
    /** esquece o pendente (ex.: a tela fechou) */
    cancel() {
      if (timer !== undefined) { clock.clearTimeout(timer); timer = undefined; }
      pending = null;
    },
  };
}
