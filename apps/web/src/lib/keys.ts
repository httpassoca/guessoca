/**
 * O teclado do jogo, puro: que ação uma tecla vira. O mouse cuida dos painéis; o teclado só tem atalhos. Num campo de
 * texto as teclas são do texto (Esc só sai do campo). Enter = Acertei e Tab = passar a vez, só na própria vez; fora
 * dela o Tab anda entre os botões como sempre. N abre e fecha o bloco; Esc abre e fecha o menu.
 *
 * O telhado (`worldKey`) tem as suas: A/D ou ←/→ andam, W/S ou ↑/↓ mudam a profundidade, Shift corre, Espaço pula,
 * J empurra e 1–4 são os emotes. Vão pela posição da tecla (`code`), não pela letra, para correr com Shift continuar
 * andando. Não se cruzam com as do jogo.
 */
export type KeyAction = 'claim' | 'skip' | 'notepad' | 'menu' | 'blur';

export interface KeyPress { key: string; code?: string; ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean; shiftKey?: boolean; repeat?: boolean }
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

/** O que se segura no telhado (vale enquanto está apertado). */
export type Hold = 'left' | 'right' | 'up' | 'down' | 'run';
/** Uma tecla do telhado: segurar, apertar (vale uma vez: pular, empurrar) ou um emote (0..3, a ordem de `EMOTES`). */
export type WorldKey = { hold: Hold } | { press: 'jump' | 'shove' } | { emote: number };
export interface WorldContext {
  /** o foco está num campo de texto, ou um modal (menu, bloco) está aberto: o telhado não ouve */
  blocked: boolean;
}

const HOLDS: Record<string, Hold> = {
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
  ShiftLeft: 'run', ShiftRight: 'run',
};
const PRESSES: Record<string, 'jump' | 'shove'> = { Space: 'jump', KeyJ: 'shove' };
const EMOTE_CODES: Record<string, number> = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3 };

export function worldKey(e: KeyPress, ctx: WorldContext): WorldKey | null {
  if (ctx.blocked || e.ctrlKey || e.altKey || e.metaKey || !e.code) return null;
  const hold = HOLDS[e.code];
  if (hold) return { hold };
  if (e.repeat) return null;
  const press = PRESSES[e.code];
  if (press) return { press };
  const emote = EMOTE_CODES[e.code];
  return emote === undefined ? null : { emote };
}

/**
 * Espaço é do telhado: fora de um campo e sem modal aberto, a página não rola e o botão focado não é apertado (na
 * descida e na subida da tecla).
 */
export function swallowsSpace(e: KeyPress, ctx: WorldContext): boolean {
  return !ctx.blocked && e.code === 'Space';
}
