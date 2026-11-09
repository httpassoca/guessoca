import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { SHOVE_COOLDOWN_MS } from '@guess/world';
import { ANIMATION_NAMES } from '../src/atlas';
import { readGifStrip } from '../src/gif';
import { blank, bounds, rgbOf, setPixel, type Image } from '../src/image';
import { CELL, FEET_Y, HIP_Y, KRATOS_SPEC, PAD_X, PAD_Y, SIDE, buildKratos, derive, pose, sideView } from '../src/kratos';

function fill(img: Image, x: number, y: number, w: number, h: number, hex: string) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) setPixel(img, x + i, y + j, [...rgbOf(hex), 255]);
}

/** Um giro de mentira: 8 células, e só a de lado tem um boneco (cabeça, tronco, espada à frente, pernas até a linha 62). */
function rotation(): Image {
  const img = blank(8 * CELL, CELL);
  const x0 = SIDE * CELL;
  fill(img, x0 + 26, 1, 13, 15, 'ccbbaa'); // a cabeça
  fill(img, x0 + 21, 16, 18, 32, '556677'); // o tronco
  fill(img, x0 + 34, 39, 22, 5, 'eeeeee'); // a mão e a espada
  fill(img, x0 + 24, 48, 14, 15, '884422'); // as pernas
  fill(img, (SIDE + 1) * CELL, 0, 4, 64, 'ff00ff'); // o vizinho encostado na borda: não pode vazar
  return img;
}

const row = (rows: Image[][], name: (typeof ANIMATION_NAMES)[number]) => rows[ANIMATION_NAMES.indexOf(name)];
const feet = (img: Image) => { const b = bounds(img)!; return b.y + b.h - 1; };

describe('kratos', () => {
  const side = sideView(rotation());

  test('o quadro de lado vai para a tela com folga, sem o vizinho', () => {
    expect(bounds(side)).toEqual({ x: 21 + PAD_X, y: 1 + PAD_Y, w: 35, h: 62 });
    expect(feet(side)).toBe(FEET_Y);
  });

  test('a pose sem nada é o quadro como veio, com a perna de trás escondida atrás da da frente', () => {
    expect(pose(side).data).toEqual(side.data);
  });

  test('cada animação tem os quadros do atlas, e o empurrão cabe no tempo do mundo', () => {
    const rows = derive(side);
    ANIMATION_NAMES.forEach((name, i) => expect(rows[i]).toHaveLength(KRATOS_SPEC.animations[name].frames));
    const s = KRATOS_SPEC.animations.shove;
    expect((s.frames / s.fps) * 1000).toBeLessThanOrEqual(SHOVE_COOLDOWN_MS);
    expect(KRATOS_SPEC.credit).toBeNull();
  });

  test('no chão (parado, andando, correndo, empurrando) algum pé fica na linha do chão em todo quadro', () => {
    const rows = derive(side);
    for (const name of ['idle', 'walk', 'run', 'shove'] as const) for (const f of row(rows, name)) expect(feet(f)).toBe(FEET_Y);
  });

  test('andando as pernas abrem: o quadro de passo é mais largo embaixo que o parado; o tronco não muda de largura', () => {
    const legs = (img: Image) => { const c = blank(img.width, img.height); c.data.set(img.data); c.data.fill(0, 0, (HIP_Y + 1) * img.width * 4); return bounds(c)!.w; };
    const rows = derive(side);
    expect(legs(row(rows, 'walk')[2])).toBeGreaterThan(legs(side));
    expect(legs(row(rows, 'run')[2])).toBeGreaterThan(legs(row(rows, 'walk')[2]));
  });

  test('o empurrão vai para a frente e volta; o pulo encolhe as pernas', () => {
    const right = (img: Image) => { const b = bounds(img)!; return b.x + b.w; };
    const shove = row(derive(side), 'shove');
    expect(right(shove[2])).toBeGreaterThan(right(side) + 4);
    expect(right(shove[4])).toBeLessThan(right(shove[2]));
    const jump = row(derive(side), 'jump');
    expect(bounds(jump[0])!.h).toBeLessThan(bounds(side)!.h);
  });

  test('monta uma folha só, com a âncora entre os pés e a cabeça no alto do parado', () => {
    const { sheets, atlas } = buildKratos({ ROTATION: rotation() });
    expect(sheets).toHaveLength(1);
    expect(sheets[0].height).toBe(ANIMATION_NAMES.length * atlas.frame.h);
    expect(atlas.stand.y + atlas.stand.h).toBe(atlas.anchor.y);
    expect(atlas.anchor.x).toBe(atlas.stand.x + 3 + 7); // o meio das pernas (24..37 na célula; o parado começa na 21)
    expect(atlas.head.y).toBeLessThanOrEqual(atlas.stand.y);
    expect(atlas.head.size).toBe(17);
  });

  test('sem o giro, ou com um giro curto, erro dizendo o que falta', () => {
    expect(() => buildKratos({})).toThrow(/ROTATION/);
    expect(() => buildKratos({ ROTATION: blank(CELL, CELL) })).toThrow(/quadros/);
  });
});

const pack = join(import.meta.dir, '../../../assets-src/kratos/kratos.gif');
describe.skipIf(!existsSync(pack))('a arte de verdade (só com o pacote em assets-src/)', () => {
  // o bun registra os testes rodando o corpo do describe mesmo quando pula: sem o pacote (no CI), não lê nada
  const strip = existsSync(pack) ? readGifStrip(pack) : blank(8 * CELL, CELL);

  test('o GIF tem 8 quadros de 64×64, e o de lado tem os pés na linha 62', () => {
    expect([strip.width, strip.height]).toEqual([8 * CELL, CELL]);
    expect(feet(sideView(strip))).toBe(FEET_Y);
  });
});
