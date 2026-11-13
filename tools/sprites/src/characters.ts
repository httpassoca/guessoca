/**
 * Os personagens (`character` 0..N−1 no protocolo), na ordem dos lugares: o herói (uma folha por cor de cabelo em `HAIRS`,
 * hoje só o loiro), o esqueleto (uma por capa em `CAPES`, hoje só a vermelha) e os de sete folhas, na ordem de `PACKS`
 * (`packs.ts`). `index.ts` grava a lista em `apps/web/src/lib/sprites/characters.json`, que o cliente
 * (`apps/web/src/lib/sprites/characters.ts`) lê para achar a folha, o atlas e a cor de cada um; e grava cada folha em
 * `apps/web/public/sprites/char-N-idle.<formato>` e `char-N-moves.<formato>` (`sheetFiles`) no lugar `N`.
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
  /**
   * as folhas (as páginas do atlas, `paginate` em `atlas.ts`), servidas do `public`: `/sprites/char-N-idle.png` (o
   * parado) e `/sprites/char-N-moves.png` (o resto; `-moves-2`, `-moves-3`… se não couber numa), ou `.webp`, conforme
   * `sheetFormat`
   */
  sheets: string[];
  /** o atlas do modelo: a chave em `atlases.json` */
  atlas: Model;
}

/**
 * Os endereços das `pages` folhas do personagem `n`: a página 0 é o parado (`char-N-idle`), as outras o resto
 * (`char-N-moves`, `char-N-moves-2`…). Nomes novos, e não os `char-N` de antes: uma troca antiga feita no `/sistema`
 * (ADR 0009), com o desenho de uma folha só, não tem como cair por cima de uma página.
 */
export function sheetFiles(n: number, model: Model, pages: number): string[] {
  return Array.from({ length: pages }, (_, p) => `/sprites/char-${n}-${p === 0 ? 'idle' : p === 1 ? 'moves' : `moves-${p}`}.${sheetFormat(model)}`);
}

/**
 * A lista, na ordem dos lugares: o herói, o esqueleto e os de sete folhas. `pagesOf(model)` diz em quantas folhas o
 * atlas daquele modelo foi cortado (o padrão, 2: o parado e o resto).
 */
export function characters(pagesOf: (model: Model) => number = () => 2): CharacterEntry[] {
  const list: Pick<CharacterEntry, 'model' | 'name' | 'color'>[] = [
    ...HAIRS.map((h) => ({ model: 'hero', name: h.name, color: `#${h.ramp[1]}` })),
    ...CAPES.map((c) => ({ model: 'skeleton', name: c.name, color: `#${c.ramp[1]}` })),
    ...PACKS.map((p) => ({ model: p.model, name: p.name, color: `#${p.color}` })),
  ];
  return list.map((c, n) => ({ ...c, sheets: sheetFiles(n, c.model, pagesOf(c.model)), atlas: c.model }));
}
