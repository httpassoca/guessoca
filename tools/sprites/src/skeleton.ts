/**
 * A receita do esqueleto (ADR 0007, emenda): o cavaleiro esqueleto desenhado pelo dono do jogo, em `assets-src/skeleton/`
 * (fora do git como o pacote do herói). Quatro personagens iguais menos a cor da capa, numa folha por personagem com as
 * mesmas linhas do herói, e um atlas (`skeleton.json`) que vale para os quatro.
 *
 * A arte tem parado, andar e golpes, mas não tem correr, pular nem cair: esses são desenhados aqui, a partir dos quadros
 * que existem (inclinar, achatar, esticar, recortar a capa de um golpe e girá-la). O empurrão é o golpe para a frente
 * sem o rastro branco; a espada fica em todas as animações.
 */
import { ANIMATION_NAMES, layout, type Atlas, type ModelSpec } from './atlas';
import {
  bounds, crop, dropComponents, getPixel, hexOf, keepColors, rgbOf, rotate90, setPixel, shear, solidify, squashRows, stretchRows, swapColors, translate, under,
  type Hex, type Image,
} from './image';
import { isSlash } from './hero';

/** Cada folha é uma linha de células deste tamanho. */
export const CELL_W = 170;
export const CELL_H = 125;

/** As folhas da arte que a receita usa (`NOME.png`). */
export const SHEETS = ['IDLE', 'WALK', 'FWD_SWING', 'DOWN_SWING'] as const;
export type SheetName = (typeof SHEETS)[number];

/** A linha dos pés no parado (a de baixo de tudo), na célula. */
export const FEET_Y = 80;

/**
 * A capa vermelha, do escuro ao claro. Achada como o cabelo do herói: na paleta inteira da arte só há três vermelhos, e
 * estes dois são os que cobrem a capa (1244 e 236 pixels no parado); o terceiro é o olho.
 */
export const CAPE: readonly [Hex, Hex] = ['771818', '982b2b'];
/** O vermelho dos olhos: não é capa e não muda. */
export const EYE: Hex = 'fe0707';

/** As quatro capas (sombra, base) dos personagens 4–7; a 0 é a original. A base é a cor do personagem na interface. */
export const CAPES: readonly { name: string; ramp: readonly [Hex, Hex] }[] = [
  { name: 'vermelho', ramp: CAPE },
  { name: 'azul', ramp: ['1c2c6e', '2f50ad'] },
  { name: 'verde', ramp: ['1c4f26', '2e7d3b'] },
  { name: 'roxo', ramp: ['45196b', '6c2fa3'] },
];

/** A capa vermelha trocada por outra rampa; o resto (olhos, ossos, espada) fica. */
export function recolorCape(frame: Image, ramp: readonly [Hex, Hex]): Image {
  return swapColors(frame, { [CAPE[0]]: ramp[0], [CAPE[1]]: ramp[1] });
}

/**
 * Uma mancha branca maior que isto é rastro de golpe: o maior osso branco (o crânio com o braço erguido) tem 55 pixels;
 * o menor rastro tem 180.
 */
export const SLASH_MIN = 100;
/** Um pedaço solto, quase todo branco e deste tamanho para cima, é a ponta do rastro (a flecha do golpe para a frente). */
export const SLASH_TIP_MIN = 40;

/**
 * Tira o rastro branco de um quadro de golpe: as manchas brancas grandes demais para serem osso, e os pedaços soltos
 * quase todos brancos e grandes demais para serem um osso solto. Os ossos são brancos também, mas finos e pequenos.
 */
export function withoutSlash(frame: Image): Image {
  const noTrail = dropComponents(frame, (_, size) => size > SLASH_MIN, ['ffffff']);
  return dropComponents(noTrail, (colors, size) => size >= SLASH_TIP_MIN && isSlash(colors));
}

/** As células de uma folha. */
export function cellsOf(sheet: Image): Image[] {
  return Array.from({ length: Math.floor(sheet.width / CELL_W) }, (_, i) => solidify(crop(sheet, i * CELL_W, 0, CELL_W, CELL_H)));
}

/** As células de cada folha usada, ou erro dizendo qual falta. */
export function skeletonCells(sheets: Readonly<Record<string, Image>>): Record<SheetName, Image[]> {
  return Object.fromEntries(SHEETS.map((name) => {
    const sheet = sheets[name];
    if (!sheet) throw new Error(`folha do esqueleto faltando: ${name}`);
    return [name, cellsOf(sheet)];
  })) as Record<SheetName, Image[]>;
}

export const SKELETON_SPEC: ModelSpec = {
  animations: {
    idle: { frames: 11, fps: 10, loop: true },
    walk: { frames: 9, fps: 12, loop: true },
    run: { frames: 9, fps: 18, loop: true },
    jump: { frames: 4, fps: 12, loop: false },
    fall: { frames: 2, fps: 10, loop: false },
    fall_loop: { frames: 3, fps: 10, loop: true },
    shove: { frames: 5, fps: 12, loop: false },
  },
  credit: null,
};

/** Os quadros do golpe para a frente que viram o empurrão: preparar, estocar, braço esticado, e voltar. */
export const SHOVE_FRAMES = [0, 1, 2, 3, 5];

// --- as receitas dos quadros que a arte não tem ---------------------------------------------------------------------

/** Quantos pixels o topo do corpo vai para a frente na corrida. */
export const RUN_LEAN = 4;

/**
 * A capa arrastando para trás (à esquerda) no vento: em cada linha de `fromY` a `toY`, a ponta de trás da capa (o pixel
 * de capa mais à esquerda, antes de `SPINE_X`) estica `length(y)` pixels na cor escura da capa. Passa por trás do que já
 * está desenhado (a espada fica na frente).
 */
function capeTrail(img: Image, fromY: number, toY: number, length: (y: number) => number): Image {
  const out: Image = { ...img, data: img.data.slice() };
  const dark = [...rgbOf(CAPE[0]), 255];
  for (let y = fromY; y <= toY; y++) {
    let edge = -1;
    for (let x = 0; x < SPINE_X; x++) {
      const p = getPixel(img, x, y);
      if (p[3] && CAPE.includes(hexOf(p[0], p[1], p[2]))) { edge = x; break; }
    }
    if (edge < 0) continue;
    for (let x = edge - 1; x >= edge - length(y) && x >= 0; x--) if (!getPixel(out, x, y)[3]) setPixel(out, x, y, dark);
  }
  return out;
}

/** O meio do corpo (a coluna do crânio), à frente do qual a capa não arrasta. */
const SPINE_X = 56;

/** Correr: o andar inclinado para a frente, com a capa arrastando atrás em pontas que tremulam a cada passo. */
export function run(walk: readonly Image[]): Image[] {
  return walk.map((f, i) => {
    const lean = shear(f, RUN_LEAN / (FEET_Y - 32), FEET_Y);
    return capeTrail(lean, 50, 68, (y) => {
      const flow = Math.round(((y - 50) / 18) * 5);
      return Math.max(0, flow - ((y + i) % 3 === 0 ? 2 : 0));
    });
  });
}

/** A capa arrastando para baixo: cada pixel de capa com o vazio embaixo desce até `n` pixels (subindo, o vento puxa). */
function capeDown(img: Image, n: number): Image {
  const out: Image = { ...img, data: img.data.slice() };
  for (let x = 0; x < img.width; x++) for (let y = img.height - 2; y >= 0; y--) {
    const p = getPixel(img, x, y);
    if (!p[3] || !CAPE.includes(hexOf(p[0], p[1], p[2])) || getPixel(img, x, y + 1)[3]) continue;
    const len = n - ((x % 3) === 1 ? 1 : 0);
    for (let k = 1; k <= len && y + k < img.height; k++) if (!getPixel(out, x, y + k)[3]) setPixel(out, x, y + k, p);
  }
  return out;
}

/** Os pés sobem `count` pixels: as linhas da canela a partir de `from` somem e o que está embaixo sobe. */
function tuck(img: Image, from: number, count: number): Image {
  return translate(squashRows(img, from, count), 0, -count);
}

/**
 * Pular: agachado (o parado com a canela mais curta), a saída (o golpe de cima, que ergue a espada e um joelho, com as
 * pernas esticadas), subindo com a capa arrastando para baixo, e com a perna da frente encolhida.
 */
export function jump(idle: Image, down: readonly Image[]): Image[] {
  const crouch = squashRows(idle, 70, 3);
  const takeoff = stretchRows(down[1], 74, 2);
  const rising = capeDown(down[2], 2);
  const tucked = tuck(rising, 68, 6);
  return [crouch, takeoff, rising, tucked];
}

/** Onde a capa erguida (a do golpe para a frente, girada) prende nas costas: o canto de cima à esquerda, na célula. */
export const FLARE_AT = { x: 33, y: 28 };

/**
 * A capa que voa para cima na queda: a capa esvoaçando para trás do golpe para a frente (`fwd`), recortada e girada 90°
 * para apontar para cima.
 */
function flare(fwd: Image): Image {
  return rotate90(keepColors(crop(fwd, 54, 40, 26, 22), CAPE));
}

/** Da linha em que a capa deixa de cobrir o corpo para baixo, as pontas que pendem. */
const HANGING_Y = 58;

/** O corpo da queda: o pulo encolhido, sem as pontas da capa que pendiam (o vento as leva para cima). */
function fallBody(down: Image, dy = 0): Image {
  const body = tuck(down, 68, 6);
  const out: Image = { ...body, data: body.data.slice() };
  for (let y = HANGING_Y; y < CELL_H; y++) for (let x = 0; x < CELL_W; x++) {
    const p = getPixel(body, x, y);
    if (p[3] && CAPE.includes(hexOf(p[0], p[1], p[2]))) out.data[(y * CELL_W + x) * 4 + 3] = 0;
  }
  return translate(out, 0, dy);
}

/** A queda e o seu loop: a capa sobe atrás das costas e ondula; a espada segue erguida. */
export function fall(down: readonly Image[], fwd: readonly Image[]): { fall: Image[]; loop: Image[] } {
  /** a capa por trás do corpo, `dy` mais baixa (no começo da queda ela ainda não subiu toda) */
  const withFlare = (body: Image, cape: Image, dx = 0, dy = 0) => {
    const out = { ...body, data: body.data.slice() };
    under(out, cape, FLARE_AT.x + dx, FLARE_AT.y + dy);
    return out;
  };
  const body = fallBody(down[2]);
  const bodyUp = fallBody(down[2], -1);
  return {
    fall: [withFlare(body, flare(fwd[1]), 1, 7), withFlare(body, flare(fwd[1]))],
    loop: [withFlare(body, flare(fwd[1])), withFlare(bodyUp, flare(fwd[2]), 0, -1), withFlare(body, flare(fwd[2]), 1, 1)],
  };
}

/** O empurrão: o golpe para a frente sem o rastro, com o pé de trás no lugar do pé do parado (o passo fica). */
export function shove(fwd: readonly Image[], idle: Image): Image[] {
  const heel = (img: Image) => {
    for (let x = 0; x < img.width; x++) if (getPixel(img, x, FEET_Y)[3]) return x;
    return 0;
  };
  const dx = heel(idle) - heel(fwd[0]);
  return SHOVE_FRAMES.map((i) => translate(withoutSlash(fwd[i]), dx, 0));
}

/** Todas as linhas da folha, na ordem do jogo, ainda na coordenada da célula. */
export function derive(cells: Record<SheetName, Image[]>): Image[][] {
  const idle = cells.IDLE, down = cells.DOWN_SWING, fwd = cells.FWD_SWING;
  const falling = fall(down, fwd);
  const rows: Record<(typeof ANIMATION_NAMES)[number], Image[]> = {
    idle,
    walk: cells.WALK,
    run: run(cells.WALK),
    jump: jump(idle[0], down),
    fall: falling.fall,
    fall_loop: falling.loop,
    shove: shove(fwd, idle[0]),
  };
  return ANIMATION_NAMES.map((name) => rows[name]);
}

/** A cabeça: o crânio branco em volta dos olhos, no primeiro quadro do parado, num quadrado. */
export function skeletonHead(idle: Image): Atlas['head'] {
  const eyes = bounds(keepColors(idle, [EYE]))!;
  // o crânio olha para a direita: dos olhos para trás uns 7 pixels, sem pegar o ombro (que também é branco)
  const from = { x: eyes.x - 7, y: eyes.y - 6 };
  const skull = bounds(crop(keepColors(idle, ['ffffff', 'c1bbbb', EYE]), from.x, from.y, eyes.w + 10, 10))!;
  const cx = from.x + skull.x + skull.w / 2, cy = from.y + skull.y + skull.h / 2;
  const size = Math.max(skull.w, skull.h) + 4;
  return {
    x: Math.max(0, Math.min(idle.width - size, Math.round(cx - size / 2))),
    y: Math.max(0, Math.min(idle.height - size, Math.round(cy - size / 2))),
    size,
  };
}

/** O pé no parado: o meio da linha de baixo. */
function feetX(idle: Image): number {
  let min = Infinity, max = -1;
  for (let x = 0; x < idle.width; x++) if (getPixel(idle, x, FEET_Y)[3]) { min = Math.min(min, x); max = Math.max(max, x); }
  return (min + max + 1) / 2;
}

/** Monta as quatro folhas (uma por capa) e o atlas a partir das folhas da arte (`sheets[NOME]`). */
export function buildSkeleton(sheets: Readonly<Record<string, Image>>): { sheets: Image[]; atlas: Atlas } {
  const cells = skeletonCells(sheets);
  const rows = derive(cells);
  const { sheet, atlas } = layout(rows, SKELETON_SPEC, { anchorX: feetX(cells.IDLE[0]), head: skeletonHead });
  return { sheets: CAPES.map((cape) => recolorCape(sheet, cape.ramp)), atlas };
}
