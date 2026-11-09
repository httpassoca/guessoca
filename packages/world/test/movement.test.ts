import { describe, expect, test } from 'bun:test';
import {
  BLINK_MS,
  blinking,
  createBody,
  DEPTH,
  DEPTH_SPEED,
  FALL_Y,
  groundAt,
  JUMP_V,
  MAP,
  NO_INPUT,
  RESPAWN_MS,
  RUN,
  spawnPoint,
  STEP,
  stepBody,
  WALK,
  WORLD_X0,
  WORLD_X1,
  type Platform,
} from '../src';
import { bodyAt, DT, first, kinds, near, once, run, T0 } from './sim';

describe('o mapa', () => {
  test('volta no meio do telhado mais alto, que é o do meio', () => {
    const roofs = MAP.filter((p) => p.kind === 'roof');
    const s = spawnPoint(MAP);
    expect(s.y).toBe(Math.max(...roofs.map((r) => r.top)));
    expect(s).toEqual({ x: 425, y: 24, z: DEPTH / 2 });
    expect(groundAt(MAP, s.x, s.z)).toBe(s.y);
  });

  test('caixas não são ponto de volta, e no empate fica o telhado mais perto do meio do mapa', () => {
    const map: Platform[] = [
      { kind: 'roof', x0: 0, x1: 100, z0: 0, z1: 40, top: 10 },
      { kind: 'roof', x0: 150, x1: 250, z0: 0, z1: 40, top: 10 },
      { kind: 'roof', x0: 300, x1: 340, z0: 0, z1: 40, top: 5 },
      { kind: 'box', x0: 10, x1: 30, z0: 0, z1: 10, top: 99 },
    ];
    expect(spawnPoint(map)).toEqual({ x: 200, y: 10, z: 20 });
  });

  test('o chão: telhados, caixas por cima deles e vãos', () => {
    expect(groundAt(MAP, 100, 10)).toBe(0);
    expect(groundAt(MAP, 425, 28)).toBe(24);
    expect(groundAt(MAP, 700, 10)).toBe(8);
    expect(groundAt(MAP, 140, 40)).toBe(28);
    expect(groundAt(MAP, 420, 50)).toBe(56);
    expect(groundAt(MAP, 720, DEPTH)).toBe(60);
    expect(groundAt(MAP, 285, 28)).toBeNull();
    expect(groundAt(MAP, 565, 28)).toBeNull();
    expect(groundAt(MAP, 100, -1)).toBeNull();
    expect(groundAt(MAP, 100, DEPTH + 1)).toBeNull();
    // as bordas ainda são chão
    expect(groundAt(MAP, 260, 0)).toBe(0);
    expect(groundAt(MAP, 310, DEPTH)).toBe(24);
  });

  test('um corpo novo nasce parado no ponto de volta, deslocado em x', () => {
    const b = createBody(MAP, T0);
    expect(b).toMatchObject({ x: 425, y: 24, z: 28, vx: 0, vy: 0, vz: 0, grounded: true, riding: null, anim: 'idle' });
    expect(b.animSince).toBe(T0);
    expect(b.respawnAt).toBeNull();
    expect(blinking(b, T0)).toBe(false);
    expect(createBody(MAP, T0, -30)).toMatchObject({ x: 395, y: 24, z: 28 });
  });
});

describe('gravidade', () => {
  test('parado no chão fica parado', () => {
    const b = createBody(MAP, T0);
    const r = run(b, {}, 2);
    expect(r.events).toEqual([]);
    expect(r.body).toMatchObject({ x: b.x, y: b.y, z: b.z, vx: 0, vy: 0, grounded: true, anim: 'idle' });
  });

  test('no ar cai com a gravidade, pousa no telhado e avisa uma vez', () => {
    const b = bodyAt(100, 10, { y: 100 });
    const falling = run(b, {}, 0.2);
    near(falling.body.y, 100 - 0.5 * 900 * 0.2 ** 2, 2);
    expect(falling.body.grounded).toBe(false);
    expect(falling.events).toEqual([]);

    const landed = run(falling.body, {}, 1, { now: falling.now });
    expect(landed.body).toMatchObject({ y: 0, vy: 0, grounded: true });
    expect(kinds(landed)).toEqual(['land']);
  });

  test('um passo grande (aba no fundo) é cortado em 50 ms', () => {
    const b = bodyAt(100, 10);
    const { body } = stepBody(b, { ...NO_INPUT, right: true }, 1, { now: T0 + 1000, platforms: MAP, others: [] });
    near(body.x, 100 + WALK * 0.05, 1e-9);
  });
});

describe('andar e pular', () => {
  test('anda a WALK e corre a RUN', () => {
    near(run(bodyAt(50, 10), { right: true }, 1).body.x, 50 + WALK, 0.5);
    near(run(bodyAt(50, 10), { right: true, run: true }, 1).body.x, 50 + RUN, 0.5);
    near(run(bodyAt(200, 10), { left: true }, 1).body.x, 200 - WALK, 0.5);
  });

  test('vira para o lado em que anda, e continua virado ao parar', () => {
    const left = run(bodyAt(100, 10), { left: true }, 0.1);
    expect(left.body.facing).toBe(-1);
    const stopped = run(left.body, {}, 0.1, { now: left.now });
    expect(stopped.body.facing).toBe(-1);
    expect(stopped.body.vx).toBe(0);
    expect(run(stopped.body, { right: true }, 0.1, { now: stopped.now }).body.facing).toBe(1);
  });

  test('anda em profundidade: up para o fundo, down para a frente, sem sair de 0..DEPTH', () => {
    const b = bodyAt(50, 10);
    near(run(b, { up: true }, 0.5).body.z, 10 + DEPTH_SPEED * 0.5, 0.5);
    expect(run(b, { up: true }, 2).body.z).toBe(DEPTH);
    expect(run(b, { down: true }, 2).body.z).toBe(0);
    const still = run(b, { down: true }, 2).body;
    expect(still).toMatchObject({ y: 0, grounded: true });
  });

  test('não pula no ar', () => {
    const r = run(bodyAt(100, 10, { y: 100 }), { jump: true }, 0.3);
    expect(kinds(r)).not.toContain('jump');
    expect(r.body.vy).toBeLessThan(0);
  });

  test('o pulo chega a uns 50 px e fica uns 2/3 de segundo no ar', () => {
    const r = run(bodyAt(50, 10), once({ jump: true }), 1.5);
    expect(kinds(r)).toEqual(['jump', 'land']);
    expect(first(r, 'jump').i).toBe(0);
    const apex = Math.max(...r.trace.map((b) => b.y));
    near(apex, JUMP_V ** 2 / (2 * 900), 3);
    near(first(r, 'land').now - first(r, 'jump').now, 667, 34);
    expect(r.body).toMatchObject({ x: 50, y: 0, grounded: true });
  });
});

describe('atravessar o telhado', () => {
  /** corre (ou anda) para a direita e pula no último passo antes de sair da beirada `edge` */
  const jumpAtEdge = (edge: number, running: boolean) => (b: { x: number; grounded: boolean }) => ({
    right: true,
    run: running,
    jump: b.grounded && b.x <= edge && b.x + (running ? RUN : WALK) * DT > edge,
  });

  test('correndo e pulando, o vão de 50 px se cruza com folga', () => {
    const r = run(bodyAt(150, 10), jumpAtEdge(260, true), 2);
    expect(kinds(r)).toEqual(['jump', 'land']);
    const landing = first(r, 'land').body;
    expect(landing.y).toBe(24);
    expect(landing.x - 310).toBeGreaterThan(30);
    expect(r.body).toMatchObject({ y: 24, grounded: true });
  });

  test('pulando antes, ainda dá: dá para errar o tempo do pulo em uns 30 px', () => {
    const r = run(bodyAt(150, 10), (b) => ({ right: true, run: true, jump: b.grounded && b.x >= 230 && b.x < 260 && b.y === 0 }), 2);
    expect(first(r, 'land').body.y).toBe(24);
  });

  test('andando, desce do telhado do meio para o de baixo pulando na beirada', () => {
    const r = run(bodyAt(500, 10), jumpAtEdge(540, false), 2);
    expect(first(r, 'land').body.y).toBe(8);
    expect(kinds(r)).not.toContain('fell');
  });

  test('andando, sobe raspando do telhado da direita para o do meio', () => {
    const left = (edge: number) => (b: { x: number; grounded: boolean }) => ({
      left: true,
      jump: b.grounded && b.x >= edge && b.x - WALK * DT < edge,
    });
    const r = run(bodyAt(620, 10), left(590), 2);
    expect(first(r, 'land').body.y).toBe(24);
    expect(kinds(r)).not.toContain('fell');
  });

  test('andando, o vão do telhado mais baixo para o do meio não dá: bate no lado e cai', () => {
    const r = run(bodyAt(200, 10), jumpAtEdge(260, false), 3);
    expect(kinds(r)).toContain('fell');
    expect(Math.max(...r.trace.map((b) => b.x))).toBeLessThan(310);
  });

  test('saindo da beirada cai na rua, volta no ponto de volta em RESPAWN_MS e pisca por BLINK_MS', () => {
    const r = run(bodyAt(250, 10), { right: true }, 3);
    expect(kinds(r)).toEqual(['fell', 'respawn']);
    const fell = first(r, 'fell');
    expect(fell.body.y).toBeLessThan(FALL_Y);
    expect(fell.body.respawnAt).toBe(fell.now + RESPAWN_MS);

    // caído, não se mexe nem com o teclado
    const fallen = r.trace.slice(fell.i, first(r, 'respawn').i);
    for (const b of fallen) expect({ x: b.x, y: b.y, z: b.z }).toEqual({ x: fell.body.x, y: fell.body.y, z: fell.body.z });
    expect(blinking(fell.body, fell.now + 100)).toBe(true);

    const back = first(r, 'respawn');
    expect(back.now).toBeGreaterThanOrEqual(fell.now + RESPAWN_MS);
    expect(back.now - fell.now).toBeLessThan(RESPAWN_MS + DT * 1000);
    expect(back.body).toMatchObject({ ...spawnPoint(MAP), vx: 0, vy: 0, vz: 0, grounded: true, riding: null, respawnAt: null });
    expect(back.body.blinkUntil).toBe(back.now + BLINK_MS);
    expect(blinking(back.body, back.now + BLINK_MS - 1)).toBe(true);
    expect(blinking(back.body, back.now + BLINK_MS)).toBe(false);
  });

  test('sobe sozinho numa beirada de até STEP, e uma mais alta bloqueia', () => {
    const floor: Platform = { kind: 'roof', x0: 0, x1: 300, z0: 0, z1: DEPTH, top: 0 };
    const low = [floor, { kind: 'box', x0: 100, x1: 200, z0: 0, z1: DEPTH, top: STEP } as Platform];
    const up = run(bodyAt(50, 10, { platforms: low }), { right: true }, 1, { platforms: low });
    expect(up.body).toMatchObject({ y: STEP, grounded: true });
    expect(up.body.x).toBeGreaterThan(100);
    expect(kinds(up)).toEqual([]);

    const high = [floor, { kind: 'box', x0: 100, x1: 200, z0: 0, z1: DEPTH, top: STEP + 1 } as Platform];
    const blocked = run(bodyAt(50, 10, { platforms: high }), { right: true }, 1, { platforms: high });
    expect(blocked.body.y).toBe(0);
    expect(blocked.body.x).toBeLessThan(100);
    near(blocked.body.x, 100, 0.01);
  });

  test('o lado da caixa bloqueia, e pulando se sobe nela', () => {
    const blocked = run(bodyAt(100, 40), { right: true }, 1);
    expect(blocked.body.x).toBeLessThan(120);
    near(blocked.body.x, 120, 0.01);
    expect(blocked.body).toMatchObject({ y: 0, grounded: true });

    const climbed = run(blocked.body, once({ jump: true, right: true }), 0.1, { now: blocked.now });
    const onTop = run(climbed.body, { right: true }, 0.5, { now: climbed.now });
    const land = first(onTop, 'land').body;
    expect(land.y).toBe(28);
    expect(land.x).toBeGreaterThanOrEqual(120);
    expect(land.x).toBeLessThanOrEqual(160);
  });

  test('desliza pela parede: bloqueado em x, segue em z, e passa quando sai da frente da caixa', () => {
    const r = run(bodyAt(110, 40), { right: true, down: true }, 1);
    expect(Math.max(...r.trace.slice(0, 9).map((b) => b.x))).toBeLessThanOrEqual(120);
    expect(r.body.x).toBeGreaterThan(160);
    expect(r.body).toMatchObject({ y: 0, z: 0, grounded: true });
  });

  test('o mundo acaba nas pontas', () => {
    const l = run(bodyAt(10, 10), { left: true, run: true }, 3);
    expect(Math.min(...l.trace.map((b) => b.x))).toBeGreaterThanOrEqual(WORLD_X0);
    expect(kinds(l)).toContain('fell');
    const r = run(bodyAt(870, 10), { right: true, run: true }, 3);
    expect(Math.max(...r.trace.map((b) => b.x))).toBeLessThanOrEqual(WORLD_X1);
    expect(kinds(r)).toContain('fell');
  });
});
