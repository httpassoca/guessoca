/**
 * Os oito personagens (`character` 0..7 no protocolo): 0–3 o herói com os quatro cabelos (`HAIRS` em `hero.ts`), 4–7 o
 * esqueleto com as quatro capas (`CAPES` em `skeleton.ts`). `index.ts` grava a lista em
 * `apps/web/src/lib/sprites/characters.json`, que o cliente (`apps/web/src/lib/sprites/characters.ts`) lê para achar a
 * folha, o atlas e a cor de cada um; e grava cada folha em `apps/web/public/sprites/char-N.png` no lugar `N` desta lista.
 *
 * Como mudar:
 * - **Outra cor de um modelo**: troque uma rampa em `HAIRS` ou `CAPES`; a cor na interface é a base da rampa, então
 *   atualize `--gs-char-N` em `apps/web/src/app.css` (um teste do cliente confere).
 * - **Mais um lugar**: a sala tem `CHARACTERS = 8` em `@guess/rules` (o protocolo valida 0..7); a soma de `HAIRS` e `CAPES`
 *   tem que dar isso. Mais lugares é mudar `CHARACTERS`, a grade do `CharacterPicker` e um `--gs-char-N` por lugar.
 * - **Um modelo novo**: um `Model` novo aqui (e no cliente), uma receita `build<Modelo>` que devolve uma folha por variante
 *   e um `Atlas` (`atlas.ts`), as variantes dele nesta lista (a ordem da lista é a ordem dos lugares), uma entrada em
 *   `models` em `index.ts` (a pasta do pacote e os arquivos), e o atlas em `ATLASES` no cliente
 *   (`apps/web/src/lib/sprites/characters.ts`). Os lugares de cada modelo saem da posição nesta lista.
 */
import { HAIRS } from './hero';
import { CAPES } from './skeleton';

/** Os modelos de personagem; cada um tem uma receita, um pacote em `assets-src/` e um atlas `<modelo>.json`. */
export type Model = 'hero' | 'skeleton';

/** Uma linha de `characters.json`: o personagem `N` é a entrada `N`. */
export interface CharacterEntry {
  model: Model;
  /** o nome da cor (do cabelo ou da capa), em português; não aparece na interface hoje */
  name: string;
  /** a cor do personagem na interface, `#rrggbb`: a base da rampa (o mesmo valor de `--gs-char-N` no CSS) */
  color: string;
  /** a folha, servida do `public`: `/sprites/char-N.png` */
  sheet: string;
  /** o atlas do modelo (`hero.json` ou `skeleton.json`) */
  atlas: Model;
}

/** A lista dos oito, na ordem dos lugares: primeiro as variantes do herói, depois as do esqueleto. */
export function characters(): CharacterEntry[] {
  const list = [
    ...HAIRS.map((h) => ({ model: 'hero' as const, name: h.name, color: `#${h.ramp[1]}` })),
    ...CAPES.map((c) => ({ model: 'skeleton' as const, name: c.name, color: `#${c.ramp[1]}` })),
  ];
  return list.map((c, n) => ({ ...c, sheet: `/sprites/char-${n}.png`, atlas: c.model }));
}
