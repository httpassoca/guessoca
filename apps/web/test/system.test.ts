import { describe, expect, test } from 'bun:test';
import { agoText, ApiError, sizeText, systemApi } from '../src/lib/system/api';
import { wav } from '../src/lib/system/wav';
import { crc32, zip } from '../src/lib/system/zip';
import { parseRoute } from '../src/lib/route';

const text = (b: Uint8Array) => new TextDecoder().decode(b);

describe('sistema: a rota', () => {
  test('/sistema é a página do sistema; o resto continua como era', () => {
    expect(parseRoute('/sistema')).toEqual({ name: 'sistema' });
    expect(parseRoute('/sistema/')).toEqual({ name: 'sistema' });
    expect(parseRoute('/sala/abcd')).toEqual({ name: 'sala', code: 'ABCD' });
    expect(parseRoute('/sistemas')).toEqual({ name: 'home' });
  });
});

describe('sistema: zip', () => {
  test('o CRC-32 é o de sempre', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array(0))).toBe(0);
  });

  test('um zip sem compressão: cada arquivo inteiro lá dentro, o diretório no fim', () => {
    const a = new TextEncoder().encode('olá'), b = new Uint8Array([1, 2, 3, 4]);
    const z = zip([{ name: 'sprites/a.txt', bytes: a }, { name: 'música/b.bin', bytes: b }]);
    const v = new DataView(z.buffer);
    expect(v.getUint32(0, true)).toBe(0x04034b50);
    expect(v.getUint16(8, true)).toBe(0); // sem compressão
    expect(v.getUint32(14, true)).toBe(crc32(a));
    expect(text(z.subarray(30, 30 + 13))).toBe('sprites/a.txt');
    expect(z.subarray(43, 43 + a.length)).toEqual(a);
    // o fim: dois arquivos, e o diretório central onde o fim diz
    const end = z.length - 22;
    expect(v.getUint32(end, true)).toBe(0x06054b50);
    expect(v.getUint16(end + 10, true)).toBe(2);
    const dir = v.getUint32(end + 16, true);
    expect(v.getUint32(dir, true)).toBe(0x02014b50);
    expect(v.getUint32(dir + 12, true) + dir).toBeLessThanOrEqual(z.length);
    expect(dir + v.getUint32(end + 12, true)).toBe(end);
    // a segunda entrada do diretório aponta para o segundo arquivo
    const second = dir + 46 + 13;
    const off = v.getUint32(second + 42, true);
    expect(v.getUint32(off, true)).toBe(0x04034b50);
    expect(z.subarray(off + 30 + new TextEncoder().encode('música/b.bin').length).subarray(0, 4)).toEqual(b);
  });

  test('vazio também é um zip', () => {
    const z = zip([]);
    expect(z.length).toBe(22);
    expect(new DataView(z.buffer).getUint32(0, true)).toBe(0x06054b50);
  });
});

describe('sistema: wav', () => {
  test('PCM de 16 bits, mono, com as amostras cortadas em -1..1', () => {
    const w = wav(Float32Array.from([0, 1, -1, 2, 0.5]), 44100);
    const v = new DataView(w.buffer);
    expect(text(w.subarray(0, 4))).toBe('RIFF');
    expect(text(w.subarray(8, 16))).toBe('WAVEfmt ');
    expect(v.getUint32(4, true)).toBe(w.length - 8);
    expect([v.getUint16(20, true), v.getUint16(22, true), v.getUint32(24, true), v.getUint16(34, true)]).toEqual([1, 1, 44100, 16]);
    expect(v.getUint32(40, true)).toBe(10);
    expect([0, 1, 2, 3, 4].map((i) => v.getInt16(44 + i * 2, true))).toEqual([0, 32767, -32767, 32767, 16384]);
  });
});

describe('sistema: a API', () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fake = (status: number, body: BodyInit) => async (url: string, init?: RequestInit) => { calls.push({ url, init }); return new Response(body, { status }); };

  test('toda chamada leva a senha; o caminho vai codificado; trocar é PUT, desfazer é DELETE', async () => {
    calls.length = 0;
    const api = systemApi('s3nha', fake(200, '{"assets":[],"server":{}}'));
    await api.list(); await api.replace('sprites/char-0.png', new Blob(['x'])); await api.restore('sprites/emotes-pt-BR.png'); await api.download('music/city_rain.ogg', true);
    expect(calls.map((c) => [c.init?.method ?? 'GET', c.url])).toEqual([
      ['GET', '/api/admin/assets'], ['PUT', '/api/admin/assets/sprites/char-0.png'], ['DELETE', '/api/admin/assets/sprites/emotes-pt-BR.png'], ['GET', '/api/admin/assets/music/city_rain.ogg?original=1'],
    ]);
    for (const c of calls) expect((c.init?.headers as Record<string, string>)['x-admin-pass']).toBe('s3nha');
  });

  test('um erro vira ApiError com o status e o texto do servidor', async () => {
    const err = await systemApi('x', fake(401, 'senha errada')).list().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect([err.status, err.message]).toEqual([401, 'senha errada']);
    const big = await systemApi('x', fake(422, 'a imagem tem que ter 10×10 pixels')).replace('sprites/a.png', new Blob()).catch((e) => e);
    expect(big.message).toContain('10×10');
  });

  test('tamanhos e tempos em texto curto', () => {
    expect([sizeText(812), sizeText(436_882), sizeText(1_320_936)]).toEqual(['812 B', '427 KB', '1,3 MB']);
    expect([agoText(42_000), agoText(17 * 60_000), agoText(3 * 3_600_000 + 5 * 60_000), agoText(52 * 3_600_000)]).toEqual(['42 s', '17 min', '3 h 05 min', '2 d 4 h']);
  });
});
