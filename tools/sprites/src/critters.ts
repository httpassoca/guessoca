/**
 * Os bichos do telhado (issue #71): gatos e passarinhos que moram nos telhados. Duas folhas e um atlas:
 *
 * - `cats.png`: três gatos do "Pet Cats Pack" de LuizMelo (CC0, `assets-src/cats/`), cada animação uma linha, e o
 *   "miau" (as três linhas de som, `Meow-VFX`) numa linha no fim;
 * - `birds.png`: o pombo e o corvo do "Bird Sprites" de carysaurus (`assets-src/birds/`; uso livre com crédito, sem
 *   redistribuir o pacote: só esta folha gerada vai para o git, ADR 0007), o parado de 12 quadros de cada um, e o voo,
 *   que o pacote grátis não tem: três quadros de bater de asas desenhados aqui em grade de texto, com as cores do
 *   próprio pássaro (a cabeça é a mesma do parado), para ser claramente o mesmo bicho;
 * - `critters.json` (em `apps/web/src/lib/sprites/`): cada tira (bicho + animação) com o retângulo na folha, o tamanho
 *   do quadro, a âncora (entre os pés, no chão), quadros, fps e se dá a volta.
 *
 * Nenhum pixel da arte do pacote muda: cada quadro é recortado inteiro (todos os quadros de uma espécie no mesmo
 * retângulo, a união dos opacos) e colado na folha. O jogo desenha a 1× (um pixel = uma unidade do mundo) e tinge na
 * hora (`tint` do Pixi) para a noite. Sem disco aqui: `index.ts` lê os PNG e grava a saída.
 */
import { parseGrid, type Palette } from './grid';
import { blank, blit, bounds, crop, solidify, type Image } from './image';

/** Uma animação de uma folha do pacote dos gatos: o arquivo (`Cat-N-<file>.png`), quantos quadros, fps e se dá a volta. */
export interface CatAnim { name: string; file: string; frames: number; fps: number; loop: boolean }

/** As células do pacote dos gatos: 50×50, os pés na linha 31 (o chão é a linha 32), o meio dos pés em x 25. */
export const CAT_CELL = 50;
export const CAT_GROUND = 32;
export const CAT_FEET_X = 25;

/**
 * As animações que o jogo usa, na ordem das linhas de cada gato. As contagens são as do pacote (a largura da folha
 * dividida por 50); os fps escolhidos no olho (o pacote não diz).
 */
export const CAT_ANIMS: readonly CatAnim[] = [
  { name: 'idle', file: 'Idle', frames: 10, fps: 8, loop: true },
  { name: 'walk', file: 'Walk', frames: 8, fps: 10, loop: true },
  { name: 'run', file: 'Run', frames: 8, fps: 14, loop: true },
  { name: 'meow', file: 'Meow', frames: 4, fps: 8, loop: false },
  { name: 'lying', file: 'Laying', frames: 8, fps: 8, loop: false },
  { name: 'itch', file: 'Itch', frames: 2, fps: 6, loop: true },
  { name: 'sleep1', file: 'Sleeping1', frames: 1, fps: 1, loop: true },
  { name: 'sleep2', file: 'Sleeping2', frames: 1, fps: 1, loop: true },
  { name: 'sitting', file: 'Sitting', frames: 1, fps: 1, loop: true },
  { name: 'lick1', file: 'Licking 1', frames: 5, fps: 6, loop: true },
  { name: 'lick2', file: 'Licking 2', frames: 5, fps: 6, loop: true },
  { name: 'stretch', file: 'Stretching', frames: 13, fps: 8, loop: false },
];

/**
 * Os gatos do jogo, um por telhado (no máximo três, para uma sala cheia ainda se ler): o preto e o cinza tigrado
 * combinam com o noir; o branco peludo se vê no telhado escuro da direita. (A numeração das pastas não segue a ordem
 * da imagem de amostra do pacote: Cat-2 é o preto, Cat-6 o tigrado, Cat-5 o branco; o Cat-3 não tem `Itch`.) `dir` é a pasta em `assets-src/cats/`.
 */
export const CATS = [
  { name: 'preto', dir: 'Cat-2' },
  { name: 'tigrado', dir: 'Cat-6' },
  { name: 'branco', dir: 'Cat-5' },
] as const;

/** O "miau": três quadros de 16×16 de linhas brancas de som, saindo da boca. */
export const MEOW_CELL = 16;
export const MEOW_FRAMES = 3;

/** As células do pacote dos pássaros: 32×32, os pés na linha 31, o meio dos pés em x 16; o parado tem 12 quadros. */
export const BIRD_CELL = 32;
export const BIRD_GROUND = 32;
export const BIRD_FEET_X = 16;
export const BIRD_IDLE_FRAMES = 12;
export const BIRDS = [
  { name: 'pigeon', file: 'Pigeon-Idle.png' },
  { name: 'crow', file: 'Crow-Idle.png' },
] as const;

/** As cores do pombo, tiradas do parado (`palette()`): contorno, ardósia, sombra, olho, cera, bico, pescoço verde e roxo, corpo, cauda, pés. */
export const PIGEON: Palette = {
  a: '000000', b: '4c5165', c: '363a4a', d: 'e4ba49', e: 'cecbcb', f: 'c09213', g: '557660', h: '8b90a5', i: '7e3e7e', j: '2d2e34',
};
/** As cores do corvo, tiradas do parado: contorno, cabeça, corpo, olho, bico (três tons), penas escuras, asa roxa. */
export const CROW: Palette = {
  a: '000000', b: '39393a', c: '252426', d: 'ceb060', e: '282250', f: '4d457e', g: '161419', h: '332245',
};

/**
 * O voo do pombo, de lado, olhando para a direita: asa para cima, aberta (no meio) e para baixo. A cabeça é a do
 * parado (as cinco primeiras linhas da direita), o corpo deitado, a cauda escura atrás; os pés recolhidos. Cada grade
 * tem a linha do corpo (a que começa com `ajj`) na mesma altura da célula: `FLY_BODY_ROW`.
 */
export const PIGEON_FLY = [
  `
  ....aa...............
  ...ahha..............
  ...ahhba.............
  ...ahhba......aaaa...
  ...ahhbba....abbbba..
  ....ahhba...abcadea..
  ....ahhbba.abbbbffda.
  .....ahbba.agbbbbaa..
  ......abbaaagggga....
  ..aaaaabbhhhhiia.....
  .aabbhhhhhhhhhia.....
  ajjbbbbbbbbbbba......
  .aaaaaaaaaaaaa.......`,
  `
  ..............aaaa...
  .............abbbba..
  ............abcadea..
  ...........abbbbffda.
  ...........agbbbbaa..
  ......aaaaaagggga....
  ...aaahhhhhhhiia.....
  .aabbhhhhhhhhhia.....
  ajjbbbbbbbbbbba......
  .aaahhhhhhhhaa.......
  ....ahhhhhaa.........
  .....aaaaa...........`,
  `
  ..............aaaa...
  .............abbbba..
  ............abcadea..
  ...........abbbbffda.
  ...........agbbbbaa..
  ......aaaaaagggga....
  ...aaahhhhhhhiia.....
  .aabbhhhhhhhhhia.....
  ajjbbbbbbbbbbba......
  .aaaabhhhhhbaa.......
  ......ahhhhba........
  ......ahhhba.........
  .......ahhba.........
  ........aaa..........`,
] as const;

/** O voo do corvo, como o do pombo: a cabeça e o bico do parado, o corpo preto, a asa com o brilho roxo. */
export const CROW_FLY = [
  `
  ....aa..................
  ...ahha.................
  ...ahhca................
  ...ahhcca.........aaaa..
  ...ahhcca........abbccaaa
  ....ahhcca......abccadeffa
  ....ahhhcca..aaaaaccgaeeefa
  .....ahhcca.acccccaccggaaaa
  ......acccaacccccccacca...
  ..aaaaaccccccccccccca.....
  .aaggcccccccccccccaa......
  agggggggggggggaaa.........
  .aaaaaaaaaaaaa............`,
  `
  ..................aaaa..
  .................abbccaaa
  ................abccadeffa
  .............aaaaaccgaeeefa
  ........aaaaacccccaccggaaaa
  ....aaahhhhhhhcccccacca...
  ..aahhcccccccccccccca.....
  .aaggcccccccccccccaa......
  agggggggggggggaaa.........
  .aaahhhhhhhhhaa...........
  ....ahhhhhaaa.............
  .....aaaaa................`,
  `
  ..................aaaa..
  .................abbccaaa
  ................abccadeffa
  .............aaaaaccgaeeefa
  ........aaaaacccccaccggaaaa
  ....aaahhhhhhhcccccacca...
  ..aahhcccccccccccccca.....
  .aaggcccccccccccccaa......
  agggggggggggggaaa.........
  .aaaachhhhhhcaa...........
  ......ahhhhhca............
  ......ahhhhca.............
  .......ahhca..............
  ........aaa...............`,
] as const;

/** a linha da célula de 32 onde fica a linha do corpo (a que começa com `ajj`/`aggg`) dos quadros de voo */
export const FLY_BODY_ROW = 24;
/** o voo: quadros por segundo (as asas batem rápido) */
export const FLY_FPS = 12;

/** Uma tira na folha: `frames` quadros de `w×h` lado a lado a partir de (`x`, `y`), a âncora em pixels do quadro. */
export interface Strip { x: number; y: number; w: number; h: number; frames: number; fps: number; loop: boolean; anchor: { x: number; y: number } }

/** O atlas dos bichos: cada folha com as tiras pelo nome (`<bicho>/<animação>`). */
export interface CrittersAtlas {
  cats: { sheet: string; names: string[]; strips: Record<string, Strip> };
  birds: { sheet: string; credit: string; names: string[]; strips: Record<string, Strip> };
}

/** Os quadros de uma folha de uma linha só, cada um com `cell` de largura (e a altura da folha). */
export function slice(sheet: Image, cell: number, frames: number): Image[] {
  if (sheet.width < cell * frames) throw new Error(`folha de ${sheet.width} px não tem ${frames} quadros de ${cell}`);
  return Array.from({ length: frames }, (_, i) => solidify(crop(sheet, i * cell, 0, cell, sheet.height)));
}

/** A união dos retângulos opacos de todos os quadros (pixels da célula). */
export function union(frames: readonly Image[]): { x: number; y: number; w: number; h: number } {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (const f of frames) {
    const b = bounds(f);
    if (!b) continue;
    x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h);
  }
  if (x1 < 0) throw new Error('todos os quadros estão vazios');
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Um quadro de voo na célula do pássaro: a grade com a linha do corpo em `FLY_BODY_ROW`, a cauda a partir de x 4. */
export function flyFrame(grid: string, colors: Palette): Image {
  const img = parseGrid(grid, colors);
  const lines = grid.split('\n').map((l) => l.trim()).filter(Boolean);
  const body = lines.findIndex((l) => l.startsWith('ajj') || l.startsWith('aggg'));
  if (body < 0) throw new Error('quadro de voo sem a linha do corpo');
  const cell = blank(BIRD_CELL, BIRD_CELL);
  blit(cell, img, 4, FLY_BODY_ROW - body);
  return cell;
}

/**
 * Empilha as tiras numa folha: cada tira numa faixa, de cima para baixo, na ordem dada; a folha tem a largura da
 * tira mais larga. `crop` é o retângulo (pixels da célula) que cada quadro da tira mantém.
 */
function stack(rows: { name: string; frames: Image[]; crop: { x: number; y: number; w: number; h: number }; fps: number; loop: boolean; anchor: { x: number; y: number } }[]) {
  const width = Math.max(...rows.map((r) => r.frames.length * r.crop.w));
  const height = rows.reduce((h, r) => h + r.crop.h, 0);
  const sheet = blank(width, height);
  const strips: Record<string, Strip> = {};
  let y = 0;
  for (const r of rows) {
    r.frames.forEach((f, i) => blit(sheet, crop(f, r.crop.x, r.crop.y, r.crop.w, r.crop.h), i * r.crop.w, y));
    strips[r.name] = { x: 0, y, w: r.crop.w, h: r.crop.h, frames: r.frames.length, fps: r.fps, loop: r.loop, anchor: { x: r.anchor.x - r.crop.x, y: r.anchor.y - r.crop.y } };
    y += r.crop.h;
  }
  return { sheet, strips };
}

/** Os arquivos que a receita lê, relativos a `assets-src/`: o nome lógico (o que `buildCritters` recebe) → o arquivo. */
export function critterFiles(): [string, string][] {
  const cats = CATS.flatMap((c) => CAT_ANIMS.map((a) => [`${c.dir}/${a.file}`, `cats/${c.dir}/${c.dir}-${a.file}.png`] as [string, string]));
  return [...cats, ['meow', 'cats/Meow-VFX/Meow-VFX.png'], ...BIRDS.map((b) => [b.name, `birds/${b.file}`] as [string, string])];
}

/**
 * A receita: `files` pelo nome lógico de `critterFiles()`. Devolve as duas folhas e o atlas (as URLs das folhas são as
 * de `/sprites/`).
 */
export function buildCritters(files: Readonly<Record<string, Image>>): { cats: Image; birds: Image; atlas: CrittersAtlas } {
  const need = (name: string) => { const f = files[name]; if (!f) throw new Error(`falta ${name}`); return f; };
  // os gatos: todos os quadros de todos no mesmo retângulo, para a âncora ser a mesma em toda tira
  const catRows = CATS.flatMap((c) => CAT_ANIMS.map((a) => ({ name: `${c.name}/${a.name}`, frames: slice(need(`${c.dir}/${a.file}`), CAT_CELL, a.frames), fps: a.fps, loop: a.loop })));
  const catBox = union(catRows.flatMap((r) => r.frames));
  const meow = slice(need('meow'), MEOW_CELL, MEOW_FRAMES);
  const meowBox = union(meow);
  const cats = stack([
    ...catRows.map((r) => ({ ...r, crop: catBox, anchor: { x: CAT_FEET_X, y: CAT_GROUND } })),
    // o miau: a âncora é a boca, embaixo à esquerda das linhas
    { name: 'meow/pop', frames: meow, crop: meowBox, fps: 8, loop: false, anchor: { x: meowBox.x, y: meowBox.y + meowBox.h } },
  ]);
  const birdRows = BIRDS.flatMap((b) => {
    const colors = b.name === 'pigeon' ? PIGEON : CROW;
    const fly = (b.name === 'pigeon' ? PIGEON_FLY : CROW_FLY).map((g) => flyFrame(g, colors));
    return [
      { name: `${b.name}/idle`, frames: slice(need(b.name), BIRD_CELL, BIRD_IDLE_FRAMES), fps: 10, loop: true },
      { name: `${b.name}/fly`, frames: [...fly, fly[1]], fps: FLY_FPS, loop: true },
    ];
  });
  const birdBox = union(birdRows.flatMap((r) => r.frames));
  const birds = stack(birdRows.map((r) => ({ ...r, crop: birdBox, anchor: { x: BIRD_FEET_X, y: BIRD_GROUND } })));
  return {
    cats: cats.sheet,
    birds: birds.sheet,
    atlas: {
      cats: { sheet: '/sprites/cats.png', names: CATS.map((c) => c.name), strips: cats.strips },
      birds: { sheet: '/sprites/birds.png', credit: 'carysaurus', names: BIRDS.map((b) => b.name), strips: birds.strips },
    },
  };
}
