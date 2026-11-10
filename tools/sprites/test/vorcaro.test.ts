import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { SHOVE_COOLDOWN_MS } from '@guess/world';
import { ANIMATION_NAMES } from '../src/atlas';
import { blank, bounds, getPixel, rgbOf, setPixel, type Image } from '../src/image';
import { readPng } from '../src/png';
import { CELL_H, CELL_W, FIXES, GROUND, H, PAD_X, SCALE, VORCARO_SPEC, W, buildVorcaro, cellsOf, derive, grow, place, shrink } from '../src/vorcaro';

function fill(img: Image, x: number, y: number, w: number, h: number, hex: string, a = 255) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) setPixel(img, x + i, y + j, [...rgbOf(hex), a]);
}

/** Uma folha de mentira com `n` células: um boneco (cabeça, corpo, sapatos) com os pés `lift` pixels acima do chão. */
function sheet(n: number, lift = 0): Image {
  const img = blank(n * CELL_W, CELL_H);
  for (let i = 0; i < n; i++) {
    const x0 = i * CELL_W;
    fill(img, x0 + 96, 50 - lift, 60, 84, 'aa7744');
    fill(img, x0 + 84, 134 - lift, 96, 194, '222244');
    fill(img, x0 + 84, 328 - lift, 96, GROUND - 328, '221111');
  }
  return img;
}
const pack = (lift = 0) => Object.fromEntries(ANIMATION_NAMES.map((name) => [name, sheet(VORCARO_SPEC.animations[name].frames, ['jump', 'fall', 'fall_loop'].includes(name) ? lift : 0)]));
const floor = (img: Image) => { const b = bounds(img)!; return b.y + b.h; };

describe('vorcaro', () => {
  test('as células saem com alfa de tudo ou nada', () => {
    const s = blank(CELL_W, CELL_H);
    fill(s, 10, 10, 2, 1, 'ffffff', 200);
    fill(s, 12, 10, 2, 1, 'ffffff', 90);
    const [c] = cellsOf(s);
    expect(getPixel(c, 10, 10)[3]).toBe(255);
    expect(getPixel(c, 12, 10)[3]).toBe(0);
  });

  test('cada quadro vai para a tela com o ponto mais baixo no chão, mesmo desenhado no ar', () => {
    const [ground] = cellsOf(sheet(1)), [air] = cellsOf(sheet(1, 42));
    expect(floor(place(ground))).toBe(H);
    expect(floor(place(air))).toBe(H);
    expect(bounds(place(ground))!.x).toBe(PAD_X + 84);
    expect(bounds(place(ground, { dx: 24 }))!.x).toBe(PAD_X + 84 + 24);
    expect([W % SCALE, H % SCALE]).toEqual([0, 0]);
  });

  test('crescer aumenta o boneco sem tirar o pé do chão nem a frente do lugar', () => {
    const [c] = cellsOf(sheet(1));
    const a = bounds(place(c))!, b = bounds(place(c, { grow: 1.16 }))!;
    expect(b.h).toBeGreaterThan(a.h);
    expect(b.y + b.h).toBe(H);
    expect(b.x + b.w).toBe(a.x + a.w);
    expect(grow(place(c), 1, 0, 0).data).toEqual(place(c).data);
  });

  test('encolher: um pixel por bloco, opaco se metade do bloco é, da cor que mais aparece (não a média)', () => {
    const img = blank(4, 2);
    fill(img, 0, 0, 2, 2, '202020');
    setPixel(img, 0, 0, [240, 240, 240, 255]); // um ponto de luz num bloco escuro: perde
    setPixel(img, 2, 0, [255, 0, 0, 255]); // um pixel só num bloco vazio: some
    const out = shrink(img, 2);
    expect([out.width, out.height]).toEqual([2, 1]);
    expect(getPixel(out, 0, 0)).toEqual([0x20, 0x20, 0x20, 255]);
    expect(getPixel(out, 1, 0)[3]).toBe(0);
  });

  test('cada animação tem os quadros do atlas, e o empurrão cabe no tempo do mundo', () => {
    const rows = derive(pack());
    ANIMATION_NAMES.forEach((name, i) => expect(rows[i]).toHaveLength(VORCARO_SPEC.animations[name].frames));
    const s = VORCARO_SPEC.animations.shove;
    expect((s.frames / s.fps) * 1000).toBeLessThanOrEqual(SHOVE_COOLDOWN_MS);
    expect(VORCARO_SPEC.credit).toBeNull();
  });

  test('todo quadro de toda animação tem o pé na mesma linha; o correr anda para a frente', () => {
    const rows = derive(pack(42));
    for (const f of rows.flat()) expect(floor(f)).toBe(H / SCALE);
    const x = (name: (typeof ANIMATION_NAMES)[number]) => bounds(rows[ANIMATION_NAMES.indexOf(name)][0])!.x;
    expect(x('run') - x('idle')).toBe(FIXES.run!.all!.dx! / SCALE);
  });

  test('monta uma folha só, com a âncora entre os sapatos e a cabeça no alto do parado', () => {
    const { sheets, atlas } = buildVorcaro(pack());
    expect(sheets).toHaveLength(1);
    expect(sheets[0].height).toBe(ANIMATION_NAMES.length * atlas.frame.h);
    expect(atlas.stand.y + atlas.stand.h).toBe(atlas.anchor.y);
    expect(atlas.anchor.x).toBe(atlas.stand.x + atlas.stand.w / 2);
    expect(atlas.head.y).toBeLessThanOrEqual(atlas.stand.y);
    expect(atlas.head.x + atlas.head.size / 2).toBe(atlas.stand.x + (96 - 84 + 30) / SCALE);
  });

  test('sem uma folha, ou com uma folha curta, erro dizendo o que falta', () => {
    const { walk: _, ...rest } = pack();
    expect(() => buildVorcaro(rest)).toThrow(/walk/);
    expect(() => buildVorcaro({ ...pack(), run: sheet(3) })).toThrow(/run.*3 quadros/);
  });
});

const dir = join(import.meta.dir, '../../../assets-src/vorcaro');
describe.skipIf(!existsSync(join(dir, 'idle.png')))('a arte de verdade (só com o pacote em assets-src/)', () => {
  test('as folhas têm células de 256×384 e pelo menos os quadros do atlas, e o parado pisa na linha do chão', () => {
    for (const name of ANIMATION_NAMES) {
      const s = readPng(join(dir, `${name}.png`));
      expect(s.height).toBe(CELL_H);
      expect(s.width / CELL_W).toBeGreaterThanOrEqual(VORCARO_SPEC.animations[name].frames);
    }
    expect(floor(cellsOf(readPng(join(dir, 'idle.png')))[0])).toBe(GROUND);
  });
});
