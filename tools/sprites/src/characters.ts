/**
 * Os nove personagens (`character` 0..8 no protocolo): 0–3 o herói com os quatro cabelos (`HAIRS` em `hero.ts`), 4, 5 e
 * 7 o esqueleto com as três capas (`CAPES` em `skeleton.ts`), 6 o Kratos (`kratos.ts`), no lugar que era da capa verde, e 8 o Vorcaro (`vorcaro.ts`). `index.ts` grava a lista em
 * `apps/web/src/lib/sprites/characters.json`, que o cliente (`apps/web/src/lib/sprites/characters.ts`) lê para achar a
 * folha, o atlas e a cor de cada um; e grava cada folha em `apps/web/public/sprites/char-N.png` no lugar `N` desta lista.
 *
 * Como mudar:
 * - **Outra cor de um modelo**: troque uma rampa em `HAIRS` ou `CAPES`; a cor na interface é a base da rampa, então
 *   atualize `--gs-char-N` em `apps/web/src/app.css` (um teste do cliente confere).
 * - **Mais um lugar**: a sala tem `CHARACTERS = 9` em `@guess/rules` (o protocolo valida 0..8); a soma de `HAIRS`, `CAPES`,
 *   o Kratos e o Vorcaro tem que dar isso. Mais lugares é mudar `CHARACTERS`, a grade do `CharacterPicker` e um `--gs-char-N` por lugar.
 * - **Um modelo novo**: um `Model` novo aqui (e no cliente), uma receita `build<Modelo>` que devolve uma folha por variante
 *   e um `Atlas` (`atlas.ts`), as variantes dele nesta lista (a ordem da lista é a ordem dos lugares), uma entrada em
 *   `models` em `index.ts` (a pasta do pacote e os arquivos), e o atlas em `ATLASES` no cliente
 *   (`apps/web/src/lib/sprites/characters.ts`). Os lugares de cada modelo saem da posição nesta lista.
 */
import { HAIRS } from './hero';
import { KRATOS_COLOR } from './kratos';
import { CAPES } from './skeleton';
import { VORCARO_COLOR } from './vorcaro';

/** Os modelos de personagem; cada um tem uma receita, um pacote em `assets-src/` e um atlas `<modelo>.json`. */
export type Model = 'hero' | 'skeleton' | 'kratos' | 'vorcaro';

/**
 * O formato da folha de cada modelo: PNG para o pixel art no tamanho do jogo; WebP sem perda para a arte grande que o
 * jogo desenha encolhida (o Vorcaro: 2 MB em PNG, 1,3 MB em WebP, os mesmos pixels).
 */
export const SHEET_FORMAT: Record<Model, 'png' | 'webp'> = { hero: 'png', skeleton: 'png', kratos: 'png', vorcaro: 'webp' };

/** O lugar do Kratos na lista. */
export const KRATOS_SLOT = 6;

/** Uma linha de `characters.json`: o personagem `N` é a entrada `N`. */
export interface CharacterEntry {
  model: Model;
  /** o nome da cor (do cabelo ou da capa), em português; não aparece na interface hoje */
  name: string;
  /** a cor do personagem na interface, `#rrggbb`: a base da rampa (o mesmo valor de `--gs-char-N` no CSS) */
  color: string;
  /** a folha, servida do `public`: `/sprites/char-N.png` (ou `.webp`, conforme `SHEET_FORMAT`) */
  sheet: string;
  /** o atlas do modelo (`hero.json`, `skeleton.json`, `kratos.json` ou `vorcaro.json`) */
  atlas: Model;
}

/**
 * A lista dos nove, na ordem dos lugares: as variantes do herói, depois as do esqueleto, com o Kratos no lugar 6 (entre
 * a segunda e a terceira capa, para os outros lugares continuarem com a cara que tinham), e o Vorcaro no fim.
 */
export function characters(): CharacterEntry[] {
  const list: Pick<CharacterEntry, 'model' | 'name' | 'color'>[] = [
    ...HAIRS.map((h) => ({ model: 'hero' as const, name: h.name, color: `#${h.ramp[1]}` })),
    ...CAPES.map((c) => ({ model: 'skeleton' as const, name: c.name, color: `#${c.ramp[1]}` })),
  ];
  list.splice(KRATOS_SLOT, 0, { model: 'kratos' as const, name: 'kratos', color: `#${KRATOS_COLOR}` });
  list.push({ model: 'vorcaro' as const, name: 'vorcaro', color: `#${VORCARO_COLOR}` });
  return list.map((c, n) => ({ ...c, sheet: `/sprites/char-${n}.${SHEET_FORMAT[c.model]}`, atlas: c.model }));
}
