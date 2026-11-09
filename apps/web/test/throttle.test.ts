import { describe, expect, test } from 'bun:test';
import { throttle } from '../src/lib/throttle';
import { ManualClock } from './manual-clock';

describe('throttle (cada tecla do post-it)', () => {
  test('a primeira chamada sai na hora; as do meio viram uma só, com o último valor, no fim do intervalo', () => {
    const clock = new ManualClock();
    const out: string[] = [];
    const t = throttle((s: string) => out.push(s), 100, clock);
    t.call('P'); t.call('Pe'); t.call('Pel'); t.call('Pelé');
    expect(out).toEqual(['P']);
    clock.step();
    expect(out).toEqual(['P', 'Pelé']);
    clock.run(); // a janela que reabriu fecha sem nada pendente
    expect(out).toEqual(['P', 'Pelé']);
    expect(clock.pending).toBe(0);
  });

  test('depois de um intervalo quieto, sai na hora de novo', () => {
    const clock = new ManualClock();
    const out: number[] = [];
    const t = throttle((n: number) => out.push(n), 100, clock);
    t.call(1);
    clock.step(); // fecha a janela sem nada pendente
    t.call(2);
    expect(out).toEqual([1, 2]);
  });

  test('flush manda o pendente agora (Pronto), e não repete depois', () => {
    const clock = new ManualClock();
    const out: string[] = [];
    const t = throttle((s: string) => out.push(s), 100, clock);
    t.call('a'); t.call('ab');
    t.flush();
    expect(out).toEqual(['a', 'ab']);
    clock.run();
    expect(out).toEqual(['a', 'ab']);
  });

  test('cancel descarta o pendente', () => {
    const clock = new ManualClock();
    const out: string[] = [];
    const t = throttle((s: string) => out.push(s), 100, clock);
    t.call('a'); t.call('ab');
    t.cancel();
    clock.run();
    expect(out).toEqual(['a']);
  });
});
