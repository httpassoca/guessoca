import { describe, expect, test } from 'bun:test';
import { parseGrid } from '../src/grid';
import { blank, blit, bounds, components, crop, dropComponents, eraseColors, getPixel, hexOf, palette, rgbOf, setPixel, solidify, swapColors } from '../src/image';

const P = { r: 'ff0000', g: '00ff00', b: '0000ff', w: 'ffffff' };

describe('grade de texto', () => {
  test('cada caractere é um pixel da paleta; ponto e espaço são transparentes', () => {
    const img = parseGrid(`
      r.g
      .b w
    `, P);
    expect([img.width, img.height]).toEqual([4, 2]);
    expect(getPixel(img, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(getPixel(img, 1, 0)[3]).toBe(0);
    expect(getPixel(img, 1, 1)).toEqual([0, 0, 255, 255]);
    expect(getPixel(img, 2, 1)[3]).toBe(0);
    expect(getPixel(img, 3, 1)).toEqual([255, 255, 255, 255]);
  });

  test('cor fora da paleta é erro, com a linha', () => {
    expect(() => parseGrid('rx', P)).toThrow(/'x'.*linha 1/);
  });
});

describe('cores', () => {
  test('hex de ida e volta', () => {
    expect(hexOf(255, 16, 0)).toBe('ff1000');
    expect(rgbOf('#FF1000')).toEqual([255, 16, 0]);
    expect(() => rgbOf('zz')).toThrow();
  });

  test('troca só as cores pedidas e não mexe na original', () => {
    const img = parseGrid('rgb', P);
    const out = swapColors(img, { ff0000: '0000ff' });
    expect([...palette(out)].sort()).toEqual(['0000ff', '00ff00']);
    expect(palette(img).has('ff0000')).toBe(true);
  });

  test('apaga as cores pedidas', () => {
    const out = eraseColors(parseGrid('rgb', P), ['00FF00']);
    expect(getPixel(out, 1, 0)[3]).toBe(0);
    expect(getPixel(out, 0, 0)[3]).toBe(255);
  });

  test('semitransparente vira opaco', () => {
    const img = blank(2, 1);
    setPixel(img, 0, 0, [1, 2, 3, 200]);
    expect(getPixel(solidify(img), 0, 0)).toEqual([1, 2, 3, 255]);
    expect(getPixel(solidify(img), 1, 0)[3]).toBe(0);
  });
});

describe('pedaços', () => {
  const img = parseGrid(`
    rr..w
    r...w
    ...b.
  `, P);

  test('vizinhança de 8 liga a diagonal', () => {
    const sizes = components(img).map((c) => c.length).sort();
    expect(sizes).toEqual([3, 3]); // rrr; w w e o b na diagonal
  });

  test('joga fora o pedaço que a regra manda', () => {
    const out = dropComponents(img, (colors) => colors.filter((c) => c === 'ffffff').length / colors.length > 0.5);
    expect(palette(out)).toEqual(new Set(['ff0000']));
  });
});

describe('recortar, colar, limites', () => {
  test('recorte fora da imagem é transparente', () => {
    const c = crop(parseGrid('rg', P), 1, 0, 2, 1);
    expect(getPixel(c, 0, 0)).toEqual([0, 255, 0, 255]);
    expect(getPixel(c, 1, 0)[3]).toBe(0);
  });

  test('colar não apaga com transparência', () => {
    const dst = parseGrid('rrr', P);
    blit(dst, parseGrid('.b', P), 1, 0);
    expect([...Array(3)].map((_, x) => hexOf(...(getPixel(dst, x, 0).slice(0, 3) as [number, number, number])))).toEqual(['ff0000', 'ff0000', '0000ff']);
  });

  test('limites do que é opaco', () => {
    expect(bounds(parseGrid(`
      ....
      .r..
      ..g.
    `, P))).toEqual({ x: 1, y: 1, w: 2, h: 2 });
    expect(bounds(blank(3, 3))).toBeNull();
  });
});
