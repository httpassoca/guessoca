/**
 * Ler um GIF animado como quadros RGBA: a arte do Kratos chega como um `.gif` (`assets-src/kratos/kratos.gif`), não como
 * folha PNG. `decodeGif` é puro (bytes → um `Image` por quadro, já compostos no tamanho da tela do GIF) e é testado sem
 * disco; `readGifStrip` lê o arquivo e põe os quadros lado a lado numa folha de uma linha, o mesmo formato das folhas PNG
 * dos outros modelos, para a receita fatiar em células.
 *
 * Só o que um GIF de pixel art usa: paleta global ou local, transparência, entrelaçado e os modos de descarte 0–3. A
 * transparência é binária (alfa 0 ou 255), como o resto do pipeline espera.
 */
import { readFileSync } from 'node:fs';
import { blank, blit, type Image } from './image';

/** Desfaz o LZW de um quadro: `data` são os sub-blocos já juntados; devolve `count` índices de paleta. */
function unlzw(data: Uint8Array, minCode: number, count: number): Uint8Array {
  const out = new Uint8Array(count);
  const clear = 1 << minCode, end = clear + 1;
  const prefix = new Int32Array(4096), suffix = new Uint8Array(4096), stack = new Uint8Array(4097);
  let size = minCode + 1, next = end + 1, prev = -1, first = 0;
  let bits = 0, nbits = 0, at = 0, o = 0;
  while (o < count) {
    while (nbits < size && at < data.length) { bits |= data[at++] << nbits; nbits += 8; }
    if (nbits < size) break;
    const code = bits & ((1 << size) - 1);
    bits >>= size; nbits -= size;
    if (code === clear) { size = minCode + 1; next = end + 1; prev = -1; continue; }
    if (code === end) break;
    if (prev < 0) { out[o++] = code; prev = code; first = code; continue; }
    let cur = code, top = 0;
    if (code >= next) { stack[top++] = first; cur = prev; }
    while (cur > end) { stack[top++] = suffix[cur]; cur = prefix[cur]; }
    first = cur;
    stack[top++] = cur;
    while (top && o < count) out[o++] = stack[--top];
    if (next < 4096) {
      prefix[next] = prev; suffix[next] = first; next++;
      if (next === 1 << size && size < 12) size++;
    }
    prev = code;
  }
  return out;
}

/** A ordem das linhas num quadro entrelaçado: de 8 em 8 a partir da 0, da 4, depois de 4 em 4 da 2, e de 2 em 2 da 1. */
function interlacedRows(h: number): number[] {
  const rows: number[] = [];
  for (const [from, step] of [[0, 8], [4, 8], [2, 4], [1, 2]]) for (let y = from; y < h; y += step) rows.push(y);
  return rows;
}

/** Os quadros de um GIF, cada um do tamanho da tela do GIF e já composto sobre os anteriores conforme o descarte. */
export function decodeGif(bytes: Uint8Array): Image[] {
  const sig = String.fromCharCode(...bytes.subarray(0, 6));
  if (sig !== 'GIF89a' && sig !== 'GIF87a') throw new Error('não é um GIF');
  const u16 = (p: number) => bytes[p] | (bytes[p + 1] << 8);
  const width = u16(6), height = u16(8);
  let p = 13;
  let global: Uint8Array | null = null;
  if (bytes[10] & 0x80) { const n = 3 * (2 << (bytes[10] & 7)); global = bytes.subarray(p, p + n); p += n; }

  /** junta os sub-blocos a partir de `p` e avança até depois do terminador */
  const blocks = () => {
    const parts: number[] = [];
    while (bytes[p]) { for (let i = 1; i <= bytes[p]; i++) parts.push(bytes[p + i]); p += 1 + bytes[p]; }
    p++;
    return Uint8Array.from(parts);
  };

  const frames: Image[] = [];
  let canvas = blank(width, height);
  let transparent = -1, disposal = 0;
  while (p < bytes.length) {
    const kind = bytes[p++];
    if (kind === 0x3b) break;
    if (kind === 0x21) {
      const label = bytes[p++];
      const body = blocks();
      if (label === 0xf9) { disposal = (body[0] >> 2) & 7; transparent = body[0] & 1 ? body[3] : -1; }
      continue;
    }
    if (kind !== 0x2c) throw new Error(`bloco de GIF desconhecido: ${kind}`);
    const x0 = u16(p), y0 = u16(p + 2), w = u16(p + 4), h = u16(p + 6), flags = bytes[p + 8];
    p += 9;
    let table = global;
    if (flags & 0x80) { const n = 3 * (2 << (flags & 7)); table = bytes.subarray(p, p + n); p += n; }
    if (!table) throw new Error('GIF sem paleta');
    const minCode = bytes[p++];
    const indices = unlzw(blocks(), minCode, w * h);
    const rows = flags & 0x40 ? interlacedRows(h) : null;

    const before: Image = { ...canvas, data: canvas.data.slice() };
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const c = indices[j * w + i];
      const x = x0 + i, y = y0 + (rows ? rows[j] : j);
      if (c === transparent || x >= width || y >= height) continue;
      const q = (y * width + x) * 4;
      canvas.data[q] = table[c * 3]; canvas.data[q + 1] = table[c * 3 + 1]; canvas.data[q + 2] = table[c * 3 + 2]; canvas.data[q + 3] = 255;
    }
    frames.push({ ...canvas, data: canvas.data.slice() });
    if (disposal === 2) {
      for (let j = y0; j < Math.min(height, y0 + h); j++) canvas.data.fill(0, (j * width + x0) * 4, (j * width + Math.min(width, x0 + w)) * 4);
    } else if (disposal === 3) canvas = before;
    transparent = -1; disposal = 0;
  }
  return frames;
}

/** Os quadros lado a lado, da esquerda para a direita, numa folha de uma linha (todos do mesmo tamanho). */
export function strip(frames: readonly Image[]): Image {
  const w = frames[0]?.width ?? 0, h = frames[0]?.height ?? 0;
  const out = blank(w * frames.length, h);
  frames.forEach((f, i) => blit(out, f, i * w, 0));
  return out;
}

/** Lê um GIF do disco como folha de uma linha, um quadro por célula. */
export function readGifStrip(path: string): Image {
  return strip(decodeGif(new Uint8Array(readFileSync(path))));
}
