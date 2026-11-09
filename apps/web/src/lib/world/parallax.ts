/**
 * Paralaxe, pura: o que fica longe rola mais devagar que o telhado. Cada faixa (o céu, a cidade de longe, a de perto, a
 * neblina) anda a uma fração `factor` da câmera; 0 fica parado (a lua), 1 anda junto com o telhado.
 * Usada por `backdrop.ts` (lua, cidade, neblina da rua) e `weather.ts` (neblina da frente, a 1); testada em
 * `apps/web/test/world-backdrop.test.ts`.
 */

/**
 * Onde começa o ladrilho de uma faixa que repete a cada `tileW` pixels do mundo, em pixels inteiros da tela, sempre em
 * (−ladrilho, 0]: a câmera em `camX` move a faixa `camX·factor` para o outro lado, mais o deslize `drift` (neblina
 * andando sozinha), tudo em pixels do mundo.
 */
export function parallaxOffset(camX: number, factor: number, tileW: number, scale: number, drift = 0): number {
  const tile = tileW * scale;
  const raw = Math.round(-(camX * factor + drift) * scale);
  const m = ((raw % tile) + tile) % tile;
  return m === 0 ? 0 : m - tile;
}

/**
 * As frações da câmera de cada camada, de trás para a frente, no olho: a lua quase parada (0,02, só para não parecer
 * colada na tela), a cidade de longe a 12%, a de perto a 30%, e a neblina da rua, logo abaixo dos telhados, a 75%.
 * O telhado e os corpos andam a 1.
 */
export const PARALLAX = { moon: 0.02, far: 0.12, near: 0.3, street: 0.75 } as const;
