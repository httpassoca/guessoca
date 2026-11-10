import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHARACTERS } from '@guess/rules';
import { artScale, character, CHARACTER_ART, frameAt, frameIndex, PORTRAIT, sheetSize } from '../src/lib/sprites/characters';

describe('personagens', () => {
  test('um por personagem do protocolo: onze, um de cada modelo', () => {
    expect(CHARACTER_ART).toHaveLength(CHARACTERS);
    expect(CHARACTER_ART.map((c) => c.model)).toEqual(['hero', 'skeleton', 'kratos', 'vorcaro', 'orelha', 'bolsonaro', 'knight', 'oldsnake', 'pinocchio', 'eve', 'katarina']);
    expect(CHARACTER_ART.map((c) => c.sheet)).toEqual(['/sprites/char-0.png', '/sprites/char-1.png', '/sprites/char-2.webp', '/sprites/char-3.webp', '/sprites/char-4.webp', '/sprites/char-5.webp', '/sprites/char-6.webp', '/sprites/char-7.webp', '/sprites/char-8.webp', '/sprites/char-9.webp', '/sprites/char-10.webp']);
    expect(new Set(CHARACTER_ART.map((c) => c.atlas)).size).toBe(11);
    expect(character(0).name).toBe('loiro');
    expect(character(1).name).toBe('vermelho');
  });

  test('cores únicas, para bordas e marcas na interface', () => {
    for (const c of CHARACTER_ART) expect(c.color).toMatch(/^#[0-9a-f]{6}$/);
    expect(new Set(CHARACTER_ART.map((c) => c.color)).size).toBe(CHARACTERS);
  });

  test('as cores do CSS (--gs-char-N) são as do characters.json', () => {
    const css = readFileSync(join(import.meta.dir, '../src/app.css'), 'utf8');
    CHARACTER_ART.forEach((c, n) => expect(css).toContain(`--gs-char-${n}: ${c.color};`));
  });

  test('o Kratos, o Vorcaro, o Orelha, o Bolsonaro, o cavaleiro, o Old Snake, o Pinóquio, a Eve e a Katarina são arte grande desenhada encolhida; os outros valem 1 unidade por pixel', () => {
    expect(CHARACTER_ART.map((c) => artScale(c.atlas) < 1)).toEqual([false, false, true, true, true, true, true, true, true, true, true]);
    const tall = (n: number) => { const a = character(n).atlas; return Math.round((a.anchor.y - a.stand.y) * artScale(a)); };
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(tall)).toEqual([37, 51, 61, 50, 20, 70, 35, 49, 50, 50, 50]);
    const o = character(4).atlas;
    expect(o.stand.w).toBeGreaterThan(o.stand.h); // quatro patas: mais comprido que alto
  });

  test('fora da faixa cai no primeiro, sem quebrar', () => {
    expect(character(99)).toBe(character(0));
    expect(character(-1)).toBe(character(0));
  });

  for (const n of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
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
    const hero = character(0).atlas, skel = character(1).atlas;
    expect(frameIndex(skel, 'run', 1000 / skel.animations.run.fps)).toBe(1);
    expect(frameIndex(hero, 'run', 1000 / hero.animations.run.fps)).toBe(1);
    expect(frameIndex(skel, 'shove', 60_000)).toBe(skel.animations.shove.frames - 1);
    expect(frameIndex(skel, 'jump', -50)).toBe(0);
  });
});
