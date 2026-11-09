import { describe, expect, test } from 'bun:test';
import { renderSfx, SFX, SFX_NAMES } from '../src/lib/sound/sfx';

describe('os efeitos sonoros, gerados de parâmetros', () => {
  test('os cinco existem', () => {
    expect([...SFX_NAMES].sort()).toEqual(['gotIt', 'jump', 'shove', 'turnEnd', 'vote']);
    for (const name of SFX_NAMES) expect(SFX[name]).toBeDefined();
  });

  test('cada um rende amostras curtas e audíveis, sem estourar', () => {
    for (const name of SFX_NAMES) {
      const { samples, sampleRate } = renderSfx(name);
      expect(samples, name).toBeInstanceOf(Float32Array);
      expect(samples.length, name).toBeGreaterThan(0);
      const seconds = samples.length / sampleRate;
      expect(seconds, name).toBeGreaterThan(0.05);
      expect(seconds, name).toBeLessThan(1.5);
      let peak = 0;
      for (const s of samples) peak = Math.max(peak, Math.abs(s));
      expect(peak, name).toBeGreaterThan(0.05);
      expect(peak, name).toBeLessThanOrEqual(1);
    }
  });
});
