/**
 * Pixel art escrita como texto: cada linha é uma linha de pixels, cada caractere uma cor da paleta, `.` (ou espaço) é
 * transparente. É como os balões dos emotes e os objetos do telhado são desenhados (ADR 0007).
 *
 *     parseGrid(`
 *       .##.
 *       #..#
 *     `, { '#': '000000' })
 */
import { blank, rgbOf, setPixel, type Hex, type Image } from './image';

export type Palette = Readonly<Record<string, Hex>>;

/** Linhas da grade sem as linhas vazias das pontas e sem o recuo comum (para escrever grades indentadas no código). */
export function gridLines(text: string): string[] {
  const lines = text.split('\n');
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^ */)![0].length));
  return lines.map((l) => l.slice(indent).replace(/\s+$/, ''));
}

export function parseGrid(text: string, colors: Palette): Image {
  const lines = gridLines(text);
  const width = Math.max(0, ...lines.map((l) => l.length));
  const img = blank(width, lines.length);
  lines.forEach((line, y) => {
    [...line].forEach((ch, x) => {
      if (ch === '.' || ch === ' ') return;
      const hex = colors[ch];
      if (!hex) throw new Error(`cor '${ch}' fora da paleta na linha ${y + 1}`);
      setPixel(img, x, y, [...rgbOf(hex), 255]);
    });
  });
  return img;
}
