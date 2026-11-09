/**
 * O telhado (ADR 0005): movimento, gravidade, colisão, ficar na cabeça dos outros, empurrão e volta depois da queda.
 * Puro: nada de DOM, Pixi ou rede. Cada navegador simula o próprio personagem com isto. Por enquanto só o sistema de
 * coordenadas; a simulação chega com o issue do mundo.
 *
 * `x` ao longo dos telhados (direita positiva), `y` para cima, `z` em profundidade (para o fundo positivo).
 */
export interface Vec3 { x: number; y: number; z: number }
