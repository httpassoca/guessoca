import { describe, expect, test } from 'bun:test';
import {
  applyShove,
  BODY_H,
  BODY_RX,
  BODY_RZ,
  SHOVE_COOLDOWN_MS,
  SHOVE_DY,
  SHOVE_DZ,
  SHOVE_REACH,
  SHOVE_STUN_MS,
  SHOVE_VX,
  SHOVE_VY,
  shoveTargets,
  type Other,
} from '../src';
import { bodyAt, DT, first, kinds, near, once, other, run, T0 } from './sim';

describe('os outros corpos', () => {
  test('não se atravessa outro corpo', () => {
    const b = other('b', 100, 0, 10);
    const r = run(bodyAt(60, 10), { right: true }, 2, { others: [b] });
    expect(Math.max(...r.trace.map((t) => t.x))).toBeLessThanOrEqual(100 - 2 * BODY_RX + 0.01);
    near(r.body.x, 100 - 2 * BODY_RX, 0.5);
    near(r.body.z, 10, 0.01);
  });

  test('vindo de raspão, escorrega em volta dele em vez de atravessar', () => {
    const b = other('b', 100, 0, 10);
    const r = run(bodyAt(60, 18), { right: true }, 2, { others: [b] });
    for (const t of r.trace) {
      const d = ((t.x - b.x) / (2 * 8)) ** 2 + ((t.z - b.z) / (2 * 5)) ** 2;
      expect(d).toBeGreaterThanOrEqual(1 - 1e-6);
    }
    expect(r.body.x).toBeGreaterThan(100);
  });

  test('passa por quem não é sólido, e não fica na cabeça dele', () => {
    const ghost = other('b', 100, 0, 10, { solid: false });
    expect(run(bodyAt(60, 10), { right: true }, 2, { others: [ghost] }).body.x).toBeGreaterThan(100);
    const fall = run(bodyAt(100, 10, { y: 80 }), {}, 1, { others: [ghost] });
    expect(fall.body).toMatchObject({ y: 0, riding: null });
  });

  test('quem está em outra altura (no telhado de cima) não atrapalha', () => {
    const above = other('b', 100, BODY_H + 10, 10);
    expect(run(bodyAt(60, 10), { right: true }, 2, { others: [above] }).body.x).toBeGreaterThan(100);
  });

  test('cai na cabeça de alguém: fica em cima, avisa o pouso e marca em quem está', () => {
    const r = run(bodyAt(100, 10, { y: 80 }), {}, 1, { others: [other('b', 100, 0, 10)] });
    expect(kinds(r)).toEqual(['land']);
    expect(r.body).toMatchObject({ y: BODY_H, grounded: true, riding: 'b', vy: 0 });
  });

  test('pula e sobe na cabeça de alguém', () => {
    const b = other('b', 100, 0, 10);
    const r = run(bodyAt(70, 10), (body, i) => ({ jump: i === 0, right: body.y > BODY_H }), 1, { others: [b] });
    expect(r.body).toMatchObject({ y: BODY_H, riding: 'b' });
  });

  test('um corpo mais alto (`h`, o chefão dos bots): não se passa por dentro dele pulando, e a cabeça fica lá em cima', () => {
    const giant = other('b', 100, 0, 10, { h: 2 * BODY_H, wide: 1.5 });
    // pulando contra ele, bate no lado mesmo no alto do pulo (num corpo comum, subiria na cabeça), e mais longe (`wide`)
    const r = run(bodyAt(60, 10), (body, i) => ({ jump: i === 0, right: true }), 1.5, { others: [giant] });
    expect(Math.max(...r.trace.map((t) => t.x))).toBeLessThanOrEqual(100 - 3 * BODY_RX + 0.01);
    near(r.body.x, 100 - 3 * BODY_RX, 0.5);
    // por trás dele passa-se como por qualquer um
    expect(run(bodyAt(60, 10 + 2 * BODY_RZ + 1), { right: true }, 2, { others: [giant] }).body.x).toBeGreaterThan(140);
    expect(r.body).toMatchObject({ y: 0, riding: null });
    // caindo de cima, pousa na cabeça, na altura dele
    const top = run(bodyAt(100, 10, { y: 140 }), {}, 1, { others: [giant] });
    expect(top.body).toMatchObject({ y: 2 * BODY_H, grounded: true, riding: 'b' });
  });

  test('é carregado quando quem está embaixo anda', () => {
    const start = run(bodyAt(100, 10, { y: 80 }), {}, 1, { others: [other('b', 100, 0, 10)] });
    const walking = (now: number): Other[] => {
      const t = (now - start.now) / 1000;
      return [other('b', 100 + 50 * t, 0, 10 + 20 * t, { vx: 50, vz: 20 })];
    };
    const r = run(start.body, {}, 1, { now: start.now, others: walking });
    near(r.body.x, 150, 0.5);
    near(r.body.z, 30, 0.5);
    expect(r.body).toMatchObject({ y: BODY_H, riding: 'b', grounded: true });
    expect(r.events).toEqual([]);
  });

  test('cai quando quem está embaixo sai de baixo', () => {
    const start = run(bodyAt(100, 10, { y: 80 }), {}, 1, { others: [other('b', 100, 0, 10)] });
    const r = run(start.body, {}, 1, { now: start.now, others: [other('b', 140, 0, 10)] });
    expect(r.body).toMatchObject({ y: 0, grounded: true, riding: null });
    expect(kinds(r)).toEqual(['land']);
  });

  test('quem some da lista também deixa de carregar', () => {
    const start = run(bodyAt(100, 10, { y: 80 }), {}, 1, { others: [other('b', 100, 0, 10)] });
    const r = run(start.body, {}, 1, { now: start.now, others: [] });
    expect(r.body).toMatchObject({ y: 0, riding: null });
  });
});

describe('empurrão', () => {
  test('empurra quem está ao alcance, e só de novo depois do intervalo', () => {
    const r = run(bodyAt(100, 10), { shove: true }, 1, { others: [other('b', 120, 0, 10)] });
    const shoves = r.events.filter((e) => e.event.type === 'shove');
    expect(shoves.length).toBe(3);
    expect(shoves[0].event).toEqual({ type: 'shove', targets: ['b'] });
    expect(shoves[0].i).toBe(0);
    expect(shoves[0].body.shoveUntil).toBe(shoves[0].now + SHOVE_COOLDOWN_MS);
    for (let k = 1; k < shoves.length; k++) {
      const gap = shoves[k].now - shoves[k - 1].now;
      expect(gap).toBeGreaterThanOrEqual(SHOVE_COOLDOWN_MS);
      expect(gap).toBeLessThan(SHOVE_COOLDOWN_MS + DT * 1000 + 1);
    }
  });

  test('empurrar sem ninguém na frente sai vazio', () => {
    const r = run(bodyAt(100, 10), once({ shove: true }), 0.1);
    expect(r.events.map((e) => e.event)).toEqual([{ type: 'shove', targets: [] }]);
  });

  test('alcança só quem está na frente, perto em z e em y, e sólido', () => {
    const reach = SHOVE_REACH + BODY_RX;
    const me = bodyAt(100, 10);
    const others = [
      other('front', 120, 0, 10),
      other('edge', 100 + reach, 0, 10),
      other('far', 100 + reach + 0.5, 0, 10),
      other('behind', 80, 0, 10),
      other('same', 100, 0, 10),
      other('deep', 120, 0, 10 + SHOVE_DZ),
      other('tooDeep', 120, 0, 10 + SHOVE_DZ + 0.5),
      other('up', 120, SHOVE_DY, 10),
      other('tooHigh', 120, SHOVE_DY + 0.5, 10),
      other('ghost', 120, 0, 10, { solid: false }),
    ];
    expect(shoveTargets(me, others)).toEqual(['front', 'edge', 'deep', 'up']);
    expect(shoveTargets({ ...me, facing: -1 }, others)).toEqual(['behind']);
  });

  test('quem é empurrado voa para lá e para cima, atordoado e solto da cabeça', () => {
    const b = { ...bodyAt(100, 10), riding: 'c' };
    const hit = applyShove(b, -1, T0);
    expect(hit).toMatchObject({
      vx: -SHOVE_VX,
      vy: SHOVE_VY,
      grounded: false,
      riding: null,
      stunnedUntil: T0 + SHOVE_STUN_MS,
      x: 100,
      y: 0,
      z: 10,
    });
    expect(b.vx).toBe(0);
  });

  test('atordoado, o teclado não vale; depois volta', () => {
    const hit = applyShove(bodyAt(100, 10), 1, T0);
    const stunned = run(hit, { left: true, jump: true, shove: true }, (SHOVE_STUN_MS - 20) / 1000);
    expect(kinds(stunned)).toEqual(['land']);
    for (let k = 1; k < stunned.trace.length; k++) expect(stunned.trace[k].x).toBeGreaterThan(stunned.trace[k - 1].x);
    expect(stunned.body.facing).toBe(1);

    const free = run(stunned.body, { left: true }, 0.5, { now: stunned.now });
    expect(free.body.x).toBeLessThan(stunned.body.x);
    expect(free.body.facing).toBe(-1);
  });

  test('atordoado no chão, escorrega até parar', () => {
    const sliding = { ...bodyAt(100, 10), vx: 200, stunnedUntil: T0 + 5000 };
    const r = run(sliding, { left: true }, 0.1);
    expect(r.body.vx).toBeGreaterThan(0);
    expect(r.body.vx).toBeLessThan(200);
    expect(run(r.body, {}, 1, { now: r.now }).body.vx).toBe(0);
  });

  test('empurrado na beirada, sai do telhado e cai na rua', () => {
    const r = run(applyShove(bodyAt(240, 10), 1, T0), {}, 2);
    expect(kinds(r)).toContain('fell');
  });

  test('empurrado longe da beirada, voa e fica no telhado', () => {
    const r = run(applyShove(bodyAt(60, 10), 1, T0), {}, 2);
    expect(kinds(r)).toEqual(['land']);
    expect(r.body).toMatchObject({ y: 0, grounded: true, vx: 0 });
    expect(r.body.x).toBeGreaterThan(60 + 60);
  });
});
