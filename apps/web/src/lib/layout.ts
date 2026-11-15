/**
 * Onde as coisas fixas da sala ficam na tela, puro: a coluna da sala à esquerda (recolhível), os botões no canto de cima,
 * o bloco preso embaixo logo à direita da coluna (ou no canto, com ela recolhida). As medidas em pixels são as mesmas do
 * CSS (`app.css`, `--gs-edge` e companhia).
 */

/** distância das bordas da tela */
export const EDGE = 12;
/** entre a coluna e o que fica ao lado dela */
export const GAP = 12;
/** o tamanho padrão do bloco aberto (o que ele tem sem a pessoa mexer, e o duplo clique na alça devolve) */
export const NOTEPAD_W = 340;
export const NOTEPAD_H = 216;
/** o menor bloco aberto que a alça deixa: um pouco menor que o padrão */
export const NOTEPAD_MIN_W = 280;
export const NOTEPAD_MIN_H = 168;
/** a alça anda em degraus deste tamanho (o jeito pixelado da sala) */
export const NOTEPAD_STEP = 8;
/** o que fica em cima da tela (os botões do canto, a vez e a votação): o bloco nunca sobe até aqui */
export const TOP_HUD_H = 160;
/** o bloco minimizado vira uma aba presa embaixo: no máximo esta largura */
export const NOTEPAD_TAB_W = 160;
/** o campo da fala, no canto de baixo à direita: a largura dele aberto (o mais largo) e a altura */
export const CHAT_W = 320;
export const CHAT_H = 36;
/** a barra de vida do chefão: a largura cheia e a menor que ainda se lê */
export const BOSS_BAR_W = 480;
export const BOSS_BAR_MIN = 280;

/** A coluna da sala: aberta ou recolhida, e a largura medida (0 enquanto não mediu). */
export interface Side { open: boolean; width: number }

/** O tamanho do bloco aberto, em px (a altura é a do painel inteiro). */
export interface Size { w: number; h: number }
export const NOTEPAD_SIZE: Size = { w: NOTEPAD_W, h: NOTEPAD_H };

/** O `left` do que fica preso embaixo, logo à direita da coluna; com ela recolhida (ou sem medida), no canto. */
export function besideSide(side: Side): number {
  return side.open && side.width > 0 ? EDGE + side.width + GAP : EDGE;
}

/**
 * Onde vai o bloco de largura `want` numa tela de `viewportW`: ao lado da coluna, encolhendo até caber; se nem
 * encolhido cabe (menos da metade da largura padrão), vai para o canto, por cima da coluna.
 */
export function notepadBox(side: Side, viewportW: number, want = NOTEPAD_W): { left: number; width: number } {
  const left = besideSide(side);
  const room = viewportW - left - EDGE;
  if (room >= want) return { left, width: want };
  if (room >= NOTEPAD_W / 2) return { left, width: room };
  return { left: EDGE, width: Math.min(want, viewportW - 2 * EDGE) };
}

/**
 * O maior bloco aberto numa tela `viewportW`×`viewportH`: no máximo metade da tela em cada direção, sem chegar no
 * campo da fala (aberto, o mais largo) nem no que fica em cima (`TOP_HUD_H`). Nunca menos que o mínimo.
 */
export function notepadMax(side: Side, viewportW: number, viewportH: number): Size {
  const w = Math.min(Math.floor(viewportW / 2), viewportW - besideSide(side) - EDGE - GAP - CHAT_W);
  const h = Math.min(Math.floor(viewportH / 2), viewportH - EDGE - TOP_HUD_H);
  return { w: Math.max(NOTEPAD_MIN_W, w), h: Math.max(NOTEPAD_MIN_H, h) };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** O tamanho pedido (o guardado) preso entre o mínimo e o máximo da tela de agora. */
export function clampNotepadSize(size: Size, side: Side, viewportW: number, viewportH: number): Size {
  const max = notepadMax(side, viewportW, viewportH);
  return { w: clamp(size.w, NOTEPAD_MIN_W, max.w), h: clamp(size.h, NOTEPAD_MIN_H, max.h) };
}

/**
 * Arrastar a alça do bloco (preso embaixo à esquerda) `dx`, `dy` px a partir de `start`: para a direita alarga, para
 * cima (dy negativo) cresce, em degraus de `NOTEPAD_STEP`, só nos lados pegos (`edges`), sempre dentro dos limites.
 */
export function resizeNotepad(start: Size, dx: number, dy: number, edges: { w: boolean; h: boolean }, side: Side, viewportW: number, viewportH: number): Size {
  const step = (d: number) => Math.round(d / NOTEPAD_STEP) * NOTEPAD_STEP || 0;
  const want = { w: edges.w ? start.w + step(dx) : start.w, h: edges.h ? start.h + step(-dy) : start.h };
  return clampNotepadSize(want, side, viewportW, viewportH);
}

export type Phase = 'lobby' | 'playing' | 'ended';

/**
 * A coluna depois de uma troca de fase: o jogo começando recolhe (o telhado e a vez são o que importa); o fim e a volta
 * ao lobby abrem (o "Jogar de novo" e a escrita estão nela). Sem troca (ou ao chegar, sem fase anterior), fica como a
 * pessoa deixou: dentro de uma fase ela recolhe e abre à vontade.
 */
export function sideCollapsedAfter(prev: Phase | null, next: Phase, collapsed: boolean): boolean {
  if (prev === null || prev === next) return collapsed;
  return next === 'playing';
}

/** Quanto da esquerda da tela a coluna cobre: a câmera do telhado centra no resto. */
export function sideInset(side: Side): number {
  return side.open && side.width > 0 ? EDGE + side.width : 0;
}

/**
 * Onde vai a barra de vida do chefão (`left`, `width` e `bottom`, px): embaixo, no meio da tela, entre o bloco (aberto,
 * da largura `notepadW` que a pessoa escolheu, ou a aba dele) e o campo da fala. Sem lugar ali para `BOSS_BAR_MIN`, sobe para cima do campo da fala, encostada à
 * direita (e ainda fora do bloco, se der).
 */
export function bossBarBox(side: Side, viewportW: number, notepadMinimized: boolean, notepadW = NOTEPAD_W): { left: number; width: number; bottom: number } {
  const pad = notepadBox(side, viewportW, notepadW);
  const from = pad.left + (notepadMinimized ? NOTEPAD_TAB_W : pad.width) + GAP;
  const to = viewportW - EDGE - CHAT_W - GAP;
  if (to - from >= BOSS_BAR_MIN) {
    const width = Math.min(BOSS_BAR_W, to - from);
    const left = Math.max(from, Math.min(to - width, Math.round(viewportW / 2 - width / 2)));
    return { left, width, bottom: EDGE };
  }
  const right = viewportW - EDGE;
  const room = right - from >= BOSS_BAR_MIN ? right - from : right - EDGE;
  const width = Math.min(BOSS_BAR_W, room);
  return { left: right - width, width, bottom: EDGE + CHAT_H + GAP };
}
