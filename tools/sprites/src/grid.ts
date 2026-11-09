/**
 * Pixel art escrita como texto: cada linha é uma linha de pixels, cada caractere uma cor da paleta, `.` (ou espaço) é
 * transparente. É como os balões dos emotes (`emotes.ts`) e os objetos do telhado (`rooftop.ts`, que monta as grades
 * com a `Sketch`) são desenhados (ADR 0007): arte nossa, sem pacote nem licença. Puro, sem disco.
 *
 *     parseGrid(`
 *       .##.
 *       #..#
 *     `, { '#': '000000' })
 */
import { blank, rgbOf, setPixel, type Hex, type Image } from './image';

/** Um caractere da grade → a cor (`rrggbb`). `.` e espaço não entram: são sempre transparentes. */
export type Palette = Readonly<Record<string, Hex>>;

/** Linhas da grade sem as linhas vazias das pontas e sem o recuo comum (para escrever grades indentadas no código). */
export function gridLines(text: string): string[] {
  const lines = text.split('\n');
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^ */)![0].length));
  return lines.map((l) => l.slice(indent).replace(/\s+$/, ''));
}

/**
 * A grade como `Image` opaca (alfa 255 ou 0): um pixel por caractere, largura da linha mais comprida (as curtas
 * completam com transparente). Um caractere fora de `colors` é erro, com a linha.
 */
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
