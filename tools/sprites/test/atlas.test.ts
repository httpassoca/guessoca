import { describe, expect, test } from 'bun:test';
import { ANIMATION_NAMES, cellOf, layout, MAX_SHEET, paginate, type ModelSpec } from '../src/atlas';
import { CHARACTERS } from '../../../packages/rules/src';
import { characters } from '../src/characters';
import { PACKS } from '../src/packs';
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

describe('as páginas', () => {
  /** uma folha de `layout` em que cada quadro é um bloco de cor própria (a animação e o índice), para seguir cada um */
  const colorOf = (row: number, i: number): [number, number, number, number] => [row * 30 + 10, i * 9 + 5, 200, 255];
  function sheetOf(spec: ModelSpec, w: number, h: number) {
    const rows = ANIMATION_NAMES.map((name, row) => Array.from({ length: spec.animations[name].frames }, (_, i) => {
      const img = blank(w, h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) setPixel(img, x, y, colorOf(row, i));
      return img;
    }));
    return layout(rows, spec, { anchorX: w / 2, head: () => ({ x: 0, y: 0, size: 4 }) });
  }
  const spec: ModelSpec = {
    animations: { idle: anim(12), walk: anim(8), run: anim(12), jump: anim(8, 12, false), fall: anim(8, 12, false), fall_loop: anim(8), shove: anim(24, 20, false) },
    credit: null,
  };

  test('o limite volta a ser 8192: o que o WebGL por software aceita', () => {
    expect(MAX_SHEET).toBe(8192);
  });

  test('o parado sozinho numa linha; o resto numa página quase quadrada, cada animação começando numa linha nova', () => {
    // o Vault Boy: quadro de 365×150, um ataque de 24 quadros (8760 pixels numa linha só)
    const { sheet, atlas } = sheetOf(spec, 365, 150);
    expect(sheet.width).toBe(8760);
    const { pages, atlas: paged } = paginate(sheet, atlas);
    for (const p of pages) expect(Math.max(p.width, p.height)).toBeLessThanOrEqual(MAX_SHEET);
    expect(paged.pages).toEqual(pages.map((p, i) => ({ w: p.width, h: p.height, cols: paged.pages![i].cols })));
    expect(pages).toHaveLength(2);
    expect(paged.pages![0]).toEqual({ w: 12 * 365, h: 150, cols: 12 });
    expect(paged.animations.idle).toMatchObject({ page: 0, row: 0 });
    expect(paged.animations.walk).toMatchObject({ page: 1, row: 0 });
    // cada animação começa onde a anterior acabou, em linhas inteiras
    const cols = paged.pages![1].cols;
    let row = 0;
    for (const name of ANIMATION_NAMES.slice(1)) {
      expect(paged.animations[name].row).toBe(row);
      row += Math.ceil(spec.animations[name].frames / cols);
    }
    expect(pages[1].height).toBe(row * 150);
    // gasta menos que a folha de uma linha por animação
    expect(pages.reduce((s, p) => s + p.width * p.height, 0)).toBeLessThan(sheet.width * sheet.height);
  });

  test('só muda quadros inteiros de lugar: cada quadro sai igual, onde `cellOf` diz', () => {
    const { sheet, atlas } = sheetOf(spec, 30, 60);
    const { pages, atlas: paged } = paginate(sheet, atlas, 400);
    expect(pages.length).toBeGreaterThan(2); // não coube numa página de 200
    ANIMATION_NAMES.forEach((name, row) => {
      for (let i = 0; i < spec.animations[name].frames; i++) {
        const c = cellOf(paged, name, i);
        expect(getPixel(pages[c.page], c.x, c.y)).toEqual(colorOf(row, i));
        expect(getPixel(pages[c.page], c.x + 29, c.y + 59)).toEqual(colorOf(row, i));
      }
    });
    for (const p of pages) expect(Math.max(p.width, p.height)).toBeLessThanOrEqual(400);
    // e nenhum pixel a mais: tudo o que é opaco nas páginas é um quadro
    const opaque = (img: Image) => { let n = 0; for (let k = 3; k < img.data.length; k += 4) n += img.data[k] ? 1 : 0; return n; };
    expect(pages.reduce((s, p) => s + opaque(p), 0)).toBe(opaque(sheet));
  });

  test('um parado que não cabe numa linha, ou uma animação que não cabe numa página, é erro', () => {
    const { sheet, atlas } = sheetOf(spec, 30, 20);
    expect(() => paginate(sheet, atlas, 300)).toThrow(/parado.*12 quadros/);
    expect(() => paginate(sheet, atlas, 100)).toThrow(/parado/);
    const tall = sheetOf(spec, 30, 250);
    expect(() => paginate(tall.sheet, tall.atlas, 400)).toThrow(/shove.*não cabe/);
  });
});

describe('os personagens', () => {
  const list = characters();

  test('o herói, o esqueleto e os de sete folhas na ordem do registro, cada um com a sua folha e o seu atlas', () => {
    expect(list).toHaveLength(CHARACTERS);
    expect(list.map((c) => c.model)).toEqual(['hero', 'skeleton', ...PACKS.map((p) => p.model)]);
    // o pixel art pequeno em PNG; a arte grande dos de sete folhas em WebP sem perda
    // em duas páginas: o parado e o resto, com nomes que nenhuma troca antiga do `/sistema` usa
    expect(list.map((c) => c.sheets)).toEqual(list.map((c, n) => ['idle', 'moves'].map((p) => `/sprites/char-${n}-${p}.${n < 2 ? 'png' : 'webp'}`)));
    expect(characters(() => 3)[5].sheets.at(-1)).toBe('/sprites/char-5-moves-2.webp');
    for (const c of list) expect(c.atlas).toBe(c.model);
  });

  test('cores de interface e modelos únicos, em #rrggbb', () => {
    expect(new Set(list.map((c) => c.color)).size).toBe(list.length);
    expect(new Set(list.map((c) => c.model)).size).toBe(list.length);
    for (const c of list) expect(c.color).toMatch(/^#[0-9a-f]{6}$/);
    expect(list.slice(0, 2).map((c) => c.name)).toEqual(['loiro', 'vermelho']);
    // e um modelo é um nome simples: vira chave de JSON e aparece em mensagens
    for (const p of PACKS) expect(p.model).toMatch(/^[a-z]+$/);
  });
});
