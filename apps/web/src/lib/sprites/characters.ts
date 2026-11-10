/**
 * Os personagens desenhados a partir das folhas geradas por `bun run sprites` (ADR 0007): `characters.json` diz de que
 * modelo é cada um (0–3 o herói, 4, 5 e 7 o esqueleto, 6 o Kratos, 8 o Vorcaro, 9 o Orelha, 10 o Bolsonaro), a cor e a folha; cada modelo tem o seu atlas (`hero.json`,
 * `skeleton.json`, `kratos.json`, `vorcaro.json`, `orelha.json`, `bolsonaro.json`) com o tamanho do quadro, a âncora, a cabeça e as animações. Puro, para os componentes e para o mundo
 * (Pixi) lerem do mesmo lugar.
 *
 * Entrada: os JSON ao lado, escritos por `tools/sprites/src/index.ts` (não editar à mão; `bun run sprites` refaz). As
 * folhas ficam em `apps/web/public/sprites/char-N.png`. Quem lê: `world/scene.ts` (os quadros), `world/view.ts` (a
 * altura da cabeça), `panels/Hero.svelte` e `panels/Swatch.svelte` (o retrato e o rosto). Coordenadas: tudo aqui está em
 * pixels do quadro (ou da folha, em `frameAt`), com a âncora entre os pés; 1 pixel do quadro = `artScale(atlas)` unidades
 * do mundo (1, menos no Vorcaro, cuja folha é a arte no tamanho em que foi feita).
 *
 * Como mudar: um modelo novo é um atlas novo (`<modelo>.json`, gerado), importado aqui, com o nome em `Model` e em
 * `ATLASES`; o `Model` de `tools/sprites/src/characters.ts` tem que ter o mesmo nome. `CHARACTER_ART` é indexado pelo
 * lugar (0..10, o `character` do protocolo, `CHARACTERS` em `@guess/rules`): mudar que modelo ocupa que lugar é em
 * `tools/sprites/src/characters.ts`, e a cor nova vai também em `--gs-char-N` (`apps/web/src/app.css`; o teste confere).
 */
import type { Anim } from '@guess/world';
import list from './characters.json';
import bolsonaro from './bolsonaro.json';
import hero from './hero.json';
import kratos from './kratos.json';
import orelha from './orelha.json';
import skeleton from './skeleton.json';
import vorcaro from './vorcaro.json';

/** As linhas da folha: as mesmas animações que o mundo escolhe (`Anim` em `@guess/world`). */
export type AnimationName = Anim;
/** Os modelos de personagem, cada um com um atlas `<modelo>.json`. */
export type Model = 'hero' | 'skeleton' | 'kratos' | 'vorcaro' | 'orelha' | 'bolsonaro';

/** O atlas de um modelo, como `tools/sprites` escreve (`Atlas` em `tools/sprites/src/atlas.ts`). */
export interface Atlas {
  /** o tamanho de cada quadro na folha, em pixels (igual em todas as linhas; o recorte comum a todos os quadros) */
  frame: { w: number; h: number };
  /** o ponto do quadro que fica no chão, entre os pés, em pixels do quadro (`y` = a linha de baixo do parado) */
  anchor: { x: number; y: number };
  /** o quadrado da cabeça no primeiro quadro do parado, em pixels do quadro (o rosto em `Swatch`, a altura do post-it) */
  head: { x: number; y: number; size: number };
  /** o retângulo do primeiro quadro do parado, em pixels do quadro (o retrato em `Hero`, sem a folga do golpe) */
  stand: { x: number; y: number; w: number; h: number };
  /** cada animação: a linha na folha, quantos quadros, a velocidade, e se dá a volta (sem loop, para no último) */
  animations: Record<AnimationName, { row: number; frames: number; fps: number; loop: boolean }>;
  /** a quem dar o crédito da arte (o herói: "Ozzbit Games", ADR 0007), ou null */
  credit: string | null;
  /** quantas unidades do mundo vale um pixel do quadro; sem isto, 1. Menor que 1: arte grande, desenhada encolhida (o Vorcaro) */
  scale?: number;
}

/**
 * Quantas unidades do mundo vale um pixel do quadro deste atlas (1 no pixel art feito no tamanho do jogo). Tudo o que
 * desenha um personagem multiplica os números do atlas por isto: `world/scene.ts`, `world/view.ts`, `Hero.svelte`.
 */
export const artScale = (atlas: Atlas): number => atlas.scale ?? 1;

/** Um atlas por modelo; `characters.json` diz qual cada personagem usa. */
const ATLASES: Record<Model, Atlas> = { hero, skeleton, kratos, vorcaro, orelha, bolsonaro };

/** Tudo o que a interface e o mundo precisam de um personagem. */
export interface CharacterArt {
  model: Model;
  /** o nome da cor do cabelo ou da capa */
  name: string;
  /** a cor do personagem, para bordas e marcas na interface */
  color: string;
  /** o endereço da folha (`/sprites/char-N.png`) */
  sheet: string;
  atlas: Atlas;
}

/** Os onze personagens, na ordem dos lugares do protocolo (0–3 o herói, 4, 5 e 7 o esqueleto, 6 o Kratos, 8 o Vorcaro, 9 o Orelha, 10 o Bolsonaro). */
export const CHARACTER_ART: readonly CharacterArt[] = list.map((c) => ({
  model: c.model as Model, name: c.name, color: c.color, sheet: c.sheet, atlas: ATLASES[c.atlas as Model],
}));

/** O personagem `n` (0..10); fora da faixa, o primeiro. */
export const character = (n: number): CharacterArt => CHARACTER_ART[n] ?? CHARACTER_ART[0];

/** O canto do quadro `frame` da animação `name` na folha, em pixels da folha. */
export function frameAt(atlas: Atlas, name: AnimationName, frame: number): { x: number; y: number } {
  const a = atlas.animations[name];
  const i = a.loop ? ((frame % a.frames) + a.frames) % a.frames : Math.max(0, Math.min(a.frames - 1, frame));
  return { x: i * atlas.frame.w, y: a.row * atlas.frame.h };
}

/** A folha inteira de um modelo, em pixels: a linha mais comprida de largura, uma linha por animação de altura. */
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
 * A janela, em unidades do mundo (pixels do quadro vezes `artScale`), em que a interface mostra qualquer personagem parado, igual para todos os modelos: cabe
 * o parado inteiro de cada um com o pé em `anchorX`, na linha de baixo. Os quadros do esqueleto são largos (a espada do
 * golpe), mas aqui só o parado aparece. `w`, `h` e `anchorX` (o pé, a partir da esquerda) em unidades do mundo, arredondados para cima.
 */
export const PORTRAIT = (() => {
  const atlases = Object.values(ATLASES);
  const left = Math.ceil(Math.max(...atlases.map((a) => (a.anchor.x - a.stand.x) * artScale(a))));
  const right = Math.ceil(Math.max(...atlases.map((a) => (a.stand.x + a.stand.w - a.anchor.x) * artScale(a))));
  const h = Math.ceil(Math.max(...atlases.map((a) => (a.anchor.y - a.stand.y) * artScale(a))));
  return { w: left + right, h, anchorX: left };
})();
