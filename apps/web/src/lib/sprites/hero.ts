/**
 * O personagem desenhado a partir das folhas geradas por `bun run sprites` (ADR 0007): onde está cada quadro, a cabeça e
 * a cor de cada cabelo. Puro, para os componentes e para o mundo (Pixi) lerem do mesmo lugar.
 */
import atlas from './hero.json';

export type AnimationName = keyof typeof atlas.animations;
export const HERO = atlas;

/** O endereço da folha do personagem `n` (0..7). */
export const heroSheet = (n: number) => `/sprites/hero-${n}.png`;

/** A cor do cabelo do personagem `n`, para bordas e marcas na interface. */
export const heroColor = (n: number) => atlas.hairs[n]?.color ?? '#888';

/** O canto do quadro `frame` da animação `name` na folha, em pixels da folha. */
export function frameAt(name: AnimationName, frame: number): { x: number; y: number } {
  const a = atlas.animations[name];
  const i = a.loop ? ((frame % a.frames) + a.frames) % a.frames : Math.max(0, Math.min(a.frames - 1, frame));
  return { x: i * atlas.frame.w, y: a.row * atlas.frame.h };
}

/** A folha inteira, em pixels. */
export const sheetSize = {
  w: Math.max(...Object.values(atlas.animations).map((a) => a.frames)) * atlas.frame.w,
  h: Object.keys(atlas.animations).length * atlas.frame.h,
};

/** O índice do quadro da animação `name` depois de `elapsed` ms nela, no fps da folha: em loop dá a volta, sem loop para no último. */
export function frameIndex(name: AnimationName, elapsed: number): number {
  const a = atlas.animations[name];
  const n = Math.floor((Math.max(0, elapsed) * a.fps) / 1000);
  return a.loop ? n % a.frames : Math.min(a.frames - 1, n);
}
