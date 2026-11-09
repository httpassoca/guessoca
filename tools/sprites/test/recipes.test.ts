import { describe, expect, test } from 'bun:test';
import { BALLOON_MIN_W, EMOTE_COLORS, EMOTES, emote, emoteSheet, inkAt, text } from '../src/emotes';
import { ANIMATIONS, CELL, HAIR, HAIRS, SHIRT_WHITE_MAX, SWORD, buildHero, isSlash, recolorHair, withoutSword } from '../src/hero';
import { blank, palette, rgbOf, setPixel, type Image } from '../src/image';

/** Um bloco sólido de uma cor em `img`. */
function fill(img: Image, x: number, y: number, w: number, h: number, hex: string) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) setPixel(img, x + i, y + j, [...rgbOf(hex), 255]);
}

/** Um corpo de mentira: um bloco de pele com cabelo em cima. */
function body(img = blank(CELL, CELL), x0 = 0) {
  fill(img, x0 + 50, 50, 12, 28, 'd2947f');
  fill(img, x0 + 50, 44, 12, 6, HAIR[1]);
  setPixel(img, x0 + 51, 45, [...rgbOf(HAIR[0]), 255]);
  setPixel(img, x0 + 52, 45, [...rgbOf(HAIR[2]), 255]);
  return img;
}

describe('o golpe sem a espada', () => {
  test('as cores da espada somem', () => {
    const f = body();
    fill(f, 62, 60, 20, 2, SWORD[0]);
    expect([...palette(withoutSword(f))].some((c) => SWORD.includes(c))).toBe(false);
  });

  test('a mancha branca grande (o rastro) some; a pequena (a camisa) fica', () => {
    const f = body();
    fill(f, 53, 60, 3, 3, 'ffffff'); // camisa: 9 pixels, dentro do corpo
    fill(f, 70, 40, 8, 8, 'ffffff'); // rastro: 64 pixels, solto
    const out = withoutSword(f);
    let white = 0;
    for (let i = 0; i < out.data.length; i += 4) if (out.data[i + 3] && out.data[i] === 255 && out.data[i + 1] === 255 && out.data[i + 2] === 255) white++;
    expect(white).toBe(9);
    expect(SHIRT_WHITE_MAX).toBeGreaterThan(9);
  });

  test('o contorno fino da lâmina à frente do corpo some; o corpo fica inteiro', () => {
    const f = body();
    fill(f, 62, 66, 24, 1, '000000'); // a lâmina: um traço de 1 pixel saindo da mão
    const out = withoutSword(f);
    const blackAt = (x: number) => out.data[(66 * CELL + x) * 4 + 3] !== 0;
    expect(blackAt(62)).toBe(true); // colado na mão (até SWORD_REACH): conta como corpo
    for (let x = 65; x < 86; x++) expect(blackAt(x)).toBe(false);
    expect(palette(out).has('d2947f')).toBe(true);
  });

  test('pedaço quase todo branco é rastro', () => {
    expect(isSlash(['ffffff', 'ffffff', '000000'])).toBe(true);
    expect(isSlash(['ffffff', 'd2947f', '000000'])).toBe(false);
  });
});

describe('cabelo', () => {
  test('a rampa castanha vira a rampa pedida, e nada mais muda', () => {
    const out = recolorHair(body(), HAIRS[3].ramp);
    const pal = palette(out);
    for (const c of HAIR) expect(pal.has(c)).toBe(false);
    for (const c of HAIRS[3].ramp) expect(pal.has(c)).toBe(true);
    expect(pal.has('d2947f')).toBe(true);
  });

  test('quatro cabelos, todos diferentes, o primeiro é o original', () => {
    expect(HAIRS.map((h) => h.name)).toEqual(['castanho', 'preto', 'loiro', 'ruivo']);
    expect(HAIRS[0].ramp).toEqual(HAIR);
    expect(new Set(HAIRS.map((h) => h.ramp[1])).size).toBe(4);
  });
});

describe('folhas do herói', () => {
  const counts: Record<string, number> = { idle: 10, walk: 10, run: 10, jump: 6, fall: 4, fall_loop: 3, combo_1: 3, combo_1_end: 4 };
  const sheets = Object.fromEntries(Object.entries(counts).map(([name, n]) => {
    const s = blank(n * CELL, CELL);
    for (let i = 0; i < n; i++) body(s, i * CELL);
    return [name, s];
  }));
  const { sheets: out, atlas } = buildHero(sheets);

  test('uma linha por animação; o empurrão junta o golpe e o fim do golpe', () => {
    expect(Object.keys(atlas.animations)).toEqual(ANIMATIONS.map((a) => a.name));
    expect(atlas.animations.shove.frames).toBe(7);
    expect(atlas.animations.fall.frames).toBe(4);
    expect(atlas.animations.idle.row).toBe(0);
  });

  test('uma folha por cabelo, do mesmo tamanho, recortadas pelo menor retângulo comum', () => {
    expect(out).toHaveLength(HAIRS.length);
    expect(atlas.frame).toEqual({ w: 12, h: 34 });
    for (const s of out) expect([s.width, s.height]).toEqual([10 * 12, ANIMATIONS.length * 34]);
  });

  test('a âncora fica entre os pés, na linha de baixo do quadro', () => {
    expect(atlas.anchor).toEqual({ x: 6, y: 34 });
  });

  test('a cabeça é um quadrado dentro do quadro, pegando o cabelo', () => {
    const { x, y, size } = atlas.head;
    expect(x).toBeGreaterThanOrEqual(0);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(x + size).toBeLessThanOrEqual(atlas.frame.w + 2);
    expect(y).toBeLessThanOrEqual(1); // o cabelo é o topo do corpo de mentira
  });

  test('o atlas leva o crédito do pacote', () => {
    expect(atlas.credit).toBe('Ozzbit Games');
  });

  test('falta uma folha do pacote: erro dizendo qual', () => {
    const { run: _, ...rest } = sheets;
    expect(() => buildHero(rest)).toThrow(/run/);
  });
});

describe('emotes', () => {
  test('a fonte tem 3×5 e 1 pixel entre letras', () => {
    expect([text('haha').width, text('haha').height]).toEqual([15, 5]);
    expect(() => text('z')).toThrow(/z/);
  });

  test('todo balão tem a largura mínima, contorno e rabicho de tinta embaixo, no meio', () => {
    for (const name of EMOTES) {
      const img = emote(name, 'pt-BR');
      expect(img.width).toBeGreaterThanOrEqual(BALLOON_MIN_W);
      expect(inkAt(img, Math.floor(img.width / 2), img.height - 1)).toBe(EMOTE_COLORS.INK);
      expect(inkAt(img, 1, 0)).toBe(EMOTE_COLORS.INK);
      expect(inkAt(img, 0, 0)).toBeNull(); // canto cortado
    }
  });

  test('o "!" é vermelho; o resto é tinta', () => {
    expect(palette(emote('exclaim', 'pt-BR')).has(EMOTE_COLORS.ALERT)).toBe(true);
    expect(palette(emote('question', 'pt-BR')).has(EMOTE_COLORS.ALERT)).toBe(false);
  });

  test('só o "eu?" muda com a língua', () => {
    const same = (a: Image, b: Image) => a.width === b.width && a.data.every((v, i) => v === b.data[i]);
    for (const name of ['question', 'exclaim', 'haha'] as const) expect(same(emote(name, 'pt-BR'), emote(name, 'en-US'))).toBe(true);
    expect(same(emote('me', 'pt-BR'), emote('me', 'en-US'))).toBe(false);
  });

  test('a folha põe os quatro lado a lado, na ordem das teclas', () => {
    const { sheet, atlas } = emoteSheet('en-US');
    const xs = EMOTES.map((n) => atlas.frames[n].x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    const last = atlas.frames.me;
    expect(last.x + last.w).toBe(sheet.width);
    expect(last.tip).toEqual({ x: Math.floor(last.w / 2), y: last.h - 1 });
  });
});
