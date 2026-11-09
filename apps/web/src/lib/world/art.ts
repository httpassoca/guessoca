/**
 * As texturas do telhado, carregadas da folha gerada (`rooftop.png`) e das faixas da cidade. Quadros comuns apontam
 * para a folha; os que repetem (e as faixas) ganham uma textura só deles, copiada para um canvas com `repeat`, para o
 * `TilingSprite` repetir sem puxar pixel do vizinho na folha. Pixi; sem teste automático.
 *
 * Entrada: `/sprites/rooftop.png` e `/sprites/skyline-*.png` (em `apps/web/public/sprites/`) com o atlas `ROOFTOP`
 * (`../sprites/rooftop.ts`, que lê `rooftop.json`), tudo gerado por `bun run sprites`. Saída: texturas em pixels da
 * folha, para `backdrop.ts`, `platforms.ts` e `weather.ts`. Um nome que não está na folha dá erro na carga, dizendo qual.
 */
import { Assets, CanvasSource, Rectangle, Texture } from 'pixi.js';
import { ROOFTOP, rooftopSheet, skylineUrl } from '../sprites/rooftop';

/** As texturas do telhado, por nome do quadro em `rooftop.json` (e por camada, nas faixas da cidade). */
export interface RooftopArt {
  /** um quadro, apontando para a folha (para `Sprite`) */
  frame(name: string): Texture;
  /** um quadro com `tile: true`, numa textura só dele que repete (para `TilingSprite`) */
  tile(name: string): Texture;
  /** a faixa da cidade da camada `far` ou `near`, que repete */
  skyline(layer: string): Texture;
}

/** O retângulo `x, y, w, h` (pixels da imagem) copiado para um canvas próprio, que repete e amplia sem borrar. */
function ownTexture(resource: CanvasImageSource, x: number, y: number, w: number, h: number): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(resource, x, y, w, h, 0, 0, w, h);
  return new Texture({ source: new CanvasSource({ resource: canvas, addressMode: 'repeat', scaleMode: 'nearest' }) });
}

/** Carrega a folha do telhado e as faixas da cidade e corta cada quadro. Uma vez, quando a cena abre. */
export async function loadRooftopArt(): Promise<RooftopArt> {
  const [sheet, ...strips] = await Promise.all([
    Assets.load<Texture>(rooftopSheet),
    ...ROOFTOP.skylines.map((s) => Assets.load<Texture>(skylineUrl(s))),
  ]);
  const res = sheet.source.resource as CanvasImageSource;
  const frames = new Map<string, Texture>();
  const tiles = new Map<string, Texture>();
  for (const [name, f] of Object.entries(ROOFTOP.frames)) {
    frames.set(name, new Texture({ source: sheet.source, frame: new Rectangle(f.x, f.y, f.w, f.h) }));
    if (f.tile) tiles.set(name, ownTexture(res, f.x, f.y, f.w, f.h));
  }
  const skylines = new Map(ROOFTOP.skylines.map((s, i) => {
    const t = strips[i];
    return [s.layer, ownTexture(t.source.resource as CanvasImageSource, 0, 0, s.w, s.h)] as const;
  }));
  const get = <T>(m: Map<string, T>, k: string, what: string) => { const v = m.get(k); if (!v) throw new Error(`${what} faltando na folha do telhado: ${k}`); return v; };
  return {
    frame: (name) => get(frames, name, 'quadro'),
    tile: (name) => get(tiles, name, 'ladrilho'),
    skyline: (layer) => get(skylines, layer, 'cidade'),
  };
}
