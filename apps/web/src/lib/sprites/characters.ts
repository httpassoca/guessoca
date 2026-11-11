/**
 * Os personagens desenhados a partir das folhas geradas por `bun run sprites` (ADR 0007): `characters.json` diz de que
 * modelo é cada um, a cor e a folha, na ordem dos lugares; `atlases.json` tem o atlas de cada modelo (o tamanho do quadro,
 * a âncora, a cabeça, as animações e a escala). Puro, para os componentes e para o mundo (Pixi) lerem do mesmo lugar.
 *
 * Entrada: os dois JSON ao lado, escritos por `tools/sprites/src/index.ts` (não editar à mão; `bun run sprites` refaz).
 * As folhas ficam em `apps/web/public/sprites/char-N.<png|webp>`. Quem lê: `world/scene.ts` (os quadros), `world/view.ts`
 * (a altura da cabeça), `panels/Hero.svelte` e `panels/Swatch.svelte` (o retrato e o rosto). Coordenadas: tudo aqui está
 * em pixels do quadro (ou da folha, em `frameAt`), com a âncora entre os pés; 1 pixel do quadro = `artScale(atlas)`
 * unidades do mundo (1 no pixel art feito no tamanho do jogo; menos nos de sete folhas, cuja folha é a arte no tamanho
 * em que foi feita).
 *
 * Como mudar: nada aqui. Um personagem novo é uma entrada em `tools/sprites/src/packs.ts` e mais um em `CHARACTERS`
 * (`@guess/rules`); esta lista e os atlas vêm gerados. `CHARACTER_ART` é indexado pelo lugar (o `character` do protocolo).
 */
import type { Anim } from '@guess/world';
import atlases from './atlases.json';
import list from './characters.json';

/** As linhas da folha: as mesmas animações que o mundo escolhe (`Anim` em `@guess/world`). */
export type AnimationName = Anim;
/** O nome de um modelo de personagem: a chave do atlas dele em `atlases.json`. */
export type Model = string;

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
  /** o quadrado do rosto em `Swatch`, quando não é o de `head` (um companheiro mais alto ao lado: `head` é o alto do conjunto) */
  face?: { x: number; y: number; size: number };
  /** quantas unidades do mundo vale um pixel do quadro; sem isto, 1. Menor que 1: arte grande, desenhada encolhida (o Vorcaro) */
  scale?: number;
}

/**
 * Quantas unidades do mundo vale um pixel do quadro deste atlas (1 no pixel art feito no tamanho do jogo). Tudo o que
 * desenha um personagem multiplica os números do atlas por isto: `world/scene.ts`, `world/view.ts`, `Hero.svelte`.
 */
export const artScale = (atlas: Atlas): number => atlas.scale ?? 1;

/** Um atlas por modelo (`atlases.json`); `characters.json` diz qual cada personagem usa. */
const ATLASES = atlases as Record<Model, Atlas>;

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

/** Os personagens, na ordem dos lugares do protocolo. */
export const CHARACTER_ART: readonly CharacterArt[] = list.map((c) => ({
  model: c.model, name: c.name, color: c.color, sheet: c.sheet, atlas: ATLASES[c.atlas],
}));

/** O personagem `n`; fora da faixa, o primeiro. */
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

/** Quanto dura o ataque de um modelo, ms: a linha `shove` inteira, no fps dela. O mundo trava o empurrão por esse tempo (`shoveLock`). */
export const attackMs = (atlas: Atlas): number => (atlas.animations.shove.frames / atlas.animations.shove.fps) * 1000;

/**
 * Como enquadrar um personagem parado numa caixa de `box.w × box.h` pixels da tela: o retângulo do quadro a mostrar
 * (`x`, `y`, `w`, `h`, em pixels do quadro: o parado, com 2 pixels de folga dos lados e em cima, até o chão) e a escala
 * `k` (pixels da tela por pixel do quadro) com que ele cabe inteiro: o maior que cabe, ajustado para o quadro ter um
 * número inteiro de pixels de largura (a animação anda de quadro em quadro por essa largura). Ampliando, quem desenha
 * não suaviza (pixel art); encolhendo, suaviza. O quadro inteiro tem a folga do ataque e do pulo: enquadrar pelo parado é o
 * que deixa todo personagem do mesmo tamanho na tela, do cachorro ao do dinossauro.
 */
export function fitScale(atlas: Atlas, box: { w: number; h: number }): { x: number; y: number; w: number; h: number; k: number } {
  const PAD = 2;
  const x = Math.max(0, atlas.stand.x - PAD), y = Math.max(0, atlas.stand.y - PAD);
  const w = Math.min(atlas.frame.w, atlas.stand.x + atlas.stand.w + PAD) - x, h = atlas.anchor.y - y;
  const k0 = Math.min(box.w / w, box.h / h);
  const k = Math.max(1, Math.floor(atlas.frame.w * k0)) / atlas.frame.w;
  return { x, y, w, h, k };
}
