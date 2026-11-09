/**
 * A imagem do post-it (ADR 0003): o navegador reduz para WebP de no máximo `IMAGE_SIDE` px e `IMAGE_BYTES_MAX` bytes
 * e manda por POST; o servidor guarda na sala e devolve o id, que vai no `write`. A conta do tamanho e da qualidade é
 * pura e testada; o canvas que de fato decodifica e codifica fica em `shrinkToWebp`, sem teste.
 */
import { IMAGE_BYTES_MAX, IMAGE_ID_RE, IMAGE_SIDE } from '@guess/protocol';

/** O tamanho com o lado maior em no máximo `max`, na mesma proporção; nunca cresce nem some. */
export function fitSize(width: number, height: number, max = IMAGE_SIDE): { width: number; height: number } {
  const w = Math.max(1, width), h = Math.max(1, height);
  const k = Math.min(1, max / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
}

/** As qualidades do WebP, da melhor para a pior; desce até caber. */
export const QUALITIES = [0.85, 0.75, 0.65, 0.5, 0.35, 0.2] as const;
/** Se nem a pior qualidade cabe, encolhe a imagem nestas escalas e desce a qualidade de novo. */
export const SCALES = [1, 0.75, 0.5, 0.35] as const;

/**
 * Codifica com `encode(qualidade, escala)` descendo a qualidade (e depois a escala) até caber em `max` bytes.
 * Devolve o primeiro que cabe; nenhum cabendo, é erro.
 */
export async function encodeWithin<B extends { size: number }>(encode: (quality: number, scale: number) => Promise<B>, max = IMAGE_BYTES_MAX): Promise<B> {
  for (const scale of SCALES) for (const quality of QUALITIES) {
    const out = await encode(quality, scale);
    if (out.size <= max) return out;
  }
  throw new Error('imagem grande demais');
}

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

/** Manda os bytes para a sala; devolve o id que o servidor deu. `fetcher` é injetável para o teste. */
export async function uploadImage(code: string, token: string, body: Blob, fetcher: Fetcher = fetch): Promise<string> {
  const r = await fetcher(`/api/rooms/${encodeURIComponent(code)}/images?token=${encodeURIComponent(token)}`, { method: 'POST', headers: { 'content-type': 'image/webp' }, body });
  if (!r.ok) throw new Error(`servidor respondeu ${r.status}`);
  const { id } = (await r.json()) as { id?: unknown };
  if (typeof id !== 'string' || !IMAGE_ID_RE.test(id)) throw new Error('servidor mandou um id estranho');
  return id;
}

/** O id da imagem a partir do endereço que o snapshot leva (`/api/rooms/CODE/images/ID`). */
export function imageIdFromUrl(url: string | null): string | null {
  const id = url?.match(/\/images\/([^/?#]+)$/)?.[1];
  return id && IMAGE_ID_RE.test(id) ? id : null;
}

/** Decodifica o arquivo escolhido e devolve um WebP que cabe nos limites. Só no navegador. */
export async function shrinkToWebp(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const base = fitSize(bitmap.width, bitmap.height);
    return await encodeWithin(async (quality, scale) => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(base.width * scale));
      canvas.height = Math.max(1, Math.round(base.height * scale));
      const g = canvas.getContext('2d');
      if (!g) throw new Error('sem canvas 2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/webp', quality));
      // navegador sem codificador WebP devolve PNG: o servidor recusaria
      if (!blob || blob.type !== 'image/webp') throw new Error('o navegador não gera WebP');
      return blob;
    });
  } finally {
    bitmap.close();
  }
}

/** O caminho inteiro: arquivo escolhido → WebP pequeno → servidor → id. */
export async function sendImage(code: string, token: string, file: Blob): Promise<string> {
  return uploadImage(code, token, await shrinkToWebp(file));
}
