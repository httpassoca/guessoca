/**
 * A vista do telhado na tela, pura: a escala inteira, onde fica o chão e onde, na mesma projeção do Pixi (`project`,
 * ADR 0006), ficam o post-it sobre a cabeça e o balão do emote.
 */
import { project, type Camera, type Vec3, type View } from '@guess/world';
import { HERO } from '../sprites/hero';

/** quanto mundo, no mínimo, cabe na tela (largura e altura, em pixels do mundo) antes de a escala subir */
const MIN_WORLD_W = 600;
const MIN_WORLD_H = 300;
export const MIN_SCALE = 2;
export const MAX_SCALE = 6;

/** A maior escala inteira em que cabem ~600×300 pixels do mundo (3 numa janela 1080p), nunca menos de 2. */
export function pickScale(width: number, height: number): number {
  const s = Math.floor(Math.min(width / MIN_WORLD_W, height / MIN_WORLD_H));
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));
}

/** onde fica o chão (y = 0, z = 0), como fração da altura da tela a partir do topo */
const GROUND_AT = 0.8;

/**
 * A vista de uma tela `width`×`height` com uma coluna de `insetRight` pixels cobrindo a direita: o centro da câmera
 * fica no meio do que se vê.
 */
export function makeView(width: number, height: number, insetRight = 0): View {
  return { scale: pickScale(width, height), width: Math.max(1, width - insetRight), height, groundY: Math.round(height * GROUND_AT) };
}

/** a altura, acima dos pés, da base do post-it: um pouco acima do topo da cabeça */
export const HEAD_Y = HERO.anchor.y - HERO.head.y + 3;

/** Onde vai a base (o meio de baixo) do post-it de quem está em `p`, em pixels da tela. */
export function headAnchor(p: Vec3, cam: Camera, view: View) {
  return project({ x: p.x, y: p.y + HEAD_Y, z: p.z }, cam, view);
}

/** o balão do emote: ao lado da cabeça, para o lado em que a pessoa olha (o post-it fica em cima) */
export const EMOTE_GAP = 14;
export const EMOTE_Y = HERO.anchor.y - HERO.head.y - 8;

/** Onde vai a ponta do rabinho do balão de quem está em `p`, em pixels da tela. */
export function emoteAnchor(p: Vec3 & { facing: 1 | -1 }, cam: Camera, view: View) {
  return project({ x: p.x + p.facing * EMOTE_GAP, y: p.y + EMOTE_Y, z: p.z }, cam, view);
}
