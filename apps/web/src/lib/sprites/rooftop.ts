/**
 * O telhado desenhado a partir da folha gerada por `bun run sprites` (issue #6, ADR 0007): onde está cada objeto na
 * folha, a âncora dele, quais repetem, e as faixas da cidade ao fundo. Puro, para o mundo (Pixi) e para os testes.
 *
 * Entrada: `rooftop.json` ao lado, escrito por `tools/sprites/src/index.ts` a partir de `tools/sprites/src/rooftop.ts`
 * (os quadros) e `skyline.ts` (as faixas); não editar à mão. As folhas ficam em `apps/web/public/sprites/`. Quem lê:
 * `world/art.ts` (as texturas), `world/dressing.ts` e `world/platforms.ts` (onde vão), `panels/Ledge.svelte`.
 * Coordenadas: pixels da folha; 1 pixel da folha = 1 unidade do mundo.
 */
import atlas from './rooftop.json';

/** Um objeto na folha do telhado: o retângulo em pixels da folha. */
export interface RooftopFrame {
  x: number; y: number; w: number; h: number;
  /** o ponto do quadro (pixels do quadro) que vai no lugar do objeto no mundo; sem âncora na receita, o meio de baixo */
  anchor: { x: number; y: number };
  /** textura que repete; o ladrilho é o quadro inteiro */
  tile?: boolean;
  /**
   * objeto de caixa: as linhas de baixo que são a frente (a altura da caixa, `top` − telhado); as de cima são o tampo
   * (`round(fundo · DEPTH_K)`). `boxLooks` em `world/dressing.ts` casa a caixa do `MAP` com o quadro por esses números.
   */
  face?: number;
}

/** Uma faixa da cidade ao fundo: a camada (`far` ou `near`), o arquivo em `/sprites/` e o tamanho em pixels. */
export interface SkylineStrip { name: string; layer: string; file: string; w: number; h: number }

/** O atlas do telhado (`rooftop.json`): os quadros por nome e as faixas da cidade. */
export const ROOFTOP: { frames: Record<string, RooftopFrame>; skylines: SkylineStrip[] } = atlas;

/** O endereço da folha do telhado. */
export const rooftopSheet = '/sprites/rooftop.png';
/** O endereço de uma faixa da cidade. */
export const skylineUrl = (s: SkylineStrip) => `/sprites/${s.file}`;
