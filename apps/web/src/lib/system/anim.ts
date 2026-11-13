/**
 * O que o `/sistema` precisa para tocar uma animação de um personagem fora do jogo: que quadro mostrar numa hora, e o
 * retângulo que a animação de verdade ocupa no quadro. Puro (menos `trimOf`, que lê os pixels da folha num canvas).
 */
import { CHARACTER_ART, frameAt, type AnimationName, type Atlas } from '../sprites/characters';

/** quanto uma animação sem loop fica no último quadro antes de recomeçar, ms */
export const HOLD = 700;

/** A duração de uma volta da animação, ms. */
export const lengthOf = (atlas: Atlas, name: AnimationName): number => (atlas.animations[name].frames / atlas.animations[name].fps) * 1000;

/** O quadro da animação `name` na hora `now` (ms): em loop dá a volta; sem loop toca, segura o último por `HOLD` e recomeça. */
export function frameAtTime(atlas: Atlas, name: AnimationName, now: number): number {
  const a = atlas.animations[name], length = lengthOf(atlas, name);
  const t = a.loop ? now % length : now % (length + HOLD);
  return Math.min(a.frames - 1, Math.floor((t * a.fps) / 1000));
}

/**
 * De quem é um arquivo de `sprites/` (o caminho servido, sem a barra do começo): o personagem `n` e a folha dele
 * (`page` 0, o parado; 1 em diante, as outras animações), ou null se não é folha de personagem. Cada personagem tem uma
 * folha por página do atlas (`char-N-idle`, `char-N-moves`).
 */
export function sheetOfPath(path: string): { n: number; page: number } | null {
  for (const [n, c] of CHARACTER_ART.entries()) {
    const page = c.sheets.findIndex((s) => s.replace(/^\//, '') === path);
    if (page >= 0) return { n, page };
  }
  return null;
}

/** Como chamar a folha `page` de um personagem: a do parado, ou a das outras animações (com o número, se há mais de uma). */
export function pageName(atlas: Atlas, page: number): string {
  if (page === 0) return 'parado';
  const names = Object.entries(atlas.animations).filter(([, a]) => a.page === page).map(([name]) => name);
  return `${atlas.pages.length > 2 ? `folha ${page}: ` : ''}${names.join(', ')}`;
}

/** Um retângulo em pixels do quadro. */
export interface Box { x: number; y: number; w: number; h: number }

const cache = new WeakMap<HTMLImageElement, Map<string, Box>>();

/**
 * O retângulo que a animação `name` ocupa no quadro, somando todos os quadros dela: da coluna mais à esquerda à mais à
 * direita com algum pixel, e do pixel mais alto até a linha do chão (`anchor.y`), para o pé ficar sempre embaixo. O
 * quadro de um modelo tem a folga da pose mais larga de todas (o ataque); cada animação ocupa só um pedaço dele, e
 * mostrar o quadro inteiro deixa o personagem pequeno e fora do meio. Guardado por folha e animação. `sheets` são as
 * folhas do personagem, uma por página do atlas; a animação está numa só (`page`), talvez em mais de uma linha.
 */
export function trimOf(sheets: readonly HTMLImageElement[], atlas: Atlas, name: AnimationName): Box {
  const { w, h } = atlas.frame, a = atlas.animations[name];
  const sheet = sheets[a.page];
  const known = cache.get(sheet)?.get(name);
  if (known) return known;
  const full: Box = { x: 0, y: 0, w, h: atlas.anchor.y };
  let box = full;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = a.frames * w; canvas.height = h;
    const g = canvas.getContext('2d', { willReadFrequently: true });
    if (g) {
      // os quadros da animação lado a lado, de onde estiverem na folha
      for (let i = 0; i < a.frames; i++) { const f = frameAt(atlas, name, i); g.drawImage(sheet, f.x, f.y, w, h, i * w, 0, w, h); }
      const data = g.getImageData(0, 0, a.frames * w, h).data;
      let x0 = w, x1 = -1, y0 = h;
      for (let y = 0; y < h; y++) for (let x = 0; x < a.frames * w; x++) {
        if (!data[(y * a.frames * w + x) * 4 + 3]) continue;
        const fx = x % w;
        if (fx < x0) x0 = fx;
        if (fx > x1) x1 = fx;
        if (y < y0) y0 = y;
      }
      if (x1 >= 0) box = { x: Math.max(0, x0 - 1), y: Math.max(0, y0 - 1), w: Math.min(w, x1 + 2) - Math.max(0, x0 - 1), h: atlas.anchor.y - Math.max(0, y0 - 1) };
    }
  } catch { /* sem canvas: o quadro inteiro */ }
  if (!cache.has(sheet)) cache.set(sheet, new Map());
  cache.get(sheet)!.set(name, box);
  return box;
}
