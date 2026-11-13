/**
 * A vida no telhado (issue #70): os quadros que fazem o mapa de sempre parecer habitado, em grade de texto com a paleta
 * do telhado (`PALETTE` de `rooftop.ts`). Nada aqui é sorteado: as grades são escritas à mão ou calculadas (a hélice
 * girando, a silhueta passando na janela).
 *
 * O que tem: as janelas soltas que o cliente põe por cima das fachadas (acesa, apagada, persiana, televisão em três
 * brilhos, alguém passando), a hélice do ar-condicionado em três passos, o vapor da chaminé, respingos, anéis e gotas
 * de chuva, o reflexo do letreiro nas poças, os letreiros BAR e 24H falhando, o avião e o carro lá embaixo, e a tralha
 * dos telhados dos lados (cadeira, vaso, claraboia, canos, antena parabólica, caixa de papelão, tigela, varal).
 *
 * Sai junto com os objetos de `rooftop.ts` na mesma folha (`ROOFTOP_RECIPES`, que `index.ts` passa a `rooftopSheet`).
 * Quem lê: `apps/web/src/lib/world/windows.ts` (janelas), `skylife.ts` (avião, carros), `rooflife.ts` (hélice, vapor,
 * chuva que encosta), `platforms.ts` e `dressing.ts` (letreiros, tralha, varal), `panels/Stage.svelte` (a janela do
 * pré-lobby). Pixels: os da grade, `y` para baixo, 1 pixel = 1 unidade do mundo.
 *
 * Como mudar: uma grade nova vira mais uma entrada em `LIFE_RECIPES`; o tempo de cada coisa (quando acende, quando
 * pinga) é do cliente, em `apps/web/src/lib/world/ambient.ts`.
 */
import { gridLines } from './grid';
import { FAN, neonSign, PUDDLES, RECIPES, Sketch, WINDOWS, type Recipe } from './rooftop';

/** A janela sem o peitoril (as 10 linhas de cima de `WINDOWS`): é o que se põe por cima da fachada. */
export const pane = (kind: string) => gridLines(WINDOWS[kind]).slice(0, 10).join('\n');

/** Troca letras numa grade, linha a linha, só onde `where(x, y)` deixar. */
function recolor(grid: string, map: Record<string, string>, where: (x: number, y: number) => boolean = () => true): string {
  return gridLines(grid).map((l, y) => [...l].map((ch, x) => (where(x, y) && map[ch] ? map[ch] : ch)).join('')).join('\n');
}

/**
 * A televisão em três brilhos: `t` é a da fachada; `t2` a cena clareou (o vidro de baixo todo claro, o de cima pegando
 * a luz); `t3` escureceu (quase só vidro). O cliente alterna entre as três num ritmo irregular.
 */
export function tvPanes(): Record<'win-t' | 'win-t2' | 'win-t3', string> {
  const t = pane('t');
  return {
    'win-t': t,
    'win-t2': recolor(t, { t: 'T', g: 'G' }, (x, y) => x > 0 && x < 7 && y > 0 && y < 9),
    'win-t3': recolor(t, { t: 'G', T: 't' }, (x, y) => y > 5 && y < 9 && (x + y) % 3 !== 0),
  };
}

/**
 * Alguém passando na frente de uma janela acesa, em `n` passos: a silhueta (cabeça de 2, ombros de 4, cor `e`) anda da
 * esquerda para a direita atrás do caixilho; a travessa do meio (linha 5) passa na frente dela. O cliente toca de trás
 * para a frente para quem anda para o outro lado.
 */
export function walkPanes(n = 5): string[] {
  const base = gridLines(pane('l'));
  return Array.from({ length: n }, (_, f) => {
    const s = new Sketch(8, 10);
    s.stamp(0, 0, base.join('\n'));
    const cx = -1 + f * 2;
    const paint = (x: number, y: number) => { if (x >= 1 && x <= 6 && y >= 1 && y <= 8 && y !== 5) s.set(x, y, 'e'); };
    for (let y = 2; y <= 3; y++) for (let x = cx; x <= cx + 1; x++) paint(x, y);
    for (let y = 4; y <= 8; y++) for (let x = cx - 1; x <= cx + 2; x++) paint(x, y);
    return s.text();
  });
}

/**
 * A hélice do ar-condicionado girando: as pás de `FAN` (as casas `k` e `n` dentro do aro) recontadas por ângulo, três
 * pás claras e três vãos escuros, cada passo um terço de pá adiante. O ângulo é medido com o `y` esticado de volta
 * (÷ 0,6, a perspectiva), para as pás não parecerem achatadas.
 */
export function fanFrames(n = 3): string[] {
  const lines = gridLines(FAN);
  const cx = (lines[0].length - 1) / 2, cy = (lines.length - 1) / 2;
  return Array.from({ length: n }, (_, f) => lines.map((l, y) => [...l].map((ch, x) => {
    if (ch !== 'k' && ch !== 'n') return ch;
    const a = Math.atan2((y - cy) / 0.6, x - cx) / (2 * Math.PI);
    const sector = Math.floor((a + 1) * 6 + f / n * 2) % 2;
    return sector === 0 ? 'n' : 'k';
  }).join('')).join('\n'));
}

/** O vapor da chaminé crescendo e se abrindo: quatro tamanhos de nuvenzinha lilás (o cliente apaga com a idade). */
export const PUFFS = [
  `
  .l.
  lll
  .L.`,
  `
  .ll.
  llll
  lLll
  .LL.`,
  `
  ..lll.
  .lllll
  lllLll
  lLLLLl
  .LLL..`,
  `
  ..llll..
  .llllll.
  llllLlll
  lLlLLLLl
  .LLLLLL.
  ..LLL...`,
];

/** O pingo batendo no tampo: uma coroa de 3 e depois de 5 pixels. */
export const SPLASHES = [
  `
  .W.
  W.W`,
  `
  W...W
  .w.w.`,
];

/** Anéis na poça, achatados pela perspectiva, abrindo e sumindo. */
export const RIPPLES = [
  `
  .W.
  W.W
  .W.`,
  `
  .HHH.
  H...H
  .HHH.`,
  `
  ..HHH..
  h.....h
  ..hhh..`,
];

/** Quem corre numa poça espirra água para os lados, em dois passos. */
export const KICKS = [
  `
  ...H.H...
  .W.....W.
  W..H.H..W`,
  `
  W.......W
  .........
  .W.....W.
  H.......H`,
];

/** A gota: pendurada na beirada (1 pixel) e caindo (um traço de 2). */
export const DRIPS = { 'drip-0': 'W', 'drip-1': 'W\nH' };

/**
 * O reflexo do neon nas poças (`PUDDLES` de `rooftop.ts`, do mesmo tamanho), em quase branco (`Y`): o cliente pinta com
 * a cor do letreiro mais perto e acende junto com ele.
 */
export const SHINES = {
  'puddle-a-shine': `
    ..............
    ......YY......
    ....YYYYY.....
    .....YYY......
    ..............`,
  'puddle-b-shine': `
    ....................
    ........YYY.........
    ......YYYYYYY.......
    .......YYYYY........
    ....................`,
} satisfies Record<`${keyof typeof PUDDLES}-shine`, string>;

/** O avião lá no alto, uma silhueta de 13×4 (as luzes de navegação são pontos à parte, no cliente). */
export const PLANE = `
  ..n..........
  .nnn.....n...
  nnnnnnnnnnnnn
  .....nnn.....`;

/**
 * Um carro na rua, de lado, indo para a direita: lanterna vermelha atrás, farol na frente e o facho se abrindo na
 * neblina. O cliente espelha para quem vai para a esquerda.
 */
export const CAR = `
  ...kkkkkk...........
  .kkddddddkk.........
  RddddddddddYyyoo....
  .kk.....kk..........`;

// --- tralha dos telhados dos lados --------------------------------------------------------------------------------------

/** Uma cadeira de praia de alumínio, de lado, com o encosto inclinado e as fitas trançadas. */
export const CHAIR = `
  .MN.........
  .Mi.........
  ..Mh........
  ..Mi........
  ..Mh........
  ..MMMMMMMMM.
  ...ihihihiN.
  ..N.......N.
  .N.........N
  N..........N`;

/** Um vaso de planta, folhas compridas caídas de chuva, vaso de barro. */
export const PLANT = `
  ...A.....
  ..AaA.A..
  .A.aAAa..
  AaA.aA.A.
  .aAaAaaA.
  ..aaAaa..
  ...aaa...
  .kkkkkkk.
  .EFFFFEk.
  .EFFFEek.
  ..EFFEe..
  ..EEEek..
  ..kkkkk..`;

/** Uma caixa de papelão largada, molhada, a fita da tampa soltando. */
export function cardboard(): string {
  const s = new Sketch(13, 10);
  s.fill(1, 0, 11, 3, 'F'); // a tampa vista de cima
  s.fill(1, 0, 11, 1, 'k');
  s.fill(5, 0, 2, 3, 'C'); // a fita
  s.fill(0, 3, 13, 1, 'k');
  s.fill(1, 4, 9, 5, 'E'); // a frente
  s.fill(10, 4, 2, 5, 'e'); // o lado
  s.fill(1, 4, 9, 1, 'F');
  s.fill(3, 6, 4, 1, 'e'); // o rótulo apagado
  s.fill(0, 9, 13, 1, 'k');
  s.set(0, 4, 'k'); s.set(12, 4, 'k');
  for (let y = 4; y < 9; y++) { s.set(0, y, 'k'); s.set(12, y, 'k'); }
  s.set(2, 1, 'w'); // água parada na tampa
  return s.text();
}

/** Uma claraboia de vidro, deitada no tampo, com a luz quente do corredor lá embaixo. */
export function skylight(): string {
  const s = new Sketch(24, 10);
  s.fill(1, 0, 22, 9, 'N');
  s.frame(1, 0, 22, 9, 'n');
  s.fill(3, 2, 18, 5, 'g');
  s.fill(5, 3, 14, 3, 'o');
  s.fill(8, 4, 8, 1, 'y');
  for (const x of [8, 12, 16]) s.fill(x, 2, 1, 5, 'n'); // a grade do vidro
  s.fill(3, 2, 18, 1, 'G');
  s.set(4, 3, 'W'); s.set(5, 2, 'W');
  s.fill(0, 9, 24, 1, 'k');
  s.fill(0, 1, 1, 8, 'k'); s.fill(23, 1, 1, 8, 'k');
  return s.text();
}

/** Canos correndo no pé da mureta do fundo, presos por braçadeiras, um subindo no fim. */
export function pipes(): string {
  const w = 56, s = new Sketch(w, 12);
  s.fill(0, 6, w - 4, 1, 'M');
  s.fill(0, 7, w - 4, 2, 'n');
  s.fill(0, 9, w - 4, 1, 'k');
  s.fill(0, 10, w - 10, 1, 'N');
  s.fill(0, 11, w - 10, 1, 'k');
  s.fill(w - 4, 0, 3, 10, 'n'); // o que sobe
  s.fill(w - 4, 0, 1, 10, 'M');
  s.fill(w - 5, 0, 5, 1, 'k');
  for (let x = 6; x < w - 4; x += 14) s.fill(x, 5, 2, 7, 'k'); // braçadeiras
  s.fill(20, 9, 1, 1, 'w'); // ferrugem molhada
  return s.text();
}

/** Uma antena parabólica velha virada para o céu, num cano. */
export const DISH = `
  ..........NN..
  .......NNMMN..
  .....NMMMMMN..
  ....NMMMMMMN..
  ...NMMMMMMNk..
  ..NMMMMMMNk...
  ..NMMMMNNk....
  ..NMMNNkk.....
  ...NNkk.......
  ....kn........
  .....n........
  .....n........
  .....n........
  .....n........
  ....nnn.......
  ...kkkkk......`;

/** A tigela de um gato: um pouco de água da chuva dentro. */
export const BOWL = `
  NhhhN
  .nnn.`;

/**
 * O varal do telhado da direita: o fio sai da torre e cai num arco até um poste fino, com roupa pendurada. Dois passos
 * (a roupa balançando no vento da chuva, para a esquerda). Âncora no começo do fio, em cima à esquerda.
 */
export function laundry(step: 0 | 1): string {
  const w = 71, h = 28, s = new Sketch(w, h);
  const sag = (x: number) => Math.round(4 * (1 - ((x - 35) / 35) ** 2));
  for (let x = 0; x < w - 1; x++) s.set(x, sag(x), 'N');
  s.fill(w - 1, 0, 1, h - 1, 'n'); // o poste
  s.set(w - 1, h - 1, 'k');
  s.set(w - 2, h - 1, 'k');
  // as peças: x no fio, a grade, quanto balança
  const hang = (x: number, grid: string, swing: number) => {
    const lines = gridLines(grid);
    lines.forEach((l, j) => [...l].forEach((ch, i) => {
      if (ch === '.') return;
      const off = step && j >= lines.length / 2 ? -swing : 0;
      s.set(x + i + off, sag(x + i) + 1 + j, ch);
    }));
  };
  hang(8, `
    i....i
    iiiiii
    .iiii.
    .ihii.
    .iiii.
    .iiii.`, 1);
  hang(22, `
    HHHH
    HhHH
    HHHH
    HHhH
    HHHH
    HHHH
    hHHh`, 1);
  hang(34, `
    u.u
    u.u
    u.u
    uuu`, 1);
  hang(44, `
    EEEEEEE
    EEFEEEE
    .EEEEE.
    .EEEEE.
    .E...E.
    .E...E.`, 1);
  hang(57, `
    yy
    oo
    oo`, 0);
  return s.text();
}

/** Os quadros novos, pelo nome que o cliente usa; as âncoras: meio de baixo, salvo onde diz. */
export const LIFE_RECIPES: readonly Recipe[] = [
  ...['d', 'l', 'b'].map((k) => ({ name: `win-${k}`, grid: pane(k), anchor: { x: 0, y: 0 } })),
  ...Object.entries(tvPanes()).map(([name, grid]) => ({ name, grid, anchor: { x: 0, y: 0 } })),
  ...walkPanes().map((grid, i) => ({ name: `win-walk-${i}`, grid, anchor: { x: 0, y: 0 } })),
  ...fanFrames().map((grid, i) => ({ name: `fan-${i}`, grid, anchor: { x: 0, y: 0 } })),
  ...PUFFS.map((grid, i) => ({ name: `puff-${i}`, grid, anchor: { x: Math.floor(gridLines(grid)[0].length / 2), y: gridLines(grid).length } })),
  ...SPLASHES.map((grid, i) => ({ name: `splash-${i}`, grid })),
  ...RIPPLES.map((grid, i) => ({ name: `ripple-${i}`, grid, anchor: { x: Math.floor(gridLines(grid)[0].length / 2), y: 1 } })),
  ...KICKS.map((grid, i) => ({ name: `kick-${i}`, grid })),
  ...Object.entries(DRIPS).map(([name, grid]) => ({ name, grid, anchor: { x: 0, y: 0 } })),
  ...Object.entries(SHINES).map(([name, grid]) => ({ name, grid })),
  { name: 'sign-bar-flicker', grid: neonSign('BAR', 'x', { vertical: true, off: [2] }), anchor: { x: 0, y: 0 } },
  { name: 'sign-bar-off', grid: neonSign('BAR', 'x', { vertical: true, off: [0, 1, 2] }), anchor: { x: 0, y: 0 } },
  { name: 'sign-24h-flicker', grid: neonSign('24H', 'x', { off: [2] }), anchor: { x: 0, y: 0 } },
  { name: 'sign-24h-off', grid: neonSign('24H', 'x', { off: [0, 1, 2] }), anchor: { x: 0, y: 0 } },
  { name: 'plane', grid: PLANE, anchor: { x: 6, y: 2 } },
  { name: 'car', grid: CAR, anchor: { x: 10, y: 3 } },
  { name: 'chair', grid: CHAIR },
  { name: 'plant', grid: PLANT },
  { name: 'cardboard', grid: cardboard() },
  { name: 'skylight', grid: skylight() },
  { name: 'pipes', grid: pipes() },
  { name: 'dish', grid: DISH },
  { name: 'bowl', grid: BOWL },
  { name: 'laundry-0', grid: laundry(0), anchor: { x: 0, y: 0 } },
  { name: 'laundry-1', grid: laundry(1), anchor: { x: 0, y: 0 } },
];

/** Tudo o que vai na folha do telhado: os objetos de `rooftop.ts` e os quadros da vida. É o que `index.ts` passa a `rooftopSheet`. */
export const ROOFTOP_RECIPES: readonly Recipe[] = [...RECIPES, ...LIFE_RECIPES];
