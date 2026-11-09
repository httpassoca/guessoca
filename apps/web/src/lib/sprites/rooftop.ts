/**
 * O telhado desenhado a partir da folha gerada por `bun run sprites` (issue #6, ADR 0007): onde está cada objeto na
 * folha, a âncora dele, quais repetem, e as faixas da cidade ao fundo. Puro, para o mundo (Pixi) e para os testes.
 */
import atlas from './rooftop.json';

export interface RooftopFrame {
  x: number; y: number; w: number; h: number;
  /** o ponto do quadro que vai no lugar do objeto no mundo */
  anchor: { x: number; y: number };
  /** textura que repete; o ladrilho é o quadro inteiro */
  tile?: boolean;
  /** objeto de caixa: as linhas de baixo que são a frente (a altura da caixa); as de cima são o tampo */
  face?: number;
}

export interface SkylineStrip { name: string; layer: string; file: string; w: number; h: number }

export const ROOFTOP: { frames: Record<string, RooftopFrame>; skylines: SkylineStrip[] } = atlas;

export const rooftopSheet = '/sprites/rooftop.png';
export const skylineUrl = (s: SkylineStrip) => `/sprites/${s.file}`;
