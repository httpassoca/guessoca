/** Ler e escrever PNG no disco; o resto do pipeline só vê `Image`. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { PNG } from 'pngjs';
import type { Image } from './image';

export function readPng(path: string): Image {
  const png = PNG.sync.read(readFileSync(path));
  return { width: png.width, height: png.height, data: new Uint8Array(png.data) };
}

export function writePng(path: string, img: Image) {
  const png = new PNG({ width: img.width, height: img.height });
  png.data = Buffer.from(img.data);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, PNG.sync.write(png, { colorType: 6 }));
}
