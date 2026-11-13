import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  BIRD_CELL, BIRD_GROUND, BIRDS, CAT_ANIMS, CAT_CELL, CAT_GROUND, CATS, CROW, CROW_FLY, FLY_BODY_ROW, MEOW_CELL, MEOW_FRAMES, PIGEON, PIGEON_FLY,
  buildCritters, critterFiles, flyFrame,
} from '../src/critters';
import { blank, bounds, crop, getPixel, palette, rgbOf, setPixel, type Image } from '../src/image';
import { readPng } from '../src/png';

function fill(img: Image, x: number, y: number, w: number, h: number, hex: string) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) setPixel(img, x + i, y + j, [...rgbOf(hex), 255]);
}

/** Uma folha de mentira: `frames` células de `cell`, cada uma com um bicho de pés no chão e uma marca diferente por quadro. */
function sheet(cell: number, frames: number, ground: number, color = '303030', h = cell): Image {
  const img = blank(cell * frames, h);
  for (let i = 0; i < frames; i++) {
    fill(img, i * cell + cell / 2 - 8, ground - 12, 18, 12, color);
    setPixel(img, i * cell + cell / 2 - 8 + (i % 18), ground - 12, [255, 0, i * 10, 255]);
  }
  return img;
}

function fakeFiles(): Record<string, Image> {
  const files: Record<string, Image> = {};
  for (const c of CATS) for (const a of CAT_ANIMS) files[`${c.dir}/${a.file}`] = sheet(CAT_CELL, a.frames, CAT_GROUND);
  files.meow = sheet(MEOW_CELL, MEOW_FRAMES, MEOW_CELL, 'ffffff');
  for (const b of BIRDS) files[b.name] = sheet(BIRD_CELL, 12, BIRD_GROUND);
  return files;
}

describe('a receita dos bichos', () => {
  test('cada arquivo que a receita lê tem um nome lógico só, dentro de cats/ ou birds/', () => {
    const files = critterFiles();
    expect(new Set(files.map(([n]) => n)).size).toBe(files.length);
    for (const [, f] of files) expect(f).toMatch(/^(cats|birds)\//);
    expect(files.some(([, f]) => f.includes('YellowBird'))).toBe(false);
  });

  test('uma tira por gato e animação, mais o miau; uma por pássaro parado e voando', () => {
    const { atlas } = buildCritters(fakeFiles());
    expect(Object.keys(atlas.cats.strips)).toHaveLength(CATS.length * CAT_ANIMS.length + 1);
    expect(Object.keys(atlas.birds.strips).sort()).toEqual(['crow/fly', 'crow/idle', 'pigeon/fly', 'pigeon/idle']);
    expect(atlas.birds.credit).toBe('carysaurus');
    for (const a of CAT_ANIMS) expect(atlas.cats.strips[`preto/${a.name}`].frames).toBe(a.frames);
  });

  test('os pixels do pacote não mudam: cada quadro da folha é o recorte do quadro original', () => {
    const files = fakeFiles();
    const { cats, atlas } = buildCritters(files);
    const s = atlas.cats.strips['tigrado/walk'];
    const src = files['Cat-6/Walk'];
    // o retângulo do recorte na célula original: a âncora diz onde fica o pé (25, 32)
    const x0 = 25 - s.anchor.x, y0 = CAT_GROUND - s.anchor.y;
    for (let i = 0; i < s.frames; i++) expect(crop(cats, s.x + i * s.w, s.y, s.w, s.h).data).toEqual(crop(src, i * CAT_CELL + x0, y0, s.w, s.h).data);
  });

  test('a âncora fica entre os pés, no chão', () => {
    const { atlas } = buildCritters(fakeFiles());
    const s = atlas.cats.strips['preto/idle'];
    expect(s.anchor.y).toBe(s.h);
    const b = atlas.birds.strips['pigeon/idle'];
    expect(b.anchor.y).toBe(b.h);
  });

  test('o voo desenhado usa só as cores do próprio pássaro, com o corpo na mesma linha em todo quadro', () => {
    for (const [grids, colors] of [[PIGEON_FLY, PIGEON], [CROW_FLY, CROW]] as const) {
      const allowed = new Set(Object.values(colors));
      for (const g of grids) {
        const f = flyFrame(g, colors);
        expect(f.width).toBe(BIRD_CELL);
        for (const c of palette(f)) expect(allowed.has(c)).toBe(true);
        const b = bounds(f)!;
        expect(b.x + b.w).toBeLessThanOrEqual(BIRD_CELL);
        expect(b.y + b.h).toBeLessThanOrEqual(BIRD_CELL);
        expect(getPixel(f, 4, FLY_BODY_ROW)[3]).toBe(255); // a ponta da cauda, na linha do corpo
      }
    }
  });
});

const root = join(import.meta.dir, '../../../assets-src');
const present = critterFiles().every(([, f]) => existsSync(join(root, f)));
describe.skipIf(!present)('a arte de verdade (só com os pacotes em assets-src/)', () => {
  // o bun roda o corpo do describe mesmo quando pula: sem os pacotes (no CI), não lê nada
  const files = present ? Object.fromEntries(critterFiles().map(([n, f]) => [n, readPng(join(root, f))])) : {};

  test('as folhas do pacote têm os quadros que a receita espera', () => {
    if (!present) return;
    for (const c of CATS) for (const a of CAT_ANIMS) expect(files[`${c.dir}/${a.file}`].width).toBe(a.frames * CAT_CELL);
    for (const b of BIRDS) expect(files[b.name].width).toBe(12 * BIRD_CELL);
  });

  test('a 1×, o gato tem uns 20 de largura e 14 de altura; o pombo cabe numa célula de 32', () => {
    if (!present) return;
    const { atlas } = buildCritters(files);
    expect(atlas.cats.strips['preto/idle'].h).toBeLessThanOrEqual(20);
    expect(atlas.birds.strips['pigeon/idle'].w).toBeLessThanOrEqual(BIRD_CELL);
  });
});
