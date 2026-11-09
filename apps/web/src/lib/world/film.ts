/**
 * O visual de filme (ADR 0006, issue #6): filtros do Pixi só no contêiner do mundo, nunca nos post-its e painéis em
 * HTML. Brilho (bloom) no cenário, para o neon e as janelas acenderem sem estourar os personagens; aberração cromática
 * e grão de VHS (ruído com a semente mudando a cada quadro e linhas de varredura) por cima de tudo do mundo.
 * Desligável no menu ("efeitos de tela"). Pixi; sem teste automático.
 *
 * Não lê arte; `scene.ts` põe `scenery` no contêiner do cenário (céu, cidade, telhados) e `world` no mundo inteiro.
 * Como mudar o clima (por exemplo a luz quente do pub, `docs/ideas/pub-irlandes.md`): mexer em `FILM`, ou montar outra
 * lista de filtros aqui; os personagens têm que continuar legíveis com os efeitos ligados.
 */
import { AdvancedBloomFilter, CRTFilter, RGBSplitFilter } from 'pixi-filters';
import type { Filter } from 'pixi.js';

/** As forças, ajustadas no olho a 1080p (escala 3); os personagens têm que continuar legíveis. */
export const FILM = {
  /** separação de vermelho e azul, em pixels da tela (para lados opostos; o verde fica) */
  split: 1.5,
  /** ruído do grão (0–1) e o tamanho do grão, em pixels da tela */
  grain: 0.07,
  grainSize: 1,
  /** linhas de varredura: largura em pixels da tela e contraste (0–1) */
  lineWidth: 3,
  lineContrast: 0.12,
  /** escurecer os cantos: o raio (fração da tela) e a força */
  vignetting: 0.32,
  vignettingAlpha: 0.55,
  /** brilho: a partir de que luminância (0–1) acende (o neon e as janelas passam, o concreto não), quanto, e o borrão */
  bloomThreshold: 0.5,
  bloomScale: 0.75,
  bloomBlur: 5,
} as const;

/** Os filtros de filme, prontos para pôr no cenário e no mundo; `tick` a cada quadro. */
export class Film {
  /** no cenário (céu, cidade, telhados, objetos): o brilho do neon */
  readonly scenery: Filter[];
  /** no mundo inteiro: aberração e VHS */
  readonly world: Filter[];
  private readonly crt: CRTFilter;

  constructor() {
    const bloom = new AdvancedBloomFilter({ threshold: FILM.bloomThreshold, bloomScale: FILM.bloomScale, brightness: 1, blur: FILM.bloomBlur, quality: 4 });
    const split = new RGBSplitFilter({ red: { x: -FILM.split, y: 0 }, green: { x: 0, y: 0 }, blue: { x: FILM.split, y: 0 } });
    this.crt = new CRTFilter({
      curvature: 0, lineWidth: FILM.lineWidth, lineContrast: FILM.lineContrast, verticalLine: false,
      // sem curvatura (a tela é plana; curvar entortaria o pixel art), o borrão da vinheta no olho
      noise: FILM.grain, noiseSize: FILM.grainSize, vignetting: FILM.vignetting, vignettingAlpha: FILM.vignettingAlpha, vignettingBlur: 0.35,
      seed: Math.random(), time: 0,
    });
    this.scenery = [bloom];
    this.world = [split, this.crt];
  }

  /** a cada quadro: o grão muda (semente nova), as linhas rolam devagar (o tempo do CRT a 2× o relógio, em s) */
  tick(now: number) {
    this.crt.seed = Math.random();
    this.crt.time = (now / 1000) * 2;
  }
}
