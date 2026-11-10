/**
 * O clima do telhado antes de o jogo começar, puro: no lobby o mundo fica em preto e branco, um pouco mais escuro e com
 * as sombras carregadas (mais contraste), e ganha cor quando o jogo começa. `scene.ts` põe a matriz num
 * `ColorMatrixFilter` do Pixi no mundo inteiro (antes da aberração e do VHS, que continuam por cima) e usa `moodStep`
 * para ir de um clima ao outro sem salto. Não depende dos "efeitos de tela": diz em que pé a sala está.
 */

/** As forças do clima do lobby, ajustadas no olho. */
export const LOBBY_LOOK = {
  /** quanto da luz fica (1 = igual): um pouco mais escuro */
  brightness: 0.88,
  /** o contraste em volta do cinza médio (1 = igual): acima disso as sombras fecham */
  contrast: 1.2,
  /** quanto tempo leva para ir do cinza à cor (e voltar), em ms */
  fadeMs: 1200,
} as const;

/** Os pesos de luminância (Rec. 601): quanto cada canal pesa no cinza. */
const LUMA = [0.299, 0.587, 0.114] as const;

/**
 * A matriz de cor do lobby (4 linhas de 5: r, g, b, a e o deslocamento, de 0 a 1): cada canal vira a luminância, com o
 * contraste em volta de 0,5 e depois o brilho. `cinza = (luma − 0,5) · contraste + 0,5`, vezes o brilho.
 */
export function lobbyMatrix(look: { brightness: number; contrast: number } = LOBBY_LOOK): number[] {
  const k = look.contrast * look.brightness;
  const offset = (0.5 - 0.5 * look.contrast) * look.brightness;
  const row = [LUMA[0] * k, LUMA[1] * k, LUMA[2] * k, 0, offset];
  return [...row, ...row, ...row, 0, 0, 0, 1, 0];
}

/** Um passo do clima: `amount` (0 = cor, 1 = lobby) anda para `target` no ritmo de `fadeMs`, sem passar dele. */
export function moodStep(amount: number, target: 0 | 1, elapsedMs: number, fadeMs: number = LOBBY_LOOK.fadeMs): number {
  const step = fadeMs > 0 ? Math.max(0, elapsedMs) / fadeMs : 1;
  return target > amount ? Math.min(target, amount + step) : Math.max(target, amount - step);
}
