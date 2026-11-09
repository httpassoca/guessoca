/**
 * O que os dois modelos de personagem (o herói e o esqueleto) têm em comum: as animações que o jogo usa, na ordem das
 * linhas da folha, e a montagem da folha e do atlas a partir dos quadros de cada animação. Puro, sem disco.
 */
import { blank, blit, bounds, crop, type Image } from './image';

/** As animações do jogo, na ordem das linhas da folha (o mundo, `@guess/world`, escolhe entre elas). */
export const ANIMATION_NAMES = ['idle', 'walk', 'run', 'jump', 'fall', 'fall_loop', 'shove'] as const;
export type AnimationName = (typeof ANIMATION_NAMES)[number];

export interface Box { x: number; y: number; w: number; h: number }

export interface Atlas {
  /** tamanho de cada quadro na folha */
  frame: { w: number; h: number };
  /** o ponto do quadro que fica no chão, entre os pés (o personagem é desenhado a partir dele) */
  anchor: { x: number; y: number };
  /** um quadrado em volta da cabeça no primeiro quadro do parado: o rosto do personagem na interface */
  head: { x: number; y: number; size: number };
  /** o retângulo do primeiro quadro do parado: o personagem inteiro na interface, sem o espaço do golpe e do pulo */
  stand: Box;
  /** uma linha da folha por animação */
  animations: Record<AnimationName, { row: number; frames: number; fps: number; loop: boolean }>;
  /** a quem dar o crédito da arte, ou null se não precisa */
  credit: string | null;
}

/** O que cada modelo decide: quantos quadros, a que velocidade, se dá a volta, e o crédito. */
export interface ModelSpec {
  animations: Record<AnimationName, { frames: number; fps: number; loop: boolean }>;
  credit: string | null;
}

/**
 * Monta a folha: `rows[i]` são os quadros da animação `ANIMATION_NAMES[i]`, todos do mesmo tamanho. Todos são
 * recortados pelo mesmo retângulo, o menor que contém todos, então o personagem não pula entre animações. A âncora fica
 * em `anchorX` (na coordenada dos quadros de entrada) e na linha de baixo do primeiro quadro do parado; `head` acha a
 * cabeça no parado já recortado.
 */
export function layout(
  rows: readonly (readonly Image[])[],
  spec: ModelSpec,
  opts: { anchorX: number; head: (idle: Image) => Atlas['head'] },
): { sheet: Image; atlas: Atlas } {
  ANIMATION_NAMES.forEach((name, i) => {
    if (rows[i]?.length !== spec.animations[name].frames) throw new Error(`${name}: ${rows[i]?.length ?? 0} quadros, esperava ${spec.animations[name].frames}`);
  });
  let minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
  for (const f of rows.flat()) {
    const b = bounds(f);
    if (!b) continue;
    minX = Math.min(minX, b.x); minY = Math.min(minY, b.y); maxX = Math.max(maxX, b.x + b.w); maxY = Math.max(maxY, b.y + b.h);
  }
  const w = maxX - minX, h = maxY - minY;
  const idle = bounds(rows[0][0])!;
  const anchor = { x: Math.round(opts.anchorX) - minX, y: idle.y + idle.h - minY };

  const cols = Math.max(...rows.map((r) => r.length));
  const sheet = blank(cols * w, rows.length * h);
  rows.forEach((frames, row) => frames.forEach((f, col) => blit(sheet, crop(f, minX, minY, w, h), col * w, row * h)));

  const atlas: Atlas = {
    frame: { w, h },
    anchor,
    head: opts.head(crop(rows[0][0], minX, minY, w, h)),
    stand: { x: idle.x - minX, y: idle.y - minY, w: idle.w, h: idle.h },
    animations: Object.fromEntries(ANIMATION_NAMES.map((name, row) => [name, { row, ...spec.animations[name] }])) as Atlas['animations'],
    credit: spec.credit,
  };
  return { sheet, atlas };
}
