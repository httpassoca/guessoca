/**
 * A receita do Vorcaro: o homem de terno, desenhado por um modelo de imagem a pedido do dono do jogo (as regras do pedido
 * estão em `docs/art.md`, "Art made by an image model"), em `assets-src/vorcaro/` (fora do git como os outros pacotes, ADR 0007).
 * Um personagem só, numa folha com as mesmas linhas do herói, e um atlas (`vorcaro.json`).
 *
 * A arte tem as sete animações, mas não é pixel art de verdade: vem grande (células de 256×384, ele com uns 300 pixels
 * de altura, dezenas de milhares de cores) e com os pés nem sempre no mesmo lugar. A receita não desenha nada; ela
 * **arruma e encolhe**: põe o ponto mais baixo de cada quadro na linha do chão, conserta os quadros que vieram fora do
 * lugar ou do tamanho (`FIXES`) e encolhe tudo `SCALE` vezes, um pixel por bloco, com a cor que mais aparece no bloco.
 *
 * Entra: `assets-src/vorcaro/<animação>.png` (`idle.png`, `walk.png`, …; cada um uma linha de células de
 * `CELL_W × CELL_H`, ele olhando para a direita). Os números abaixo são em pixels da célula, medidos na arte. Sai, por
 * `index.ts`: `apps/web/public/sprites/char-8.png` e `apps/web/src/lib/sprites/vorcaro.json`.
 *
 * Como mudar:
 * - **Arte nova do mesmo personagem**: troque os PNG na pasta; se a célula mudar, `CELL_W`, `CELL_H` e `GROUND`; se os
 *   quadros mudarem, `frames` em `VORCARO_SPEC` e `USE`. Confira com `bun run sprites:preview`.
 * - **Maior ou menor no jogo**: `SCALE` (6 dá uns 50 pixels de altura; o herói tem 37, o Kratos 62).
 * - **Um quadro torto**: uma entrada em `FIXES` (andar para o lado, ou crescer).
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
/** Quantos pixels da arte viram um pixel do jogo. */
export const SCALE = 6;
/** A folga à esquerda da célula na tela de trabalho (o correr anda para a frente, o empurrão estica o braço). */
export const PAD_X = 28;
/** A tela de trabalho, em pixels da arte: múltiplos de `SCALE`, com o chão caindo numa divisa de bloco. */
export const W = Math.ceil((PAD_X + CELL_W) / SCALE) * SCALE;
/** A altura dela: cabe o quadro mais alto (uns 305 pixels, e o que cresce) com o pé no chão. */
export const H = Math.ceil(330 / SCALE) * SCALE;
/** O chão na tela de trabalho. */
const FLOOR = H;

/** A cor do Vorcaro na interface (`--gs-char-8` no CSS): o azul da gravata. */
export const VORCARO_COLOR: Hex = '6f8fc0';

/**
 * Quadros, fps e loop de cada linha: os do herói (o pedido da arte fixa esses números), menos um quadro no parado e no
 * andar, porque o décimo de cada um veio igual ao primeiro e travaria a volta. O empurrão, 7 a 16 fps ≈ 437 ms, cabe em
 * `SHOVE_COOLDOWN_MS` (450 ms). A queda, 4 a 12 fps ≈ 333 ms, dura o `FALL_MS` do mundo.
 */
export const VORCARO_SPEC: ModelSpec = {
  animations: {
    idle: { frames: 9, fps: 10, loop: true },
    walk: { frames: 9, fps: 12, loop: true },
    run: { frames: 10, fps: 14, loop: true },
    jump: { frames: 6, fps: 12, loop: false },
    fall: { frames: 4, fps: 12, loop: false },
    fall_loop: { frames: 3, fps: 10, loop: true },
    shove: { frames: 7, fps: 16, loop: false },
  },
  credit: null,
};

/** Um conserto de quadro: andar `dx` pixels da arte para a frente, e/ou crescer `grow` vezes a partir do chão e do nariz. */
export interface Fix { dx?: number; grow?: number }

/**
 * Os consertos, por animação e por quadro (`all` vale para todos os quadros dela), medidos olhando a arte:
 * - no correr o corpo veio todo atrás da cabeça (os pés 24 pixels atrás dos do parado): anda para a frente;
 * - o quinto quadro do correr veio menor que os outros (250 de altura contra 305): cresce.
 */
export const FIXES: Partial<Record<AnimationName, { all?: Fix; frames?: Record<number, Fix> }>> = {
  run: { all: { dx: 24 }, frames: { 4: { grow: 1.16 } } },
};

/** As células de uma folha, da esquerda para a direita, com alfa de tudo ou nada (metade para cima é opaco). */
export function cellsOf(sheet: Image): Image[] {
  return Array.from({ length: Math.floor(sheet.width / CELL_W) }, (_, i) => {
    const c = crop(sheet, i * CELL_W, 0, CELL_W, CELL_H);
    for (let p = 3; p < c.data.length; p += 4) c.data[p] = c.data[p] >= 128 ? 255 : 0;
    return c;
  });
}

/** A imagem `k` vezes maior (vizinho mais próximo), no mesmo tamanho de tela, com o ponto `(ox, oy)` parado. */
export function grow(img: Image, k: number, ox: number, oy: number): Image {
  const out = blank(img.width, img.height);
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    const sx = Math.floor(ox + (x + 0.5 - ox) / k), sy = Math.floor(oy + (y + 0.5 - oy) / k);
    if (sx < 0 || sy < 0 || sx >= img.width || sy >= img.height) continue;
    const s = (sy * img.width + sx) * 4;
    out.data.set(img.data.subarray(s, s + 4), (y * img.width + x) * 4);
  }
  return out;
}

/**
 * Uma célula na tela de trabalho: consertada, e com o ponto mais baixo no chão (`FLOOR`). No ar (pulo, queda) isso põe
 * o sapato onde o corpo do jogo está, em vez de boiar na altura em que a arte o desenhou.
 */
export function place(cell: Image, fix: Fix = {}): Image {
  const b = bounds(cell);
  const out = blank(W, H);
  if (!b) return out;
  blit(out, cell, PAD_X + (fix.dx ?? 0), FLOOR - (b.y + b.h));
  return fix.grow ? grow(out, fix.grow, PAD_X + (fix.dx ?? 0) + b.x + b.w, FLOOR) : out;
}

/**
 * Encolhe `n` vezes: cada bloco de `n × n` vira um pixel, opaco se metade do bloco é; a cor é a média da cor que mais
 * aparece no bloco (as cores agrupadas de 32 em 32 por canal), não a média de tudo, para o contorno escuro e a luz não
 * virarem um cinza no meio.
 */
export function shrink(img: Image, n: number): Image {
  const out = blank(Math.floor(img.width / n), Math.floor(img.height / n));
  for (let y = 0; y < out.height; y++) for (let x = 0; x < out.width; x++) {
    const groups = new Map<number, [number, number, number, number]>();
    let solid = 0;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const p = ((y * n + j) * img.width + x * n + i) * 4;
      if (!img.data[p + 3]) continue;
      solid++;
      const key = (img.data[p] >> 5) << 6 | (img.data[p + 1] >> 5) << 3 | (img.data[p + 2] >> 5);
      const g = groups.get(key) ?? [0, 0, 0, 0];
      g[0] += img.data[p]; g[1] += img.data[p + 1]; g[2] += img.data[p + 2]; g[3]++;
      groups.set(key, g);
    }
    if (solid * 2 < n * n) continue;
    let best: [number, number, number, number] = [0, 0, 0, 0];
    for (const g of groups.values()) if (g[3] > best[3]) best = g;
    out.data.set([Math.round(best[0] / best[3]), Math.round(best[1] / best[3]), Math.round(best[2] / best[3]), 255], (y * out.width + x) * 4);
  }
  return out;
}

/** Os quadros de cada animação, na ordem de `ANIMATION_NAMES`, já no tamanho do jogo. */
export function derive(sheets: Readonly<Record<string, Image>>): Image[][] {
  return ANIMATION_NAMES.map((name) => {
    const sheet = sheets[name];
    if (!sheet) throw new Error(`folha do Vorcaro faltando: ${name}`);
    const cells = cellsOf(sheet);
    const want = VORCARO_SPEC.animations[name].frames;
    if (cells.length < want) throw new Error(`${name}: a folha do Vorcaro tem ${cells.length} quadros, esperava ${want}`);
    const fix = FIXES[name];
    return cells.slice(0, want).map((c, i) => shrink(place(c, { ...fix?.all, ...fix?.frames?.[i] }), SCALE));
  });
}

/** O meio dos sapatos no parado: o meio das duas linhas de baixo. */
export function feetX(idle: Image): number {
  const b = bounds(idle)!;
  const f = bounds(crop(idle, 0, b.y + b.h - 2, idle.width, 2))!;
  return f.x + f.w / 2;
}

/** Quantas linhas do alto do parado são cabeça (do cabelo ao queixo). */
const HEAD_ROWS = 14;

/** O quadrado da cabeça: do alto do parado, centrado no que há nas linhas da cabeça. */
export function vorcaroHead(idle: Image): Atlas['head'] {
  const b = bounds(idle)!;
  const h = bounds(crop(idle, 0, b.y, idle.width, HEAD_ROWS))!;
  const size = HEAD_ROWS + 2;
  return { x: Math.round(h.x + h.w / 2 - size / 2), y: Math.max(0, b.y - 1), size };
}

/** A folha e o atlas do Vorcaro a partir das sete folhas do pacote. */
export function buildVorcaro(sheets: Readonly<Record<string, Image>>): { sheets: Image[]; atlas: Atlas } {
  const rows = derive(sheets);
  const { sheet, atlas } = layout(rows, VORCARO_SPEC, { anchorX: feetX(rows[0][0]), head: vorcaroHead });
  return { sheets: [sheet], atlas };
}
