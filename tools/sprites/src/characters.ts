/**
 * Os seis personagens (`character` 0..5 no protocolo), na ordem dos lugares: 0 o herói loiro (`HAIRS` em `hero.ts`), 1 o
 * esqueleto de capa vermelha (`CAPES` em `skeleton.ts`), 2 o Kratos, 3 o Vorcaro, 4 o Orelha (o cachorro) e 5 o Bolsonaro
 * no dinossauro (os quatro de sete folhas, `pack.ts`). `index.ts` grava a lista em
 * `apps/web/src/lib/sprites/characters.json`, que o cliente (`apps/web/src/lib/sprites/characters.ts`) lê para achar a
 * folha, o atlas e a cor de cada um; e grava cada folha em `apps/web/public/sprites/char-N.<formato>` no lugar `N`.
 *
 * O elenco já teve onze: quatro cores de cabelo do herói e três capas do esqueleto. Com mais modelos, ficou uma de cada.
 *
 * Como mudar:
 * - **Outra cor de um modelo**: mais uma rampa em `HAIRS` ou `CAPES` (cada rampa é um lugar a mais); a cor na interface
 *   é a base da rampa, então ponha `--gs-char-N` em `apps/web/src/app.css` (um teste do cliente confere).
 * - **Mais ou menos lugares**: a sala tem `CHARACTERS = 6` em `@guess/rules` (o protocolo valida 0..5); esta lista tem
 *   que ter esse tamanho. Mudar é mexer em `CHARACTERS`, num `--gs-char-N` por lugar e nos testes de faixa (rules,
 *   protocol, create, identity). O número que cada navegador lembra passa a apontar para outro personagem.
 * - **Um modelo novo**: um `Model` novo aqui (e no cliente), uma receita `build<Modelo>` que devolve uma folha por variante
 *   e um `Atlas` (`atlas.ts`), a entrada dele nesta lista (a ordem da lista é a ordem dos lugares), uma entrada em
 *   `models` em `index.ts` (a pasta do pacote e os arquivos), e o atlas em `ATLASES` no cliente
 *   (`apps/web/src/lib/sprites/characters.ts`).
 */
import { BOLSONARO_COLOR } from './bolsonaro';
import { HAIRS } from './hero';
import { KRATOS_COLOR } from './kratos';
import { CAPES } from './skeleton';
import { ORELHA_COLOR } from './orelha';
import { VORCARO_COLOR } from './vorcaro';

/** Os modelos de personagem; cada um tem uma receita, um pacote em `assets-src/` e um atlas `<modelo>.json`. */
export type Model = 'hero' | 'skeleton' | 'kratos' | 'vorcaro' | 'orelha' | 'bolsonaro';

/**
 * O formato da folha de cada modelo: PNG para o pixel art no tamanho do jogo; WebP sem perda para a arte grande que o
 * jogo desenha encolhida (o Kratos e o Vorcaro, este 2 MB em PNG e 1,3 MB em WebP, os mesmos pixels).
 */
export const SHEET_FORMAT: Record<Model, 'png' | 'webp'> = { hero: 'png', skeleton: 'png', kratos: 'webp', vorcaro: 'webp', orelha: 'webp', bolsonaro: 'webp' };

/** Uma linha de `characters.json`: o personagem `N` é a entrada `N`. */
export interface CharacterEntry {
  model: Model;
  /** o nome da cor (do cabelo ou da capa), em português; não aparece na interface hoje */
  name: string;
  /** a cor do personagem na interface, `#rrggbb`: a base da rampa (o mesmo valor de `--gs-char-N` no CSS) */
  color: string;
  /** a folha, servida do `public`: `/sprites/char-N.png` (ou `.webp`, conforme `SHEET_FORMAT`) */
  sheet: string;
  /** o atlas do modelo (`hero.json`, `skeleton.json`, `kratos.json`, `vorcaro.json`, `orelha.json` ou `bolsonaro.json`) */
  atlas: Model;
}

/** A lista dos seis, na ordem dos lugares: o herói, o esqueleto e os quatro de sete folhas. */
export function characters(): CharacterEntry[] {
  const list: Pick<CharacterEntry, 'model' | 'name' | 'color'>[] = [
    ...HAIRS.map((h) => ({ model: 'hero' as const, name: h.name, color: `#${h.ramp[1]}` })),
    ...CAPES.map((c) => ({ model: 'skeleton' as const, name: c.name, color: `#${c.ramp[1]}` })),
    { model: 'kratos', name: 'kratos', color: `#${KRATOS_COLOR}` },
    { model: 'vorcaro', name: 'vorcaro', color: `#${VORCARO_COLOR}` },
    { model: 'orelha', name: 'orelha', color: `#${ORELHA_COLOR}` },
    { model: 'bolsonaro', name: 'bolsonaro', color: `#${BOLSONARO_COLOR}` },
  ];
  return list.map((c, n) => ({ ...c, sheet: `/sprites/char-${n}.${SHEET_FORMAT[c.model]}`, atlas: c.model }));
}
