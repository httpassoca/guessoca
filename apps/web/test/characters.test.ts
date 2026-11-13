import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHARACTERS } from '@guess/rules';
import { artScale, character, CHARACTER_ART, frameAt, frameIndex, fitScale, largestSheet, sheetSize } from '../src/lib/sprites/characters';

describe('personagens', () => {
  test('um por personagem do protocolo, cada um com a sua folha no lugar dele e o seu atlas', () => {
    expect(CHARACTER_ART).toHaveLength(CHARACTERS);
    CHARACTER_ART.forEach((c, n) => {
      // uma folha por página do atlas: o parado e o resto
      expect(c.sheets).toHaveLength(c.atlas.pages.length);
      expect(c.sheets[0]).toMatch(new RegExp(`^/sprites/char-${n}-idle\\.(png|webp)$`));
      expect(c.sheets[1]).toMatch(new RegExp(`^/sprites/char-${n}-moves\\.(png|webp)$`));
      expect(c.atlas.frame.w).toBeGreaterThan(0);
    });
    expect(CHARACTER_ART.slice(0, 2).map((c) => [c.model, c.name])).toEqual([['hero', 'loiro'], ['skeleton', 'vermelho']]);
    expect(new Set(CHARACTER_ART.map((c) => c.model)).size).toBe(CHARACTERS); // hoje, um de cada modelo
  });

  test('cores únicas, para bordas e marcas na interface', () => {
    for (const c of CHARACTER_ART) expect(c.color).toMatch(/^#[0-9a-f]{6}$/);
    expect(new Set(CHARACTER_ART.map((c) => c.color)).size).toBe(CHARACTERS);
  });

  test('o pixel art no tamanho do jogo vale 1 unidade por pixel; a arte grande é desenhada encolhida, e cada um tem o seu tamanho', () => {
    const tall = (model: string) => { const a = CHARACTER_ART.find((c) => c.model === model)!.atlas; return Math.round((a.anchor.y - a.stand.y) * artScale(a)); };
    expect(CHARACTER_ART.map((c) => artScale(c.atlas) < 1)).toEqual(CHARACTER_ART.map((c) => c.sheets.every((s) => s.endsWith('.webp'))));
    // um adulto tem 50: a Eve e o Pinóquio são a medida; o cachorro fica no joelho, o do dinossauro é o maior
    expect(['hero', 'skeleton', 'kratos', 'vorcaro', 'orelha', 'bolsonaro', 'knight', 'eve', 'pinocchio', 'josuke', 'starplatinum'].map(tall)).toEqual([37, 51, 61, 50, 15, 70, 10, 50, 50, 50, 58]);
    const dog = CHARACTER_ART.find((c) => c.model === 'orelha')!.atlas;
    expect(dog.stand.w).toBeGreaterThan(dog.stand.h); // quatro patas: mais comprido que alto
  });

  test('fora da faixa cai no primeiro, sem quebrar', () => {
    expect(character(99)).toBe(character(0));
    expect(character(-1)).toBe(character(0));
  });

  for (const n of CHARACTER_ART.keys()) {
    const { atlas, model } = character(n);

    test(`${model}: as animações que o jogo usa existem`, () => {
      for (const name of ['idle', 'walk', 'run', 'jump', 'fall', 'fall_loop', 'shove'] as const) expect(atlas.animations[name].frames).toBeGreaterThan(0);
      expect(atlas.animations.shove.loop).toBe(false);
      expect(atlas.animations.fall_loop.loop).toBe(true);
    });

    test(`${model}: o quadro de uma animação em loop dá a volta; o de uma sem loop para no último`, () => {
      expect(frameAt(atlas, 'idle', atlas.animations.idle.frames)).toEqual(frameAt(atlas, 'idle', 0));
      const last = atlas.animations.shove.frames - 1, cols = atlas.pages[atlas.animations.shove.page].cols;
      expect(frameAt(atlas, 'shove', 99)).toEqual({
        page: atlas.animations.shove.page,
        x: (last % cols) * atlas.frame.w,
        y: (atlas.animations.shove.row + Math.floor(last / cols)) * atlas.frame.h,
      });
    });

    test(`${model}: nenhuma folha passa de 8192 pixels de lado (o limite do WebGL por software), e todo quadro cabe na sua`, () => {
      expect(largestSheet(atlas)).toBeLessThanOrEqual(8192);
      // a página 0 é só o parado, numa linha: o seletor e o rosto andam nela de quadro em quadro
      expect(atlas.animations.idle).toMatchObject({ page: 0, row: 0 });
      expect(sheetSize(atlas)).toEqual({ w: atlas.animations.idle.frames * atlas.frame.w, h: atlas.frame.h });
      for (const [name, a] of Object.entries(atlas.animations)) {
        for (let i = 0; i < a.frames; i++) {
          const f = frameAt(atlas, name as keyof typeof atlas.animations, i);
          const page = sheetSize(atlas, f.page);
          expect(f.x + atlas.frame.w).toBeLessThanOrEqual(page.w);
          expect(f.y + atlas.frame.h).toBeLessThanOrEqual(page.h);
        }
      }
    });

    test(`${model}: dois quadros de animações diferentes nunca caem no mesmo lugar`, () => {
      const seen = new Set<string>();
      for (const [name, a] of Object.entries(atlas.animations)) {
        for (let i = 0; i < a.frames; i++) {
          const f = frameAt(atlas, name as keyof typeof atlas.animations, i);
          const key = `${f.page}:${f.x}:${f.y}`;
          expect(seen.has(key)).toBe(false);
          seen.add(key);
        }
      }
    });

    test(`${model}: a cabeça e o parado cabem no quadro`, () => {
      expect(atlas.head.x + atlas.head.size).toBeLessThanOrEqual(atlas.frame.w + 2);
      expect(atlas.head.y + atlas.head.size).toBeLessThanOrEqual(atlas.frame.h);
      expect(atlas.stand.x + atlas.stand.w).toBeLessThanOrEqual(atlas.frame.w);
      expect(atlas.stand.y + atlas.stand.h).toBe(atlas.anchor.y);
    });

    test(`${model}: enquadrado numa caixa, o parado cabe inteiro, com o pé embaixo, e os passos da animação caem em pixel inteiro`, () => {
      for (const box of [{ w: 56, h: 84 }, { w: 272, h: 232 }]) {
        const f = fitScale(atlas, box);
        expect(f.w * f.k).toBeLessThanOrEqual(box.w + 0.001);
        expect(f.h * f.k).toBeLessThanOrEqual(box.h + 0.001);
        expect(f.y + f.h).toBe(atlas.anchor.y);
        expect(f.x).toBeLessThanOrEqual(atlas.stand.x);
        expect(f.x + f.w).toBeGreaterThanOrEqual(atlas.stand.x + atlas.stand.w);
        expect(Math.abs(atlas.frame.w * f.k - Math.round(atlas.frame.w * f.k))).toBeLessThan(1e-6);
        // enche a caixa: um dos lados quase inteiro
        expect(Math.max((f.w * f.k) / box.w, (f.h * f.k) / box.h)).toBeGreaterThan(0.9);
      }
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
