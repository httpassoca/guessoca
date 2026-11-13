import { describe, expect, test } from 'bun:test';
import { CONFETTI_COLORS, CONFETTI_MS, CONFETTI_PIECES, confetti, pieceOffset, pieceShown, seeded } from '../src/lib/world/confetti';

describe('o confete', () => {
  test('a mesma semente dá o mesmo confete; outra semente, outro', () => {
    expect(confetti(seeded(7))).toEqual(confetti(seeded(7)));
    expect(confetti(seeded(7))).not.toEqual(confetti(seeded(8)));
  });

  test('o sorteio semeado fica em [0, 1)', () => {
    const r = seeded(123);
    for (let i = 0; i < 1000; i++) { const v = r(); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });

  test('um número fixo de pedaços, cada um com uma cor da paleta e 1 ou 2 pixels', () => {
    const pieces = confetti(seeded(1));
    expect(pieces).toHaveLength(CONFETTI_PIECES);
    for (const p of pieces) {
      expect(Number.isInteger(p.color) && p.color >= 0 && p.color < CONFETTI_COLORS.length).toBe(true);
      expect([1, 2]).toContain(p.size);
    }
    expect(new Set(pieces.map((p) => p.color)).size).toBeGreaterThan(2);
  });

  test('um estouro na hora e um rastro depois; tudo acaba em uns 2 s', () => {
    const pieces = confetti(seeded(2));
    const burst = pieces.filter((p) => p.born === 0);
    expect(burst.length).toBeGreaterThan(CONFETTI_PIECES / 3);
    expect(burst.length).toBeLessThan(CONFETTI_PIECES);
    for (const p of pieces) {
      expect(p.born).toBeGreaterThanOrEqual(0);
      expect(p.life).toBeGreaterThan(400);
      expect(p.born + p.life).toBeLessThanOrEqual(CONFETTI_MS);
    }
    expect(Math.max(...pieces.map((p) => p.born + p.life))).toBeGreaterThan(CONFETTI_MS - 400);
  });

  test('cada pedaço sai de onde nasceu, em pixels inteiros do mundo', () => {
    for (const p of confetti(seeded(3))) {
      expect(pieceOffset(p, 0)).toEqual({ x: 0, y: 0 });
      for (const age of [50, 333, 800]) {
        const o = pieceOffset(p, age);
        expect(Number.isInteger(o.x) && Number.isInteger(o.y)).toBe(true);
      }
    }
  });

  test('o estouro espalha para os dois lados e sobe; depois todo pedaço desce', () => {
    const pieces = confetti(seeded(4));
    const early = pieces.map((p) => pieceOffset(p, 150));
    expect(early.some((o) => o.x < -3)).toBe(true);
    expect(early.some((o) => o.x > 3)).toBe(true);
    expect(early.filter((o) => o.y > 0).length).toBeGreaterThan(pieces.length * 0.8);
    for (const p of pieces) expect(pieceOffset(p, p.life).y).toBeLessThan(pieceOffset(p, 300).y);
  });

  test('fica perto de onde nasceu (não atravessa a tela)', () => {
    for (const p of confetti(seeded(5))) for (let age = 0; age <= p.life; age += 50) {
      const o = pieceOffset(p, age);
      expect(Math.abs(o.x)).toBeLessThanOrEqual(45);
      expect(o.y).toBeLessThanOrEqual(45);
      expect(o.y).toBeGreaterThanOrEqual(-60);
    }
  });

  test('aparece só durante a vida, e pisca no fim em vez de esmaecer', () => {
    const [p] = confetti(seeded(6));
    expect(pieceShown(p, -1)).toBe(false);
    expect(pieceShown(p, 0)).toBe(true);
    expect(pieceShown(p, p.life / 2)).toBe(true);
    expect(pieceShown(p, p.life)).toBe(false);
    const end = Array.from({ length: 24 }, (_, i) => pieceShown(p, p.life - 240 + i * 10));
    expect(end).toContain(true);
    expect(end).toContain(false);
  });
});
