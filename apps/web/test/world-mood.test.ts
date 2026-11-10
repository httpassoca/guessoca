import { describe, expect, test } from 'bun:test';
import { LOBBY_LOOK, lobbyMatrix, moodStep } from '../src/lib/world/mood';

/** aplica a matriz a uma cor (0–1) */
const apply = (m: number[], [r, g, b]: number[]) => [0, 1, 2].map((i) => m[i * 5] * r + m[i * 5 + 1] * g + m[i * 5 + 2] * b + m[i * 5 + 4]);

describe('o clima do lobby', () => {
  const m = lobbyMatrix();

  test('preto e branco: os três canais saem iguais, e o alfa não muda', () => {
    const [r, g, b] = apply(m, [0.9, 0.2, 0.6]);
    expect(r).toBeCloseTo(g, 10);
    expect(g).toBeCloseTo(b, 10);
    expect(m.slice(15)).toEqual([0, 0, 0, 1, 0]);
  });

  test('mais escuro e com as sombras fechadas: o branco não chega a branco, o cinza médio escurece, o escuro vai a preto', () => {
    expect(apply(m, [1, 1, 1])[0]).toBeLessThan(1);
    expect(apply(m, [0.5, 0.5, 0.5])[0]).toBeCloseTo(0.5 * LOBBY_LOOK.brightness, 10);
    expect(apply(m, [0.08, 0.08, 0.08])[0]).toBeLessThanOrEqual(0);
    // mais contraste que o original: a distância entre um claro e um médio cresce
    const gap = apply(m, [0.8, 0.8, 0.8])[0] - apply(m, [0.5, 0.5, 0.5])[0];
    expect(gap).toBeGreaterThan((0.8 - 0.5) * LOBBY_LOOK.brightness);
  });

  test('vai do cinza à cor (e volta) aos poucos, sem passar do alvo', () => {
    expect(moodStep(1, 0, 600, 1200)).toBeCloseTo(0.5, 10);
    expect(moodStep(0.2, 0, 600, 1200)).toBe(0);
    expect(moodStep(0, 1, 300, 1200)).toBeCloseTo(0.25, 10);
    expect(moodStep(0.9, 1, 600, 1200)).toBe(1);
    expect(moodStep(1, 1, 16)).toBe(1);
    expect(moodStep(0.5, 0, -5, 1200)).toBe(0.5);
    expect(moodStep(1, 0, 16, 0)).toBe(0);
  });
});
