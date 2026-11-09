/**
 * A cidade ao fundo (issue #6): faixas largas de prédios que repetem na horizontal, geradas por um sorteio semeado, uma
 * por profundidade. A de longe é mais clara e enevoada, com janelas de um pixel; a de perto é escura, com janelas
 * maiores, caixas-d'água, antenas e um pouco de neon. O cliente as rola a frações diferentes da câmera (paralaxe).
 *
 * Repete sem emenda: as duas primeiras e as duas últimas colunas ficam fora dos prédios, só com a base, então a primeira
 * e a última coluna são iguais.
 *
 * Sai, por `index.ts`: `apps/web/public/sprites/skyline-far.png` e `skyline-near.png`, listadas em `skylines` de
 * `apps/web/src/lib/sprites/rooftop.json`. O cliente (`world/backdrop.ts`) as põe num `TilingSprite` na escala inteira, com
 * a base de cada uma a uma altura fixa do chão (`FAR_BASE`, `NEAR_BASE`) e rolando a `PARALLAX.far`/`.near` da câmera
 * (`world/parallax.ts`). Em pixels da faixa, `y` para baixo; 1 pixel = 1 unidade do mundo antes da escala.
 *
 * Como mudar: outra cidade é outra `seed` em `SKYLINES` (a mesma semente dá sempre a mesma imagem, byte a byte); outro
 * clima são os números de `STYLES`. Conferir com `bun run sprites:preview`.
 */
import { blank, rgbOf, setPixel, type Hex, type Image } from './image';

/** A camada: `far` (longe, clara e enevoada) ou `near` (perto, escura). O cliente acha a faixa pela camada. */
export type SkylineLayer = 'far' | 'near';

/** Uma faixa: o nome do arquivo (sem `.png`), a camada, o tamanho em pixels (a largura é o ladrilho que repete) e a semente. */
export interface SkylineSpec { name: string; layer: SkylineLayer; width: number; height: number; seed: number }

/**
 * As duas faixas. A largura é o ladrilho (a de perto mais larga, porque anda mais rápido e a repetição se notaria antes);
 * a altura dá folga acima do prédio mais alto de cada estilo (`maxH`) para as antenas. As sementes são fixas e não têm
 * significado: trocar uma dá outra cidade.
 */
export const SKYLINES: readonly SkylineSpec[] = [
  { name: 'skyline-far', layer: 'far', width: 320, height: 150, seed: 11 },
  { name: 'skyline-near', layer: 'near', width: 448, height: 230, seed: 29 },
];

/**
 * O jeito de uma camada. Cores: `body` (paredes, sorteadas por prédio), `edge` (a quina da esquerda e a borda da caixa-
 * d'água), `roof` (a laje e as antenas), `dark` (janela apagada; null = nem desenha), `lit` (janelas acesas), `base` (o
 * chão atrás de tudo, `baseH` linhas de altura, para não ver céu entre os prédios). `litP` é a chance de uma janela estar
 * acesa (vezes 1,6 ou 0,6 por prédio, e 2,2 num andar em cada quatro). `win`: tamanho da janela e passo em x/y, em pixels.
 * `minW`–`maxW`, `minH`–`maxH`: largura e altura sorteadas de cada prédio. `antennaP`, `tankP`, `neonP`: as chances de
 * antena, caixa-d'água e neon por prédio. Todos ajustados no olho.
 */
interface Style {
  body: Hex[]; edge: Hex; roof: Hex; dark: Hex | null; lit: Hex[]; litP: number; base: Hex; baseH: number;
  win: { w: number; h: number; sx: number; sy: number };
  minW: number; maxW: number; minH: number; maxH: number;
  antennaP: number; tankP: number; neonP: number;
}

/** Longe: claro, roxo, janelas de 1 pixel e poucas, sem caixas-d'água. Perto: escuro, janelas de 2×2, mais neon. */
const STYLES: Record<SkylineLayer, Style> = {
  far: {
    body: ['2a2350', '2e2757', '262048'], edge: '3a3172', roof: '342c66', dark: null, lit: ['a5789a', 'c79c6e', '8c6aa8'],
    litP: 0.11, base: '241e44', baseH: 24, win: { w: 1, h: 1, sx: 3, sy: 3 },
    minW: 12, maxW: 30, minH: 36, maxH: 140, antennaP: 0.35, tankP: 0, neonP: 0.08,
  },
  near: {
    body: ['15122a', '18142f', '120f24'], edge: '241f42', roof: '1f1a3a', dark: '1d1938', lit: ['e0a64a', 'ffd27a', 'c8873a', 'ffe2a0'],
    litP: 0.09, base: '0e0c1d', baseH: 100, win: { w: 2, h: 2, sx: 4, sy: 5 },
    minW: 22, maxW: 50, minH: 90, maxH: 190, antennaP: 0.3, tankP: 0.35, neonP: 0.45,
  },
};

/** Neon (tubo, brilho): o magenta e o ciano da paleta do telhado (`x`/`v` e `z`/`u` em `rooftop.ts`). */
const NEON: [Hex, Hex][] = [['ff3cc8', '6e1660'], ['3ef0ff', '125a74']];
/** A luz vermelha na ponta das antenas (o `R` do telhado). */
const BEACON: Hex = 'ff4256';

/** Sorteio pequeno e determinístico (mulberry32): a mesma semente dá sempre a mesma cidade. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Uma faixa da cidade, `width × height` pixels: prédios lado a lado da coluna 2 até `width − 2`, cada um com largura e
 * altura sorteadas, às vezes um recuo no topo, janelas, antena, caixa-d'água e neon; às vezes um vão de 1–4 pixels
 * entre eles (mostra a `base`). Determinística pela `seed`.
 */
export function skyline(o: { layer: SkylineLayer; width: number; height: number; seed: number }): Image {
  const st = STYLES[o.layer];
  const r = rng(o.seed);
  const int = (a: number, b: number) => a + Math.floor(r() * (b - a + 1));
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
  const { width: W, height: H } = o;
  const img = blank(W, H);
  const put = (x: number, y: number, hex: Hex) => { if (x >= 0 && y >= 0 && x < W && y < H) setPixel(img, x, y, [...rgbOf(hex), 255]); };
  const rect = (x: number, y: number, w: number, h: number, hex: Hex) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) put(i, j, hex); };

  // a base: o que fica atrás de tudo embaixo, para não haver frestas de céu entre os prédios
  rect(0, H - st.baseH, W, st.baseH, st.base);

  let x = 2;
  while (x < W - 2) {
    let bw = int(st.minW, st.maxW);
    if (x + bw > W - 2) bw = W - 2 - x;
    if (bw < 6) break;
    const bh = Math.min(H - 2, int(st.minH, st.maxH));
    const top = H - bh;
    const body = pick(st.body);
    rect(x, top, bw, bh, body);
    // recuo: o topo mais estreito, às vezes
    let roofX = x, roofW = bw, roofY = top;
    if (bw > 18 && r() < 0.4) {
      const inset = int(3, Math.floor(bw / 4));
      const tier = int(6, 16);
      for (let j = top; j < top + tier; j++) for (let i = x; i < x + bw; i++) if (i < x + inset || i >= x + bw - inset) clear(img, i, j);
      roofX = x + inset; roofW = bw - 2 * inset; roofY = top;
      rect(x, top + tier, bw, 1, st.roof);
    }
    rect(roofX, roofY, roofW, 1, st.roof);
    rect(x, top + 1, 1, bh - 1, st.edge);

    // janelas
    const { w: ww, h: wh, sx, sy } = st.win;
    const dense = r() < 0.5 ? 1.6 : 0.6;
    for (let wy = top + 4; wy + wh < H - 2; wy += sy) {
      const floorLit = r() < 0.25 ? 2.2 : 1;
      for (let wx = x + 3; wx + ww < x + bw - 1; wx += sx) {
        if (!isInside(img, wx, wy)) continue;
        if (r() < st.litP * dense * floorLit) rect(wx, wy, ww, wh, pick(st.lit));
        else if (st.dark) rect(wx, wy, ww, wh, st.dark);
      }
    }

    // em cima: antena com luz, caixa-d'água
    if (r() < st.antennaP) {
      const ax = roofX + int(1, Math.max(1, roofW - 2));
      const ah = int(5, o.layer === 'far' ? 12 : 18);
      rect(ax, roofY - ah, 1, ah, st.roof);
      put(ax, roofY - ah - 1, BEACON);
    }
    if (st.tankP && roofW > 12 && r() < st.tankP) {
      const tx = roofX + int(2, roofW - 9);
      rect(tx, roofY - 8, 6, 5, st.roof);
      rect(tx - 1, roofY - 9, 8, 1, st.edge);
      rect(tx, roofY - 3, 1, 3, st.roof);
      rect(tx + 5, roofY - 3, 1, 3, st.roof);
    }
    // neon: uma faixa vertical numa quina, ou uma placa sem letra
    if (r() < st.neonP && bh > 30) {
      const [tube, glow] = pick(NEON);
      if (r() < 0.6 || o.layer === 'far') {
        const nh = int(8, o.layer === 'far' ? 12 : 22);
        const ny = top + int(4, Math.max(5, Math.min(30, bh - nh - 4)));
        const nx = r() < 0.5 ? x + 2 : x + bw - 3;
        rect(nx - 1, ny - 1, 3, nh + 2, glow);
        rect(nx, ny, 1, nh, tube);
      } else {
        const sw = Math.min(bw - 6, int(8, 14));
        const sy0 = top + int(6, Math.max(7, Math.min(24, bh - 10)));
        const sx0 = x + Math.floor((bw - sw) / 2);
        rect(sx0 - 1, sy0 - 1, sw + 2, 5, glow);
        rect(sx0, sy0, sw, 3, '0c0a17');
        for (let i = 0; i < sw; i += 2) put(sx0 + i, sy0 + 1, tube);
        rect(sx0, sy0, sw, 1, tube);
        rect(sx0, sy0 + 2, sw, 1, tube);
      }
    }
    x += bw + (r() < 0.35 ? int(1, 4) : 0);
  }
  return img;
}

function clear(img: Image, x: number, y: number) {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  img.data[(y * img.width + x) * 4 + 3] = 0;
}

function isInside(img: Image, x: number, y: number) {
  return x >= 0 && y >= 0 && x < img.width && y < img.height && img.data[(y * img.width + x) * 4 + 3] !== 0;
}
