/**
 * A vista do telhado na tela, pura: a escala inteira, onde fica o chão e onde, na mesma projeção do Pixi (`project`,
 * ADR 0006), ficam o post-it sobre a cabeça e o balão do emote.
 *
 * Por que inteira: cada pixel do sprite vira um quadrado exato de `scale`×`scale` pixels da tela, sem borrar nem
 * engrossar uma coluna e não a vizinha (com o `nearest` e o `roundPixels` de `scene.ts`). Lê os atlas dos personagens
 * (`../sprites/characters.ts`) para a altura da cabeça de cada modelo; usado por `runtime.ts` e `scene.ts`; testado em
 * `apps/web/test/world-view.test.ts`.
 */
import { project, type Camera, type Vec3, type View } from '@guess/world';
import { artScale, character } from '../sprites/characters';

/**
 * quanto mundo, no mínimo, cabe na tela (largura e altura, em pixels do mundo) antes de a escala subir: uns dois terços
 * do mapa (900 de largura) de lado a lado, e o pulo (50) mais as caixas altas (60) com folga em cima
 */
const MIN_WORLD_W = 600;
const MIN_WORLD_H = 300;
/** a menor escala: abaixo de 2 o personagem (uns 40 pixels de altura) fica pequeno demais para ler */
export const MIN_SCALE = 2;
/** a maior escala: numa tela enorme mostra mais mundo em vez de ampliar sem fim */
export const MAX_SCALE = 6;

/** A maior escala inteira em que cabem ~600×300 pixels do mundo (3 numa janela 1080p), entre 2 e 6; a tela em px. */
export function pickScale(width: number, height: number): number {
  const s = Math.floor(Math.min(width / MIN_WORLD_W, height / MIN_WORLD_H));
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));
}

/**
 * A escala com o zoom da pessoa: a automática mais `zoom` passos inteiros (a roda do mouse), sempre entre `MIN_SCALE` e
 * `MAX_SCALE`, e sempre inteira (os pixels continuam quadrados).
 */
export function zoomedScale(width: number, height: number, zoom = 0): number {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, pickScale(width, height) + Math.trunc(zoom)));
}

/**
 * O zoom depois de um passo da roda (`dir` +1 aproxima, −1 afasta): anda 1 a partir da escala que está na tela, e não
 * acumula além dos limites (na escala máxima, aproximar de novo não guarda passos para desfazer depois).
 */
export function stepZoom(zoom: number, dir: 1 | -1, width: number, height: number): number {
  const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, zoomedScale(width, height, zoom) + dir));
  return next - pickScale(width, height);
}

/** onde fica o chão (y = 0, z = 0), como fração da altura da tela a partir do topo: 80% (céu em cima, queda embaixo) */
const GROUND_AT = 0.8;

/**
 * A parte que se vê de uma tela `width`×`height` com uma coluna de `inset` pixels cobrindo um lado: a câmera segue e
 * para nas pontas do mundo dentro dela. A escala é a da tela inteira (recolher a coluna não muda o tamanho do mundo),
 * mais o `zoom` da pessoa.
 */
export function makeView(width: number, height: number, inset = 0, zoom = 0): View {
  return { scale: zoomedScale(width, height, zoom), width: Math.max(1, width - inset), height, groundY: Math.round(height * GROUND_AT) };
}

/**
 * A vista para desenhar quando uma coluna de `insetLeft` pixels cobre a esquerda: a mesma escala de `visible` (a parte
 * que se vê, de `makeView(w, h, insetLeft)`, onde a câmera segue e para nas pontas do mundo), larga o bastante para o
 * meio cair no meio do que se vê. Tudo anda `insetLeft` para a direita e o telhado continua por baixo da coluna.
 */
export function renderView(visible: View, insetLeft: number): View {
  return insetLeft > 0 ? { ...visible, width: visible.width + 2 * insetLeft } : visible;
}

/**
 * A altura, acima dos pés, da base do post-it do personagem `n`, em unidades do mundo: o topo do quadrado da cabeça no
 * atlas (pixels do quadro, `anchor.y − head.y`) mais 3 de folga. Cada modelo tem a sua (o herói 40, o esqueleto 47), por
 * isso sai do atlas e não de `BODY_H`. `scale`: quantas vezes maior o corpo é desenhado (o chefão dos bots engraçados);
 * a cabeça sobe junto, a folga não.
 */
export function headY(n: number, scale = 1): number {
  const { atlas } = character(n);
  return Math.round((atlas.anchor.y - atlas.head.y) * artScale(atlas) * scale) + 3;
}

/** Onde vai a base (o meio de baixo) do post-it de quem está em `p` (unidades do mundo), em pixels da tela. */
export function headAnchor(p: Vec3 & { character: number; scale?: number }, cam: Camera, view: View) {
  return project({ x: p.x, y: p.y + headY(p.character, p.scale), z: p.z }, cam, view);
}

/**
 * o balão do emote: ao lado da cabeça, para o lado em que a pessoa olha (o post-it fica em cima); 14 unidades à frente
 * dos pés, fora do rosto (no olho)
 */
export const EMOTE_GAP = 14;
/**
 * a altura, acima dos pés, da ponta do balão (unidades do mundo): 11 abaixo da base do post-it, nos olhos de `n`; num
 * corpo desenhado `scale` vezes maior, tudo isso vezes `scale`
 */
export const emoteY = (n: number, scale = 1) => (headY(n) - 11) * scale;

/** Onde vai a ponta do rabinho do balão de quem está em `p` (unidades do mundo), em pixels da tela. */
export function emoteAnchor(p: Vec3 & { facing: 1 | -1; character: number; scale?: number }, cam: Camera, view: View) {
  const k = p.scale ?? 1;
  return project({ x: p.x + p.facing * EMOTE_GAP * k, y: p.y + emoteY(p.character, k), z: p.z }, cam, view);
}
