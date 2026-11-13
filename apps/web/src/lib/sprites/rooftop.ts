/**
 * O telhado desenhado a partir da folha gerada por `bun run sprites` (issue #6, ADR 0007): onde está cada objeto na
 * folha, a âncora dele, quais repetem, e as faixas da cidade ao fundo. Puro, para o mundo (Pixi) e para os testes.
 *
 * Entrada: `rooftop.json` ao lado, escrito por `tools/sprites/src/index.ts` a partir de `tools/sprites/src/rooftop.ts`
 * (os quadros), `life.ts` (a vida no telhado) e `skyline.ts` (as faixas); não editar à mão. As folhas ficam em `apps/web/public/sprites/`. Quem lê:
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
  /**
   * fachada: onde ficam as janelas, em pixels do quadro (a primeira em `x, y`, cada uma `w`×`h`, uma a cada `bay`
   * colunas e `floor` linhas) e o desenho de cada uma (`plan`, uma linha por andar: `d` apagada, `l` acesa, `b`
   * persiana, `t` televisão, `.` parede). As janelas vivas (`world/windows.ts`) se põem por cima delas.
   */
  windows?: { x: number; y: number; w: number; h: number; bay: number; floor: number; plan: string[] };
}

/**
 * Uma janela da cidade ao fundo que pisca (`world/skylife.ts`): onde está na faixa (pixels dela), se nasceu acesa, e as
 * cores acesa e apagada (`rrggbb`).
 */
export interface Twinkle { x: number; y: number; w: number; h: number; lit: boolean; on: string; off: string }

/** Uma faixa da cidade ao fundo: a camada (`far` ou `near`), o arquivo em `/sprites/`, o tamanho em pixels e as janelas que piscam. */
export interface SkylineStrip { name: string; layer: string; file: string; w: number; h: number; twinkle: Twinkle[] }

/** O atlas do telhado (`rooftop.json`): os quadros por nome e as faixas da cidade. */
export const ROOFTOP: { frames: Record<string, RooftopFrame>; skylines: SkylineStrip[] } = atlas;

/** O endereço da folha do telhado. */
export const rooftopSheet = '/sprites/rooftop.png';
/** O endereço de uma faixa da cidade. */
export const skylineUrl = (s: SkylineStrip) => `/sprites/${s.file}`;
