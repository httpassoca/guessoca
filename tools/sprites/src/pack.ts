/**
 * A receita comum dos personagens que chegam **prontos, em sete folhas**: a arte que o dono pede a um modelo de imagem
 * (o pedido está em `docs/art.md`, "Art made by an image model"), uma folha por animação (`idle.png`, `walk.png`,
 * `run.png`, `jump.png`, `fall.png`, `fall_loop.png`, `shove.png`), cada uma uma linha de células iguais, o personagem
 * olhando para a direita. O Kratos (`kratos.ts`), o Vorcaro (`vorcaro.ts`) e o Orelha (`orelha.ts`) são só os números de cada um (`PackConfig`).
 *
 * A regra: **a receita não muda nenhum pixel da arte**. Não encolhe, não recolore, não redesenha, não aumenta um quadro,
 * não tira quadro. Ela só **muda quadros inteiros de lugar** (o ponto mais baixo de cada um vai para a linha do chão; uma
 * animação pode andar para a frente, `shifts`) e recorta todos pelo mesmo retângulo (`layout`). A folha sai no tamanho
 * da arte, e é o jogo que a desenha menor: o atlas leva `scale` (`worldScale`), unidades do mundo por pixel do quadro
 * (`artScale` no cliente). Se um quadro veio errado (menor, repetido, torto), avise o dono e peça arte nova.
 *
 * Coordenadas: pixels da célula do pacote; a tela de trabalho tem `padX` de folga de cada lado e o chão na última linha.
 *
 * Como mudar:
 * - **Personagem novo**: um arquivo como `vorcaro.ts` com um `PackConfig` (meça a célula e as linhas da cabeça na arte;
 *   o pacote traz um `sheet.json` com a célula e os quadros), e os passos de `docs/art.md`.
 * - **Arte nova de um que já existe**: troque os PNG na pasta dele em `assets-src/`; se a célula ou os quadros mudarem,
 *   os números no `PackConfig` dele.
 */
import { ANIMATION_NAMES, layout, type AnimationName, type Atlas, type ModelSpec } from './atlas';
import { blank, blit, bounds, crop, type Image } from './image';

/** As folhas de um pacote: uma por animação, `<nome>.png`. */
export const SHEETS = ANIMATION_NAMES;

/**
 * Quadros, fps e loop que o pedido da arte fixa: os do herói. O empurrão, 7 a 16 fps ≈ 437 ms, cabe em
 * `SHOVE_COOLDOWN_MS` (450 ms). A queda, 4 a 12 fps ≈ 333 ms, dura o `FALL_MS` do mundo.
 */
export const PACK_SPEC: ModelSpec = {
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

/** Os números de um personagem de sete folhas, em pixels da célula, medidos na arte. */
export interface PackConfig {
  /** o nome nas mensagens de erro */
  name: string;
  /** o tamanho de cada célula das folhas */
  cellW: number;
  cellH: number;
  /** a folga de cada lado na tela de trabalho: pelo menos o maior `shifts` */
  padX: number;
  /** quantos pixels uma animação anda para a frente (os pés vieram atrás dos do parado); só muda o lugar */
  shifts: Partial<Record<AnimationName, number>>;
  /** quadros, fps, loop e crédito; `PACK_SPEC` se a arte seguiu o pedido */
  spec: ModelSpec;
  /** unidades do mundo por pixel do quadro: a altura que ele deve ter no jogo ÷ a altura na arte */
  worldScale: number;
  /** quantas linhas do alto do parado são cabeça (do alto ao queixo): o que há nelas dá o meio do rosto */
  headRows: number;
  /** o lado do quadrado do rosto, se não for `headRows` mais um sétimo (um bicho de quatro patas, com a cabeça na frente) */
  headSize?: number;
  /** quantas linhas de baixo do parado são sola (para achar o meio dos pés) */
  feetRows: number;
}

/** As células de uma folha, da esquerda para a direita, como vieram. */
export function cellsOf(sheet: Image, c: PackConfig): Image[] {
  return Array.from({ length: Math.floor(sheet.width / c.cellW) }, (_, i) => crop(sheet, i * c.cellW, 0, c.cellW, c.cellH));
}

/**
 * Uma célula na tela de trabalho, `dx` pixels para a frente e com o ponto mais baixo na última linha (o chão). No ar
 * (pulo, queda) isso põe o pé onde o corpo do jogo está, em vez de boiar na altura em que a arte o desenhou.
 */
export function place(cell: Image, c: PackConfig, dx = 0): Image {
  const b = bounds(cell);
  const out = blank(c.cellW + 2 * c.padX, c.cellH);
  if (b) blit(out, cell, c.padX + dx, c.cellH - (b.y + b.h));
  return out;
}

/** Os quadros de cada animação, na ordem de `ANIMATION_NAMES`: os da arte, só mudados de lugar. */
export function derive(sheets: Readonly<Record<string, Image>>, c: PackConfig): Image[][] {
  return ANIMATION_NAMES.map((name) => {
    const sheet = sheets[name];
    if (!sheet) throw new Error(`folha de ${c.name} faltando: ${name}`);
    const cells = cellsOf(sheet, c);
    const want = c.spec.animations[name].frames;
    if (cells.length < want) throw new Error(`${name}: a folha de ${c.name} tem ${cells.length} quadros, esperava ${want}`);
    return cells.slice(0, want).map((cell) => place(cell, c, c.shifts[name] ?? 0));
  });
}

/** O meio dos pés no parado: o meio das `rows` linhas de baixo. */
export function feetX(idle: Image, rows: number): number {
  const b = bounds(idle)!;
  const f = bounds(crop(idle, 0, b.y + b.h - rows, idle.width, rows))!;
  return f.x + f.w / 2;
}

/** O quadrado da cabeça: do alto do parado, centrado no que há nas `rows` linhas da cabeça, com um sétimo de folga (ou de lado `side`). */
export function headBox(idle: Image, rows: number, side?: number): Atlas['head'] {
  const b = bounds(idle)!;
  const h = bounds(crop(idle, 0, b.y, idle.width, rows))!;
  const pad = Math.round(rows / 7);
  const size = side ?? rows + pad;
  return { x: Math.round(h.x + h.w / 2 - size / 2), y: Math.max(0, b.y - Math.floor(pad / 2)), size };
}

/** A folha (no tamanho da arte) e o atlas (com `scale`) de um personagem de sete folhas. */
export function buildPack(sheets: Readonly<Record<string, Image>>, c: PackConfig): { sheets: Image[]; atlas: Atlas } {
  const rows = derive(sheets, c);
  const { sheet, atlas } = layout(rows, c.spec, { anchorX: feetX(rows[0][0], c.feetRows), head: (idle) => headBox(idle, c.headRows, c.headSize) });
  return { sheets: [sheet], atlas: { ...atlas, scale: c.worldScale } };
}
