/**
 * Os balões de fala sobre as cabeças, puro: quem está falando o quê e até quando. Uma fala não fica guardada: vira um
 * balão perto do personagem de quem falou, dura de `BUBBLE_MIN` a `BUBBLE_MAX` conforme o tamanho e some; uma fala nova
 * da mesma pessoa troca a anterior. O `World.svelte` guarda a lista e desenha (HTML, na camada dos post-its, com a fonte
 * de pixel); o relógio é o de quem chama (`performance.now()`). Testado em `apps/web/test/chat.test.ts`.
 */
import { CHAT_INTERVAL } from '@guess/protocol';

/** Um balão de fala: de quem (`id` do membro), o texto já limpo, até quando fica (ms) e um número que muda a cada fala. */
export interface Bubble { id: string; text: string; until: number; seq: number }

/** o balão mais curto fica isto na tela, ms: dá para ler um "oi" e ver de quem veio */
export const BUBBLE_MIN = 3000;
/** e o mais longo (60 caracteres), isto */
export const BUBBLE_MAX = 6000;
/** ms a mais por caractere: 50 leva os 60 caracteres de `BUBBLE_MIN` a `BUBBLE_MAX` */
const BUBBLE_PER_CHAR = 50;

/** Quanto tempo o balão de `text` fica na tela, ms: cresce com o tamanho, entre `BUBBLE_MIN` e `BUBBLE_MAX`. */
export function bubbleMs(text: string): number {
  return Math.min(BUBBLE_MAX, BUBBLE_MIN + BUBBLE_PER_CHAR * [...text].length);
}

/** `id` falou `text` em `now`: o balão dele entra no lugar do anterior (se havia); os vencidos saem. */
export function say(list: readonly Bubble[], id: string, text: string, now: number): Bubble[] {
  const seq = list.reduce((m, b) => Math.max(m, b.seq), 0) + 1;
  return [...alive(list, now).filter((b) => b.id !== id), { id, text, until: now + bubbleMs(text), seq }];
}

/** Os balões que ainda estão na tela em `now`; devolve a mesma lista quando nenhum venceu. */
export function alive(list: readonly Bubble[], now: number): readonly Bubble[] {
  return list.some((b) => b.until <= now) ? list.filter((b) => b.until > now) : list;
}

/** Quando o próximo balão vence, ms; null = não há balão. */
export function nextExpiry(list: readonly Bubble[]): number | null {
  return list.length ? Math.min(...list.map((b) => b.until)) : null;
}

/**
 * o mínimo entre duas falas mandadas daqui: o intervalo do servidor mais uma folga para a rede, senão duas falas a um
 * segundo uma da outra podem chegar mais juntas e a segunda se perde
 */
export const SEND_GAP = CHAT_INTERVAL + 200;

/** Dá para mandar uma fala agora? `lastSent` = quando a última saiu daqui (ms), ou null. */
export function canSend(lastSent: number | null, now: number): boolean {
  return lastSent === null || now - lastSent >= SEND_GAP;
}

/**
 * Quanto (px da tela) empurrar para a direita um balão de `width` px centrado num pixel inteiro, para a borda esquerda
 * dele cair num pixel inteiro: meio pixel quando a largura é ímpar. Fora da grade, a fonte de pixel e o contorno borram.
 */
export function snapShift(width: number): number {
  return width / 2 - Math.floor(width / 2);
}
