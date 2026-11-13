/**
 * O confete de quem acertou (issue #58), puro: um número fixo de pedaços sorteados uma vez, e onde cada um está pela
 * idade dele, em forma fechada (nada é simulado por quadro). Metade estoura na hora; a outra metade nasce aos poucos
 * durante um segundo, de onde o personagem estiver (ele está sendo lançado para o alto, então fica um rastro). Cada
 * pedaço sai rápido, freia no ar e desce balançando; no fim da vida pisca em vez de esmaecer (pixel art: sem
 * transparência). Em unidades do mundo (1 = 1 pixel de sprite), `y` para cima, ms. `celebration.ts` desenha; testado
 * em `apps/web/test/world-confetti.test.ts`.
 */

/** Um pedaço de confete: quando nasce (ms depois do acerto), quanto vive, com que velocidade sai, como desce. */
export interface Piece {
  born: number;
  life: number;
  /** de onde sai em relação ao meio do corpo, unidades inteiras (`oy` para cima): espalha o confete pelo corpo */
  ox: number;
  oy: number;
  /** a velocidade de saída, unidades/s (`vy` para cima); o ar freia */
  vx: number;
  vy: number;
  /** a velocidade de descida, unidades/s */
  fall: number;
  /** o balanço para os lados: meia-largura (unidades) e a fase (rad) */
  sway: number;
  phase: number;
  /** índice em `CONFETTI_COLORS` */
  color: number;
  /** o lado do quadradinho, em pixels do mundo */
  size: 1 | 2;
}

/** quanto dura a comemoração inteira, ms: nenhum pedaço passa disto */
export const CONFETTI_MS = 2000;
/** quantos pedaços por acerto (no olho: enche em volta do personagem sem cobri-lo) */
export const CONFETTI_PIECES = 96;
/** as cores, chapadas, da paleta do telhado (`PALETTE` em `tools/sprites/src/rooftop.ts`): os neons, a janela acesa, a luz da antena e a da televisão */
export const CONFETTI_COLORS: readonly number[] = [0xff3cc8, 0x3ef0ff, 0xffcf73, 0xfff1c2, 0xff4256, 0x4f78ff];

/** a fração que estoura na hora; o resto é o rastro */
const BURST = 0.5;
/** o rastro nasce durante isto, ms (o salto inteiro dura cerca de 1 s) */
const STREAM_MS = 1000;
/** a vida de um pedaço, ms, mínimo e máximo */
const LIFE: [number, number] = [700, 1000];
/** a velocidade de saída: para os lados até isto, para cima entre os dois, unidades/s */
const OUT_X = 170;
const OUT_Y: [number, number] = [80, 230];
/** o freio do ar, por segundo: a saída percorre no máximo velocidade / `DRAG` (34 para os lados, 46 para cima) */
const DRAG = 5;
/** a descida, unidades/s, mínimo e máximo */
const FALL: [number, number] = [32, 50];
/** de onde sai: até isto para cada lado do meio do corpo, unidades */
const FROM_X = 8;
const FROM_Y = 12;
/** o balanço: até 3 unidades para cada lado, a 9 rad/s */
const SWAY: [number, number] = [1, 3];
const SWAY_SPEED = 9;
/** no fim da vida o pedaço pisca: os últimos 240 ms, alternando a cada 60 */
const BLINK_MS = 240;
const BLINK_PERIOD = 60;

/** Um sorteio semeado (mulberry32), em [0, 1): a mesma semente dá a mesma sequência. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Os pedaços de uma comemoração, sorteados com `random`. */
export function confetti(random: () => number, count = CONFETTI_PIECES): Piece[] {
  const between = ([a, b]: [number, number]) => a + random() * (b - a);
  const burst = Math.round(count * BURST);
  return Array.from({ length: count }, (_, i): Piece => {
    const life = Math.round(between(LIFE));
    // o rastro: espalhado por igual no tempo, com um pouco de acaso, sem passar do fim
    const born = i < burst ? 0 : Math.min(CONFETTI_MS - life, Math.round(((i - burst + random()) / (count - burst)) * STREAM_MS) + 1);
    return {
      born, life,
      ox: Math.round((random() * 2 - 1) * FROM_X) + 0,
      oy: Math.round((random() * 2 - 1) * FROM_Y) + 0,
      vx: (random() * 2 - 1) * OUT_X,
      vy: between(OUT_Y),
      fall: between(FALL),
      sway: between(SWAY),
      phase: random() * Math.PI * 2,
      color: Math.floor(random() * CONFETTI_COLORS.length),
      size: random() < 0.7 ? 2 : 1,
    };
  });
}

/** Onde o pedaço está em relação a onde nasceu, `age` ms depois: pixels inteiros do mundo, `y` para cima. */
export function pieceOffset(p: Piece, age: number): { x: number; y: number } {
  const t = Math.max(0, age) / 1000;
  const out = (1 - Math.exp(-DRAG * t)) / DRAG;
  const x = p.vx * out + p.sway * (Math.sin(p.phase + SWAY_SPEED * t) - Math.sin(p.phase));
  const y = p.vy * out - p.fall * t;
  return { x: Math.round(x) + 0, y: Math.round(y) + 0 }; // + 0: sem −0
}

/** Se o pedaço aparece com `age` ms: só durante a vida, piscando no fim. */
export function pieceShown(p: Piece, age: number): boolean {
  if (age < 0 || age >= p.life) return false;
  const left = p.life - age;
  return left > BLINK_MS || Math.floor(left / BLINK_PERIOD) % 2 === 0;
}
