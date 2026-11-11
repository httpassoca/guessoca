import { describe, expect, test } from 'bun:test';
import { createBody, MAP, NO_INPUT, SHOVE_COOLDOWN_MS, SHOVE_MAX_MS, shoveLock, stepBody } from '../src';
import { bodyAt, DT, once, run, T0 } from './sim';

/** a hora do passo `i` de um `run` que começou em T0 */
const at = (i: number) => T0 + (i + 1) * DT * 1000;
/** o índice do passo em que já se passaram `ms` */
const step = (ms: number) => Math.round(ms / (DT * 1000)) - 1;

describe('animação', () => {
  test('parado = idle, andando = walk, correndo = run, em profundidade = walk', () => {
    expect(run(bodyAt(50, 10), {}, 0.1).body.anim).toBe('idle');
    expect(run(bodyAt(50, 10), { right: true }, 0.1).body.anim).toBe('walk');
    expect(run(bodyAt(50, 10), { right: true, run: true }, 0.1).body.anim).toBe('run');
    expect(run(bodyAt(50, 10), { up: true }, 0.1).body.anim).toBe('walk');
  });

  test('a animação só recomeça (animSince) quando muda', () => {
    const r = run(bodyAt(50, 10), { right: true }, 0.5);
    expect(new Set(r.trace.map((b) => b.animSince))).toEqual(new Set([at(0)]));
    const stop = run(r.body, {}, 0.1, { now: r.now });
    expect(stop.body).toMatchObject({ anim: 'idle', animSince: r.now + DT * 1000 });
  });

  test('o pulo: jump subindo, fall descendo, e idle ao pousar', () => {
    const r = run(bodyAt(50, 10), once({ jump: true }), 1);
    expect(r.trace[0].anim).toBe('jump');
    expect(r.trace[15].anim).toBe('jump');
    const falling = r.trace.findIndex((b) => b.anim === 'fall');
    expect(falling).toBeGreaterThan(15);
    expect(r.trace[falling].vy).toBeLessThanOrEqual(0);
    expect(r.trace[falling - 1].vy).toBeGreaterThan(0);
    expect(r.trace[falling].animSince).toBe(at(falling));
    expect(r.body.anim).toBe('idle');
  });

  test('caindo de longe: fall uma vez (~333 ms) e depois fall_loop', () => {
    const r = run(bodyAt(100, 10, { y: 400 }), {}, 0.6);
    expect(r.trace[0]).toMatchObject({ anim: 'fall', animSince: at(0) });
    expect(r.trace[step(300)].anim).toBe('fall');
    const loop = r.trace.findIndex((b) => b.anim === 'fall_loop');
    expect(at(loop) - at(0)).toBeGreaterThanOrEqual(333);
    expect(at(loop) - at(0)).toBeLessThan(334 + DT * 1000);
    expect(r.trace[loop].animSince).toBe(at(loop));
    expect(r.body.anim).toBe('fall_loop');
  });

  test('empurrando = shove até shoveUntil, mesmo andando, e depois volta', () => {
    const r = run(bodyAt(50, 10), (_b, i) => ({ shove: i === 0, right: true }), 1);
    expect(r.trace[0]).toMatchObject({ anim: 'shove', shoveUntil: at(0) + SHOVE_COOLDOWN_MS });
    r.trace.forEach((b, i) => expect(b.anim).toBe(at(i) < at(0) + SHOVE_COOLDOWN_MS ? 'shove' : 'walk'));
  });

  test('empurrado no ar: jump subindo e fall descendo', () => {
    const r = run({ ...bodyAt(60, 10), vx: 200, vy: 160, grounded: false, stunnedUntil: T0 + 400 }, {}, 0.3);
    expect(r.trace[0].anim).toBe('jump');
    expect(r.trace.some((b) => b.anim === 'fall')).toBe(true);
  });
});

describe('o tempo do ataque', () => {
  test('o empurrão trava pelo tempo do ataque do personagem, entre o intervalo do jogo e o teto', () => {
    expect(shoveLock()).toBe(SHOVE_COOLDOWN_MS);
    expect(shoveLock(300)).toBe(SHOVE_COOLDOWN_MS); // um ataque curto segura o último quadro até o intervalo
    expect(shoveLock(900)).toBe(900); // uma rajada lenta dura o que dura
    expect(shoveLock(5000)).toBe(SHOVE_MAX_MS);
  });

  test('quem tem um ataque de 0,9 s fica na animação de ataque, e sem atacar de novo, por 0,9 s', () => {
    const now = 10_000;
    const ctx = { now, platforms: MAP, others: [], shoveMs: 900 };
    const hit = stepBody(createBody(MAP, now), { ...NO_INPUT, shove: true }, 1 / 60, ctx);
    expect(hit.events.some((e) => e.type === 'shove')).toBe(true);
    expect(hit.body.shoveUntil).toBe(now + 900);
    const mid = stepBody(hit.body, { ...NO_INPUT, shove: true }, 1 / 60, { ...ctx, now: now + 600 });
    expect(mid.events.some((e) => e.type === 'shove')).toBe(false);
    expect(mid.body.anim).toBe('shove');
    const after = stepBody(mid.body, NO_INPUT, 1 / 60, { ...ctx, now: now + 950 });
    expect(after.body.anim).not.toBe('shove');
  });
});
