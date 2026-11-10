import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ADMIN_HEADER, ASSET_PATH_RE, hashOf, overridePath, passOk, sniff } from '../src/admin';
import { silentLog } from '../src/log';
import { createServer } from '../src/server';

/** uma senha só dos testes; a de verdade só existe no ambiente do servidor */
const PASS = 'senha-so-dos-testes';
const HASH = hashOf(PASS);
/** um PNG de verdade, 1×1 */
const PNG_1: Uint8Array<ArrayBuffer> = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
const ogg = (n: number): Uint8Array<ArrayBuffer> => { const b = new Uint8Array(n); b.set([0x4f, 0x67, 0x67, 0x53]); return b; };

let dist: string, data: string, app: ReturnType<typeof createServer>, base: string;
type Bytes = Uint8Array<ArrayBuffer>;
let png2: Bytes, png1b: Bytes, webp1: Bytes;
const api = (path: string, init: RequestInit = {}, pass: string | null = PASS) =>
  fetch(`${base}/api/admin/${path}`, { ...init, headers: { ...(pass === null ? {} : { [ADMIN_HEADER]: pass }), ...init.headers } });

beforeAll(async () => {
  dist = mkdtempSync(join(tmpdir(), 'guess-admin-dist-'));
  data = mkdtempSync(join(tmpdir(), 'guess-admin-data-'));
  mkdirSync(join(dist, 'sprites')); mkdirSync(join(dist, 'music'));
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>guessoca</title>');
  writeFileSync(join(dist, 'sprites/char-0.png'), PNG_1);
  writeFileSync(join(dist, 'sprites/notas.txt'), 'não é arte');
  writeFileSync(join(dist, 'music/city_rain.ogg'), ogg(100));
  const own = (b: Uint8Array): Bytes => new Uint8Array(b);
  png2 = own(await new Bun.Image(PNG_1).resize(2, 2).png().bytes());
  png1b = own(await new Bun.Image(png2).resize(1, 1).png().bytes());
  webp1 = own(await new Bun.Image(PNG_1).webp({ lossless: true }).bytes());
  app = createServer({ port: 0, distDir: dist, dataDir: data, adminHash: HASH, log: silentLog, dev: true });
  base = `http://localhost:${app.server.port}`;
});
afterAll(() => { app.stop(); rmSync(dist, { recursive: true }); rmSync(data, { recursive: true }); });

describe('sistema: a senha', () => {
  test('a senha confere pelo SHA-256, e nem ela nem um hash ficam no código do servidor', () => {
    expect(HASH).toMatch(/^[0-9a-f]{64}$/);
    expect(passOk(PASS, HASH)).toBe(true);
    expect(passOk(PASS, ` ${HASH.toUpperCase()}\n`)).toBe(true); // o hash do ambiente pode vir com espaço ou em maiúsculas
    expect(passOk(`${PASS} `, HASH)).toBe(false);
    expect(passOk('', HASH)).toBe(false);
    expect(passOk(null, HASH)).toBe(false);
    for (const file of ['admin.ts', 'server.ts', 'index.ts']) expect(readFileSync(join(import.meta.dir, '../src', file), 'utf8')).not.toMatch(/[0-9a-f]{64}/);
  });

  test('sem senha ou com a senha errada, 401 em toda rota, e nada é escrito', async () => {
    expect((await api('assets', {}, null)).status).toBe(401);
    expect((await api('assets', {}, 'errada')).status).toBe(401);
    expect((await api('assets/sprites/char-0.png', { method: 'PUT', body: png1b }, 'errada')).status).toBe(401);
    expect((await api('assets/sprites/char-0.png', { method: 'DELETE' }, null)).status).toBe(401);
    expect(existsSync(overridePath(data, 'sprites/char-0.png'))).toBe(false);
  });

  test('sem o hash no ambiente (ou sem pasta de dados) o sistema fica desligado: 404, com qualquer senha', async () => {
    for (const opts of [{ dataDir: data }, { adminHash: HASH }, { dataDir: data, adminHash: '' }]) {
      const s = createServer({ port: 0, distDir: dist, log: silentLog, ...opts });
      try {
        const r = await fetch(`http://localhost:${s.server.port}/api/admin/assets`, { headers: { [ADMIN_HEADER]: PASS } });
        expect([r.status, await r.text()]).toEqual([404, 'sistema desligado']);
      } finally { s.stop(); }
    }
  });
});

describe('sistema: a lista', () => {
  test('os arquivos de sprites e music, com bytes e tamanho em pixels; o que não é arte fica de fora', async () => {
    const r = await api('assets');
    expect(r.status).toBe(200);
    const { assets, server } = await r.json() as { assets: { path: string; format: string; bytes: number; width?: number; height?: number; overridden: boolean }[]; server: { rooms: number } };
    expect(assets.map((a) => a.path)).toEqual(['sprites/char-0.png', 'music/city_rain.ogg']);
    expect(assets[0]).toMatchObject({ format: 'png', bytes: PNG_1.length, width: 1, height: 1, overridden: false });
    expect(assets[1]).toMatchObject({ format: 'ogg', bytes: 100, overridden: false });
    expect(server.rooms).toBe(0);
  });
});

describe('sistema: trocar um arquivo', () => {
  test('só o que já existe, do mesmo formato e, se imagem, do mesmo tamanho', async () => {
    const put = (path: string, body: Bytes) => api(`assets/${path}`, { method: 'PUT', body });
    expect((await put('sprites/novo.png', png1b)).status).toBe(404);
    expect((await put('sprites/..%2Findex.html', png1b)).status).toBe(400);
    expect((await put('assets/app.js', png1b)).status).toBe(400);
    expect((await put('sprites/char-0.png', webp1)).status).toBe(415);
    expect((await put('sprites/char-0.png', ogg(50))).status).toBe(415);
    const wrong = await put('sprites/char-0.png', png2);
    expect(wrong.status).toBe(422);
    expect(await wrong.text()).toContain('1×1');
    expect((await put('music/city_rain.ogg', png1b)).status).toBe(415);
    expect(existsSync(join(data, 'overrides'))).toBe(false);
  });

  test('a troca passa a ser servida, o original fica intacto, e desfazer volta ao original', async () => {
    const url = `${base}/sprites/char-0.png`;
    const bytesOf = async (r: Response) => new Uint8Array(await r.arrayBuffer());
    expect(await bytesOf(await fetch(url))).toEqual(PNG_1);

    expect((await api('assets/sprites/char-0.png', { method: 'PUT', body: png1b })).status).toBe(200);
    expect(await bytesOf(await fetch(url))).toEqual(png1b);
    expect(new Uint8Array(readFileSync(join(dist, 'sprites/char-0.png')))).toEqual(PNG_1);
    const { assets } = await (await api('assets')).json() as { assets: { path: string; overridden: boolean; bytes: number; originalBytes: number }[] };
    expect(assets[0]).toMatchObject({ overridden: true, bytes: png1b.length, originalBytes: PNG_1.length });

    // baixar: o que vale, ou o original
    expect(await bytesOf(await api('assets/sprites/char-0.png'))).toEqual(png1b);
    const original = await api('assets/sprites/char-0.png?original=1');
    expect(await bytesOf(original)).toEqual(PNG_1);
    expect(original.headers.get('content-disposition')).toContain('char-0.png');

    expect((await api('assets/sprites/char-0.png', { method: 'DELETE' })).status).toBe(200);
    expect(await bytesOf(await fetch(url))).toEqual(PNG_1);
    expect((await api('assets/sprites/char-0.png', { method: 'DELETE' })).status).toBe(200); // desfazer duas vezes não quebra
  });

  test('a música também se troca', async () => {
    expect((await api('assets/music/city_rain.ogg', { method: 'PUT', body: ogg(300) })).status).toBe(200);
    expect((await (await fetch(`${base}/music/city_rain.ogg`)).arrayBuffer()).byteLength).toBe(300);
    await api('assets/music/city_rain.ogg', { method: 'DELETE' });
    expect((await (await fetch(`${base}/music/city_rain.ogg`)).arrayBuffer()).byteLength).toBe(100);
  });
});

describe('sistema: os bytes', () => {
  test('o formato sai dos primeiros bytes, não do nome', () => {
    expect(sniff(PNG_1)).toBe('png');
    expect(sniff(ogg(8))).toBe('ogg');
    expect(sniff(new TextEncoder().encode('<html>'))).toBeNull();
    expect(sniff(new Uint8Array(0))).toBeNull();
  });

  test('um caminho gerenciado é uma das duas pastas e um nome simples', () => {
    for (const ok of ['sprites/char-0.png', 'music/city_rain.ogg', 'sprites/emotes-pt-BR.png']) expect(ASSET_PATH_RE.test(ok)).toBe(true);
    for (const bad of ['sprites/../index.html', 'assets/app.js', 'sprites/a/b.png', '/sprites/x.png', 'sprites/.oculto', 'sprites/']) expect(ASSET_PATH_RE.test(bad)).toBe(false);
  });
});
