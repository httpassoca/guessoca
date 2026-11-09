/**
 * A receita do Kratos: pixel art do dono do jogo, em `assets-src/kratos/kratos.gif` (fora do git como os outros pacotes).
 * Um personagem só (sem variantes de cor), numa folha com as mesmas linhas do herói e do esqueleto, e um atlas
 * (`kratos.json`).
 *
 * A arte é um GIF de 8 quadros de 64×64 com o personagem **girando parado** (frente, três quartos, lado, costas…): não
 * tem nenhuma animação do jogo. Então a receita usa só o quadro de lado olhando para a direita (`SIDE`) e desenha as sete
 * animações a partir dele, como o esqueleto faz com correr, pular e cair: o quadro é cortado na linha do quadril em
 * **tronco** (cabeça, braços, espada) e **pernas**; as pernas viram duas (a da frente, e a de trás escurecida, por baixo),
 * cada uma inclinada a partir do quadril e encolhida no joelho; o tronco inclina, sobe e desce. É um substituto até
 * existirem folhas desenhadas de verdade.
 *
 * Entra: `sheets.ROTATION`, a folha de uma linha que `readGifStrip` (`gif.ts`) monta com os quadros do GIF. Sai, por
 * `index.ts`: `apps/web/public/sprites/char-6.png` (o lugar do Kratos em `characters.ts`) e
 * `apps/web/src/lib/sprites/kratos.json`. Arte do dono: sem crédito (`credit: null`).
 *
 * Coordenadas: a célula de 64×64 é colada numa tela maior (`W × H`, com `PAD_X` de folga de cada lado e `PAD_Y` em cima),
 * para a estocada e o pulo não saírem da borda; todos os números abaixo são em pixels dessa tela, medidos olhando a arte.
 *
 * Como mudar:
 * - **Trocar uma animação desenhada por uma folha de verdade**: o dono põe a folha (PNG de uma linha ou GIF, células de
 *   64×64, olhando para a direita, o pé na linha 62 da célula e no mesmo x) em `assets-src/kratos/`; ela entra em `files`
 *   no `index.ts`, é fatiada como `sideView` faz, e a linha em `derive` passa a ser essas células. `frames` em
 *   `KRATOS_SPEC` vira o número de células.
 * - **Ajustar um movimento**: os números de cada pose estão nas funções `walk`, `run`, `jump`, `fall`, `shove`; confira
 *   em `bun run sprites:preview`.
 */
import { ANIMATION_NAMES, layout, type Atlas, type ModelSpec } from './atlas';
import { blank, blit, bounds, crop, shear, solidify, squashRows, stretchRows, translate, under, type Hex, type Image } from './image';

/** O lado de cada quadro do GIF, em pixels. */
export const CELL = 64;
/** O quadro do giro em que ele está de lado, olhando para a direita (o terceiro). */
export const SIDE = 2;
/** A folha que a receita usa (o GIF, como folha de uma linha). */
export const SHEETS = ['ROTATION'] as const;

/** A folga à esquerda e à direita da célula na tela de trabalho. */
export const PAD_X = 16;
/** A folga em cima. */
export const PAD_Y = 8;
/** A tela de trabalho. */
export const W = CELL + 2 * PAD_X;
export const H = CELL + PAD_Y;

/** A linha dos pés (a de baixo de tudo; 62 na célula): a âncora em y. */
export const FEET_Y = 62 + PAD_Y;
/** A linha do quadril (a barra do saiote; 47 na célula): acima é tronco, abaixo são pernas; o pivô de inclinar os dois. */
export const HIP_Y = 47 + PAD_Y;
/** A linha do joelho (50 na célula): encolher a perna tira linhas daqui para baixo. */
const KNEE_Y = 50 + PAD_Y;
/** Uma linha do peito (30 na célula): respirar tira esta linha e desce os ombros e a cabeça 1 pixel. */
const CHEST_Y = 30 + PAD_Y;
/** O alto da cabeça (linha 1 da célula). */
const TOP_Y = 1 + PAD_Y;
/** A mão e a espada: da coluna 34 da célula para a frente, nas linhas 38 a 45. */
const SWORD = { x: 34 + PAD_X, y: 38 + PAD_Y, h: 8 };
/** Quantas linhas do alto do quadro são cabeça (até o queixo, antes do ombro). */
const HEAD_ROWS = 15;

/** A cor do Kratos na interface (`--gs-char-6` no CSS): o cinza pálido da pele, que nenhum outro personagem usa. */
export const KRATOS_COLOR: Hex = 'cdbfb4';

/**
 * Quadros, fps e loop de cada linha; todos os quadros são desenhados aqui. O empurrão, 5 a 12 fps ≈ 417 ms, cabe em
 * `SHOVE_COOLDOWN_MS` (450 ms). A queda, 2 a 6 fps ≈ 333 ms, dura o `FALL_MS` do mundo.
 */
export const KRATOS_SPEC: ModelSpec = {
  animations: {
    idle: { frames: 4, fps: 4, loop: true },
    walk: { frames: 8, fps: 10, loop: true },
    run: { frames: 8, fps: 14, loop: true },
    jump: { frames: 4, fps: 12, loop: false },
    fall: { frames: 2, fps: 6, loop: false },
    fall_loop: { frames: 3, fps: 10, loop: true },
    shove: { frames: 5, fps: 12, loop: false },
  },
  credit: null,
};

/** O quadro de lado, sem semitransparência, colado na tela de trabalho. */
export function sideView(rotation: Image): Image {
  if (rotation.width < (SIDE + 1) * CELL) throw new Error(`o giro do Kratos tem menos de ${SIDE + 1} quadros`);
  const out = blank(W, H);
  blit(out, solidify(crop(rotation, SIDE * CELL, 0, CELL, CELL)), PAD_X, PAD_Y);
  return out;
}

/** Só as linhas de `from` a `to` (inclusive). */
function rows(img: Image, from: number, to: number): Image {
  const out = blank(img.width, img.height);
  blit(out, crop(img, 0, from, img.width, to - from + 1), 0, from);
  return out;
}

/** A mesma imagem mais escura (`f` de 0 a 1): a perna de trás, na sombra do corpo. */
export function darken(img: Image, f: number): Image {
  const out: Image = { ...img, data: img.data.slice() };
  for (let i = 0; i < out.data.length; i += 4) for (let c = 0; c < 3; c++) out.data[i + c] = Math.round(out.data[i + c] * f);
  return out;
}

/** Uma pose: quanto cada parte sai do lugar, em pixels (zero em tudo é o quadro de lado como veio). */
export interface Pose {
  /** o pé da frente: para a frente (+) ou para trás (−) */
  front?: number;
  /** o pé de trás (a perna escurecida, por baixo) */
  back?: number;
  /** quanto o pé da frente sobe (a perna encolhe no joelho) */
  liftFront?: number;
  /** quanto o pé de trás sobe */
  liftBack?: number;
  /** quanto o alto da cabeça vai para a frente (o tronco inclina a partir do quadril) */
  lean?: number;
  /** o tronco desce (+) ou sobe (−) */
  bob?: number;
  /** os ombros e a cabeça descem 1 pixel (soltar o ar) */
  breath?: boolean;
  /** a mão da espada estica para a frente */
  thrust?: number;
  /** o personagem todo anda para a frente (o passo da estocada) */
  dx?: number;
}

/** Quanto as pernas sobem por baixo do saiote, para o tronco poder subir 1 ou 2 pixels sem abrir um vão. */
const OVERLAP = 2;

/** Uma perna: inclinada a partir do quadril até o pé andar `d`, e encolhida `lift` no joelho. */
function leg(legs: Image, d: number, lift: number): Image {
  const swung = shear(legs, -d / (FEET_Y - HIP_Y), HIP_Y);
  return lift ? translate(squashRows(swung, KNEE_Y, lift), 0, -lift) : swung;
}

/** Desenha uma pose a partir do quadro de lado (na tela de trabalho). */
export function pose(side: Image, p: Pose = {}): Image {
  let body = rows(side, 0, HIP_Y);
  if (p.thrust) {
    // a mão e a espada andam `thrust`; o vão que fica é o antebraço esticado (a coluna logo atrás da mão, repetida)
    const sword = crop(body, SWORD.x, SWORD.y, W - SWORD.x, SWORD.h);
    const arm = crop(body, SWORD.x - 1, SWORD.y, 1, SWORD.h);
    for (let y = SWORD.y; y < SWORD.y + SWORD.h; y++) body.data.fill(0, (y * W + SWORD.x) * 4, (y + 1) * W * 4);
    blit(body, sword, SWORD.x + p.thrust, SWORD.y);
    for (let g = 0; g < p.thrust; g++) blit(body, arm, SWORD.x + g, SWORD.y);
  }
  if (p.breath) body = squashRows(body, CHEST_Y, 1);
  if (p.lean) body = shear(body, p.lean / (HIP_Y - TOP_Y), HIP_Y);
  const legs = rows(side, HIP_Y - OVERLAP, H - 1);
  const out = translate(body, 0, p.bob ?? 0);
  under(out, leg(legs, p.front ?? 0, p.liftFront ?? 0), 0, 0);
  under(out, darken(leg(legs, p.back ?? 0, p.liftBack ?? 0), 0.6), 0, 0);
  return p.dx ? translate(out, p.dx, 0) : out;
}

/** Parado: respirando, dois quadros com o ar dentro e dois com os ombros 1 pixel mais baixos. */
export function idle(side: Image): Image[] {
  return [pose(side), pose(side), pose(side, { breath: true }), pose(side, { breath: true })];
}

/**
 * Um ciclo de passo em 8 quadros: os pés vão e voltam `stride` pixels em sentidos opostos (um seno); o pé que está indo
 * para a frente sobe até `lift`; com as pernas abertas o tronco desce `bob`. `lean` inclina o tronco o ciclo todo.
 */
function cycle(side: Image, stride: number, lift: number, bob: number, lean: number): Image[] {
  return Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * 2 * Math.PI;
    const front = Math.round(stride * Math.sin(a)), up = Math.round(lift * Math.cos(a));
    return pose(side, {
      front, back: -front, lean,
      liftFront: Math.max(0, up), liftBack: Math.max(0, -up),
      bob: Math.abs(front) === stride ? bob : 0,
    });
  });
}

/** Andar: passo curto, o tronco reto. */
export const walk = (side: Image): Image[] => cycle(side, 4, 2, 1, 0);
/** Correr: passo largo, joelho alto, o tronco inclinado para a frente. */
export const run = (side: Image): Image[] => cycle(side, 7, 4, 1, 3);

/** Pular: agachado, esticado na saída, subindo com uma perna à frente, e com as duas encolhidas. */
export function jump(side: Image): Image[] {
  return [
    squashRows(pose(side, { lean: 1 }), KNEE_Y, 3),
    stretchRows(pose(side, { back: -2 }), KNEE_Y + 2, 2),
    pose(side, { front: 3, liftFront: 3, back: -3 }),
    pose(side, { front: 4, liftFront: 5, back: -2, liftBack: 2 }),
  ];
}

/** A queda (as pernas abrindo) e o seu loop (abertas, balançando). */
export function fall(side: Image): { fall: Image[]; loop: Image[] } {
  return {
    fall: [pose(side, { front: 3, liftFront: 2, back: -4 }), pose(side, { front: 5, back: -5, liftBack: 1 })],
    loop: [
      pose(side, { front: 5, back: -5 }),
      pose(side, { front: 6, back: -5, bob: -1 }),
      pose(side, { front: 5, back: -6, liftBack: 1 }),
    ],
  };
}

/**
 * O empurrão: recua o tronco, dá um passo e estoca com a espada, segura e volta. O pé de trás fica plantado (`back`
 * desfaz o `dx` do passo).
 */
export function shove(side: Image): Image[] {
  return [
    pose(side, { lean: -2, front: -1 }),
    pose(side, { lean: 3, dx: 2, front: 3, back: -2, thrust: 2 }),
    pose(side, { lean: 5, dx: 4, front: 3, back: -4, thrust: 4, bob: 1 }),
    pose(side, { lean: 5, dx: 4, front: 3, back: -4, thrust: 3, bob: 1 }),
    pose(side, { lean: 2, dx: 2, front: 1, back: -2, thrust: 1 }),
  ];
}

/** Todas as linhas da folha, na ordem do jogo, na tela de trabalho. */
export function derive(side: Image): Image[][] {
  const falling = fall(side);
  const all: Record<(typeof ANIMATION_NAMES)[number], Image[]> = {
    idle: idle(side), walk: walk(side), run: run(side), jump: jump(side),
    fall: falling.fall, fall_loop: falling.loop, shove: shove(side),
  };
  return ANIMATION_NAMES.map((name) => all[name]);
}

/** A cabeça, em pixels do quadro: um quadrado em volta das `HEAD_ROWS` linhas de cima do parado. */
export function kratosHead(idleFrame: Image): Atlas['head'] {
  const stand = bounds(idleFrame)!;
  const head = bounds(crop(idleFrame, 0, stand.y, idleFrame.width, HEAD_ROWS))!;
  const size = Math.max(head.w, head.h) + 2;
  const cx = head.x + head.w / 2, cy = stand.y + head.y + head.h / 2;
  return {
    x: Math.max(0, Math.min(idleFrame.width - size, Math.round(cx - size / 2))),
    y: Math.max(0, Math.min(idleFrame.height - size, Math.round(cy - size / 2))),
    size,
  };
}

/** O pé no parado: o meio das botas (as linhas do joelho para baixo), em x da tela (a âncora em x). */
function feetX(side: Image): number {
  const b = bounds(rows(side, KNEE_Y, FEET_Y))!;
  return b.x + b.w / 2;
}

/** Monta a folha (uma só: o Kratos não tem variantes) e o atlas a partir do giro (`sheets.ROTATION`). */
export function buildKratos(sheets: Readonly<Record<string, Image>>): { sheets: Image[]; atlas: Atlas } {
  if (!sheets.ROTATION) throw new Error('folha do Kratos faltando: ROTATION');
  const side = sideView(sheets.ROTATION);
  const { sheet, atlas } = layout(derive(side), KRATOS_SPEC, { anchorX: feetX(side), head: kratosHead });
  return { sheets: [sheet], atlas };
}


