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
