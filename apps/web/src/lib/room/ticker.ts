import { realClock, type Clock } from './remote';

/** O que usamos de um Worker (para o teste trocar por um de mentira). */
export interface WorkerLike {
  postMessage(message: unknown): void;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onerror: ((ev?: unknown) => void) | null;
}

/** O Worker inteiro: agenda o que a página pede e avisa com o id quando vence. */
const SOURCE = `const t = new Map();
onmessage = (e) => {
  const m = e.data;
  if (m.set) t.set(m.set, setTimeout(() => { t.delete(m.set); postMessage(m.set); }, m.ms));
  else if (m.clear) { clearTimeout(t.get(m.clear)); t.delete(m.clear); }
};`;

function blobWorker(): WorkerLike {
  const url = URL.createObjectURL(new Blob([SOURCE], { type: 'text/javascript' }));
  return new Worker(url) as unknown as WorkerLike;
}

/**
 * Um `Clock` cujos timers rodam num Worker. O Chrome segura os timers de uma aba escondida há mais de 5 minutos a um por
 * minuto; os de um Worker dedicado não, e o aviso dele chega à página na hora. Assim o `ping` de uma aba esquecida no
 * fundo segue a cada 15 s e ela não perde o lugar (issue #72). Sem Worker, ou se ele quebra, os timers da página
 * (`fallback`) seguem no lugar dele, com o que estava agendado.
 */
let shared: Clock | null = null;
/** Um só `workerClock` para a página inteira: entrar e sair de salas não cria um Worker novo a cada vez. */
export function sharedWorkerClock(): Clock { return (shared ??= workerClock()); }

export function workerClock(make: () => WorkerLike = blobWorker, fallback: Clock = realClock): Clock {
  let worker: WorkerLike | null = null;
  try { worker = make(); } catch { worker = null; }
  let seq = 0;
  /** os agendados no Worker: id → a função e o tempo pedido */
  const tasks = new Map<number, { fn: () => void; ms: number }>();
  /** os que passaram para a página depois de o Worker quebrar: id → handle da página */
  const moved = new Map<number, unknown>();

  const breakDown = () => {
    worker = null;
    for (const [id, t] of tasks) moved.set(id, fallback.setTimeout(() => { moved.delete(id); t.fn(); }, t.ms));
    tasks.clear();
  };
  if (worker) {
    worker.onmessage = (ev) => {
      const id = Number(ev.data);
      const t = tasks.get(id);
      if (!t) return;
      tasks.delete(id);
      t.fn();
    };
    worker.onerror = breakDown;
  }

  return {
    setTimeout(fn, ms) {
      if (!worker) return { page: fallback.setTimeout(fn, ms) };
      const id = ++seq;
      tasks.set(id, { fn, ms });
      try { worker.postMessage({ set: id, ms }); } catch { breakDown(); }
      return id;
    },
    clearTimeout(handle) {
      if (handle && typeof handle === 'object' && 'page' in handle) { fallback.clearTimeout((handle as { page: unknown }).page); return; }
      const id = handle as number;
      if (moved.has(id)) { fallback.clearTimeout(moved.get(id)); moved.delete(id); return; }
      if (!tasks.delete(id)) return;
      try { worker?.postMessage({ clear: id }); } catch { /* o Worker já quebrou: nada a cancelar lá */ }
    },
  };
}
