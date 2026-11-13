import { describe, expect, test } from 'bun:test';
import { workerClock, type WorkerLike } from '../src/lib/room/ticker';
import { ManualClock } from './manual-clock';

/** Um Worker de mentira: guarda o que recebeu; `fire(id)` faz como se o timer dele tivesse vencido. */
function fakeWorker() {
  const w = {
    got: [] as unknown[], onmessage: null as ((e: { data: unknown }) => void) | null, onerror: null as (() => void) | null,
    postMessage(m: unknown) { w.got.push(m); },
    fire(id: number) { w.onmessage?.({ data: id }); },
  };
  return w;
}

describe('relógio num Worker (abas no fundo, issue #72)', () => {
  test('agenda e cancela no Worker, e roda a função quando ele avisa', () => {
    const w = fakeWorker();
    const clock = workerClock(() => w as WorkerLike);
    let ran = 0;
    const a = clock.setTimeout(() => { ran++; }, 15_000);
    const b = clock.setTimeout(() => { ran += 10; }, 500);
    expect(w.got).toEqual([{ set: a, ms: 15_000 }, { set: b, ms: 500 }]);
    clock.clearTimeout(b);
    expect(w.got.at(-1)).toEqual({ clear: b });
    w.fire(b as number); // chegou depois de cancelado: nada
    w.fire(a as number);
    w.fire(a as number); // repetido: uma vez só
    expect(ran).toBe(1);
  });

  test('sem Worker (navegador sem, ou bloqueado), usa os timers da página', () => {
    const fallback = new ManualClock();
    const clock = workerClock(() => { throw new Error('sem Worker'); }, fallback);
    let ran = false;
    clock.setTimeout(() => { ran = true; }, 100);
    expect(fallback.pending).toBe(1);
    fallback.run();
    expect(ran).toBe(true);
  });

  test('se o Worker quebra, o que estava agendado passa para os timers da página', () => {
    const w = fakeWorker();
    const fallback = new ManualClock();
    const clock = workerClock(() => w as WorkerLike, fallback);
    let ran = false;
    clock.setTimeout(() => { ran = true; }, 100);
    w.onerror?.();
    expect(fallback.pending).toBe(1);
    fallback.run();
    expect(ran).toBe(true);
    clock.setTimeout(() => {}, 5);
    expect(fallback.pending).toBe(1);
  });
});
