import { describe, expect, test } from 'bun:test';
import { blank, getPixel, rgbOf, setPixel } from '../src/image';
import { CONTACT_COLORS, contactLayout, contactSheet, upscale } from '../src/preview';

const px = (hex: string): [number, number, number, number] => [...rgbOf(hex), 255];

describe('a prévia (folha de contato)', () => {
  const o = { scale: 4, pad: 3, checker: 4 };

  test('numa linha só, cada quadro ampliado com 1 de borda e o espaço em volta', () => {
    const { width, height, cells } = contactLayout([{ w: 10, h: 5 }, { w: 10, h: 5 }], o);
    expect(cells).toEqual([{ x: 4, y: 4, w: 40, h: 20 }, { x: 4 + 48, y: 4, w: 40, h: 20 }]);
    expect(width).toBe(2 * (40 + 2 + 6));
    expect(height).toBe(20 + 2 + 6);
  });

  test('com largura máxima, quebra em prateleiras da altura do maior quadro', () => {
    const { width, height, cells } = contactLayout([{ w: 10, h: 5 }, { w: 10, h: 8 }, { w: 10, h: 5 }], { ...o, maxWidth: 100 });
    expect(cells.map((c) => [c.x, c.y])).toEqual([[4, 4], [52, 4], [4, 8 * 4 + 8 + 4]]);
    expect(width).toBe(96);
    expect(height).toBe((32 + 8) + (20 + 8));
  });

  test('um quadro mais largo que o máximo fica sozinho na linha, sem sumir', () => {
    const { cells } = contactLayout([{ w: 50, h: 2 }, { w: 50, h: 2 }], { ...o, maxWidth: 100 });
    expect(cells[1].y).toBeGreaterThan(cells[0].y);
  });

  test('ampliar repete cada pixel k×k', () => {
    const img = blank(2, 1);
    setPixel(img, 1, 0, px('ff0000'));
    const big = upscale(img, 3);
    expect([big.width, big.height]).toEqual([6, 3]);
    expect(getPixel(big, 2, 2)[3]).toBe(0);
    expect(getPixel(big, 3, 0)).toEqual(px('ff0000'));
    expect(getPixel(big, 5, 2)).toEqual(px('ff0000'));
  });

  test('o transparente vira xadrez, o quadro fica por cima, com borda e o tique da âncora', () => {
    const f = blank(2, 2);
    setPixel(f, 0, 0, px('00ff00'));
    const sheet = contactSheet([f], o, [{ x: 1, y: 2 }]);
    const c = contactLayout([{ w: 2, h: 2 }], o).cells[0];
    expect(getPixel(sheet, c.x, c.y)).toEqual(px('00ff00'));
    expect(getPixel(sheet, c.x + 4, c.y)).toEqual(px(CONTACT_COLORS.dark));
    expect(getPixel(sheet, c.x + 4, c.y + 4)).toEqual(px(CONTACT_COLORS.light));
    expect(getPixel(sheet, c.x - 1, c.y)).toEqual(px(CONTACT_COLORS.border));
    expect(getPixel(sheet, c.x + 4, c.y + c.h + 1)).toEqual(px(CONTACT_COLORS.anchor));
    expect(getPixel(sheet, c.x, c.y + c.h + 1)).toEqual(px(CONTACT_COLORS.bg));
    // a âncora no pé (y = h) marca a última linha à esquerda
    expect(getPixel(sheet, c.x - 2, c.y + c.h - 1)).toEqual(px(CONTACT_COLORS.anchor));
    expect(getPixel(sheet, c.x - 2, c.y)).toEqual(px(CONTACT_COLORS.bg));
  });
});
