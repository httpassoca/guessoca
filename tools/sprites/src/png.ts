/**
 * Ler e escrever PNG no disco, a única porta do pipeline para arquivos de imagem: `index.ts` lê as folhas de
 * `assets-src/` com `readPng` e grava as de `apps/web/public/sprites/` com `writePng`; o resto do pipeline só vê
 * `Image` (`image.ts`) e é testado sem disco. Uma arte nova que chegue como PNG (um objeto do telhado desenhado à mão,
 * por exemplo) entra por aqui, em `index.ts`, e segue como `Image`.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { PNG } from 'pngjs';
import type { Image } from './image';

/** Lê um PNG (qualquer tipo de cor) como `Image` RGBA de 8 bits, em pixels do arquivo. */
export function readPng(path: string): Image {
  const png = PNG.sync.read(readFileSync(path));
  return { width: png.width, height: png.height, data: new Uint8Array(png.data) };
}

/**
 * Grava `img` como PNG RGBA (`colorType: 6`), criando a pasta. A saída é determinística: as mesmas receitas sobre o mesmo
 * pacote dão os mesmos bytes, então `bun run sprites` sem mudança de receita não muda nada no git.
 */
export function writePng(path: string, img: Image) {
  const png = new PNG({ width: img.width, height: img.height });
  png.data = Buffer.from(img.data);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, PNG.sync.write(png, { colorType: 6 }));
}

/**
 * Grava a imagem como WebP **sem perda** (o codificador que vem no Bun, `Bun.Image`): os pixels visíveis voltam
 * idênticos, e o arquivo sai uns 30 % menor que o PNG. Para as folhas grandes (arte de modelo de imagem, que o jogo
 * desenha encolhida); o pixel art pequeno continua em PNG. O RGB por baixo de um pixel transparente não é guardado.
 */
export async function writeWebp(path: string, img: Image) {
  const png = new PNG({ width: img.width, height: img.height });
  png.data = Buffer.from(img.data);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, await new Bun.Image(PNG.sync.write(png, { colorType: 6 })).webp({ lossless: true }).bytes());
}

/** Lê um WebP como `Image`; os pixels transparentes voltam com RGB zero. */
export async function readWebp(path: string): Promise<Image> {
  const png = PNG.sync.read(Buffer.from(await new Bun.Image(readFileSync(path)).png().bytes()));
  const data = new Uint8Array(png.data);
  for (let i = 0; i < data.length; i += 4) if (!data[i + 3]) data[i] = data[i + 1] = data[i + 2] = 0;
  return { width: png.width, height: png.height, data };
}

/** Lê uma folha gerada pelo nome: `.webp` ou PNG. */
export const readSheet = async (path: string): Promise<Image> => (path.endsWith('.webp') ? readWebp(path) : readPng(path));
/** Grava uma folha gerada pelo nome: `.webp` (sem perda) ou PNG. */
export const writeSheet = async (path: string, img: Image) => (path.endsWith('.webp') ? writeWebp(path, img) : writePng(path, img));
