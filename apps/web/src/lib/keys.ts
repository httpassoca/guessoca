/**
 * O teclado do jogo, puro: que ação uma tecla vira. O mouse cuida dos painéis; o teclado só tem atalhos. Num campo de
 * texto as teclas são do texto (Esc só sai do campo). Enter = Acertei e Tab = passar a vez, só na própria vez; fora
 * dela o Tab anda entre os botões como sempre. N abre e fecha o bloco; Esc abre e fecha o menu.
 */
export type KeyAction = 'claim' | 'skip' | 'notepad' | 'menu' | 'blur';

export interface KeyPress { key: string; ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean; shiftKey?: boolean; repeat?: boolean }
export interface KeyContext {
  /** o foco está num campo de texto */
  inTextField: boolean;
  canClaim: boolean;
  canSkip: boolean;
}

export function keyAction(e: KeyPress, ctx: KeyContext): KeyAction | null {
  if (e.ctrlKey || e.altKey || e.metaKey || e.repeat) return null;
  if (e.key === 'Escape') return ctx.inTextField ? 'blur' : 'menu';
  if (ctx.inTextField || e.shiftKey) return null;
  switch (e.key) {
    case 'Enter': return ctx.canClaim ? 'claim' : null;
    case 'Tab': return ctx.canSkip ? 'skip' : null;
    case 'n': case 'N': return 'notepad';
    default: return null;
  }
}

/** O que do elemento focado interessa para saber se é um campo de texto. */
export interface FocusLike { tagName?: string; type?: string; isContentEditable?: boolean }
const NOT_TEXT = new Set(['button', 'checkbox', 'radio', 'file', 'submit', 'reset', 'image', 'range', 'color']);

export function isTextField(el: FocusLike | null | undefined): boolean {
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = (el.tagName ?? '').toUpperCase();
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return tag === 'INPUT' && !NOT_TEXT.has((el.type ?? 'text').toLowerCase());
}
