import { describe, expect, test } from 'bun:test';
import { fadeStep, loopGain, musicWanted } from '../src/lib/sound/music';

describe('a trilha do jogo', () => {
  test('toca só com o jogo correndo', () => {
    expect(musicWanted('playing')).toBe(true);
    expect(musicWanted('lobby')).toBe(false);
    expect(musicWanted('ended')).toBe(false);
  });

  test('cada volta sobe em 1 s no começo e desce em 1 s no fim', () => {
    expect(loopGain(0, 100)).toBe(0);
    expect(loopGain(0.5, 100)).toBe(0.5);
    expect(loopGain(1, 100)).toBe(1);
    expect(loopGain(50, 100)).toBe(1);
    expect(loopGain(99, 100)).toBe(1);
    expect(loopGain(99.75, 100)).toBe(0.25);
    expect(loopGain(100, 100)).toBe(0);
  });

  test('sem duração ainda (carregando), só a subida', () => {
    expect(loopGain(0.25, NaN)).toBe(0.25);
    expect(loopGain(30, Infinity)).toBe(1);
  });

  test('entra e sai em 1 s, sem passar de 0 nem de 1', () => {
    expect(fadeStep(0, true, 0.25)).toBe(0.25);
    expect(fadeStep(0.9, true, 0.25)).toBe(1);
    expect(fadeStep(1, false, 0.5)).toBe(0.5);
    expect(fadeStep(0.1, false, 0.5)).toBe(0);
  });
});
