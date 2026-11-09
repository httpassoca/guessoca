import { describe, expect, test } from 'bun:test';
import { frameAt, HERO, heroColor, heroSheet, sheetSize } from '../src/lib/sprites/hero';

describe('personagem', () => {
  test('oito personagens, cada um com a sua folha e a cor do cabelo', () => {
    expect(HERO.hairs).toHaveLength(8);
    expect(heroSheet(3)).toBe('/sprites/hero-3.png');
    expect(heroColor(0)).toMatch(/^#[0-9a-f]{6}$/);
  });

  test('as animações que o jogo usa existem', () => {
    for (const name of ['idle', 'walk', 'run', 'jump', 'fall', 'fall_loop', 'shove'] as const) expect(HERO.animations[name].frames).toBeGreaterThan(0);
    expect(HERO.animations.shove.loop).toBe(false);
  });

  test('o quadro de uma animação em loop dá a volta; o de uma sem loop para no último', () => {
    const idle = HERO.animations.idle;
    expect(frameAt('idle', idle.frames)).toEqual(frameAt('idle', 0));
    expect(frameAt('shove', 99)).toEqual({ x: (HERO.animations.shove.frames - 1) * HERO.frame.w, y: HERO.animations.shove.row * HERO.frame.h });
  });

  test('a folha cabe todas as linhas e a mais comprida', () => {
    expect(sheetSize.h).toBe(Object.keys(HERO.animations).length * HERO.frame.h);
    expect(sheetSize.w % HERO.frame.w).toBe(0);
  });

  test('a cabeça cabe no quadro', () => {
    expect(HERO.head.x + HERO.head.size).toBeLessThanOrEqual(HERO.frame.w + 2);
    expect(HERO.head.y + HERO.head.size).toBeLessThanOrEqual(HERO.frame.h);
  });
});
