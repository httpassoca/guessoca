/**
 * `bun run sprites:preview`: folhas de contato ampliadas do que `bun run sprites` gerou, para conferir a arte no olho
 * sem abrir o jogo. Lê só a saída versionada (as folhas em `apps/web/public/sprites/` e os atlas em
 * `apps/web/src/lib/sprites/`), nunca `assets-src/`, então roda em qualquer máquina. Escreve em `.preview/` na raiz
 * (fora do git e do Docker) e imprime cada caminho:
 *
 * - `<modelo>-<animação>.png`: os quadros de uma animação lado a lado, do primeiro personagem do modelo (o mesmo atlas
 *   vale para as outras cores), cada quadro num xadrez com borda e tiques vermelhos embaixo e à esquerda, na coluna e na linha da âncora (o pé);
 * - `characters-idle.png`: o primeiro quadro do parado dos sete personagens, na ordem dos lugares 0–6;
 * - `rooftop.png`, `emotes-<língua>.png` e `skyline-<camada>.png`: os objetos do telhado, os balões e a cidade.
 *
 * Tudo a `SCALE`× (4). A montagem (`contactLayout`, `contactSheet`, `upscale`) é pura e testada em
 * `test/preview.test.ts`; só o fim do arquivo (`import.meta.main`) mexe em disco.
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { ANIMATION_NAMES, type Atlas } from './atlas';
import type { CharacterEntry } from './characters';
import type { EmoteAtlas } from './emotes';
import { blank, blit, crop, getPixel, rgbOf, setPixel, type Hex, type Image } from './image';
import { readPng, readSheet, writePng } from './png';
import type { RooftopAtlas } from './rooftop';

/** A ampliação das folhas de contato: 1 pixel da folha vira `SCALE × SCALE` pixels da imagem. */
export const SCALE = 4;

/** As cores da folha de contato: o fundo, as duas casas do xadrez, a borda de cada quadro e o tique da âncora. */
export const CONTACT_COLORS = { bg: '101018', light: '3a3a46', dark: '2a2a34', border: '8a8aa0', anchor: 'ff3344' } as const;

export interface ContactOptions {
  /** ampliação, em pixels da imagem por pixel da folha */
  scale: number;
  /** espaço em volta de cada quadro (fora da borda), em pixels da imagem; cabe o tique da âncora */
  pad: number;
  /** a imagem não passa desta largura: os quadros quebram em linhas (prateleiras); sem isto, uma linha só */
  maxWidth?: number;
  /** lado de uma casa do xadrez, em pixels da imagem */
  checker: number;
}

/** Onde o miolo de um quadro (o quadro ampliado, sem a borda) fica na imagem, em pixels da imagem. */
export interface Cell { x: number; y: number; w: number; h: number }

/**
 * A disposição: cada quadro `w×h` (em pixels da folha) vira um miolo de `w·scale × h·scale`, com 1 pixel de borda e
 * `pad` de espaço em volta. Da esquerda para a direita, numa linha só ou em prateleiras de até `maxWidth`; a altura de
 * uma prateleira é a do maior quadro nela, e os quadros se alinham por cima.
 */
export function contactLayout(sizes: readonly { w: number; h: number }[], o: ContactOptions): { width: number; height: number; cells: Cell[] } {
  const outer = (n: number) => n * o.scale + 2 + 2 * o.pad;
  const cells: Cell[] = [];
  let x = 0, y = 0, shelf = 0, width = 0;
  for (const s of sizes) {
    const w = outer(s.w), h = outer(s.h);
    if (x > 0 && o.maxWidth !== undefined && x + w > o.maxWidth) { y += shelf; x = 0; shelf = 0; }
    cells.push({ x: x + o.pad + 1, y: y + o.pad + 1, w: s.w * o.scale, h: s.h * o.scale });
    x += w;
    shelf = Math.max(shelf, h);
    width = Math.max(width, x);
  }
  return { width: Math.max(1, width), height: Math.max(1, y + shelf), cells };
}

/** `img` ampliada `k` vezes sem borrar (vizinho mais próximo). */
export function upscale(img: Image, k: number): Image {
  const out = blank(img.width * k, img.height * k);
  for (let y = 0; y < out.height; y++) for (let x = 0; x < out.width; x++) setPixel(out, x, y, getPixel(img, Math.floor(x / k), Math.floor(y / k)));
  return out;
}

function rect(img: Image, x: number, y: number, w: number, h: number, hex: Hex) {
  const c = [...rgbOf(hex), 255];
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (i >= 0 && j >= 0 && i < img.width && j < img.height) setPixel(img, i, j, c);
}

/**
 * A folha de contato: os `frames` na disposição de `contactLayout`, cada um ampliado sobre um xadrez (o transparente
 * aparece), com borda. `anchors[i]`, se houver, é a âncora do quadro `i` em pixels do quadro: dois tiques vermelhos de
 * `scale` pixels, um embaixo da borda de baixo na coluna da âncora e um à esquerda da borda na linha dela (a âncora no
 * pé, `y = h`, cai na última linha).
 */
export function contactSheet(frames: readonly Image[], o: ContactOptions, anchors?: readonly ({ x: number; y: number } | null)[]): Image {
  const { width, height, cells } = contactLayout(frames.map((f) => ({ w: f.width, h: f.height })), o);
  const out = blank(width, height);
  rect(out, 0, 0, width, height, CONTACT_COLORS.bg);
  frames.forEach((f, i) => {
    const c = cells[i];
    rect(out, c.x - 1, c.y - 1, c.w + 2, c.h + 2, CONTACT_COLORS.border);
    for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) {
      const odd = (Math.floor(x / o.checker) + Math.floor(y / o.checker)) % 2;
      setPixel(out, c.x + x, c.y + y, [...rgbOf(odd ? CONTACT_COLORS.dark : CONTACT_COLORS.light), 255]);
    }
    blit(out, upscale(f, o.scale), c.x, c.y);
    const a = anchors?.[i];
    if (!a) return;
    const tick = Math.max(1, o.pad - 1);
    rect(out, c.x + a.x * o.scale, c.y + c.h + 1, o.scale, tick, CONTACT_COLORS.anchor);
    rect(out, c.x - 1 - tick, c.y + Math.min(a.y * o.scale, c.h - o.scale), tick, o.scale, CONTACT_COLORS.anchor);
  });
  return out;
}

/** As opções de sempre: `SCALE`×, 4 de espaço (cabe o tique), casas de um pixel da folha, até 2400 de largura. */
export const PREVIEW: ContactOptions = { scale: SCALE, pad: 4, checker: SCALE, maxWidth: 2400 };

/** Os quadros da animação `name` numa folha de personagem, em pixels do quadro. */
export function animationFrames(sheet: Image, atlas: Atlas, name: (typeof ANIMATION_NAMES)[number]): Image[] {
  const a = atlas.animations[name];
  return Array.from({ length: a.frames }, (_, i) => crop(sheet, i * atlas.frame.w, a.row * atlas.frame.h, atlas.frame.w, atlas.frame.h));
}

if (import.meta.main) {
  const root = resolve(import.meta.dir, '../../..');
  const sheets = join(root, 'apps/web/public/sprites');
  const atlases = join(root, 'apps/web/src/lib/sprites');
  const out = join(root, '.preview');
  mkdirSync(out, { recursive: true });
  const json = <T>(name: string): T => JSON.parse(readFileSync(join(atlases, name), 'utf8')) as T;
  const written: string[] = [];
  const write = (name: string, img: Image) => {
    const path = join(out, name);
    writePng(path, img);
    written.push(`${relative(root, path)}  ${img.width}×${img.height}`);
  };
  const sheetOf = (url: string) => readSheet(join(sheets, url.replace(/^\/sprites\//, '')));

  // os personagens: uma imagem por animação de cada modelo, e o parado dos sete
  const list = json<CharacterEntry[]>('characters.json');
  const idles: Image[] = [];
  const idleAnchors: { x: number; y: number }[] = [];
  const seen = new Set<string>();
  for (const c of list) {
    const atlas = json<Atlas>(`${c.atlas}.json`);
    const sheet = await sheetOf(c.sheet);
    idles.push(animationFrames(sheet, atlas, 'idle')[0]);
    idleAnchors.push(atlas.anchor);
    if (seen.has(c.model)) continue;
    seen.add(c.model);
    for (const name of ANIMATION_NAMES) {
      const frames = animationFrames(sheet, atlas, name);
      write(`${c.model}-${name}.png`, contactSheet(frames, PREVIEW, frames.map(() => atlas.anchor)));
    }
  }
  write('characters-idle.png', contactSheet(idles, PREVIEW, idleAnchors));

  // o telhado: cada objeto da folha, em prateleiras, com a âncora
  const rooftop = json<RooftopAtlas & { skylines: { name: string; file: string }[] }>('rooftop.json');
  const roofSheet = readPng(join(sheets, 'rooftop.png'));
  const props = Object.values(rooftop.frames);
  write('rooftop.png', contactSheet(props.map((f) => crop(roofSheet, f.x, f.y, f.w, f.h)), PREVIEW, props.map((f) => f.anchor)));

  // os balões, um arquivo por língua, com a ponta do rabicho como âncora
  const emotes = json<EmoteAtlas>('emotes.json');
  for (const lang of ['pt-BR', 'en-US']) {
    const file = join(sheets, `emotes-${lang}.png`);
    if (!existsSync(file)) continue;
    const sheet = readPng(file);
    const frames = Object.values(emotes.frames);
    write(`emotes-${lang}.png`, contactSheet(frames.map((f) => crop(sheet, f.x, f.y, f.w, f.h)), PREVIEW, frames.map((f) => ({ x: f.tip.x, y: f.h }))));
  }

  // a cidade ao fundo: cada faixa inteira, e duas vezes lado a lado para ver a emenda
  for (const s of rooftop.skylines) {
    const strip = readPng(join(sheets, s.file));
    const twice = blank(strip.width * 2, strip.height);
    blit(twice, strip, 0, 0);
    blit(twice, strip, strip.width, 0);
    write(`${s.name}.png`, contactSheet([twice], { ...PREVIEW, maxWidth: undefined }));
  }

  console.log(`prévia em ${relative(root, out)}/ (${SCALE}×; os tiques vermelhos embaixo e à esquerda de cada quadro marcam a âncora):`);
  for (const line of written) console.log(`  ${line}`);
}
