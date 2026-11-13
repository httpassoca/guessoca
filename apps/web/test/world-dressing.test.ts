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

describe('a tralha dos telhados dos lados (issue #70)', () => {
  const sides = DECOR.filter((d) => d.roof !== 1);
  const CLUTTER = ['chair', 'plant', 'skylight', 'pipes', 'dish', 'cardboard', 'laundry-0', 'bowl'];

  test('os dois telhados dos lados ganham tralha, e o do meio não', () => {
    for (const roof of [0, 2]) expect(DECOR.filter((d) => d.roof === roof && CLUTTER.includes(d.frame)).length).toBeGreaterThanOrEqual(3);
    expect(DECOR.filter((d) => d.roof === 1 && CLUTTER.includes(d.frame))).toHaveLength(0);
    for (const name of CLUTTER) expect(sides.some((d) => d.frame === name)).toBe(true);
  });

  test('perto do ar-condicionado e da chaminé fica livre (só a tigela do gato)', () => {
    const boxes = MAP.filter((p) => p.kind === 'box' && p.x0 < 500);
    for (const d of DECOR.filter((x) => CLUTTER.includes(x.frame) && x.frame !== 'bowl')) {
      const f = ROOFTOP.frames[d.frame];
      const x0 = d.x - f.anchor.x, x1 = x0 + f.w;
      for (const b of boxes) expect({ frame: d.frame, clear: x1 < b.x0 - 15 || x0 > b.x1 + 15 }).toEqual({ frame: d.frame, clear: true });
    }
    const bowl = DECOR.find((d) => d.frame === 'bowl')!;
    const ac = MAP.find((p) => p.kind === 'box' && p.x0 === 120)!;
    expect(Math.abs(bowl.x - ac.x1)).toBeLessThan(20);
  });

  test('o varal sai da torre e acaba antes da caixa-d\'água', () => {
    const line = DECOR.find((d) => d.frame === 'laundry-0')!;
    const mast = DECOR.find((d) => d.frame === 'mast' && d.roof === line.roof)!;
    const tank = MAP.find((p) => p.kind === 'box' && p.x0 === 700)!;
    expect(Math.abs(line.x - mast.x)).toBeLessThanOrEqual(4);
    expect(line.x + ROOFTOP.frames['laundry-0'].w).toBeLessThanOrEqual(tank.x0 + 2);
    expect(line.dy).toBeLessThan(ROOFTOP.frames.mast.h);
    expect(ROOFTOP.frames['laundry-1'].w).toBe(ROOFTOP.frames['laundry-0'].w);
  });

  test('cada poça tem o reflexo do neon do mesmo tamanho', () => {
    for (const d of DECOR.filter((x) => x.frame.startsWith('puddle-'))) {
      const f = ROOFTOP.frames[d.frame], shine = ROOFTOP.frames[`${d.frame}-shine`];
      expect(shine).toBeDefined();
      expect([shine.w, shine.h]).toEqual([f.w, f.h]);
    }
  });
});

describe('as janelas e a cidade no atlas (issue #70)', () => {
  test('cada fachada diz onde estão as janelas: o plano tem um andar por linha e uma baia por coluna', () => {
    for (let i = 0; i < ROOFS.length; i++) {
      const f = ROOFTOP.frames[facadeOf(i)];
      const w = f.windows!;
      expect(w.plan.length * w.floor).toBe(f.h);
      expect(2 + w.plan[0].length * w.bay).toBe(f.w);
      for (const row of w.plan) expect(row).toMatch(/^[dlbt.]+$/);
      for (const k of ['d', 'l', 'b']) expect([ROOFTOP.frames[`win-${k}`].w, ROOFTOP.frames[`win-${k}`].h]).toEqual([w.w, w.h]);
    }
  });

  test('as duas faixas da cidade têm umas janelas que piscam, dentro da faixa', () => {
    for (const s of ROOFTOP.skylines) {
      expect(s.twinkle.length).toBeGreaterThanOrEqual(6);
      for (const t of s.twinkle) {
        expect(t.x + t.w).toBeLessThanOrEqual(s.w);
        expect(t.y + t.h).toBeLessThanOrEqual(s.h);
        expect(t.on).toMatch(/^[0-9a-f]{6}$/);
        expect(t.off).toMatch(/^[0-9a-f]{6}$/);
      }
    }
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
