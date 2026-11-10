/**
 * A receita do Vorcaro: o homem de terno, desenhado por um modelo de imagem a pedido do dono do jogo (as regras do pedido
 * estão em `docs/art.md`, "Art made by an image model"), em `assets-src/vorcaro/` (fora do git como os outros pacotes,
 * ADR 0007). Um personagem só, numa folha com as mesmas linhas do herói, e um atlas (`vorcaro.json`).
 *
 * A arte tem as sete animações, mas vem grande (células de 256×384, ele com uns 300 pixels de altura) e com os pés nem
 * sempre no mesmo lugar. **A receita não muda nenhum pixel da arte**: não encolhe, não recolore, não redesenha, não
 * tira quadro. Ela só **muda os quadros de lugar** (põe o ponto mais baixo de cada um na linha do chão, e anda o correr
 * para a frente) e recorta todos pelo mesmo retângulo (`layout`). A folha sai no tamanho da arte, e é o jogo que a
 * desenha menor: o atlas leva `scale` (`WORLD_SCALE`), quantas unidades do mundo vale um pixel do quadro.
 *
 * Entra: `assets-src/vorcaro/<animação>.png` (`idle.png`, `walk.png`, …; cada um uma linha de células de
 * `CELL_W × CELL_H`, ele olhando para a direita). Os números abaixo são em pixels da célula, medidos na arte. Sai, por
 * `index.ts`: `apps/web/public/sprites/char-8.png` e `apps/web/src/lib/sprites/vorcaro.json`.
 *
 * Como mudar:
 * - **Arte nova do mesmo personagem**: troque os PNG na pasta; se a célula mudar, `CELL_W`, `CELL_H` e `GROUND`; se os
 *   quadros mudarem, `frames` em `VORCARO_SPEC`. Confira com `bun run sprites:preview`.
 * - **Maior ou menor no jogo**: `WORLD_SCALE` (1/6 dá uns 50 de altura no mundo; o herói tem 37, o Kratos 62).
 * - **Um quadro fora do lugar**: uma entrada em `SHIFTS` (só anda para o lado; a arte não muda).
 * - **Outro personagem do mesmo pedido**: copie esta receita; quase tudo é medir a célula, o chão e os quadros tortos.
 */
import { ANIMATION_NAMES, layout, type AnimationName, type Atlas, type ModelSpec } from './atlas';
import { blank, blit, bounds, crop, type Hex, type Image } from './image';

/** Cada folha é uma linha de células deste tamanho, em pixels. */
export const CELL_W = 256;
/** A altura da célula (e da folha). */
export const CELL_H = 384;
/** As folhas que a receita usa: uma por animação, `<nome>.png`. */
export const SHEETS = ANIMATION_NAMES;

/** A linha do chão na célula: a primeira linha vazia embaixo dos sapatos no parado. Todo quadro é descido ou subido até ela. */
export const GROUND = 352;
/** Quantas unidades do mundo vale um pixel do quadro: o jogo desenha a folha 6 vezes menor que a arte. */
export const WORLD_SCALE = 1 / 6;
/** A folga à esquerda da célula na tela de trabalho (o correr anda para a frente). */
export const PAD_X = 28;
/** A tela de trabalho, em pixels da arte. */
export const W = PAD_X + CELL_W;
/** A altura dela: cabe o quadro mais alto (uns 305 pixels) com o pé no chão. */
export const H = 330;
/** O chão na tela de trabalho. */
const FLOOR = H;

/** A cor do Vorcaro na interface (`--gs-char-8` no CSS): o azul da gravata. */
export const VORCARO_COLOR: Hex = '6f8fc0';

/**
 * Quadros, fps e loop de cada linha: os do herói (o pedido da arte fixa esses números), com todos os quadros que a arte
 * tem. O empurrão, 7 a 16 fps ≈ 437 ms, cabe em `SHOVE_COOLDOWN_MS` (450 ms). A queda, 4 a 12 fps ≈ 333 ms, dura o
 * `FALL_MS` do mundo.
 */
export const VORCARO_SPEC: ModelSpec = {
  animations: {
    idle: { frames: 10, fps: 10, loop: true },
    walk: { frames: 10, fps: 12, loop: true },
    run: { frames: 10, fps: 14, loop: true },
    jump: { frames: 6, fps: 12, loop: false },
    fall: { frames: 4, fps: 12, loop: false },
    fall_loop: { frames: 3, fps: 10, loop: true },
    shove: { frames: 7, fps: 16, loop: false },
  },
  credit: null,
};

/**
 * Quantos pixels da arte cada animação anda para a frente, medido olhando a arte: no correr o corpo veio todo atrás da
 * cabeça (os pés 24 pixels atrás dos do parado). Só muda o lugar; os pixels são os da arte.
 */
export const SHIFTS: Partial<Record<AnimationName, number>> = { run: 24 };

/** As células de uma folha, da esquerda para a direita, como vieram. */
export function cellsOf(sheet: Image): Image[] {
  return Array.from({ length: Math.floor(sheet.width / CELL_W) }, (_, i) => crop(sheet, i * CELL_W, 0, CELL_W, CELL_H));
}

/**
 * Uma célula na tela de trabalho, `dx` pixels para a frente e com o ponto mais baixo no chão (`FLOOR`). No ar (pulo,
 * queda) isso põe o sapato onde o corpo do jogo está, em vez de boiar na altura em que a arte o desenhou.
 */
export function place(cell: Image, dx = 0): Image {
  const b = bounds(cell);
  const out = blank(W, H);
  if (b) blit(out, cell, PAD_X + dx, FLOOR - (b.y + b.h));
  return out;
}

/** Os quadros de cada animação, na ordem de `ANIMATION_NAMES`: os da arte, só mudados de lugar. */
export function derive(sheets: Readonly<Record<string, Image>>): Image[][] {
  return ANIMATION_NAMES.map((name) => {
    const sheet = sheets[name];
    if (!sheet) throw new Error(`folha do Vorcaro faltando: ${name}`);
    const cells = cellsOf(sheet);
    const want = VORCARO_SPEC.animations[name].frames;
    if (cells.length < want) throw new Error(`${name}: a folha do Vorcaro tem ${cells.length} quadros, esperava ${want}`);
    return cells.slice(0, want).map((c) => place(c, SHIFTS[name] ?? 0));
  });
}

/** Quantas linhas de baixo do parado são sola de sapato. */
const FEET_ROWS = 12;

/** O meio dos sapatos no parado: o meio das linhas de baixo. */
export function feetX(idle: Image): number {
  const b = bounds(idle)!;
  const f = bounds(crop(idle, 0, b.y + b.h - FEET_ROWS, idle.width, FEET_ROWS))!;
  return f.x + f.w / 2;
}

/** Quantas linhas do alto do parado são cabeça (do cabelo ao queixo). */
const HEAD_ROWS = 84;

/** O quadrado da cabeça: do alto do parado, centrado no que há nas linhas da cabeça. */
export function vorcaroHead(idle: Image): Atlas['head'] {
  const b = bounds(idle)!;
  const h = bounds(crop(idle, 0, b.y, idle.width, HEAD_ROWS))!;
  const size = HEAD_ROWS + 12;
  return { x: Math.round(h.x + h.w / 2 - size / 2), y: Math.max(0, b.y - 6), size };
}

/** A folha e o atlas do Vorcaro a partir das sete folhas do pacote. */
export function buildVorcaro(sheets: Readonly<Record<string, Image>>): { sheets: Image[]; atlas: Atlas } {
  const rows = derive(sheets);
  const { sheet, atlas } = layout(rows, VORCARO_SPEC, { anchorX: feetX(rows[0][0]), head: vorcaroHead });
  return { sheets: [sheet], atlas: { ...atlas, scale: WORLD_SCALE } };
}
