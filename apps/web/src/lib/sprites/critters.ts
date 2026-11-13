/**
 * Os bichos do telhado (issue #71) como o cliente os lê: `critters.json` ao lado, escrito por `bun run sprites` a partir
 * de `tools/sprites/src/critters.ts` (não editar à mão). Duas folhas em `/sprites/`: `cats.png` (os gatos e o miau) e
 * `birds.png` (o pombo e o corvo, parados e voando). Cada tira é uma animação de um bicho, quadros lado a lado; a âncora
 * fica entre os pés, no chão, em pixels do quadro (1 pixel = 1 unidade do mundo). Puro.
 */
import atlas from './critters.json';

/** Uma tira: o retângulo do primeiro quadro na folha, quantos quadros, fps, se dá a volta, e a âncora. */
export interface Strip { x: number; y: number; w: number; h: number; frames: number; fps: number; loop: boolean; anchor: { x: number; y: number } }

export interface CrittersAtlas {
  cats: { sheet: string; names: string[]; strips: Record<string, Strip> };
  /** o pacote dos pássaros pede crédito (carysaurus), mostrado junto do da Ozzbit (`credit.birds`) */
  birds: { sheet: string; credit: string; names: string[]; strips: Record<string, Strip> };
}

export const CRITTERS: CrittersAtlas = atlas;

/** O quadro da tira `ms` depois de ela começar: dá a volta se `loop`, senão fica no último. */
export function stripFrame(s: Pick<Strip, 'frames' | 'fps' | 'loop'>, ms: number): number {
  const i = Math.floor((Math.max(0, ms) * s.fps) / 1000);
  return s.loop ? i % s.frames : Math.min(i, s.frames - 1);
}
