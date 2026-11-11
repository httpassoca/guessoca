/**
 * Um segredo do jogo, puro: trocar de personagem com a partida correndo, sem botão nem aviso em lugar nenhum. As regras
 * já deixam (`character` vale em qualquer fase); o que é escondido é só o jeito de pedir.
 *
 * Como funciona: a sequência `SEQUENCE` (pela posição da tecla, `code`; as setas ou WASD, que no telhado só fazem o
 * personagem dar uns passos) destrava o segredo até a página ser recarregada. Destravado, `Comma` e `Period` (as teclas
 * `,` e `.`) passam para o personagem anterior e o próximo, dando a volta. Num campo de texto, nada disso vale.
 *
 * Não está no menu de teclas, nas traduções nem nos documentos de propósito: quem acha, achou. Para mudar a sequência ou
 * as teclas, é aqui; o teste (`test/secret.test.ts`) acompanha.
 */

/** As oito teclas, na ordem: cima, cima, baixo, baixo, esquerda, direita, esquerda, direita. */
export const SEQUENCE = ['up', 'up', 'down', 'down', 'left', 'right', 'left', 'right'] as const;
type Dir = (typeof SEQUENCE)[number];

const DIRS: Record<string, Dir> = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
};
const STEPS: Record<string, 1 | -1> = { Comma: -1, Period: 1 };

/** O que o segredo guarda: quanto da sequência já entrou, e se já destravou. */
export interface Secret { progress: number; unlocked: boolean }
export const NO_SECRET: Secret = { progress: 0, unlocked: false };

export interface SecretKey { code?: string; repeat?: boolean; ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean }

/**
 * Uma tecla apertada: o segredo novo e, se for o caso, o passo a dar no personagem (−1 o anterior, +1 o próximo).
 * `blocked`: o foco está num campo de texto ou há um modal aberto (a tecla é do texto; o que já entrou da sequência
 * fica). Uma tecla que não é direção, ou a direção errada, recomeça a sequência (a direção errada já conta como a
 * primeira, se for).
 */
export function secretKey(s: Secret, e: SecretKey, blocked: boolean): { secret: Secret; step: 1 | -1 | null } {
  if (blocked || e.repeat || e.ctrlKey || e.altKey || e.metaKey || !e.code) return { secret: s, step: null };
  if (s.unlocked) return { secret: s, step: STEPS[e.code] ?? null };
  const dir = DIRS[e.code];
  if (!dir) return { secret: s.progress ? NO_SECRET : s, step: null };
  const progress = dir === SEQUENCE[s.progress] ? s.progress + 1 : dir === SEQUENCE[0] ? (s.progress >= 2 && SEQUENCE[s.progress - 1] === 'up' && dir === 'up' ? 2 : 1) : 0;
  return progress === SEQUENCE.length ? { secret: { progress: 0, unlocked: true }, step: null } : { secret: { progress, unlocked: false }, step: null };
}

/** O personagem a `step` lugares de `current`, dando a volta em `count`. */
export const stepCharacter = (current: number, step: 1 | -1, count: number): number => (((current + step) % count) + count) % count;
