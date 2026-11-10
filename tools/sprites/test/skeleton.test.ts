import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ANIMATION_NAMES } from '../src/atlas';
import { blank, bounds, components, getPixel, hexOf, palette, rgbOf, setPixel, type Image } from '../src/image';
import { readPng } from '../src/png';
import {
  CAPE, CAPES, CELL_H, CELL_W, EYE, FEET_Y, SHEETS, SHOVE_FRAMES, SKELETON_SPEC, SLASH_MIN, buildSkeleton, derive, recolorCape, skeletonCells, withoutSlash,
} from '../src/skeleton';

function fill(img: Image, x: number, y: number, w: number, h: number, hex: string) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) setPixel(img, x + i, y + j, [...rgbOf(hex), 255]);
}
const count = (img: Image, hex: string) => {
  let n = 0;
  for (let i = 0; i < img.data.length; i += 4) if (img.data[i + 3] && hexOf(img.data[i], img.data[i + 1], img.data[i + 2]) === hex) n++;
  return n;
};

/** Um esqueleto de mentira numa célula: crânio branco com olhos, tronco com capa, ossos finos brancos até o chão. */
function body(img = blank(CELL_W, CELL_H), x0 = 0) {
  fill(img, x0 + 56, 40, 12, 6, 'ffffff'); // o crânio
  fill(img, x0 + 56, 40, 12, 3, '7e7e7e'); // o alto do crânio na sombra: sobram 36 brancos, como no de verdade
  setPixel(img, x0 + 65, 44, [...rgbOf(EYE), 255]);
  setPixel(img, x0 + 68 - 1, 44, [...rgbOf(EYE), 255]);
  fill(img, x0 + 48, 46, 18, 16, CAPE[0]); // a capa
  fill(img, x0 + 48, 46, 18, 2, CAPE[1]);
  fill(img, x0 + 52, 50, 2, 10, '7e7e7e'); // costelas cinza por cima da capa
  fill(img, x0 + 50, 62, 2, 19, 'ffffff'); // perna branca, fina: 38 pixels
  fill(img, x0 + 58, 62, 2, 19, '7e7e7e'); // perna de trás
  fill(img, x0 + 46, 80, 6, 1, 'ffffff'); // pé
  fill(img, x0 + 30, 50, 18, 2, '4d5865'); // a espada nas costas
  return img;
}

describe('capa', () => {
  test('a capa vermelha é a original, e a única que ficou', () => {
    expect(CAPES.map((c) => c.name)).toEqual(['vermelho']);
    expect(CAPES[0].ramp).toEqual(CAPE);
  });

  test('trocar a capa só mexe nas cores da capa: olhos, ossos e espada ficam', () => {
    const f = body();
    const BLUE = ['1c2c6e', '2f50ad'] as const; // uma capa que o jogo já teve
    const out = recolorCape(f, BLUE);
    for (const c of CAPE) expect(palette(out).has(c)).toBe(false);
    expect(count(out, BLUE[0]) + count(out, BLUE[1])).toBe(count(f, CAPE[0]) + count(f, CAPE[1]));
    for (const keep of [EYE, 'ffffff', '7e7e7e', '4d5865']) expect(count(out, keep)).toBe(count(f, keep));
    expect(EYE).not.toBe(CAPE[0]);
  });
});

describe('o rastro do golpe', () => {
  test('a mancha branca grande some; os ossos brancos finos e o crânio ficam', () => {
    const f = body();
    const bones = count(f, 'ffffff');
    fill(f, 66, 47, 40, 8, 'ffffff'); // o rastro, colado na capa
    const out = withoutSlash(f);
    expect(count(out, 'ffffff')).toBe(bones);
    expect(count(out, CAPE[0])).toBe(count(f, CAPE[0]));
  });

  test('a ponta solta do rastro (toda branca, cheia) some; um osso solto fica', () => {
    const f = body();
    fill(f, 120, 40, 8, 7, 'ffffff'); // ponta de flecha solta: 56 pixels
    fill(f, 90, 70, 2, 10, 'ffffff'); // um osso solto: 20 pixels
    const out = withoutSlash(f);
    expect(getPixel(out, 122, 42)[3]).toBe(0);
    expect(getPixel(out, 90, 75)[3]).toBe(255);
    expect(SLASH_MIN).toBeGreaterThan(55); // o crânio com o braço erguido tem 55
  });
});

describe('as animações desenhadas', () => {
  const counts: Record<string, number> = { IDLE: 11, WALK: 9, FWD_SWING: 7, DOWN_SWING: 7 };
  const sheets = Object.fromEntries(SHEETS.map((name) => {
    const s = blank(counts[name] * CELL_W, CELL_H);
    for (let i = 0; i < counts[name]; i++) body(s, i * CELL_W);
    return [name, s];
  }));
  const rows = derive(skeletonCells(sheets));

  test('cada animação tem os quadros que o atlas diz', () => {
    rows.forEach((frames, i) => expect(frames.length).toBe(SKELETON_SPEC.animations[ANIMATION_NAMES[i]].frames));
    expect(SKELETON_SPEC.animations.run.fps).toBeGreaterThan(SKELETON_SPEC.animations.walk.fps);
    expect(SKELETON_SPEC.animations.fall_loop.loop).toBe(true);
    expect(SKELETON_SPEC.animations.shove.loop).toBe(false);
    // o empurrão cabe no tempo dele no mundo (SHOVE_COOLDOWN_MS)
    expect((SKELETON_SPEC.animations.shove.frames / SKELETON_SPEC.animations.shove.fps) * 1000).toBeLessThanOrEqual(450);
  });

  test('nenhum quadro desenhado encosta na borda da célula (nada ficou cortado)', () => {
    for (const frames of rows) for (const f of frames) {
      const b = bounds(f)!;
      expect(b.x).toBeGreaterThan(0);
      expect(b.y).toBeGreaterThan(0);
      expect(b.x + b.w).toBeLessThan(CELL_W);
      expect(b.y + b.h).toBeLessThan(CELL_H);
    }
  });

  test('correr e cair ainda têm capa e crânio; o agachado tem o pé no chão', () => {
    for (const name of ['run', 'jump', 'fall', 'fall_loop'] as const) for (const f of rows[ANIMATION_NAMES.indexOf(name)]) {
      expect(count(f, CAPE[0])).toBeGreaterThan(0);
      expect(count(f, EYE)).toBe(2);
    }
    const crouch = bounds(rows[ANIMATION_NAMES.indexOf('jump')][0])!;
    expect(crouch.y + crouch.h - 1).toBe(FEET_Y);
  });

  test('a folha e o atlas: uma folha por capa, a âncora no chão', () => {
    const { sheets: out, atlas } = buildSkeleton(sheets);
    expect(out).toHaveLength(CAPES.length);
    expect(atlas.credit).toBeNull();
    expect(atlas.anchor.y).toBe(atlas.stand.y + atlas.stand.h);
    const { x, y, size } = atlas.head;
    expect(x + size).toBeLessThanOrEqual(atlas.frame.w);
    expect(y + size).toBeLessThanOrEqual(atlas.frame.h);
  });

  test('falta uma folha: erro dizendo qual', () => {
    const { WALK: _, ...rest } = sheets;
    expect(() => buildSkeleton(rest)).toThrow(/WALK/);
  });
});

const pack = join(import.meta.dir, '../../../assets-src/skeleton');
describe.skipIf(!existsSync(pack))('a arte de verdade (só com o pacote em assets-src/)', () => {
  // o bun registra os testes rodando o corpo do describe mesmo quando pula: sem o pacote (no CI), não lê nada
  const loaded = existsSync(pack);
  const sheets = loaded ? Object.fromEntries(SHEETS.map((name) => [name, readPng(join(pack, `${name}.png`))])) : {};
  const cells = (loaded ? skeletonCells(sheets) : {}) as ReturnType<typeof skeletonCells>;

  test('tirar o rastro não mexe em quadro sem golpe: os ossos ficam todos', () => {
    for (const f of [...cells.IDLE, ...cells.WALK, cells.DOWN_SWING[1], cells.DOWN_SWING[2]]) expect(withoutSlash(f).data).toEqual(f.data);
  });

  test('no empurrão não sobra mancha branca grande; os olhos e os ossos ficam', () => {
    const rows = derive(cells);
    rows[ANIMATION_NAMES.indexOf('shove')].forEach((f, i) => {
      const source = cells.FWD_SWING[SHOVE_FRAMES[i]];
      expect(Math.max(0, ...components(f, new Set(['ffffff'])).map((c) => c.length))).toBeLessThan(SLASH_MIN);
      expect(count(f, EYE)).toBe(count(source, EYE));
      expect(count(f, 'ffffff')).toBeGreaterThanOrEqual(40); // crânio e perna da frente
    });
  });

  test('a capa original só usa as duas cores da capa; o resto do vermelho é o olho', () => {
    const reds = [...palette(cells.IDLE[0])].filter((c) => { const [r, g, b] = rgbOf(c); return r > g + 40 && r > b + 40; });
    expect(reds.sort()).toEqual([...CAPE, EYE].sort());
  });
});
