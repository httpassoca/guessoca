import { describe, expect, test } from 'bun:test';
import { DEPTH_K, depthKey, followCamera, project, WORLD_X0, WORLD_X1, type View } from '../src';
import { near } from './sim';

const view: View = { scale: 3, width: 960, height: 540, groundY: 450 };
/** meia tela, em pixels do mundo */
const half = view.width / view.scale / 2;

describe('projeção', () => {
  test('o ponto debaixo da câmera, no chão da frente, cai no meio da tela, na linha do chão', () => {
    expect(project({ x: 100, y: 0, z: 0 }, { x: 100 }, view)).toEqual({ x: 480, y: 450 });
  });

  test('x anda para os lados; y e z sobem na tela, z encolhido por DEPTH_K', () => {
    expect(project({ x: 110, y: 20, z: 10 }, { x: 100 }, view)).toEqual({ x: 510, y: 450 - (20 + 10 * DEPTH_K) * 3 });
    expect(project({ x: 90, y: 0, z: 0 }, { x: 100 }, view).x).toBe(450);
  });

  test('a ordem de desenho: quem está mais ao fundo vem primeiro', () => {
    const bodies = [
      { id: 'meio', z: 20 },
      { id: 'frente', z: 0 },
      { id: 'fundo', z: 50 },
    ];
    const order = [...bodies].sort((a, b) => depthKey(b) - depthKey(a)).map((b) => b.id);
    expect(order).toEqual(['fundo', 'meio', 'frente']);
    expect(depthKey({ z: 30 })).toBeGreaterThan(depthKey({ z: 29.5 }));
  });
});

describe('câmera', () => {
  test('vai na direção do alvo, suave, sem passar dele', () => {
    const cam = { x: 400 };
    const next = followCamera(cam, { x: 500 }, view, 1 / 60);
    expect(next.x).toBeGreaterThan(400);
    expect(next.x).toBeLessThan(500);
    near(next.x, 400 + 100 * (1 - Math.exp(-6 / 60)), 1.5);
    expect(cam.x).toBe(400);

    let c = cam;
    for (let i = 0; i < 120; i++) c = followCamera(c, { x: 500 }, view, 1 / 60);
    near(c.x, 500, 0.5);
  });

  test('segue mais rápido com `follow` maior, e não se mexe com dt 0', () => {
    const slow = followCamera({ x: 400 }, { x: 500 }, view, 1 / 60, 2);
    const fast = followCamera({ x: 400 }, { x: 500 }, view, 1 / 60, 12);
    expect(fast.x).toBeGreaterThan(slow.x);
    expect(followCamera({ x: 400 }, { x: 500 }, view, 0).x).toBe(400);
  });

  test('não mostra além das pontas do mundo', () => {
    let c = { x: 400 };
    for (let i = 0; i < 600; i++) c = followCamera(c, { x: WORLD_X0 }, view, 1 / 60);
    expect(c.x).toBe(WORLD_X0 + half);
    for (let i = 0; i < 600; i++) c = followCamera(c, { x: WORLD_X1 }, view, 1 / 60);
    expect(c.x).toBe(WORLD_X1 - half);
    expect(followCamera({ x: 0 }, { x: 0 }, view, 1 / 60).x).toBe(WORLD_X0 + half);
  });

  test('numa tela maior que o mundo, fica no meio', () => {
    const wide: View = { scale: 1, width: 1200, height: 600, groundY: 500 };
    const middle = (WORLD_X0 + WORLD_X1) / 2;
    expect(followCamera({ x: 0 }, { x: 0 }, wide, 1 / 60).x).toBe(middle);
    expect(followCamera({ x: 900 }, { x: 850 }, wide, 1 / 60).x).toBe(middle);
  });
});
