/**
 * A receita do personagem (ADR 0007): das folhas do pacote da Ozzbit Games, oito personagens iguais menos a cor do
 * cabelo, numa folha por personagem com uma linha por animação, e um atlas (`hero.json`) que vale para os oito.
 * O empurrão é o golpe do pacote (combo_1 + combo_1_end) sem a espada: as cores da lâmina e do cabo são só dela e
 * saem por cor; o rastro branco do golpe sai por ser um pedaço quase todo branco solto do corpo.
 */
import {
  blank, blit, bounds, components, crop, dropComponents, eraseColors, palette, solidify, swapColors, trimThinAhead, type Hex, type Image,
} from './image';

/** Lado da célula das folhas do pacote. */
export const CELL = 128;

/** As animações do jogo, na ordem das linhas da folha; cada uma vem de uma ou mais folhas do pacote, em sequência. */
export const ANIMATIONS = [
  { name: 'idle', from: ['idle'], fps: 10, loop: true },
  { name: 'walk', from: ['walk'], fps: 12, loop: true },
  { name: 'run', from: ['run'], fps: 14, loop: true },
  { name: 'jump', from: ['jump'], fps: 12, loop: false },
  { name: 'fall', from: ['fall'], fps: 12, loop: false },
  { name: 'fall_loop', from: ['fall_loop'], fps: 10, loop: true },
  { name: 'shove', from: ['combo_1', 'combo_1_end'], fps: 16, loop: false },
] as const;

export type AnimationName = (typeof ANIMATIONS)[number]['name'];

/** O cabelo castanho do pacote, do escuro ao claro: sombra, base, brilho. */
export const HAIR: readonly [Hex, Hex, Hex] = ['4c2641', '7d5556', '9f95ab'];

/** As oito cores de cabelo (sombra, base, brilho); a 0 é a original. A base é a cor do personagem na interface. */
export const HAIRS: readonly { name: string; ramp: readonly [Hex, Hex, Hex] }[] = [
  { name: 'castanho', ramp: HAIR },
  { name: 'preto', ramp: ['141220', '2c2838', '5d5873'] },
  { name: 'loiro', ramp: ['8a5a1e', 'd9a441', 'f7e39a'] },
  { name: 'ruivo', ramp: ['6b1f14', 'b9452a', 'ef9264'] },
  { name: 'azul', ramp: ['1b2a6b', '3a5fd0', '9bb7ff'] },
  { name: 'verde', ramp: ['1d4a2b', '3f944f', 'a0dc8e'] },
  { name: 'prata', ramp: ['5f6172', 'aeb2c4', 'f2f3f8'] },
  { name: 'lilás', ramp: ['46297a', '8a5cd6', 'cdb6ff'] },
];

/** Cores que só a espada (lâmina azul, cabo laranja e dourado) usa no pacote. */
export const SWORD: readonly Hex[] = ['5f66be', 'a1c9eb', '231787', '58c2ff', '2a53b0', 'd67523', '903317', 'ffe845'];

/**
 * Uma mancha branca maior que isto é a lâmina ou o rastro do golpe: o branco da camisa vem em manchas pequenas,
 * separadas pelas dobras e pelo contorno.
 */
export const SHIRT_WHITE_MAX = 24;

/** Um pedaço solto que é mais da metade branco é sobra do golpe, não o corpo. */
export function isSlash(colors: readonly Hex[]): boolean {
  return colors.filter((c) => c === 'ffffff').length / colors.length > 0.5;
}

/**
 * Tira a espada e o rastro de um quadro do golpe: apaga as cores só da espada, depois as manchas brancas grandes demais
 * para serem camisa, depois o contorno fino da lâmina à frente do corpo (`SWORD_REACH`), e por fim os pedaços soltos
 * que sobraram (faíscas, pontas).
 */
export function withoutSword(frame: Image): Image {
  const noSword = eraseColors(frame, SWORD);
  const noBlade = dropComponents(noSword, (_, size) => size > SHIRT_WHITE_MAX, ['ffffff']);
  const noEdge = trimThinAhead(noBlade, SWORD_REACH);
  const biggest = Math.max(...components(noEdge).map((c) => c.length));
  return dropComponents(noEdge, (colors, size) => isSlash(colors) || size < biggest / 10);
}

/** Até onde, em pixels, o contorno conta como corpo a partir do miolo (a mão e o punho ficam; a lâmina não). */
export const SWORD_REACH = 2;

/** O cabelo castanho trocado por outra rampa. */
export function recolorHair(frame: Image, ramp: readonly [Hex, Hex, Hex]): Image {
  return swapColors(frame, { [HAIR[0]]: ramp[0], [HAIR[1]]: ramp[1], [HAIR[2]]: ramp[2] });
}

/** As células de uma folha do pacote (uma linha de `CELL × CELL`). */
export function cells(sheet: Image): Image[] {
  return Array.from({ length: Math.floor(sheet.width / CELL) }, (_, i) => crop(sheet, i * CELL, 0, CELL, CELL));
}

export interface Atlas {
  /** tamanho de cada quadro na folha */
  frame: { w: number; h: number };
  /** o ponto do quadro que fica no chão, entre os pés (o personagem é desenhado a partir dele) */
  anchor: { x: number; y: number };
  /** uma linha da folha por animação */
  animations: Record<AnimationName, { row: number; frames: number; fps: number; loop: boolean }>;
  /** um quadrado em volta da cabeça no primeiro quadro do parado: o rosto do personagem na interface */
  head: { x: number; y: number; size: number };
  /** as cores de cabelo, na ordem das folhas `hero-N.png` */
  hairs: { name: string; color: string }[];
  credit: string;
}

/**
 * Monta as folhas a partir das folhas do pacote (`sheets[nome]`). Todos os quadros são recortados pelo mesmo retângulo,
 * o menor que contém todos depois de tirar a espada, então o personagem não pula entre animações. Devolve uma folha por
 * cor de cabelo e o atlas.
 */
export function buildHero(sheets: Readonly<Record<string, Image>>): { sheets: Image[]; atlas: Atlas } {
  const rows = ANIMATIONS.map((a) => a.from.flatMap((name) => {
    const sheet = sheets[name];
    if (!sheet) throw new Error(`folha do pacote faltando: ${name}`);
    return cells(sheet).map((c) => solidify(a.name === 'shove' ? withoutSword(c) : c));
  }));

  // o retângulo comum a todos os quadros
  let minX = CELL, minY = CELL, maxX = 0, maxY = 0;
  for (const f of rows.flat()) {
    const b = bounds(f);
    if (!b) continue;
    minX = Math.min(minX, b.x); minY = Math.min(minY, b.y); maxX = Math.max(maxX, b.x + b.w); maxY = Math.max(maxY, b.y + b.h);
  }
  const w = maxX - minX, h = maxY - minY;
  // os pés: o meio do parado, na linha de baixo
  const idle = bounds(rows[0][0])!;
  const anchor = { x: Math.round(idle.x + idle.w / 2) - minX, y: h };

  const cols = Math.max(...rows.map((r) => r.length));
  const base = blank(cols * w, rows.length * h);
  rows.forEach((frames, row) => frames.forEach((f, col) => blit(base, crop(f, minX, minY, w, h), col * w, row * h)));

  // a cabeça: o cabelo no primeiro quadro do parado, esticado para baixo até pegar o rosto, num quadrado
  const hairOnly = eraseColors(crop(rows[0][0], minX, minY, w, h), [...palette(rows[0][0])].filter((c) => !HAIR.includes(c)));
  const hb = bounds(hairOnly)!;
  const size = Math.max(hb.w, hb.h + 6) + 2;
  const head = { x: Math.max(0, Math.round(hb.x + hb.w / 2 - size / 2)), y: Math.max(0, hb.y - 1), size };

  const atlas: Atlas = {
    frame: { w, h },
    anchor,
    head,
    animations: Object.fromEntries(ANIMATIONS.map((a, row) => [a.name, { row, frames: rows[row].length, fps: a.fps, loop: a.loop }])) as Atlas['animations'],
    hairs: HAIRS.map((hair) => ({ name: hair.name, color: `#${hair.ramp[1]}` })),
    credit: 'Ozzbit Games',
  };
  return { sheets: HAIRS.map((hair) => recolorHair(base, hair.ramp)), atlas };
}
