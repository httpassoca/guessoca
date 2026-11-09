/**
 * Os efeitos de tela (aberração cromática, grão de VHS, brilho do neon): ligados por padrão, desligáveis no menu para
 * computador lento, lembrados pelo navegador (localStorage). Quem desenha (`Scene`) escuta a troca com `onEffects`.
 */
const KEY = 'guess.effects';

type MaybeStore = Pick<Storage, 'getItem' | 'setItem'> | null;
const local = (): MaybeStore => (typeof localStorage === 'undefined' ? null : localStorage);

/** Ligados, a menos que este navegador tenha desligado. */
export function effectsIn(store: MaybeStore): boolean {
  try { return store?.getItem(KEY) !== '0'; } catch { return true; }
}

export function rememberEffectsIn(store: MaybeStore, on: boolean) {
  try { store?.setItem(KEY, on ? '1' : '0'); } catch { /* modo privado: segue sem lembrar */ }
}

let on = effectsIn(local());
const listeners = new Set<(on: boolean) => void>();

export const effectsOn = () => on;

export function setEffects(value: boolean) {
  on = value;
  rememberEffectsIn(local(), value);
  for (const fn of listeners) fn(value);
}

/** Avisa a cada troca; devolve como parar de ouvir. */
export function onEffects(fn: (on: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
