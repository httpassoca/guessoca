/**
 * Um `.zip` sem compressão (método "stored"), para o sistema (`screens/Sistema.svelte`) baixar todos os arquivos do jogo
 * de uma vez sem depender de biblioteca. As imagens e a música já são comprimidas, então guardar sem comprimir quase
 * não custa. Puro: bytes entram, bytes saem. Nomes em UTF-8, sem pastas vazias, sem ZIP64 (o total fica bem abaixo de 4 GB).
 */

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();

/** O CRC-32 (o do zip e do PNG) de uns bytes. */
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Um arquivo do zip: o caminho dentro dele (com `/`) e os bytes. */
export interface ZipEntry { name: string; bytes: Uint8Array }

/** Os bytes de um `.zip` com os arquivos na ordem dada, sem compressão. */
export function zip(entries: readonly ZipEntry[]): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder();
  const names = entries.map((e) => enc.encode(e.name));
  const total = entries.reduce((n, e, i) => n + 30 + names[i].length + e.bytes.length + 46 + names[i].length, 22);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  const offsets: number[] = [], crcs: number[] = [];
  let p = 0;
  entries.forEach((e, i) => {
    offsets.push(p);
    crcs.push(crc32(e.bytes));
    view.setUint32(p, 0x04034b50, true); view.setUint16(p + 4, 20, true); view.setUint16(p + 6, 0x0800, true); // UTF-8
    view.setUint32(p + 14, crcs[i], true); view.setUint32(p + 18, e.bytes.length, true); view.setUint32(p + 22, e.bytes.length, true);
    view.setUint16(p + 26, names[i].length, true);
    out.set(names[i], p + 30); out.set(e.bytes, p + 30 + names[i].length);
    p += 30 + names[i].length + e.bytes.length;
  });
  const start = p;
  entries.forEach((e, i) => {
    view.setUint32(p, 0x02014b50, true); view.setUint16(p + 4, 20, true); view.setUint16(p + 6, 20, true); view.setUint16(p + 8, 0x0800, true);
    view.setUint32(p + 16, crcs[i], true); view.setUint32(p + 20, e.bytes.length, true); view.setUint32(p + 24, e.bytes.length, true);
    view.setUint16(p + 28, names[i].length, true); view.setUint32(p + 42, offsets[i], true);
    out.set(names[i], p + 46);
    p += 46 + names[i].length;
  });
  view.setUint32(p, 0x06054b50, true); view.setUint16(p + 8, entries.length, true); view.setUint16(p + 10, entries.length, true);
  view.setUint32(p + 12, p - start, true); view.setUint32(p + 16, start, true);
  return out;
}
