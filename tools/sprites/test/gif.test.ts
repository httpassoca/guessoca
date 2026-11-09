import { describe, expect, test } from 'bun:test';
import { decodeGif, strip } from '../src/gif';
import { getPixel } from '../src/image';

/** Sub-blocos de um quadro LZW sem compressão de verdade: um `clear` antes de cada índice, tudo em códigos de 3 bits. */
function lzw(indices: number[]): number[] {
  const codes = indices.flatMap((i) => [4, i]).concat(5);
  const bytes: number[] = [];
  let bits = 0, n = 0;
  for (const c of codes) { bits |= c << n; n += 3; while (n >= 8) { bytes.push(bits & 255); bits >>= 8; n -= 8; } }
  if (n) bytes.push(bits & 255);
  return [bytes.length, ...bytes, 0];
}

/** Um GIF de 2×2 com paleta de 4 cores (0 transparente quando pedido) e um quadro por lista de índices. */
function gif(frames: { indices: number[]; transparent?: boolean; disposal?: number }[]): Uint8Array {
  const out = [...'GIF89a'].map((c) => c.charCodeAt(0));
  out.push(2, 0, 2, 0, 0x81, 0, 0);
  out.push(0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255);
  for (const f of frames) {
    out.push(0x21, 0xf9, 4, ((f.disposal ?? 0) << 2) | (f.transparent ? 1 : 0), 5, 0, 0, 0);
    out.push(0x2c, 0, 0, 0, 0, 2, 0, 2, 0, 0, 2, ...lzw(f.indices));
  }
  out.push(0x3b);
  return Uint8Array.from(out);
}

describe('gif', () => {
  test('um quadro: as cores da paleta, e o índice transparente com alfa 0', () => {
    const [f] = decodeGif(gif([{ indices: [1, 2, 3, 0], transparent: true }]));
    expect([f.width, f.height]).toEqual([2, 2]);
    expect(getPixel(f, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(getPixel(f, 1, 0)).toEqual([0, 255, 0, 255]);
    expect(getPixel(f, 0, 1)).toEqual([0, 0, 255, 255]);
    expect(getPixel(f, 1, 1)[3]).toBe(0);
  });

  test('descarte 2 limpa a tela antes do próximo quadro; sem descarte, o anterior fica por baixo', () => {
    const cleared = decodeGif(gif([{ indices: [1, 1, 1, 1], transparent: true, disposal: 2 }, { indices: [0, 2, 0, 0], transparent: true }]));
    expect(getPixel(cleared[1], 0, 0)[3]).toBe(0);
    expect(getPixel(cleared[1], 1, 0)).toEqual([0, 255, 0, 255]);
    const kept = decodeGif(gif([{ indices: [1, 1, 1, 1], transparent: true }, { indices: [0, 2, 0, 0], transparent: true }]));
    expect(getPixel(kept[1], 0, 0)).toEqual([255, 0, 0, 255]);
    expect(getPixel(kept[0], 1, 0)).toEqual([255, 0, 0, 255]);
  });

  test('a folha de uma linha tem um quadro por célula', () => {
    const s = strip(decodeGif(gif([{ indices: [1, 1, 1, 1] }, { indices: [2, 2, 2, 2] }])));
    expect([s.width, s.height]).toEqual([4, 2]);
    expect(getPixel(s, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(getPixel(s, 2, 1)).toEqual([0, 255, 0, 255]);
  });

  test('o que não é GIF dá erro', () => {
    expect(() => decodeGif(Uint8Array.from([1, 2, 3, 4, 5, 6, 7]))).toThrow(/GIF/);
  });
});
