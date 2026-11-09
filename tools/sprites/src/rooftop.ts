/**
 * O telhado neon-noir (issue #6, ADR 0007): cada objeto é uma grade de texto com a paleta abaixo, como os balões dos
 * emotes. Onde há repetição (o tijolo de uma fachada, as janelas, as lâminas de um ar-condicionado) uma prancheta
 * (`Sketch`) carimba grades menores; o resultado é sempre uma grade de texto, lida por `parseGrid`.
 *
 * O que sai: `rooftop.png` com todos os objetos e `rooftop.json` com onde cada um está, a âncora (o ponto do objeto que
 * vai no lugar dele no mundo) e, nas texturas que repetem, a marca `tile`. As caixas do mapa (`MAP` de `@guess/world`)
 * ganham um objeto do tamanho exato delas: a caixa é a colisão, o objeto é a cara; `fits` diz de que caixa é.
 *
 * Estilo: noite chuvosa, concreto molhado, azul e roxo fundos, neon magenta e ciano, janela amarela quente. Inspirado
 * no clima dos jogos neon-noir; nada copiado de nenhum.
 */
import { gridLines, parseGrid, type Palette } from './grid';
import { blank, blit, type Image } from './image';

/** A paleta inteira do telhado: um caractere por cor. */
export const PALETTE = {
  // concreto molhado
  k: '0c0a17', // contorno, sombra funda
  d: '1a1730', // concreto escuro, junta
  c: '29263f', // concreto
  C: '37334f', // concreto claro
  w: '4a4570', // brilho molhado
  W: '7a74b0', // reflexo
  // tijolo (prédio da esquerda)
  m: '1d1324', // argamassa
  B: '4d2440', // tijolo
  b: '3a1b33', // tijolo na sombra
  // painel (prédio do meio, o hotel)
  p: '232340',
  P: '2e2e50',
  // azulejo (prédio da direita)
  s: '182636',
  S: '22344a',
  // vidro e janelas
  g: '0f0e1f', // vidro escuro
  G: '232b52', // reflexo no vidro
  y: 'ffcf73', // janela acesa
  Y: 'fff1c2', // o mais claro da janela
  o: 'b8742f', // persiana, móveis contra a luz
  t: '4f78ff', // luz de televisão
  T: 'a8c0ff',
  // metal
  n: '34324e',
  N: '55527a',
  M: '8b88b8',
  // madeira (caixa-d'água)
  e: '3a2630',
  E: '553638',
  F: '76504a',
  // neon: tubo, brilho em volta
  x: 'ff3cc8', // magenta
  v: '6e1660',
  z: '3ef0ff', // ciano
  u: '125a74',
  R: 'ff4256', // luz de antena
  // lua
  l: 'b9b1d9',
  L: '8d84ba',
  q: '7369a2',
  // poça (o céu e o neon refletidos)
  h: '2c3566',
  H: '5b78d6',
  i: '8c3f8f',
  // neblina (desenhada com transparência no cliente)
  f: '6a5a9a',
} as const satisfies Palette;

export type Ink = keyof typeof PALETTE;

/**
 * A prancheta: uma grade de caracteres para montar um objeto. `stamp` carimba uma grade de texto por cima (o `.` deixa
 * o que está embaixo); o que cai fora é cortado. `text()` devolve a grade pronta.
 */
export class Sketch {
  private readonly cells: string[][];
  constructor(readonly w: number, readonly h: number, ch = '.') {
    this.cells = Array.from({ length: h }, () => Array<string>(w).fill(ch));
  }
  at(x: number, y: number): string | undefined { return this.cells[y]?.[x]; }
  set(x: number, y: number, ch: string) { if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.cells[y][x] = ch; }
  fill(x: number, y: number, w: number, h: number, ch: string) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, ch);
  }
  /** só a borda de um retângulo */
  frame(x: number, y: number, w: number, h: number, ch: string) {
    this.fill(x, y, w, 1, ch); this.fill(x, y + h - 1, w, 1, ch); this.fill(x, y, 1, h, ch); this.fill(x + w - 1, y, 1, h, ch);
  }
  stamp(x: number, y: number, text: string) {
    gridLines(text).forEach((line, j) => [...line].forEach((ch, i) => { if (ch !== '.' && ch !== ' ') this.set(x + i, y + j, ch); }));
  }
  /** um traço de pixel em pixel entre dois pontos (Bresenham) */
  line(x0: number, y0: number, x1: number, y1: number, ch: string) {
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, ch);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  text(): string { return this.cells.map((r) => r.join('')).join('\n'); }
}

// --- texturas que repetem ------------------------------------------------------------------------------------------------
// Toda textura que repete tem a primeira e a última coluna iguais: a emenda é uma junta (ou um pilar) de duas colunas,
// metade de cada lado, e some quando os ladrilhos se encostam.

/** Uma placa de concreto do tampo: 32 de largura, a junta nas pontas e em cima; poças rasas brilhando de molhado. */
const SLAB = `
  dddddddddddddddddddddddddddddddd
  dcccccCcccccccccccccccdccccccccd
  dccccccccccdcccccccccccccccCcccd
  dccCccccccccccccccccccccccccccccd
  dccccccccccccccCcccccdcccccccccd
  dccccccdcccccccccccccccccccccCcd
  dcccccccccccccwwwwwcccccccccccccd
  dcCccccccccccccdccccccCccccccccd
  dcccccccccccccccccccccccccccdccd
  dcccdcccccccccccccCcccccccccccccd
  dccccccccccccccccccccccwwwwccccd
  dcccccCccccccccccccdcccccccccccd
  dccccccccccccccccccccccccccccccd
  dcccdcccccccccccccccCcccccdccccd
  dcccccccwwwccccccccccccccccccccd
  dccccccccccccCccccccccccccccccccd
  dcccccccccCccccccccccccdccccccd`;

/** A grade de uma linha só, cortada ou completada com `pad` até `w` (para as placas acima não errarem a largura). */
function fit(text: string, w: number, pad = 'c', edge = 'd'): string[] {
  return gridLines(text).map((l) => {
    const inner = l.slice(1, -1).slice(0, w - 2).padEnd(w - 2, pad);
    return edge + inner + edge;
  });
}

/** O tampo do telhado: duas placas, a segunda espelhada, 34 linhas (a profundidade do telhado, 56 · 0,6, arredondada para cima). */
export function roofTop(): string {
  const slab = fit(SLAB, 32);
  slab[0] = 'd'.repeat(32);
  const mirrored = slab.map((l) => [...l].reverse().join(''));
  return [...slab, ...mirrored].join('\n');
}

/** A mureta da beirada da frente: 4 linhas acima da linha do telhado (a âncora) e a cornija na fachada, 4 abaixo. */
export const PARAPET = `
  wwwwwwwwwwwwwwww
  CCCCCCCCCCCCCCCC
  kkkkkkkkkkkkkkkk
  dcccccccdccccccd
  CCCCCCCCCCCCCCCC
  cccccccccccccccc
  dddddddddddddddd
  kkkkkkkkkkkkkkkk`;

/** A mureta do fundo, vista por dentro: 5 linhas acima da beirada de trás. */
export const LEDGE = `
  CCCCCCCCCCCCCCCC
  cccccccccccccccc
  dddddddddddddddd
  dcccccccdccccccd
  kkkkkkkkkkkkkkkk`;

/** A neblina: um pontilhado (Bayer 4×4) cada vez mais denso para baixo, 129 de largura para repetir sem emenda. */
export function fog(w = 129, h = 24): string {
  const bayer = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
  const rows: string[] = [];
  for (let y = 0; y < h; y++) {
    const density = Math.pow((y + 1) / h, 1.6) * 0.9;
    let line = '';
    for (let x = 0; x < w; x++) line += bayer[y % 4][x % 4] / 16 < density ? 'f' : '.';
    rows.push(line);
  }
  return rows.join('\n');
}

// --- fachadas -----------------------------------------------------------------------------------------------------------

const WINDOWS: Record<string, string> = {
  // apagada: vidro escuro com o céu refletido
  d: `
    kkkkkkkk
    kgggGggk
    kggGgggk
    kgGggggk
    kggggggk
    knnnnnnk
    kgggggGk
    kggggGgk
    kgggGggk
    kkkkkkkk
    CCCCCCCC`,
  // acesa: amarelo quente, um móvel contra a luz
  l: `
    kkkkkkkk
    kYyyyyyk
    kyyyyyyk
    kyyyyyok
    kyyyyyok
    knnnnnnk
    kyyyyyyk
    kyyyyoyk
    kyyyoook
    kkkkkkkk
    CCCCCCCC`,
  // acesa com a persiana meio baixada
  b: `
    kkkkkkkk
    kooooook
    kyyyyyyk
    kooooook
    kyyyyyyk
    knnnnnnk
    kyyyyyyk
    kyyyyyyk
    kyyYyyyk
    kkkkkkkk
    CCCCCCCC`,
  // alguém vendo televisão no escuro
  t: `
    kkkkkkkk
    kggggGgk
    kgggggGk
    kgtggggk
    kttgtggk
    knnnnnnk
    kTtttttk
    kttTtttk
    kttttttk
    kkkkkkkk
    CCCCCCCC`,
};

const BRICK = `
  BBBBBBBm
  bbbbbbbm
  mmmmmmmm
  BBBmBBBB
  bbbmbbbb
  mmmmmmmm`;

const PANEL = `
  ddddddddddddddd
  PPppppppppppppp
  Ppppppppppppppp
  ppppppppppppppp
  ppppppPpppppppp
  ppppppppppppppp
  ppppppppppppppp
  ppppppppppppPpp
  ppppppppppppppp
  ppppppppppppppp
  pppPppppppppppp`;

const TILE = `
  dddd
  dSss
  dsss
  dsss`;

/** um andar da fachada, em linhas; uma baia (uma janela) em colunas */
const FLOOR = 22;
const BAY = 16;

/**
 * Uma fachada que repete: `plan` diz a janela de cada baia (uma linha por andar, `d` apagada, `l` acesa, `b` com
 * persiana, `t` televisão, `.` parede), sobre a parede `wall` carimbada em ladrilho. Entre os andares, uma laje de duas
 * linhas `band` (a última linha de um andar e a primeira do próximo); nas pontas, meio pilar `pillar` de cada lado.
 */
function facade(o: { wall: string; band: string; pillar: string; plan: string; lintel?: string }): string {
  const plan = gridLines(o.plan);
  const bays = plan[0].length, floors = plan.length;
  const w = 2 + bays * BAY, h = floors * FLOOR;
  const s = new Sketch(w, h);
  const wall = gridLines(o.wall);
  const tw = wall[0].length, th = wall.length;
  for (let y = 0; y < h; y += th) for (let x = 1; x < w - 1; x += tw) s.stamp(x, y, o.wall);
  for (let f = 0; f < floors; f++) {
    const y0 = f * FLOOR;
    s.fill(0, y0, w, 1, o.band);
    s.fill(0, y0 + FLOOR - 1, w, 1, o.band);
    [...plan[f]].forEach((kind, i) => {
      if (kind === '.') return;
      const win = WINDOWS[kind];
      if (!win) throw new Error(`janela desconhecida: ${kind}`);
      const x = 1 + i * BAY + 4;
      if (o.lintel) s.fill(x - 1, y0 + 4, 10, 1, o.lintel);
      s.stamp(x, y0 + 5, win);
    });
  }
  s.fill(0, 0, 1, h, o.pillar);
  s.fill(w - 1, 0, 1, h, o.pillar);
  return s.text();
}

// --- caixas do mapa ------------------------------------------------------------------------------------------------------

/** A hélice no tampo do ar-condicionado, achatada pela perspectiva. */
const FAN = `
  .....MMMMMM.....
  ...MMknknknMM...
  .MMknknknknknMM.
  .MknknkMMknknkM.
  MknknkMNNMknknkM
  MknknkMNNMknknkM
  .MknknkMMknknkM.
  .MMknknknknknMM.
  ...MMknknknMM...
  .....MMMMMM.....`;

/** O ar-condicionado da caixa x 120–160: 40 de largura, frente de 28, tampo de 16 (26 de fundo · 0,6). */
export function airCon(): string {
  const s = new Sketch(40, 44, 'N');
  // tampo
  s.fill(0, 0, 40, 1, 'k');
  s.fill(1, 1, 38, 1, 'n');
  s.stamp(3, 3, FAN);
  s.stamp(21, 3, FAN);
  s.fill(1, 14, 38, 1, 'n');
  s.fill(1, 15, 38, 1, 'M');
  s.fill(30, 6, 5, 1, 'w'); // chuva parada no tampo
  // frente
  s.fill(1, 16, 38, 1, 'n');
  s.frame(3, 19, 24, 20, 'n');
  for (let y = 20; y < 38; y++) s.fill(4, y, 22, 1, ['M', 'N', 'k'][(y - 20) % 3]);
  s.frame(29, 19, 8, 14, 'n');
  s.set(30, 20, 'M'); s.set(35, 20, 'M'); s.set(30, 31, 'M'); s.set(35, 31, 'M');
  s.fill(31, 23, 4, 2, 'y'); // etiqueta
  s.fill(29, 35, 8, 1, 'n');
  s.fill(29, 36, 8, 1, 'k');
  s.fill(1, 40, 38, 1, 'n');
  s.fill(1, 41, 38, 1, 'k');
  s.fill(0, 42, 40, 2, '.');
  s.fill(2, 42, 5, 2, 'k');
  s.fill(33, 42, 5, 2, 'k');
  // escorrido de chuva
  s.fill(28, 33, 1, 7, 'w');
  s.fill(8, 39, 1, 1, 'w');
  s.fill(0, 0, 1, 42, 'k');
  s.fill(39, 0, 1, 42, 'k');
  return s.text();
}

/** A boca de uma chaminé, de cima. */
const FLUE = `
  ..kkkkkk..
  .kddddddk.
  kddkkkkddk
  kdkkkkkkdk
  .kkkkkkkk.
  ..nnnnnn..`;

/** A chaminé da caixa x 400–440: 40 de largura, frente de 32, tampo de 13 (22 de fundo · 0,6). Tijolo com tampa de concreto e uma grelha de ventilação. */
export function chimney(): string {
  const s = new Sketch(40, 45);
  // tampa vista de cima
  s.fill(0, 0, 40, 13, 'C');
  s.fill(0, 0, 40, 1, 'k');
  s.fill(1, 1, 38, 1, 'c');
  s.stamp(7, 3, FLUE);
  s.stamp(23, 3, FLUE);
  for (const [x, y] of [[6, 4], [18, 6], [22, 2], [33, 8], [11, 10], [27, 10]]) s.set(x, y, 'n');
  s.fill(1, 12, 38, 1, 'w');
  // frente: a tampa, a sombra dela, e o tijolo
  s.fill(0, 13, 40, 1, 'C');
  s.fill(0, 14, 40, 1, 'c');
  s.fill(0, 15, 40, 1, 'd');
  for (let y = 16; y < 45; y += 6) for (let x = 2; x < 38; x += 8) s.stamp(x, y, BRICK);
  s.fill(0, 16, 2, 29, '.');
  s.fill(38, 16, 2, 29, '.');
  s.fill(2, 16, 36, 1, 'k');
  s.fill(2, 17, 36, 1, 'm');
  // grelha
  s.frame(14, 25, 12, 9, 'k');
  for (let y = 26; y < 33; y++) s.fill(15, y, 10, 1, y % 2 ? 'N' : 'n');
  s.fill(15, 26, 10, 1, 'M');
  // fuligem escorrendo da tampa
  s.fill(8, 18, 1, 4, 'm');
  s.fill(31, 18, 1, 6, 'm');
  s.fill(2, 16, 1, 29, 'k');
  s.fill(37, 16, 1, 29, 'k');
  s.fill(0, 13, 1, 3, 'k');
  s.fill(39, 13, 1, 3, 'k');
  s.fill(0, 0, 1, 13, 'k');
  s.fill(39, 0, 1, 13, 'k');
  return s.text();
}

/** A caixa-d'água da caixa x 700–744: 44 de largura, frente de 52, tampo de 12 (20 de fundo · 0,6). Madeira com cintas, sobre pernas de ferro. */
export function waterTank(): string {
  const w = 44, h = 64;
  const s = new Sketch(w, h);
  const cy = 5.5, ry = 6, rx = w / 2;
  const half = (y: number) => { const t = (y + 0.5 - cy - 0.5) / ry; return t * t >= 1 ? -1 : rx * Math.sqrt(1 - t * t); };
  // o corpo: aduelas, escuro nas pontas e claro à esquerda do meio
  const bodyTop = 6, bodyBottom = 47;
  for (let x = 0; x < w; x++) {
    const t = x / (w - 1);
    let ch = t < 0.06 ? 'e' : t < 0.38 ? 'F' : t < 0.72 ? 'E' : 'e';
    if (x % 5 === 2 && t > 0.06 && t < 0.94) ch = ch === 'F' ? 'E' : 'e';
    s.fill(x, bodyTop, 1, bodyBottom - bodyTop + 1, ch);
  }
  for (const y of [18, 29, 40]) {
    s.fill(0, y, w, 1, 'n');
    s.fill(4, y, 14, 1, 'N');
  }
  s.fill(0, bodyTop, 1, bodyBottom - bodyTop + 1, 'k');
  s.fill(w - 1, bodyTop, 1, bodyBottom - bodyTop + 1, 'k');
  // a tampa: uma elipse de metal com a borda da frente clara
  for (let y = 0; y < 12; y++) {
    const hw = half(y);
    if (hw < 0) continue;
    const x0 = Math.round(rx - hw), x1 = Math.round(rx + hw) - 1;
    s.fill(x0, y, x1 - x0 + 1, 1, 'N');
    s.set(x0, y, 'k'); s.set(x1, y, 'k');
    if (y === 0) s.fill(x0, y, x1 - x0 + 1, 1, 'k');
  }
  for (let y = 6; y < 12; y++) {
    const hw = half(y);
    const below = half(y + 1);
    const x0 = Math.round(rx - hw), x1 = Math.round(rx + hw) - 1;
    const b0 = below < 0 ? x1 + 1 : Math.round(rx - below), b1 = below < 0 ? x0 - 1 : Math.round(rx + below) - 1;
    for (let x = x0; x <= x1; x++) if (x < b0 || x > b1) s.set(x, y, 'M');
  }
  s.stamp(17, 3, `
    .nnnnnnnn.
    nNNNNNNNNn
    .nnnnnnnn.`);
  s.fill(9, 2, 4, 1, 'w');
  // estrado e pernas
  s.fill(0, 48, w, 1, 'k');
  s.fill(0, 49, w, 1, 'n');
  s.fill(0, 50, w, 1, 'k');
  for (const lx of [3, 21, 39]) {
    s.fill(lx, 51, 2, 12, 'n');
    s.fill(lx, 51, 1, 12, 'N');
    s.fill(lx - 1, 63, 4, 1, 'k');
  }
  s.line(5, 52, 20, 61, 'n'); s.line(20, 52, 5, 61, 'n');
  s.line(23, 52, 38, 61, 'n'); s.line(38, 52, 23, 61, 'n');
  // escada à direita
  for (let y = 22; y < 50; y += 3) s.fill(36, y, 4, 1, 'n');
  s.fill(36, 20, 1, 30, 'n');
  s.fill(39, 20, 1, 30, 'n');
  return s.text();
}

// --- enfeites -----------------------------------------------------------------------------------------------------------

/** Antena de TV, de pé atrás da mureta do fundo. */
export const ANTENNA = [
  '.N.N.N.N.N.N.N.',
  'NNNNNNNNNNNNNNN',
  '.N.N.N.N.N.N.N.',
  '.......N.......',
  '...N.N.N.N.N...',
  '...NNNNNNNNN...',
  '...N.N.N.N.N...',
  '.......N.......',
  '.....N.N.N.....',
  '.....NNNNN.....',
  '.......M.......',
  ...Array<string>(16).fill('.......N.......'),
  '......nNn......',
  '.....kkkkk.....',
].join('\n');

/** Torre de rádio em treliça; a luz vermelha (`beacon`) pisca em cima, desenhada à parte. */
export const MAST = [
  '...n...',
  '...N...',
  '..nMn..',
  ...Array.from({ length: 7 }, () => ['..N.N..', '...N...', '..N.N..', '..NNN..']).flat(),
  '.N...N.',
  '.NN.NN.',
  '.N.N.N.',
  '.NN.NN.',
  'N.....N',
  'NN...NN',
  'kkkkkkk',
].join('\n');

export const BEACON = `
  .R.
  RRR
  .R.`;

export const PUDDLES = {
  'puddle-a': `
    ...hhhhhhhh...
    .hhhHhhhhihhh.
    hhhhhhhiihhhhh
    .hhhhhhhhhhhh.
    ...hhhhhhhh...`,
  'puddle-b': `
    .....hhhhhhhhhh.....
    ..hhhhhzhhhhhhhhhh..
    hhhhhhhhhhhhhiihhhhh
    .hhhHHhhhhhhhhhhhhh.
    ...hhhhhhhhhhhhh....`,
};

/** A lua, cheia e um pouco apagada à direita. */
export function moon(): string {
  const n = 24, c = (n - 1) / 2;
  const s = new Sketch(n, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = x - c, dy = y - c;
    if (dx * dx + dy * dy > (c + 0.4) * (c + 0.4)) continue;
    s.set(x, y, dx + dy * 0.35 > 6.5 ? 'L' : 'l');
  }
  s.stamp(6, 5, `
    .qq.
    qqqq
    .qq.`);
  s.stamp(13, 9, `
    qq
    qq`);
  s.stamp(4, 13, `
    .q.
    qqq`);
  s.stamp(10, 16, `
    qqq.
    .qqq`);
  s.set(16, 4, 'q');
  return s.text();
}

// --- neon ---------------------------------------------------------------------------------------------------------------

/** A fonte dos letreiros: 5×7, um traço só (o tubo). Só as letras que os letreiros usam. */
const NEON_FONT: Record<string, string> = {
  B: '####.\n#...#\n#...#\n####.\n#...#\n#...#\n####.',
  A: '.###.\n#...#\n#...#\n#####\n#...#\n#...#\n#...#',
  R: '####.\n#...#\n#...#\n####.\n#.#..\n#..#.\n#...#',
  H: '#...#\n#...#\n#...#\n#####\n#...#\n#...#\n#...#',
  O: '.###.\n#...#\n#...#\n#...#\n#...#\n#...#\n.###.',
  T: '#####\n..#..\n..#..\n..#..\n..#..\n..#..\n..#..',
  E: '#####\n#....\n#....\n####.\n#....\n#....\n#####',
  L: '#....\n#....\n#....\n#....\n#....\n#....\n#####',
  '2': '.###.\n#...#\n....#\n...#.\n..#..\n.#...\n#####',
  '4': '...#.\n..##.\n.#.#.\n#..#.\n#####\n...#.\n...#.',
};

/**
 * Um letreiro de neon: o texto na fonte acima em tubo (`x` magenta ou `z` ciano) com um halo escuro da mesma cor, numa
 * placa preta com moldura. `vertical` empilha as letras; `off` são as letras com o tubo apagado (para o pisca-pisca);
 * `legs` põe a placa em pernas, para ficar de pé no telhado.
 */
export function neonSign(text: string, tube: 'x' | 'z', o: { vertical?: boolean; off?: number[]; legs?: number } = {}): string {
  const glow = tube === 'x' ? 'v' : 'u';
  const LW = 5, LH = 7, GAP = 2, M = 3;
  const n = text.length;
  const w = o.vertical ? LW + 2 * M : n * LW + (n - 1) * GAP + 2 * M;
  const ph = o.vertical ? n * LH + (n - 1) * GAP + 2 * M : LH + 2 * M;
  const legs = o.legs ?? 0;
  const s = new Sketch(w, ph + legs);
  s.fill(0, 0, w, ph, 'k');
  s.frame(0, 0, w, ph, 'n');
  for (const [x, y] of [[1, 1], [w - 2, 1], [1, ph - 2], [w - 2, ph - 2]]) s.set(x, y, 'N');
  const strokes: [number, number, boolean][] = [];
  [...text].forEach((ch, i) => {
    const glyph = NEON_FONT[ch];
    if (!glyph) throw new Error(`letra fora da fonte do neon: ${ch}`);
    const gx = M + (o.vertical ? 0 : i * (LW + GAP)), gy = M + (o.vertical ? i * (LH + GAP) : 0);
    const lit = !o.off?.includes(i);
    gridLines(glyph).forEach((line, y) => [...line].forEach((c, x) => { if (c === '#') strokes.push([gx + x, gy + y, lit]); }));
  });
  for (const [x, y, lit] of strokes) {
    if (!lit) continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (s.at(x + dx, y + dy) === 'k') s.set(x + dx, y + dy, glow);
  }
  for (const [x, y, lit] of strokes) s.set(x, y, lit ? tube : 'n');
  if (legs) {
    for (const lx of [3, w - 5]) { s.fill(lx, ph, 2, legs, 'n'); s.fill(lx, ph, 1, legs, 'N'); s.fill(lx - 1, ph + legs - 1, 4, 1, 'k'); }
    s.fill(3, ph + Math.floor(legs / 2), w - 6, 1, 'n');
  }
  return s.text();
}

// --- receitas e folha ------------------------------------------------------------------------------------------------

export interface Recipe {
  name: string;
  grid: string;
  /** textura que repete (o ladrilho é o quadro inteiro) */
  tile?: boolean;
  /** o ponto do quadro que vai no lugar do objeto no mundo; sem isto, o meio de baixo */
  anchor?: { x: number; y: number };
  /** objeto de uma caixa do mapa: largura, altura da frente e fundo (z) da caixa */
  fits?: { w: number; h: number; depth: number };
}

const box = (name: string, grid: string, fits: Recipe['fits'] & {}): Recipe => ({ name, grid, fits, anchor: { x: 0, y: gridLines(grid).length } });

export const RECIPES: readonly Recipe[] = [
  { name: 'roof-top', grid: roofTop(), tile: true, anchor: { x: 0, y: 0 } },
  { name: 'parapet', grid: PARAPET, tile: true, anchor: { x: 0, y: 4 } },
  { name: 'ledge', grid: LEDGE, tile: true, anchor: { x: 0, y: 5 } },
  { name: 'fog', grid: fog(), tile: true, anchor: { x: 0, y: 0 } },
  {
    name: 'facade-a', tile: true, anchor: { x: 0, y: 0 },
    grid: facade({ wall: BRICK, band: 'c', pillar: 'c', lintel: 'C', plan: 'dlddbddl\nddtddldd\nbdddldtd' }),
  },
  {
    name: 'facade-b', tile: true, anchor: { x: 0, y: 0 },
    grid: facade({ wall: PANEL, band: 'd', pillar: 'P', plan: 'dbddlddd\nlddbdtdl\nddlddddb' }),
  },
  {
    name: 'facade-c', tile: true, anchor: { x: 0, y: 0 },
    grid: facade({ wall: TILE, band: 'S', pillar: 'd', lintel: 'k', plan: 'ddlddtdd\ntddddldb\ndldtdddd' }),
  },
  box('ac', airCon(), { w: 40, h: 28, depth: 26 }),
  box('chimney', chimney(), { w: 40, h: 32, depth: 22 }),
  box('tank', waterTank(), { w: 44, h: 52, depth: 20 }),
  { name: 'antenna', grid: ANTENNA },
  { name: 'mast', grid: MAST },
  { name: 'beacon', grid: BEACON, anchor: { x: 1, y: 1 } },
  { name: 'sign-bar', grid: neonSign('BAR', 'x', { vertical: true }), anchor: { x: 0, y: 0 } },
  { name: 'sign-hotel', grid: neonSign('HOTEL', 'z', { legs: 10 }) },
  { name: 'sign-hotel-flicker', grid: neonSign('HOTEL', 'z', { legs: 10, off: [3] }) },
  { name: 'sign-24h', grid: neonSign('24H', 'x'), anchor: { x: 0, y: 0 } },
  { name: 'puddle-a', grid: PUDDLES['puddle-a'] },
  { name: 'puddle-b', grid: PUDDLES['puddle-b'] },
  { name: 'moon', grid: moon(), anchor: { x: 12, y: 12 } },
];

export interface RooftopFrame {
  x: number; y: number; w: number; h: number;
  anchor: { x: number; y: number };
  tile?: true;
  /** caixa: quantas linhas de baixo são a frente (a altura da caixa); as de cima são o tampo */
  face?: number;
}

export interface RooftopAtlas {
  frames: Record<string, RooftopFrame>;
}

/** Todos os objetos numa folha (prateleiras de até `width`, 1 pixel entre eles) e onde cada um ficou. */
export function rooftopSheet(width = 256): { sheet: Image; atlas: RooftopAtlas } {
  const imgs = RECIPES.map((r) => ({ r, img: parseGrid(r.grid, PALETTE) }));
  const order = [...imgs].sort((a, b) => b.img.height - a.img.height || b.img.width - a.img.width);
  const sheetW = Math.max(width, ...imgs.map((i) => i.img.width));
  const placed = new Map<string, { x: number; y: number }>();
  let x = 0, y = 0, shelf = 0;
  for (const { r, img } of order) {
    if (x + img.width > sheetW) { x = 0; y += shelf + 1; shelf = 0; }
    placed.set(r.name, { x, y });
    x += img.width + 1;
    shelf = Math.max(shelf, img.height);
  }
  const sheet = blank(sheetW, y + shelf);
  const frames: Record<string, RooftopFrame> = {};
  for (const { r, img } of imgs) {
    const at = placed.get(r.name)!;
    blit(sheet, img, at.x, at.y);
    frames[r.name] = {
      x: at.x, y: at.y, w: img.width, h: img.height,
      anchor: r.anchor ?? { x: Math.floor(img.width / 2), y: img.height },
      ...(r.tile ? { tile: true as const } : {}),
      ...(r.fits ? { face: r.fits.h } : {}),
    };
  }
  return { sheet, atlas: { frames } };
}
