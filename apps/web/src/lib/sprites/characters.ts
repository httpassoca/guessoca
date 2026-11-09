/**
 * Os personagens desenhados a partir das folhas geradas por `bun run sprites` (ADR 0007): `characters.json` diz de que
 * modelo é cada um (0–3 o herói, 4–7 o esqueleto), a cor e a folha; cada modelo tem o seu atlas (`hero.json`,
 * `skeleton.json`) com o tamanho do quadro, a âncora, a cabeça e as animações. Puro, para os componentes e para o mundo
 * (Pixi) lerem do mesmo lugar.
 */
import type { Anim } from '@guess/world';
import list from './characters.json';
import hero from './hero.json';
import skeleton from './skeleton.json';

export type AnimationName = Anim;
export type Model = 'hero' | 'skeleton';

/** O atlas de um modelo, como `tools/sprites` escreve (`Atlas` em `tools/sprites/src/atlas.ts`). */
export interface Atlas {
  frame: { w: number; h: number };
  /** o ponto do quadro que fica no chão, entre os pés */
  anchor: { x: number; y: number };
  /** o quadrado da cabeça no primeiro quadro do parado */
  head: { x: number; y: number; size: number };
  /** o retângulo do primeiro quadro do parado */
  stand: { x: number; y: number; w: number; h: number };
  animations: Record<AnimationName, { row: number; frames: number; fps: number; loop: boolean }>;
  credit: string | null;
}

const ATLASES: Record<Model, Atlas> = { hero, skeleton };

export interface CharacterArt {
  model: Model;
  /** o nome da cor do cabelo ou da capa */
  name: string;
  /** a cor do personagem, para bordas e marcas na interface */
  color: string;
  /** o endereço da folha */
  sheet: string;
  atlas: Atlas;
}

export const CHARACTER_ART: readonly CharacterArt[] = list.map((c) => ({
  model: c.model as Model, name: c.name, color: c.color, sheet: c.sheet, atlas: ATLASES[c.atlas as Model],
}));

/** O personagem `n` (0..7); fora da faixa, o primeiro. */
export const character = (n: number): CharacterArt => CHARACTER_ART[n] ?? CHARACTER_ART[0];

/** O canto do quadro `frame` da animação `name` na folha, em pixels da folha. */
export function frameAt(atlas: Atlas, name: AnimationName, frame: number): { x: number; y: number } {
  const a = atlas.animations[name];
  const i = a.loop ? ((frame % a.frames) + a.frames) % a.frames : Math.max(0, Math.min(a.frames - 1, frame));
  return { x: i * atlas.frame.w, y: a.row * atlas.frame.h };
}

/** A folha inteira de um modelo, em pixels. */
export function sheetSize(atlas: Atlas): { w: number; h: number } {
  return {
    w: Math.max(...Object.values(atlas.animations).map((a) => a.frames)) * atlas.frame.w,
    h: Object.keys(atlas.animations).length * atlas.frame.h,
  };
}

/** O índice do quadro da animação `name` depois de `elapsed` ms nela, no fps do modelo: em loop dá a volta, sem loop para no último. */
export function frameIndex(atlas: Atlas, name: AnimationName, elapsed: number): number {
  const a = atlas.animations[name];
  const n = Math.floor((Math.max(0, elapsed) * a.fps) / 1000);
  return a.loop ? n % a.frames : Math.min(a.frames - 1, n);
}

/**
 * A janela em que a interface mostra qualquer personagem parado, igual para os dois modelos: cabe o parado inteiro de
 * cada um com o pé em `anchorX`, na linha de baixo. Os quadros do esqueleto são largos (a espada do golpe), mas aqui só
 * o parado aparece.
 */
export const PORTRAIT = (() => {
  const atlases = Object.values(ATLASES);
  const left = Math.max(...atlases.map((a) => a.anchor.x - a.stand.x));
  const right = Math.max(...atlases.map((a) => a.stand.x + a.stand.w - a.anchor.x));
  const h = Math.max(...atlases.map((a) => a.anchor.y - a.stand.y));
  return { w: left + right, h, anchorX: left };
})();
