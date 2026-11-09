/**
 * O mapa vestido (issue #6), puro: que objeto da folha do telhado cobre cada caixa do `MAP`, onde ficam o tampo e a
 * fachada de cada telhado na tela, que fachada cada prédio usa, e os enfeites (antenas, letreiros, poças) em
 * coordenadas do mundo. A geometria é do `@guess/world` e não muda aqui: a caixa é a colisão, o objeto é a cara dela.
 *
 * Entrada: `MAP` (unidades do mundo) e `ROOFTOP` (`apps/web/src/lib/sprites/rooftop.json`, pixels da folha). Saída:
 * posições para `platforms.ts`, que desenha. Testado em `apps/web/test/world-dressing.test.ts`.
 *
 * Como mudar:
 * - um enfeite novo: o quadro na folha (`RECIPES` em `tools/sprites/src/rooftop.ts`) e uma linha em `DECOR`;
 * - uma caixa nova no `MAP`: um quadro com `fits` do tamanho dela em `tools/sprites/src/rooftop.ts`, senão `boxLooks`
 *   não acha e ela fica invisível (o teste do pipeline aponta);
 * - um mapa novo: os telhados saem de `MAP` (`ROOFS`), a fachada de cada um de `facadeOf`, e os enfeites de uma `DECOR`
 *   própria, com `roof` sendo o índice em `ROOFS` (da esquerda para a direita).
 */
import { DEPTH, DEPTH_K, MAP, project, type Camera, type Platform, type Vec3, type View } from '@guess/world';
import { ROOFTOP } from '../sprites/rooftop';

/** Os telhados da esquerda para a direita. */
export const ROOFS: readonly Platform[] = MAP.filter((p) => p.kind === 'roof').sort((a, b) => a.x0 - b.x0);

const FACADES = ['facade-a', 'facade-b', 'facade-c'] as const;
/** O nome do quadro da fachada do telhado `i` (tijolo, o hotel de painéis, azulejo), revezando se houver mais prédios. */
export const facadeOf = (i: number) => FACADES[i % FACADES.length];

/** Um retângulo em pixels da tela. */
type Rect = { x: number; y: number; w: number; h: number };

/**
 * Na tela (pixels): o tampo (da beirada de trás à da frente, `DEPTH`·`DEPTH_K`·escala de altura) e a fachada (da beirada
 * da frente até o fim da tela).
 */
export function roofRects(roof: Platform, cam: Camera, view: View): { top: Rect; facade: Rect } {
  const front = project({ x: roof.x0, y: roof.top, z: roof.z0 }, cam, view);
  const back = project({ x: roof.x0, y: roof.top, z: roof.z1 }, cam, view);
  const w = (roof.x1 - roof.x0) * view.scale;
  return {
    top: { x: front.x, y: back.y, w, h: front.y - back.y },
    facade: { x: front.x, y: front.y, w, h: view.height - front.y },
  };
}

/** O objeto que veste uma caixa do mapa. */
export interface BoxLook {
  box: Platform;
  /** o topo do telhado embaixo da caixa, em unidades do mundo: onde está o pé dela */
  base: number;
  /** o nome do quadro em `rooftop.json` */
  frame: string;
  /** onde vai a âncora do objeto (o pé da frente, à esquerda) na tela, em pixels da tela */
  place(cam: Camera, view: View): { x: number; y: number };
}

/**
 * O objeto de cada caixa: o quadro com a mesma largura, a frente com a altura da caixa (do telhado ao topo) e o tampo
 * com o fundo dela achatado pela perspectiva. Caixa sem objeto do tamanho dela fica de fora (a receita falta).
 * Exemplo: a caixa x 120–160, z 30–56, top 28 no telhado de top 0 pede um quadro de 40 de largura, `face` 28 e
 * `round(26 · 0,6)` = 16 linhas de tampo: o ar-condicionado. Assim o topo visível do objeto cai exatamente no `top`.
 */
export function boxLooks(platforms: readonly Platform[]): BoxLook[] {
  const out: BoxLook[] = [];
  for (const box of platforms) {
    if (box.kind !== 'box') continue;
    const cx = (box.x0 + box.x1) / 2, cz = (box.z0 + box.z1) / 2;
    let base = 0;
    for (const r of platforms) if (r.kind === 'roof' && cx >= r.x0 && cx <= r.x1 && cz >= r.z0 && cz <= r.z1) base = Math.max(base, r.top);
    const rows = Math.round((box.z1 - box.z0) * DEPTH_K);
    const frame = Object.keys(ROOFTOP.frames).find((name) => {
      const f = ROOFTOP.frames[name];
      return f.face === box.top - base && f.w === box.x1 - box.x0 && f.h - f.face === rows;
    });
    if (!frame) continue;
    out.push({ box, base, frame, place: (cam, view) => project({ x: box.x0, y: base, z: box.z0 }, cam, view) });
  }
  return out;
}

/**
 * Um enfeite: `back` fica de pé atrás da mureta do fundo (antenas, a placa do hotel), `dy` acima do telhado; `facade` vai
 * pregado na fachada, `dy` abaixo da beirada; `floor` fica deitado no tampo, em `z` (poças; sem `z`, no meio). `frame` é o
 * nome do quadro em `rooftop.json`, `roof` o índice em `ROOFS`, e `x`, `z`, `dy` são unidades do mundo: `x` é onde a
 * âncora do quadro vai.
 */
export interface Decor { frame: string; roof: number; x: number; layer: 'back' | 'facade' | 'floor'; z?: number; dy?: number }

/** a altura da torre, em pixels da folha = unidades do mundo: a luz (`beacon`) vai em cima dela */
const MAST_H = ROOFTOP.frames.mast.h;
/** quanto atrás da beirada de trás ficam os enfeites de trás, em unidades de `z` (logo atrás da mureta do fundo) */
const BEHIND = 3;

/**
 * Os enfeites do telhado, por prédio, escolhidos no olho para não cair onde as caixas estão nem uns sobre os outros:
 * letreiros na fachada a 6 unidades da beirada (logo abaixo da cornija), torres com a luz no topo, poças pelo chão.
 */
export const DECOR: readonly Decor[] = [
  { frame: 'antenna', roof: 0, x: 44, layer: 'back' },
  { frame: 'mast', roof: 0, x: 232, layer: 'back' },
  { frame: 'beacon', roof: 0, x: 232, layer: 'back', dy: MAST_H },
  { frame: 'sign-bar', roof: 0, x: 24, layer: 'facade', dy: 6 },
  { frame: 'puddle-a', roof: 0, x: 70, layer: 'floor', z: 14 },
  { frame: 'puddle-b', roof: 0, x: 212, layer: 'floor', z: 22 },
  { frame: 'sign-hotel', roof: 1, x: 352, layer: 'back' },
  { frame: 'antenna', roof: 1, x: 508, layer: 'back' },
  { frame: 'puddle-b', roof: 1, x: 470, layer: 'floor', z: 12 },
  { frame: 'mast', roof: 2, x: 622, layer: 'back' },
  { frame: 'beacon', roof: 2, x: 622, layer: 'back', dy: MAST_H },
  { frame: 'antenna', roof: 2, x: 838, layer: 'back' },
  { frame: 'sign-24h', roof: 2, x: 792, layer: 'facade', dy: 6 },
  { frame: 'puddle-a', roof: 2, x: 662, layer: 'floor', z: 28 },
  { frame: 'puddle-b', roof: 2, x: 818, layer: 'floor', z: 16 },
];

/** Onde, no mundo (unidades), vai a âncora do enfeite; `project` leva isso para a tela. */
export function decorAt(d: Decor): Vec3 {
  const roof = ROOFS[d.roof];
  if (d.layer === 'back') return { x: d.x, y: roof.top + (d.dy ?? 0), z: DEPTH + BEHIND };
  if (d.layer === 'facade') return { x: d.x, y: roof.top - (d.dy ?? 0), z: 0 };
  return { x: d.x, y: roof.top, z: d.z ?? DEPTH / 2 };
}

/** Um número de 0 a 1 que só depende de `n` (para o neon falhar sem sorteio). */
function hash(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * O neon do hotel falha: em dois de cada três ciclos de 5 s (`hash` do ciclo ≥ 0,33), três tremeliques no começo do
 * ciclo (0–80 ms, 160–220 ms e 400–700 ms apagado), como um tubo com mau contato; no olho. `now` em ms; true = a letra
 * apagada (o quadro `sign-hotel-flicker`).
 */
export function neonFlicker(now: number): boolean {
  const cycle = Math.floor(now / 5000);
  if (hash(cycle) < 0.33) return false;
  const t = now - cycle * 5000;
  return t < 80 || (t >= 160 && t < 220) || (t >= 400 && t < 700);
}

/** A luz vermelha da torre: acesa 400 ms a cada 1,4 s (o ritmo de luz de obstáculo, no olho). `now` em ms. */
export const beaconOn = (now: number) => ((now % 1400) + 1400) % 1400 < 400;
