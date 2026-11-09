/** O passo da física: 60 por segundo, fixo, não importa a taxa do monitor. */
export const STEP_MS = 1000 / 60;
/** depois de a aba dormir, recupera no máximo isto de passos de uma vez (o resto do tempo é esquecido) */
export const MAX_STEPS = 15;

/**
 * Quantos passos fixos cabem no tempo real que passou (`elapsed`, ms) mais a sobra do quadro anterior (`acc`); devolve a
 * nova sobra. Depois de `MAX_STEPS`, joga fora o atraso em vez de correr atrás dele.
 */
export function fixedSteps(acc: number, elapsed: number, step = STEP_MS, max = MAX_STEPS): { steps: number; acc: number } {
  let total = acc + Math.max(0, elapsed);
  let steps = Math.floor(total / step);
  if (steps > max) { steps = max; total = steps * step + (total % step); }
  return { steps, acc: total - steps * step };
}
