import { describe, expect, test } from 'bun:test';
import { NO_INPUT } from '@guess/world';
import { Controls } from '../src/lib/world/controls';
import { fixedSteps, STEP_MS } from '../src/lib/world/loop';

describe('controles do telhado', () => {
  test('o que está segurado vale a cada passo, até soltar', () => {
    const c = new Controls();
    c.hold('left'); c.hold('run');
    expect(c.take()).toEqual({ ...NO_INPUT, left: true, run: true });
    expect(c.take()).toEqual({ ...NO_INPUT, left: true, run: true });
    c.release('left');
    expect(c.take()).toEqual({ ...NO_INPUT, run: true });
  });

  test('pular e empurrar valem num passo só, mesmo que a tecla já tenha subido', () => {
    const c = new Controls();
    c.press('jump');
    c.press('shove');
    expect(c.take()).toEqual({ ...NO_INPUT, jump: true, shove: true });
    expect(c.take()).toEqual(NO_INPUT);
  });

  test('o aperto espera o próximo passo (um quadro sem passo não o perde)', () => {
    const c = new Controls();
    c.press('jump');
    // nenhum passo neste quadro: nada foi tomado
    expect(c.take().jump).toBe(true);
  });

  test('soltar tudo (perdeu o foco, abriu o menu) esquece o segurado e o apertado', () => {
    const c = new Controls();
    c.hold('right'); c.hold('up'); c.press('jump');
    c.releaseAll();
    expect(c.take()).toEqual(NO_INPUT);
  });

  test('esquerda e direita juntas: a última apertada vale', () => {
    const c = new Controls();
    c.hold('left'); c.hold('right');
    expect(c.take()).toMatchObject({ left: false, right: true });
    c.release('right');
    expect(c.take()).toMatchObject({ left: true, right: false });
    c.hold('up'); c.hold('down');
    expect(c.take()).toMatchObject({ up: false, down: true });
  });
});

describe('passo fixo a 60 Hz', () => {
  test('o tempo real vira passos inteiros; a sobra fica para o próximo quadro', () => {
    let r = fixedSteps(0, STEP_MS * 2.5);
    expect(r.steps).toBe(2);
    r = fixedSteps(r.acc, STEP_MS * 0.6);
    expect(r.steps).toBe(1);
    expect(r.acc).toBeCloseTo(STEP_MS * 0.1);
  });

  test('um monitor de 144 Hz tem quadros sem passo', () => {
    expect(fixedSteps(0, 1000 / 144).steps).toBe(0);
  });

  test('depois de a aba dormir, não tenta recuperar segundos inteiros', () => {
    const r = fixedSteps(0, 5000);
    expect(r.steps).toBeLessThanOrEqual(15);
    expect(r.acc).toBeLessThan(STEP_MS);
  });

  test('60 Hz', () => expect(STEP_MS).toBeCloseTo(1000 / 60));
});
