import { describe, expect, test } from 'bun:test';
import { DEPTH_K, MAP } from '@guess/world';
import { gridLines, parseGrid } from '../src/grid';
import { bounds, getPixel, type Image } from '../src/image';
import { PALETTE, RECIPES, rooftopSheet, Sketch } from '../src/rooftop';
import { SKYLINES, skyline } from '../src/skyline';

const column = (img: Image, x: number) => Array.from({ length: img.height }, (_, y) => getPixel(img, x, y).join(','));
const row = (img: Image, y: number) => Array.from({ length: img.width }, (_, x) => getPixel(img, x, y).join(','));
const recipe = (name: string) => RECIPES.find((r) => r.name === name)!;
const { sheet, atlas } = rooftopSheet();

describe('a prancheta', () => {
  test('carimba uma grade por cima; o ponto não apaga o que está embaixo', () => {
    const s = new Sketch(4, 2, 'c');
    s.stamp(1, 0, `
      k.
      .k`);
    expect(s.text()).toBe('ckcc\ncckc');
  });

  test('preenche e corta o que sai da prancheta', () => {
    const s = new Sketch(3, 2);
    s.fill(2, 1, 5, 5, 'k');
    expect(s.text()).toBe('...\n..k');
  });
});

describe('objetos do telhado', () => {
  test('toda grade é retangular e lê com a paleta', () => {
    expect(RECIPES.length).toBeGreaterThan(10);
    for (const r of RECIPES) {
      const lines = gridLines(r.grid);
      expect({ name: r.name, widths: new Set(lines.map((l) => l.length)).size }).toEqual({ name: r.name, widths: 1 });
      for (const ch of lines.join('')) if (ch !== '.') expect({ name: r.name, ch, known: ch in PALETTE }).toEqual({ name: r.name, ch, known: true });
      expect(() => parseGrid(r.grid, PALETTE)).not.toThrow();
    }
  });

  test('nomes únicos', () => {
    expect(new Set(RECIPES.map((r) => r.name)).size).toBe(RECIPES.length);
  });

  test('cada caixa do mapa tem um objeto do tamanho dela, com o topo visível na altura da caixa', () => {
    const roofs = MAP.filter((p) => p.kind === 'roof');
    for (const box of MAP.filter((p) => p.kind === 'box')) {
      const base = roofs.find((r) => box.x0 >= r.x0 && box.x1 <= r.x1)!.top;
      const fits = RECIPES.filter((r) => r.fits && r.fits.w === box.x1 - box.x0 && r.fits.h === box.top - base && r.fits.depth === box.z1 - box.z0);
      expect(fits).toHaveLength(1);
      const img = parseGrid(fits[0].grid, PALETTE);
      const topRows = Math.round((box.z1 - box.z0) * DEPTH_K);
      // a frente sobe `top - base` linhas a partir do pé; o tampo (a profundidade da caixa) fica por cima dela
      expect(img.width).toBe(box.x1 - box.x0);
      expect(img.height).toBe(box.top - base + topRows);
      // a linha mais alta desenhada é a beirada de trás do tampo: nada passa do topo da caixa
      expect(bounds(img)!.y).toBe(0);
      // no atlas: âncora no pé da frente, e a frente com a altura da caixa
      const f = atlas.frames[fits[0].name];
      expect(f.anchor).toEqual({ x: 0, y: img.height });
      expect(f.face).toBe(box.top - base);
    }
  });

  test('as texturas que repetem: a primeira e a última coluna são iguais', () => {
    const tiles = RECIPES.filter((r) => r.tile);
    expect(tiles.map((t) => t.name)).toEqual(expect.arrayContaining(['roof-top', 'parapet', 'ledge', 'facade-a', 'facade-b', 'facade-c', 'fog']));
    for (const t of tiles) {
      const img = parseGrid(t.grid, PALETTE);
      expect({ name: t.name, left: column(img, 0) }).toEqual({ name: t.name, left: column(img, img.width - 1) });
    }
  });

  test('as fachadas também repetem para baixo (a primeira e a última linha são iguais)', () => {
    for (const name of ['facade-a', 'facade-b', 'facade-c']) {
      const img = parseGrid(recipe(name).grid, PALETTE);
      expect({ name, top: row(img, 0) }).toEqual({ name, top: row(img, img.height - 1) });
    }
  });

  test('o tampo do telhado cobre a profundidade inteira do telhado', () => {
    const img = parseGrid(recipe('roof-top').grid, PALETTE);
    expect(img.height).toBe(Math.ceil(56 * DEPTH_K));
  });

  test('as placas de neon: textos nossos, em magenta ou ciano', () => {
    const signs = RECIPES.filter((r) => r.name.startsWith('sign-'));
    expect(signs.length).toBeGreaterThanOrEqual(3);
    for (const s of signs) expect(s.grid).toMatch(/[xz]/);
  });
});

describe('a folha do telhado', () => {
  test('o atlas tem todos os quadros, dentro da folha e sem um em cima do outro', () => {
    expect(Object.keys(atlas.frames).sort()).toEqual(RECIPES.map((r) => r.name).sort());
    const rects = Object.values(atlas.frames);
    for (const f of rects) {
      expect(f.x + f.w).toBeLessThanOrEqual(sheet.width);
      expect(f.y + f.h).toBeLessThanOrEqual(sheet.height);
    }
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i], b = rects[j];
      const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
      expect(apart).toBe(true);
    }
  });

  test('cada quadro na folha é a grade dele', () => {
    for (const r of RECIPES) {
      const img = parseGrid(r.grid, PALETTE);
      const f = atlas.frames[r.name];
      expect({ name: r.name, w: f.w, h: f.h }).toEqual({ name: r.name, w: img.width, h: img.height });
      for (let y = 0; y < img.height; y += 3) for (let x = 0; x < img.width; x += 3) expect(getPixel(sheet, f.x + x, f.y + y)).toEqual(getPixel(img, x, y));
    }
  });

  test('as texturas que repetem vêm marcadas; o tamanho do ladrilho é o do quadro', () => {
    for (const r of RECIPES) expect(atlas.frames[r.name].tile ?? false).toBe(r.tile ?? false);
  });
});

describe('a cidade ao fundo', () => {
  test('mesma semente, mesma imagem; outra semente, outra', () => {
    const o = { width: 200, height: 120, layer: 'near' as const };
    const a = skyline({ ...o, seed: 5 }), b = skyline({ ...o, seed: 5 }), c = skyline({ ...o, seed: 6 });
    expect(a.data).toEqual(b.data);
    expect(a.data).not.toEqual(c.data);
  });

  test('pelo menos duas camadas, cada uma repetindo sem emenda (primeira e última coluna iguais)', () => {
    expect(SKYLINES.length).toBeGreaterThanOrEqual(2);
    for (const s of SKYLINES) {
      const img = skyline(s);
      expect([img.width, img.height]).toEqual([s.width, s.height]);
      expect(column(img, 0)).toEqual(column(img, img.width - 1));
    }
  });

  test('tem prédios, janelas acesas e um pouco de neon', () => {
    const near = SKYLINES.find((s) => s.layer === 'near')!;
    const img = skyline(near);
    const colors = new Map<string, number>();
    for (let i = 0; i < img.data.length; i += 4) if (img.data[i + 3]) {
      const k = [img.data[i], img.data[i + 1], img.data[i + 2]].join(',');
      colors.set(k, (colors.get(k) ?? 0) + 1);
    }
    const warm = [...colors.keys()].filter((k) => { const [r, g, b] = k.split(',').map(Number); return r > 180 && g > 120 && b < 140; });
    expect(warm.length).toBeGreaterThan(0);
    const neon = [...colors.keys()].filter((k) => { const [r, g, b] = k.split(',').map(Number); return (r > 200 && b > 150 && g < 100) || (g > 200 && b > 200 && r < 100); });
    expect(neon.length).toBeGreaterThan(0);
  });
});
