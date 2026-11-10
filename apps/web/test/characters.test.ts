import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHARACTERS } from '@guess/rules';
import { artScale, character, CHARACTER_ART, frameAt, frameIndex, PORTRAIT, sheetSize } from '../src/lib/sprites/characters';

describe('personagens', () => {
  test('um por personagem do protocolo: quatro heróis, três esqueletos, o Kratos no lugar 6 e o Vorcaro no 8', () => {
    expect(CHARACTER_ART).toHaveLength(CHARACTERS);
    expect(CHARACTER_ART.map((c) => c.model)).toEqual(['hero', 'hero', 'hero', 'hero', 'skeleton', 'skeleton', 'kratos', 'skeleton', 'vorcaro']);
    expect(character(3).sheet).toBe('/sprites/char-3.png');
    expect(character(8).sheet).toBe('/sprites/char-8.webp');
    expect(character(5).atlas).toBe(character(4).atlas);
    expect(character(7).atlas).toBe(character(4).atlas);
    expect(character(0).atlas).not.toBe(character(4).atlas);
    expect(character(6).atlas).not.toBe(character(4).atlas);
  });

  test('cores únicas, para bordas e marcas na interface', () => {
    for (const c of CHARACTER_ART) expect(c.color).toMatch(/^#[0-9a-f]{6}$/);
    expect(new Set(CHARACTER_ART.map((c) => c.color)).size).toBe(CHARACTERS);
  });

  test('as cores do CSS (--gs-char-N) são as do characters.json', () => {
    const css = readFileSync(join(import.meta.dir, '../src/app.css'), 'utf8');
    CHARACTER_ART.forEach((c, n) => expect(css).toContain(`--gs-char-${n}: ${c.color};`));
  });

  test('só o Vorcaro é arte grande desenhada encolhida; os outros valem 1 unidade por pixel', () => {
    expect(CHARACTER_ART.map((c) => artScale(c.atlas) < 1)).toEqual([false, false, false, false, false, false, false, false, true]);
    const v = character(8).atlas;
    expect(Math.round((v.anchor.y - v.stand.y) * artScale(v))).toBe(50);
  });

  test('fora da faixa cai no primeiro, sem quebrar', () => {
    expect(character(99)).toBe(character(0));
    expect(character(-1)).toBe(character(0));
  });

  for (const n of [0, 4, 6, 8]) {
    const { atlas, model } = character(n);

    test(`${model}: as animações que o jogo usa existem`, () => {
      for (const name of ['idle', 'walk', 'run', 'jump', 'fall', 'fall_loop', 'shove'] as const) expect(atlas.animations[name].frames).toBeGreaterThan(0);
      expect(atlas.animations.shove.loop).toBe(false);
      expect(atlas.animations.fall_loop.loop).toBe(true);
    });

    test(`${model}: o quadro de uma animação em loop dá a volta; o de uma sem loop para no último`, () => {
      expect(frameAt(atlas, 'idle', atlas.animations.idle.frames)).toEqual(frameAt(atlas, 'idle', 0));
      expect(frameAt(atlas, 'shove', 99)).toEqual({ x: (atlas.animations.shove.frames - 1) * atlas.frame.w, y: atlas.animations.shove.row * atlas.frame.h });
    });

    test(`${model}: a folha cabe todas as linhas e a mais comprida`, () => {
      const size = sheetSize(atlas);
      expect(size.h).toBe(Object.keys(atlas.animations).length * atlas.frame.h);
      expect(size.w).toBe(Math.max(...Object.values(atlas.animations).map((a) => a.frames)) * atlas.frame.w);
    });

    test(`${model}: a cabeça e o parado cabem no quadro`, () => {
      expect(atlas.head.x + atlas.head.size).toBeLessThanOrEqual(atlas.frame.w + 2);
      expect(atlas.head.y + atlas.head.size).toBeLessThanOrEqual(atlas.frame.h);
      expect(atlas.stand.x + atlas.stand.w).toBeLessThanOrEqual(atlas.frame.w);
      expect(atlas.stand.y + atlas.stand.h).toBe(atlas.anchor.y);
    });

    test(`${model}: o retrato (a janela da interface) mostra o parado inteiro, com o pé no mesmo lugar`, () => {
      const k = artScale(atlas);
      expect(PORTRAIT.anchorX - (atlas.anchor.x - atlas.stand.x) * k).toBeGreaterThanOrEqual(0);
      expect(PORTRAIT.w - PORTRAIT.anchorX).toBeGreaterThanOrEqual((atlas.stand.x + atlas.stand.w - atlas.anchor.x) * k);
      expect(PORTRAIT.h).toBeGreaterThanOrEqual((atlas.anchor.y - atlas.stand.y) * k);
    });
  }

  test('o índice do quadro segue o fps de cada modelo', () => {
    const hero = character(0).atlas, skel = character(4).atlas;
    expect(frameIndex(skel, 'run', 1000 / skel.animations.run.fps)).toBe(1);
    expect(frameIndex(hero, 'run', 1000 / hero.animations.run.fps)).toBe(1);
    expect(frameIndex(skel, 'shove', 60_000)).toBe(skel.animations.shove.frames - 1);
    expect(frameIndex(skel, 'jump', -50)).toBe(0);
  });
});
