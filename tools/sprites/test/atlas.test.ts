import { describe, expect, test } from 'bun:test';
import { ANIMATION_NAMES, layout, type ModelSpec } from '../src/atlas';
import { characters } from '../src/characters';
import { blank, getPixel, rgbOf, setPixel, type Image } from '../src/image';

function fill(img: Image, x: number, y: number, w: number, h: number, hex: string) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) setPixel(img, x + i, y + j, [...rgbOf(hex), 255]);
}

/** Um quadro 40×40 com um bloco 6×10 em `(x, 20)`. */
function frame(x: number, extra?: (img: Image) => void) {
  const img = blank(40, 40);
  fill(img, x, 20, 6, 10, '336699');
  extra?.(img);
  return img;
}

const anim = (frames: number, fps = 10, loop = true) => ({ frames, fps, loop });

describe('a montagem do atlas', () => {
  const spec: ModelSpec = {
    animations: { idle: anim(3), walk: anim(2), run: anim(2, 14), jump: anim(1, 12, false), fall: anim(1, 12, false), fall_loop: anim(2), shove: anim(4, 16, false) },
    credit: null,
  };
  const rows = ANIMATION_NAMES.map((name) => Array.from({ length: spec.animations[name].frames }, (_, i) =>
    // o empurrão estica o bloco 4 pixels para a frente; o pulo sobe 3
    name === 'shove' ? frame(10, (img) => fill(img, 16, 24, 4, 1, '336699')) : name === 'jump' ? frame(10 + i, (img) => fill(img, 12, 17, 2, 3, 'ffffff')) : frame(10)));
  const { sheet, atlas } = layout(rows, spec, { anchorX: 13, head: () => ({ x: 0, y: 0, size: 4 }) });

  test('uma linha por animação, na ordem do jogo, com fps e loop do modelo', () => {
    expect(Object.keys(atlas.animations)).toEqual([...ANIMATION_NAMES]);
    expect(atlas.animations.shove).toEqual({ row: 6, frames: 4, fps: 16, loop: false });
    expect(atlas.credit).toBeNull();
  });

  test('o quadro é o menor retângulo que cabe todos', () => {
    expect(atlas.frame).toEqual({ w: 10, h: 13 }); // x 10..20, y 17..30
    expect([sheet.width, sheet.height]).toEqual([4 * 10, 7 * 13]);
  });

  test('a âncora (o pé) e o parado vêm do primeiro quadro do parado, no quadro recortado', () => {
    expect(atlas.anchor).toEqual({ x: 3, y: 13 });
    expect(atlas.stand).toEqual({ x: 0, y: 3, w: 6, h: 10 });
  });

  test('cada quadro vai para a sua coluna e linha', () => {
    const shoveRow = 6 * 13;
    expect(getPixel(sheet, 3 * 10 + 9, shoveRow + 7)[3]).toBe(255); // a ponta do empurrão, no quarto quadro
    expect(getPixel(sheet, 9, 7)[3]).toBe(0); // o parado não tem ponta
  });
});

describe('os personagens', () => {
  const list = characters();

  test('nove, um de cada modelo, cada um com a sua folha e o seu atlas', () => {
    expect(list).toHaveLength(9);
    expect(list.map((c) => c.model)).toEqual(['hero', 'skeleton', 'kratos', 'vorcaro', 'orelha', 'bolsonaro', 'knight', 'oldsnake', 'pinocchio']);
    // o pixel art pequeno em PNG; a arte grande dos de sete folhas em WebP sem perda
    expect(list.map((c) => c.sheet)).toEqual(['/sprites/char-0.png', '/sprites/char-1.png', '/sprites/char-2.webp', '/sprites/char-3.webp', '/sprites/char-4.webp', '/sprites/char-5.webp', '/sprites/char-6.webp', '/sprites/char-7.webp', '/sprites/char-8.webp']);
    for (const c of list) expect(c.atlas).toBe(c.model);
  });

  test('cores de interface únicas, em #rrggbb, e os nomes', () => {
    expect(new Set(list.map((c) => c.color)).size).toBe(9);
    for (const c of list) expect(c.color).toMatch(/^#[0-9a-f]{6}$/);
    expect(list.map((c) => c.name)).toEqual(['loiro', 'vermelho', 'kratos', 'vorcaro', 'orelha', 'bolsonaro', 'cavaleiro', 'oldsnake', 'pinocchio']);
  });
});
