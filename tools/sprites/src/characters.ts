/**
 * Os personagens (`character` 0..N−1 no protocolo), na ordem dos lugares: o herói (uma folha por cor de cabelo em `HAIRS`,
 * hoje só o loiro), o esqueleto (uma por capa em `CAPES`, hoje só a vermelha) e os de sete folhas, na ordem de `PACKS`
 * (`packs.ts`). `index.ts` grava a lista em `apps/web/src/lib/sprites/characters.json`, que o cliente
 * (`apps/web/src/lib/sprites/characters.ts`) lê para achar a folha, o atlas e a cor de cada um; e grava cada folha em
 * `apps/web/public/sprites/char-N.<formato>` no lugar `N`.
 *
 * Como mudar:
 * - **Mais um personagem de sete folhas**: uma entrada em `PACKS` (`packs.ts`) e mais um em `CHARACTERS`
 *   (`@guess/rules`); um teste confere que a lista tem esse tamanho.
 * - **Outra cor do herói ou do esqueleto**: mais uma rampa em `HAIRS` ou `CAPES` (cada rampa é um lugar a mais).
 * - **Um modelo de outro tipo** (arte que precisa de receita própria, como o herói): uma receita `build<Modelo>`, a
 *   entrada dele em `characters()` e em `models` de `index.ts`.
 * - Mudar a ordem ou tirar alguém renumera os lugares: o número que cada navegador lembra passa a apontar para outro.
 */
import { HAIRS } from './hero';
import { PACKS } from './packs';
import { CAPES } from './skeleton';

/** O nome de um modelo: `hero`, `skeleton` ou o `model` de uma entrada de `PACKS`. É a chave do atlas dele. */
export type Model = string;

/**
 * O formato da folha de um modelo: PNG para o pixel art no tamanho do jogo (o herói e o esqueleto); WebP sem perda para
 * a arte grande que o jogo desenha encolhida (todos os de sete folhas: os mesmos pixels, uns 30 % menos bytes).
 */
export const sheetFormat = (model: Model): 'png' | 'webp' => (model === 'hero' || model === 'skeleton' ? 'png' : 'webp');

/** Uma linha de `characters.json`: o personagem `N` é a entrada `N`. */
export interface CharacterEntry {
  model: Model;
  /** o nome (da cor do cabelo ou da capa, ou do personagem), em português; não aparece na interface hoje */
  name: string;
  /** a cor do personagem na interface, `#rrggbb` */
  color: string;
  /** a folha, servida do `public`: `/sprites/char-N.png` (ou `.webp`, conforme `sheetFormat`) */
  sheet: string;
  /** o atlas do modelo: a chave em `atlases.json` */
  atlas: Model;
}

/** A lista, na ordem dos lugares: o herói, o esqueleto e os de sete folhas. */
export function characters(): CharacterEntry[] {
  const list: Pick<CharacterEntry, 'model' | 'name' | 'color'>[] = [
    ...HAIRS.map((h) => ({ model: 'hero', name: h.name, color: `#${h.ramp[1]}` })),
    ...CAPES.map((c) => ({ model: 'skeleton', name: c.name, color: `#${c.ramp[1]}` })),
    ...PACKS.map((p) => ({ model: p.model, name: p.name, color: `#${p.color}` })),
  ];
  return list.map((c, n) => ({ ...c, sheet: `/sprites/char-${n}.${sheetFormat(c.model)}`, atlas: c.model }));
}
