/**
 * Os balões dos emotes (teclas 1–4): `?`, `!`, `haha` e "eu?" (apontando para si). Desenhados aqui, de grades de texto:
 * uma fonte de 3×5 pixels e um balão com contorno e rabicho montado em código. O balão que tem palavra sai uma vez por
 * língua ("eu?" / "me?", ADR 0004); a folha de cada língua tem os quatro, na ordem das teclas.
 */
import { parseGrid } from './grid';
import { blank, blit, getPixel, setPixel, type Image } from './image';

const INK = '1a1426';
const PAPER = 'ffffff';
const ALERT = 'e0304a';

/** A fonte: 3 de largura, 5 de altura (o `!` e o `?` cabem nisso). */
const FONT: Record<string, string> = {
  '?': `
    ###
    ..#
    .##
    ...
    .#.`,
  '!': `
    .#.
    .#.
    .#.
    ...
    .#.`,
  h: `
    #..
    #..
    ###
    #.#
    #.#`,
  a: `
    ...
    ##.
    .##
    #.#
    ###`,
  e: `
    ...
    ###
    #.#
    ##.
    ###`,
  u: `
    ...
    #.#
    #.#
    #.#
    ###`,
  m: `
    ...
    ###
    ###
    #.#
    #.#`,
};

/** Um texto na fonte de 3×5, com 1 pixel entre letras. */
export function text(s: string, color = INK): Image {
  const glyphs = [...s].map((ch) => {
    const grid = FONT[ch];
    if (!grid) throw new Error(`letra fora da fonte: ${ch}`);
    return parseGrid(grid, { '#': color });
  });
  const img = blank(glyphs.length * 4 - 1, 5);
  glyphs.forEach((g, i) => blit(img, g, i * 4, 0));
  return img;
}

/**
 * Um balão em volta de `content`: papel branco com pelo menos 2 pixels de folga, contorno escuro com os cantos cortados,
 * e um rabicho embaixo, no meio, apontando para a cabeça. Nunca mais estreito que `BALLOON_MIN_W`, para o rabicho não
 * engolir a borda de baixo.
 */
export const BALLOON_MIN_W = 13;
export function balloon(content: Image): Image {
  const pad = 2;
  const padX = Math.max(pad, Math.ceil((BALLOON_MIN_W - 2 - content.width) / 2));
  const bw = content.width + padX * 2 + 2, bh = content.height + pad * 2 + 2;
  const tail = 2;
  const img = blank(bw, bh + tail);
  const ink = [0x1a, 0x14, 0x26, 255], paper = [255, 255, 255, 255];
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    const edgeX = x === 0 || x === bw - 1, edgeY = y === 0 || y === bh - 1;
    if (edgeX && edgeY) continue; // canto cortado
    setPixel(img, x, y, edgeX || edgeY ? ink : paper);
  }
  // rabicho: um triângulo de papel com contorno, abrindo a borda de baixo
  const cx = Math.floor(bw / 2);
  for (let t = 0; t < tail; t++) {
    const half = tail - 1 - t;
    for (let x = cx - half - 1; x <= cx + half + 1; x++) {
      const border = x === cx - half - 1 || x === cx + half + 1;
      if (t === tail - 1 && !border) continue;
      setPixel(img, x, bh - 1 + t, border ? ink : paper);
    }
  }
  setPixel(img, cx, bh - 1 + tail, ink);
  blit(img, content, padX + 1, pad + 1);
  return img;
}

/** Os quatro emotes, na ordem das teclas 1–4. */
export const EMOTES = ['question', 'exclaim', 'haha', 'me'] as const;
export type EmoteName = (typeof EMOTES)[number];
export type EmoteLang = 'pt-BR' | 'en-US';

const words: Record<EmoteLang, string> = { 'pt-BR': 'eu?', 'en-US': 'me?' };

export function emote(name: EmoteName, lang: EmoteLang): Image {
  switch (name) {
    case 'question': return balloon(text('?'));
    case 'exclaim': return balloon(text('!', ALERT));
    case 'haha': return balloon(text('haha'));
    case 'me': return balloon(text(words[lang]));
  }
}

export interface EmoteAtlas {
  /** cada balão na folha: posição, tamanho e o ponto da ponta do rabicho */
  frames: Record<EmoteName, { x: number; y: number; w: number; h: number; tip: { x: number; y: number } }>;
}

/** A folha de uma língua (os quatro lado a lado, 1 pixel entre eles) e onde cada um está. */
export function emoteSheet(lang: EmoteLang): { sheet: Image; atlas: EmoteAtlas } {
  const imgs = EMOTES.map((n) => emote(n, lang));
  const sheet = blank(imgs.reduce((s, i) => s + i.width + 1, -1), Math.max(...imgs.map((i) => i.height)));
  const frames = {} as EmoteAtlas['frames'];
  let x = 0;
  imgs.forEach((img, i) => {
    blit(sheet, img, x, 0);
    frames[EMOTES[i]] = { x, y: 0, w: img.width, h: img.height, tip: { x: Math.floor(img.width / 2), y: img.height - 1 } };
    x += img.width + 1;
  });
  return { sheet, atlas: { frames } };
}

/** Só para teste: a cor de um pixel como hex, ou null se transparente. */
export function inkAt(img: Image, x: number, y: number): string | null {
  const [r, g, b, a] = getPixel(img, x, y);
  return a ? [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('') : null;
}

export const EMOTE_COLORS = { INK, PAPER, ALERT };
