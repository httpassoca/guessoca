import { describe, expect, test } from 'bun:test';
import { GHOST_ALPHA, GHOST_FLOAT_MS, GHOST_LIFT_MAX, GHOST_LIFT_MIN, ghostLift } from '../src/lib/world/ghost';

describe('o fantasma no telhado', () => {
  test('translúcido, mas ainda dá para ver quem é', () => {
    expect(GHOST_ALPHA).toBeGreaterThan(0.3);
    expect(GHOST_ALPHA).toBeLessThan(0.7);
  });

  test('flutua em pixels inteiros, entre o mínimo e o máximo, e volta ao começo a cada ciclo', () => {
    const lifts = Array.from({ length: 100 }, (_, i) => ghostLift((i * GHOST_FLOAT_MS) / 100));
    expect(lifts.every((l) => Number.isInteger(l) && l >= GHOST_LIFT_MIN && l <= GHOST_LIFT_MAX)).toBe(true);
    expect(new Set(lifts)).toEqual(new Set([1, 2, 3, 4]));
    expect(ghostLift(123)).toBe(ghostLift(123 + GHOST_FLOAT_MS));
  });

  test('dois fantasmas não flutuam em coro', () => {
    const a = Array.from({ length: 24 }, (_, i) => ghostLift(i * 100, 1));
    const b = Array.from({ length: 24 }, (_, i) => ghostLift(i * 100, 2));
    expect(a).not.toEqual(b);
  });
});
