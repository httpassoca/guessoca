import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { SHOVE_COOLDOWN_MS } from '@guess/world';
import { ANIMATION_NAMES } from '../src/atlas';
import { blank, bounds, crop, palette, rgbOf, setPixel, type Image } from '../src/image';
import { readPng } from '../src/png';
import { CELL_H, CELL_W, GROUND, H, PAD_X, SHIFTS, VORCARO_SPEC, WORLD_SCALE, buildVorcaro, cellsOf, derive, place } from '../src/vorcaro';

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
/** só o retângulo com o boneco */
const tight = (img: Image) => { const b = bounds(img)!; return crop(img, b.x, b.y, b.w, b.h); };

describe('vorcaro', () => {
  test('as células saem como vieram, pixel por pixel', () => {
    const src = sheet(2);
    const cells = cellsOf(src);
    expect(cells).toHaveLength(2);
    expect(cells[1].data).toEqual(crop(src, CELL_W, 0, CELL_W, CELL_H).data);
  });

  test('cada quadro vai para a tela com o ponto mais baixo no chão, mesmo desenhado no ar, sem mudar a arte', () => {
    const [ground] = cellsOf(sheet(1)), [air] = cellsOf(sheet(1, 42));
    expect(floor(place(ground))).toBe(H);
    expect(floor(place(air))).toBe(H);
    expect(bounds(place(ground))!.x).toBe(PAD_X + 84);
    expect(bounds(place(ground, 24))!.x).toBe(PAD_X + 84 + 24);
    expect(tight(place(air, 24)).data).toEqual(tight(air).data);
    expect(palette(place(ground))).toEqual(palette(ground));
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
    for (const f of rows.flat()) expect(floor(f)).toBe(H);
    const x = (name: (typeof ANIMATION_NAMES)[number]) => bounds(rows[ANIMATION_NAMES.indexOf(name)][0])!.x;
    expect(x('run') - x('idle')).toBe(SHIFTS.run!);
  });

  test('monta uma folha só, no tamanho da arte, com a escala do mundo no atlas', () => {
    const { sheets, atlas } = buildVorcaro(pack());
    expect(sheets).toHaveLength(1);
    expect(sheets[0].height).toBe(ANIMATION_NAMES.length * atlas.frame.h);
    expect(atlas.scale).toBe(WORLD_SCALE);
    expect(atlas.stand).toMatchObject({ w: 96, h: GROUND - 50 });
    expect(atlas.stand.y + atlas.stand.h).toBe(atlas.anchor.y);
    expect(atlas.anchor.x).toBe(atlas.stand.x + atlas.stand.w / 2);
    expect(atlas.head.y).toBeLessThanOrEqual(atlas.stand.y);
    expect(atlas.head.x + atlas.head.size / 2).toBe(atlas.stand.x + (96 - 84 + 30));
    // o primeiro quadro do parado, na folha, é a arte: os mesmos pixels do boneco da célula
    const first = crop(sheets[0], atlas.stand.x, atlas.stand.y, atlas.stand.w, atlas.stand.h);
    expect(first.data).toEqual(tight(cellsOf(sheet(1))[0]).data);
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
