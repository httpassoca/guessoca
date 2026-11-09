/**
 * Os telhados e as caixas em cima deles, como blocos lisos: o topo e a frente (mais escura). É o único lugar que sabe
 * desenhar plataformas; o visual do telhado (issue #6) troca este módulo inteiro.
 */
import { project, type Camera, type Platform, type View } from '@guess/world';
import type { Graphics } from 'pixi.js';

const COLORS = {
  roof: { top: 0x3b3654, front: 0x1d1a2b, edge: 0x5a5480 },
  box: { top: 0x4f4a6e, front: 0x2c2840, edge: 0x76709c },
} as const;

/** Redesenha as plataformas para a câmera de agora (é barato: meia dúzia de retângulos). */
export function drawPlatforms(g: Graphics, platforms: readonly Platform[], cam: Camera, view: View) {
  g.clear();
  const s = view.scale;
  // telhados antes das caixas (elas ficam em cima); entre iguais, o mais ao fundo primeiro
  const order = [...platforms].sort((a, b) => (a.kind === b.kind ? b.z0 - a.z0 : a.kind === 'roof' ? -1 : 1));
  for (const p of order) {
    const c = COLORS[p.kind];
    const back = project({ x: p.x0, y: p.top, z: p.z1 }, cam, view);
    const front = project({ x: p.x1, y: p.top, z: p.z0 }, cam, view);
    const x = back.x, w = front.x - back.x;
    if (x > view.width + view.scale * 100 || x + w < -view.scale * 100) continue;
    // a frente desce até a rua (telhado) ou até o telhado em que a caixa está
    const base = p.kind === 'roof' ? null : baseOf(p, platforms);
    const bottom = base === null ? view.height : project({ x: p.x0, y: base, z: p.z0 }, cam, view).y;
    g.rect(x, back.y, w, front.y - back.y).fill(c.top);
    g.rect(x, front.y, w, Math.max(0, bottom - front.y)).fill(c.front);
    g.rect(x, front.y - s, w, s).fill(c.edge);
  }
}

/** o topo do telhado debaixo de uma caixa */
function baseOf(box: Platform, platforms: readonly Platform[]): number {
  const cx = (box.x0 + box.x1) / 2, cz = (box.z0 + box.z1) / 2;
  let base = 0;
  for (const p of platforms) if (p.kind === 'roof' && cx >= p.x0 && cx <= p.x1 && cz >= p.z0 && cz <= p.z1) base = Math.max(base, p.top);
  return base;
}
