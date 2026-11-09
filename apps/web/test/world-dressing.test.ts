import { describe, expect, test } from 'bun:test';
import { DEPTH, DEPTH_K, MAP, project, type View } from '@guess/world';
import { ROOFTOP } from '../src/lib/sprites/rooftop';
import { boxLooks, DECOR, decorAt, facadeOf, neonFlicker, beaconOn, roofRects, ROOFS } from '../src/lib/world/dressing';

const view: View = { scale: 3, width: 1200, height: 900, groundY: 720 };
const cam = { x: 400 };

describe('as caixas do mapa vestidas', () => {
  const looks = boxLooks(MAP);

  test('toda caixa ganha o objeto do tamanho dela', () => {
    const boxes = MAP.filter((p) => p.kind === 'box');
    expect(looks).toHaveLength(boxes.length);
    expect(looks.map((l) => l.frame).sort()).toEqual(['ac', 'chimney', 'tank']);
    for (const l of looks) {
      const f = ROOFTOP.frames[l.frame];
      expect(f.w).toBe(l.box.x1 - l.box.x0);
      expect(f.face).toBe(l.box.top - l.base);
      expect(f.h - f.face!).toBe(Math.round((l.box.z1 - l.box.z0) * DEPTH_K));
    }
  });

  test('o pé da frente vai no pé da caixa; a beirada de cima da frente cai no topo da caixa', () => {
    for (const l of looks) {
      const at = l.place(cam, view);
      const f = ROOFTOP.frames[l.frame];
      expect(at).toEqual(project({ x: l.box.x0, y: l.base, z: l.box.z0 }, cam, view));
      expect(at.y - f.face! * view.scale).toBeCloseTo(project({ x: l.box.x0, y: l.box.top, z: l.box.z0 }, cam, view).y, 6);
      // o tampo desenhado termina a menos de meio pixel do mundo da beirada de trás da caixa
      const back = project({ x: l.box.x0, y: l.box.top, z: l.box.z1 }, cam, view).y;
      expect(Math.abs(at.y - f.h * view.scale - back)).toBeLessThanOrEqual(view.scale / 2);
    }
  });
});

describe('os telhados', () => {
  test('cada telhado tem uma fachada, e prédios vizinhos são diferentes', () => {
    expect(ROOFS.length).toBe(MAP.filter((p) => p.kind === 'roof').length);
    const names = ROOFS.map((_, i) => facadeOf(i));
    for (const n of names) expect(ROOFTOP.frames[n]?.tile).toBe(true);
    for (let i = 1; i < names.length; i++) expect(names[i]).not.toBe(names[i - 1]);
  });

  test('o tampo vai da beirada de trás até a da frente; a fachada desce da frente até o fim da tela', () => {
    const roof = ROOFS[1];
    const r = roofRects(roof, cam, view);
    const front = project({ x: roof.x0, y: roof.top, z: 0 }, cam, view);
    const back = project({ x: roof.x0, y: roof.top, z: DEPTH }, cam, view);
    expect(r.top).toEqual({ x: front.x, y: back.y, w: (roof.x1 - roof.x0) * view.scale, h: front.y - back.y });
    expect(r.facade).toEqual({ x: front.x, y: front.y, w: (roof.x1 - roof.x0) * view.scale, h: view.height - front.y });
  });
});

describe('os enfeites', () => {
  test('todo enfeite usa um quadro da folha e fica em cima de um telhado', () => {
    expect(DECOR.length).toBeGreaterThan(5);
    for (const d of DECOR) {
      expect(ROOFTOP.frames[d.frame]).toBeDefined();
      const roof = ROOFS[d.roof];
      expect(d.x).toBeGreaterThanOrEqual(roof.x0);
      expect(d.x).toBeLessThanOrEqual(roof.x1);
    }
  });

  test('o que fica atrás (antenas, placa do hotel) está depois da mureta do fundo; o do chão, dentro do telhado; o da fachada, abaixo da beirada', () => {
    for (const d of DECOR) {
      const roof = ROOFS[d.roof];
      const p = decorAt(d);
      if (d.layer === 'back') expect(p.z).toBeGreaterThan(DEPTH);
      if (d.layer === 'floor') { expect(p.z).toBeGreaterThan(0); expect(p.z).toBeLessThan(DEPTH); expect(p.y).toBe(roof.top); }
      if (d.layer === 'facade') { expect(p.z).toBe(0); expect(p.y).toBeLessThan(roof.top); }
    }
  });

  test('três letreiros de neon, e a luz da torre em cima da torre', () => {
    expect(DECOR.filter((d) => d.frame.startsWith('sign-')).length).toBeGreaterThanOrEqual(3);
    const mast = DECOR.find((d) => d.frame === 'mast')!;
    const beacon = DECOR.find((d) => d.frame === 'beacon')!;
    expect(beacon.x).toBe(mast.x);
    expect(decorAt(beacon).y).toBe(decorAt(mast).y + ROOFTOP.frames.mast.h);
  });
});

describe('o que pisca', () => {
  test('o neon falha de vez em quando, não o tempo todo', () => {
    const samples = Array.from({ length: 2000 }, (_, i) => neonFlicker(i * 37));
    const off = samples.filter(Boolean).length;
    expect(off).toBeGreaterThan(0);
    expect(off / samples.length).toBeLessThan(0.25);
    expect(neonFlicker(1234)).toBe(neonFlicker(1234));
  });

  test('a luz da torre acende e apaga', () => {
    const s = Array.from({ length: 100 }, (_, i) => beaconOn(i * 50));
    expect(s.some(Boolean)).toBe(true);
    expect(s.some((b) => !b)).toBe(true);
  });
});
