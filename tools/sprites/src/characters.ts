/**
 * Os oito personagens (`character` 0..7 no protocolo): 0–3 o herói com os quatro cabelos, 4–7 o esqueleto com as quatro
 * capas. Vira `characters.json`, que o cliente lê para achar a folha, o atlas e a cor de cada um.
 */
import { HAIRS } from './hero';
import { CAPES } from './skeleton';

export type Model = 'hero' | 'skeleton';

export interface CharacterEntry {
  model: Model;
  /** o nome da cor (do cabelo ou da capa) */
  name: string;
  /** a cor do personagem na interface: a base da rampa */
  color: string;
  /** a folha, servida do `public` */
  sheet: string;
  /** o atlas do modelo (`hero.json` ou `skeleton.json`) */
  atlas: Model;
}

export function characters(): CharacterEntry[] {
  const list = [
    ...HAIRS.map((h) => ({ model: 'hero' as const, name: h.name, color: `#${h.ramp[1]}` })),
    ...CAPES.map((c) => ({ model: 'skeleton' as const, name: c.name, color: `#${c.ramp[1]}` })),
  ];
  return list.map((c, n) => ({ ...c, sheet: `/sprites/char-${n}.png`, atlas: c.model }));
}
