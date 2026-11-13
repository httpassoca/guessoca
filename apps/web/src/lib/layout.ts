/**
 * Onde as coisas fixas da sala ficam na tela, puro: a coluna da sala à esquerda (recolhível), os botões no canto de cima,
 * o bloco preso embaixo logo à direita da coluna (ou no canto, com ela recolhida). As medidas em pixels são as mesmas do
 * CSS (`app.css`, `--gs-edge` e companhia).
 */

/** distância das bordas da tela */
export const EDGE = 12;
/** entre a coluna e o que fica ao lado dela */
export const GAP = 12;
/** largura do bloco aberto */
export const NOTEPAD_W = 340;
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

/** O `left` do que fica preso embaixo, logo à direita da coluna; com ela recolhida (ou sem medida), no canto. */
export function besideSide(side: Side): number {
  return side.open && side.width > 0 ? EDGE + side.width + GAP : EDGE;
}

/**
 * Onde vai o bloco numa tela de `viewportW`: ao lado da coluna, encolhendo até caber; se nem encolhido cabe (menos
 * da metade da largura), vai para o canto, por cima da coluna.
 */
export function notepadBox(side: Side, viewportW: number): { left: number; width: number } {
  const left = besideSide(side);
  const room = viewportW - left - EDGE;
  if (room >= NOTEPAD_W) return { left, width: NOTEPAD_W };
  if (room >= NOTEPAD_W / 2) return { left, width: room };
  return { left: EDGE, width: Math.min(NOTEPAD_W, viewportW - 2 * EDGE) };
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
 * ou a aba dele) e o campo da fala. Sem lugar ali para `BOSS_BAR_MIN`, sobe para cima do campo da fala, encostada à
 * direita (e ainda fora do bloco, se der).
 */
export function bossBarBox(side: Side, viewportW: number, notepadMinimized: boolean): { left: number; width: number; bottom: number } {
  const pad = notepadBox(side, viewportW);
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
