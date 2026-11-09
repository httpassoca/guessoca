/**
 * Imagens RGBA em memória e as operações puras que as receitas usam: recortar, colar, trocar cores, apagar cores e
 * jogar fora pedaços soltos. Nada aqui lê ou escreve arquivo (ver `png.ts`), então tudo é testado sem disco.
 */
export interface Image { width: number; height: number; data: Uint8Array }

/** Cor como `rrggbb` minúsculo, sem `#`. */
export type Hex = string;

export function blank(width: number, height: number): Image {
  return { width, height, data: new Uint8Array(width * height * 4) };
}

const at = (img: Image, x: number, y: number) => (y * img.width + x) * 4;

export function getPixel(img: Image, x: number, y: number): [number, number, number, number] {
  const i = at(img, x, y);
  return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
}

export function setPixel(img: Image, x: number, y: number, [r, g, b, a]: readonly number[]) {
  const i = at(img, x, y);
  img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = a;
}

export function hexOf(r: number, g: number, b: number): Hex {
  return [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

export function rgbOf(hex: Hex): [number, number, number] {
  const h = hex.replace(/^#/, '').toLowerCase();
  if (!/^[0-9a-f]{6}$/.test(h)) throw new Error(`cor inválida: ${hex}`);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Um pedaço `w×h` de `img` a partir de `(x, y)`; o que cai fora vira transparente. */
export function crop(img: Image, x: number, y: number, w: number, h: number): Image {
  const out = blank(w, h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const sx = x + i, sy = y + j;
    if (sx < 0 || sy < 0 || sx >= img.width || sy >= img.height) continue;
    setPixel(out, i, j, getPixel(img, sx, sy));
  }
  return out;
}

/** Cola `src` em `dst` com o canto em `(x, y)`; pixels transparentes de `src` não apagam nada. */
export function blit(dst: Image, src: Image, x: number, y: number) {
  for (let j = 0; j < src.height; j++) for (let i = 0; i < src.width; i++) {
    const p = getPixel(src, i, j);
    const dx = x + i, dy = y + j;
    if (p[3] === 0 || dx < 0 || dy < 0 || dx >= dst.width || dy >= dst.height) continue;
    setPixel(dst, dx, dy, p);
  }
}

/** Troca cada cor de `map` (de → para) mantendo a transparência; as outras ficam. */
export function swapColors(img: Image, map: Readonly<Record<Hex, Hex>>): Image {
  const out: Image = { ...img, data: img.data.slice() };
  const to = new Map(Object.entries(map).map(([k, v]) => [k.toLowerCase(), rgbOf(v)]));
  for (let i = 0; i < out.data.length; i += 4) {
    if (!out.data[i + 3]) continue;
    const c = to.get(hexOf(out.data[i], out.data[i + 1], out.data[i + 2]));
    if (c) { out.data[i] = c[0]; out.data[i + 1] = c[1]; out.data[i + 2] = c[2]; }
  }
  return out;
}

/** Apaga (deixa transparente) todo pixel com uma das cores de `colors`. */
export function eraseColors(img: Image, colors: Iterable<Hex>): Image {
  const set = new Set([...colors].map((c) => c.toLowerCase()));
  const out: Image = { ...img, data: img.data.slice() };
  for (let i = 0; i < out.data.length; i += 4) {
    if (out.data[i + 3] && set.has(hexOf(out.data[i], out.data[i + 1], out.data[i + 2]))) out.data[i + 3] = 0;
  }
  return out;
}

/**
 * Os pedaços opacos de `img`, ligados por vizinhança de 8; cada um é a lista de índices `y * width + x`. Com `only`,
 * só pixels dessas cores contam (os pedaços de uma cor só, por exemplo o branco).
 */
export function components(img: Image, only?: ReadonlySet<Hex>): number[][] {
  const counts = (p: number) => img.data[p * 4 + 3] !== 0 && (!only || only.has(hexOf(img.data[p * 4], img.data[p * 4 + 1], img.data[p * 4 + 2])));
  const seen = new Uint8Array(img.width * img.height);
  const out: number[][] = [];
  for (let start = 0; start < seen.length; start++) {
    if (seen[start] || !counts(start)) continue;
    const comp: number[] = [];
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const p = stack.pop()!;
      comp.push(p);
      const x = p % img.width, y = (p - x) / img.width;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= img.width || ny >= img.height) continue;
        const q = ny * img.width + nx;
        if (!seen[q] && counts(q)) { seen[q] = 1; stack.push(q); }
      }
    }
    out.push(comp);
  }
  return out;
}

/** Apaga os pedaços para os quais `drop` diz sim (recebe as cores do pedaço e o tamanho); `only` como em `components`. */
export function dropComponents(img: Image, drop: (colors: Hex[], size: number) => boolean, only?: Iterable<Hex>): Image {
  const out: Image = { ...img, data: img.data.slice() };
  for (const comp of components(img, only ? new Set([...only].map((c) => c.toLowerCase())) : undefined)) {
    const colors = comp.map((p) => hexOf(img.data[p * 4], img.data[p * 4 + 1], img.data[p * 4 + 2]));
    if (drop(colors, comp.length)) for (const p of comp) out.data[p * 4 + 3] = 0;
  }
  return out;
}

/** Deixa todo pixel semitransparente totalmente opaco (pixel art não tem meio-termo). */
export function solidify(img: Image): Image {
  const out: Image = { ...img, data: img.data.slice() };
  for (let i = 3; i < out.data.length; i += 4) if (out.data[i]) out.data[i] = 255;
  return out;
}

/** O menor retângulo com todos os pixels opacos; null se a imagem é toda transparente. */
export function bounds(img: Image): { x: number; y: number; w: number; h: number } | null {
  let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    if (!img.data[at(img, x, y) + 3]) continue;
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** Todas as cores opacas da imagem. */
export function palette(img: Image): Set<Hex> {
  const out = new Set<Hex>();
  for (let i = 0; i < img.data.length; i += 4) if (img.data[i + 3]) out.add(hexOf(img.data[i], img.data[i + 1], img.data[i + 2]));
  return out;
}

/**
 * Apaga traços finos à frente (à direita) do corpo: o miolo é o que tem os 8 vizinhos opacos; fica tudo o que está a
 * até `reach` pixels do miolo, e o resto à direita do centro do miolo some. Atrás (à esquerda) nada muda: é onde o
 * cachecol esvoaça.
 */
export function trimThinAhead(img: Image, reach: number): Image {
  const { width: w, height: h } = img;
  const opaque = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && img.data[(y * w + x) * 4 + 3] !== 0;
  const core = new Uint8Array(w * h);
  let sumX = 0, n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!opaque(x, y)) continue;
    let all = true;
    for (let dy = -1; dy <= 1 && all; dy++) for (let dx = -1; dx <= 1; dx++) if (!opaque(x + dx, y + dy)) { all = false; break; }
    if (all) { core[y * w + x] = 1; sumX += x; n++; }
  }
  if (!n) return img;
  const centre = sumX / n;
  const out: Image = { ...img, data: img.data.slice() };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!opaque(x, y) || x <= centre) continue;
    let near = false;
    for (let dy = -reach; dy <= reach && !near; dy++) for (let dx = -reach; dx <= reach; dx++) {
      const cx = x + dx, cy = y + dy;
      if (cx >= 0 && cy >= 0 && cx < w && cy < h && core[cy * w + cx]) { near = true; break; }
    }
    if (!near) out.data[(y * w + x) * 4 + 3] = 0;
  }
  return out;
}

/** Fica só com os pixels das cores `colors` (o resto vira transparente). */
export function keepColors(img: Image, colors: Iterable<Hex>): Image {
  const set = new Set([...colors].map((c) => c.toLowerCase()));
  const out: Image = { ...img, data: img.data.slice() };
  for (let i = 0; i < out.data.length; i += 4) {
    if (out.data[i + 3] && !set.has(hexOf(out.data[i], out.data[i + 1], out.data[i + 2]))) out.data[i + 3] = 0;
  }
  return out;
}

/** Cola `src` em `dst` por baixo: só os pixels transparentes de `dst` recebem (o que já está desenhado fica na frente). */
export function under(dst: Image, src: Image, x: number, y: number) {
  for (let j = 0; j < src.height; j++) for (let i = 0; i < src.width; i++) {
    const p = getPixel(src, i, j);
    const dx = x + i, dy = y + j;
    if (p[3] === 0 || dx < 0 || dy < 0 || dx >= dst.width || dy >= dst.height || dst.data[at(dst, dx, dy) + 3]) continue;
    setPixel(dst, dx, dy, p);
  }
}

/** A mesma imagem deslocada `(dx, dy)`, do mesmo tamanho; o que sai da borda some. */
export function translate(img: Image, dx: number, dy: number): Image {
  const out = blank(img.width, img.height);
  blit(out, img, dx, dy);
  return out;
}

/** Cada linha `y` reconstruída por `pick(y)`: devolve a linha de origem (ou null para vazia) e o deslocamento em x. */
function remapRows(img: Image, pick: (y: number) => { from: number | null; dx: number }): Image {
  const out = blank(img.width, img.height);
  for (let y = 0; y < img.height; y++) {
    const { from, dx } = pick(y);
    if (from === null || from < 0 || from >= img.height) continue;
    for (let x = 0; x < img.width; x++) {
      const sx = x - dx;
      if (sx < 0 || sx >= img.width) continue;
      const p = getPixel(img, sx, from);
      if (p[3]) setPixel(out, x, y, p);
    }
  }
  return out;
}

/**
 * Inclina para a frente (à direita): a linha `y` anda `⌊k · (pivotY − y)⌋` pixels, então a linha do pé (`pivotY`)
 * fica e o topo vai mais longe. Com pixel art isso sai em degraus, como um desenhista faria à mão.
 */
export function shear(img: Image, k: number, pivotY: number): Image {
  return remapRows(img, (y) => ({ from: y, dx: Math.trunc(k * (pivotY - y)) }));
}

/** Achata: tira `count` linhas a partir de `from` e desce o que estava em cima; o que está embaixo (os pés) fica. */
export function squashRows(img: Image, from: number, count: number): Image {
  return remapRows(img, (y) => ({ from: y >= from + count ? y : y - count, dx: 0 }));
}

/** Estica: repete a linha `at` mais `count` vezes e sobe o que estava em cima; o que está embaixo fica. */
export function stretchRows(img: Image, at: number, count: number): Image {
  return remapRows(img, (y) => ({ from: y > at ? y : y >= at - count ? at : y + count, dx: 0 }));
}

/** Gira 90° no sentido do relógio: o que apontava para a esquerda passa a apontar para cima. */
export function rotate90(img: Image): Image {
  const out = blank(img.height, img.width);
  for (let y = 0; y < out.height; y++) for (let x = 0; x < out.width; x++) setPixel(out, x, y, getPixel(img, y, img.height - 1 - x));
  return out;
}

/** Espelha de cima para baixo. */
export function flipY(img: Image): Image {
  return remapRows(img, (y) => ({ from: img.height - 1 - y, dx: 0 }));
}
