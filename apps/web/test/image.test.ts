import { describe, expect, test } from 'bun:test';
import { IMAGE_BYTES_MAX, IMAGE_SIDE } from '@guess/protocol';
import { encodeWithin, fitSize, imageIdFromUrl, QUALITIES, uploadImage } from '../src/lib/image';

describe('imagem: tamanho', () => {
  test('o lado maior fica em no máximo 512 px, mantendo a proporção', () => {
    expect(fitSize(2048, 1024)).toEqual({ width: IMAGE_SIDE, height: 256 });
    expect(fitSize(1000, 3000)).toEqual({ width: 171, height: IMAGE_SIDE });
    expect(fitSize(512, 512)).toEqual({ width: 512, height: 512 });
  });

  test('imagem pequena não cresce', () => {
    expect(fitSize(100, 50)).toEqual({ width: 100, height: 50 });
  });

  test('nunca some: pelo menos 1 px de cada lado', () => {
    expect(fitSize(10_000, 1)).toEqual({ width: IMAGE_SIDE, height: 1 });
    expect(fitSize(0, 0)).toEqual({ width: 1, height: 1 });
  });
});

describe('imagem: qualidade', () => {
  /** um codificador falso: o tamanho cai com a qualidade e com a escala */
  const fake = (bytesAt: (quality: number, scale: number) => number) => {
    const tried: [number, number][] = [];
    const encode = async (quality: number, scale: number) => { tried.push([quality, scale]); return { size: bytesAt(quality, scale) }; };
    return { tried, encode };
  };

  test('na primeira qualidade que cabe, para', async () => {
    const { tried, encode } = fake((q) => (q > 0.6 ? IMAGE_BYTES_MAX + 1 : IMAGE_BYTES_MAX));
    const out = await encodeWithin(encode);
    expect(out.size).toBe(IMAGE_BYTES_MAX);
    expect(tried.every(([, s]) => s === 1)).toBe(true);
    expect(tried.at(-1)![0]).toBeLessThanOrEqual(0.6);
    expect(tried.map(([q]) => q)).toEqual(QUALITIES.slice(0, tried.length));
  });

  test('as qualidades descem', () => {
    for (let i = 1; i < QUALITIES.length; i++) expect(QUALITIES[i]).toBeLessThan(QUALITIES[i - 1]);
  });

  test('se nem a pior qualidade cabe, encolhe a imagem e tenta de novo', async () => {
    const { tried, encode } = fake((_q, s) => (s < 1 ? 1000 : IMAGE_BYTES_MAX * 10));
    const out = await encodeWithin(encode);
    expect(out.size).toBe(1000);
    expect(tried.at(-1)![1]).toBeLessThan(1);
  });

  test('se nada cabe, desiste com erro', async () => {
    const { encode } = fake(() => IMAGE_BYTES_MAX * 100);
    await expect(encodeWithin(encode)).rejects.toThrow();
  });
});

describe('imagem: envio', () => {
  test('POST com os bytes em WebP para a sala, com o token; devolve o id', async () => {
    let asked: { url: string; init?: RequestInit } | null = null;
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' });
    const id = await uploadImage('ABCD', 'tok-12345', blob, async (url, init) => {
      asked = { url: String(url), init };
      return new Response(JSON.stringify({ id: '0123456789abcdef' }), { status: 201 });
    });
    expect(id).toBe('0123456789abcdef');
    expect(asked!.url).toBe('/api/rooms/ABCD/images?token=tok-12345');
    expect(asked!.init?.method).toBe('POST');
    expect(new Headers(asked!.init?.headers).get('content-type')).toBe('image/webp');
    expect(asked!.init?.body).toBe(blob);
  });

  test('recusa do servidor ou id estranho é erro', async () => {
    const blob = new Blob([new Uint8Array([1])]);
    await expect(uploadImage('ABCD', 't', blob, async () => new Response('', { status: 413 }))).rejects.toThrow();
    await expect(uploadImage('ABCD', 't', blob, async () => new Response(JSON.stringify({ id: '../x' })))).rejects.toThrow();
  });

  test('o id volta do endereço que o snapshot leva', () => {
    expect(imageIdFromUrl('/api/rooms/ABCD/images/0123456789abcdef')).toBe('0123456789abcdef');
    expect(imageIdFromUrl(null)).toBeNull();
    expect(imageIdFromUrl('/qualquer/coisa')).toBeNull();
  });
});
