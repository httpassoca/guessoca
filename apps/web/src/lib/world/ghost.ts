/**
 * Como se desenha quem virou fantasma, puro: nenhum pixel novo, só o que a cena aplica na hora de desenhar (como o
 * `tint` dos bichos, `docs/art.md`). O corpo fica translúcido e azulado e flutua um pouco acima do chão, subindo e
 * descendo devagar em passos inteiros de pixel do mundo (o pixel art continua na grade); a sombra fica no chão, mais
 * fraca, e é ela que diz onde o fantasma "está". Testado em `apps/web/test/world-ghost.test.ts`.
 */

/** quanto do corpo se vê */
export const GHOST_ALPHA = 0.45;
/** o azul-gelo multiplicado nas cores do personagem */
export const GHOST_TINT = 0xb4d4ff;
/** a sombra do fantasma, em vezes a de um corpo comum */
export const GHOST_SHADOW_ALPHA = 0.35;
/** de quanto a quanto (pixels do mundo, inteiros) flutua acima do chão, e quanto dura uma subida e descida, ms */
export const GHOST_LIFT_MIN = 1;
export const GHOST_LIFT_MAX = 4;
export const GHOST_FLOAT_MS = 2400;

/**
 * A altura do flutuar em pixels do mundo (inteiro, entre `GHOST_LIFT_MIN` e `GHOST_LIFT_MAX`) no instante `now`; `seed`
 * defasa cada fantasma, para dois juntos não subirem em coro.
 */
export function ghostLift(now: number, seed = 0): number {
  const phase = ((now + seed * 397) % GHOST_FLOAT_MS) / GHOST_FLOAT_MS;
  const k = (1 - Math.cos(phase * 2 * Math.PI)) / 2;
  return Math.round(GHOST_LIFT_MIN + k * (GHOST_LIFT_MAX - GHOST_LIFT_MIN));
}
