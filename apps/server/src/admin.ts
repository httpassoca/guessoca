/**
 * O sistema (`/sistema` no cliente): a API do dono do jogo para ver, baixar e trocar os arquivos do jogo sem deploy.
 *
 * - **Senha**: toda chamada leva a senha no cabeçalho `x-admin-pass`; o servidor compara o SHA-256 dela com o hash que
 *   o ambiente dá em `GUESS_ADMIN_HASH`. Nem a senha nem o hash ficam no repositório (que é público): sem a variável, o
 *   sistema fica desligado e as rotas respondem 404. Sem sessão: a página guarda a senha na aba. Errou: 401, depois de
 *   `FAIL_DELAY` ms (para não dar para chutar rápido).
 * - **O que se gerencia**: os arquivos de `sprites/` e `music/` do cliente buildado (`dist`). Os efeitos sonoros são
 *   código (`sfx.ts`), e os atlas vão dentro do JavaScript: a página mostra, mas só um deploy muda.
 * - **Trocar**: o arquivo novo vai para `dataDir/overrides/<pasta>/<nome>` e o servidor passa a servi-lo no lugar do
 *   original (`static.ts` olha lá primeiro). O original fica intacto: `DELETE` tira a troca. `dataDir` é um volume do
 *   Docker (`/app/data`), então as trocas sobrevivem a um deploy; **um deploy não as desfaz**, nem quando traz arte nova
 *   para o mesmo arquivo, e a página avisa quais arquivos estão trocados.
 * - **O que se aceita**: só o nome de um arquivo que já existe, do mesmo formato (PNG, WebP ou Ogg, conferido nos bytes),
 *   até `UPLOAD_BYTES_MAX`; uma imagem tem que ter o mesmo tamanho em pixels da original, porque os atlas (que dizem onde
 *   está cada quadro) não mudam.
 *
 * Rotas, todas com a senha: `GET /api/admin/assets` (a lista e o estado do servidor), `GET /api/admin/assets/<caminho>`
 * (baixa o que está valendo; `?original=1` baixa o original), `PUT` (troca, o corpo é o arquivo), `DELETE` (desfaz).
 */
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { timingSafeEqual } from 'node:crypto';

/** O cabeçalho em que a página manda a senha. */
export const ADMIN_HEADER = 'x-admin-pass';
/** Quanto uma senha errada espera pela resposta, ms. */
export const FAIL_DELAY = 400;
/** O maior arquivo que se pode subir (a música tem 5 MB). */
export const UPLOAD_BYTES_MAX = 24 * 1024 * 1024;
/** As pastas do `dist` que o sistema gerencia. */
export const ASSET_DIRS = ['sprites', 'music'] as const;
/** Um caminho gerenciado: uma das pastas e um nome de arquivo simples. */
export const ASSET_PATH_RE = /^(sprites|music)\/[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** O formato de um arquivo pelos primeiros bytes, ou null se não é um dos que o jogo usa. */
export function sniff(bytes: Uint8Array): 'png' | 'webp' | 'ogg' | null {
  const at = (i: number, s: string) => [...s].every((c, k) => bytes[i + k] === c.charCodeAt(0));
  if (bytes.length >= 8 && bytes[0] === 0x89 && at(1, 'PNG')) return 'png';
  if (bytes.length >= 12 && at(0, 'RIFF') && at(8, 'WEBP')) return 'webp';
  if (bytes.length >= 4 && at(0, 'OggS')) return 'ogg';
  return null;
}

const TYPES = { png: 'image/png', webp: 'image/webp', ogg: 'audio/ogg' } as const;
const formatOf = (path: string) => (path.split('.').pop() ?? '') as keyof typeof TYPES;

/** O SHA-256 de uma senha, em hexadecimal: o que vai em `GUESS_ADMIN_HASH`. */
export const hashOf = (pass: string): string => new Bun.CryptoHasher('sha256').update(pass).digest('hex');

/** A senha confere com o hash? Compara em tempo constante. */
export function passOk(given: string | null, hash: string): boolean {
  if (!given) return false;
  const a = Buffer.from(hashOf(given));
  const b = Buffer.from(hash.trim().toLowerCase());
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Uma linha da lista: um arquivo gerenciado e o que está valendo para ele. */
export interface AssetInfo {
  /** `sprites/char-0.png` */
  path: string;
  /** o formato pelo nome: `png`, `webp` ou `ogg` */
  format: string;
  /** os bytes do que está sendo servido (a troca, se há) */
  bytes: number;
  /** os bytes do original do deploy */
  originalBytes: number;
  /** o tamanho em pixels do original (imagens) */
  width?: number;
  height?: number;
  /** há uma troca valendo, e de quando ela é (ms) */
  overridden: boolean;
  overriddenAt?: number;
}

export interface AdminOptions {
  /** o cliente buildado */
  distDir: string;
  /** onde as trocas ficam (`<dataDir>/overrides`) */
  dataDir: string;
  /** o SHA-256 da senha, em hexadecimal (`GUESS_ADMIN_HASH`) */
  hash: string;
  /** o estado do servidor para a página */
  stats: () => Record<string, unknown>;
  /** espera de senha errada, ms (os testes zeram) */
  failDelay?: number;
}

/** Onde fica a troca de um caminho gerenciado. */
export const overridePath = (dataDir: string, path: string) => join(dataDir, 'overrides', path);

const size = (file: string): number | null => { try { return statSync(file).size; } catch { return null; } };

/** A API do sistema: `handle` responde às rotas `/api/admin/…` e devolve null para o resto. */
export function createAdmin(opts: AdminOptions) {
  const hash = opts.hash;
  const failDelay = opts.failDelay ?? FAIL_DELAY;

  async function list(): Promise<AssetInfo[]> {
    const out: AssetInfo[] = [];
    for (const dir of ASSET_DIRS) {
      let names: string[] = [];
      try { names = readdirSync(join(opts.distDir, dir)).sort(); } catch { /* sem a pasta, nada */ }
      for (const name of names) {
        const path = `${dir}/${name}`;
        if (!ASSET_PATH_RE.test(path) || !(formatOf(path) in TYPES)) continue;
        const original = join(opts.distDir, path), over = overridePath(opts.dataDir, path);
        const originalBytes = size(original) ?? 0, overBytes = size(over);
        const info: AssetInfo = { path, format: formatOf(path), bytes: overBytes ?? originalBytes, originalBytes, overridden: overBytes !== null };
        if (overBytes !== null) info.overriddenAt = statSync(over).mtimeMs;
        if (info.format !== 'ogg') {
          try { const m = await new Bun.Image(original).metadata(); info.width = m.width; info.height = m.height; } catch { /* imagem ilegível: sem tamanho */ }
        }
        out.push(info);
      }
    }
    return out;
  }

  async function put(req: Request, path: string): Promise<Response> {
    const original = join(opts.distDir, path);
    if (size(original) === null) return new Response('só se troca um arquivo que já existe', { status: 404 });
    if (Number(req.headers.get('content-length') ?? 0) > UPLOAD_BYTES_MAX) return new Response('arquivo grande demais', { status: 413 });
    const bytes = new Uint8Array(await req.arrayBuffer());
    if (bytes.length > UPLOAD_BYTES_MAX) return new Response('arquivo grande demais', { status: 413 });
    const format = formatOf(path);
    if (sniff(bytes) !== format) return new Response(`o arquivo tem que ser ${format}`, { status: 415 });
    if (format !== 'ogg') {
      try {
        const [was, now] = await Promise.all([new Bun.Image(original).metadata(), new Bun.Image(bytes).metadata()]);
        if (was.width !== now.width || was.height !== now.height) {
          return new Response(`a imagem tem que ter ${was.width}×${was.height} pixels (veio ${now.width}×${now.height}): o atlas não muda`, { status: 422 });
        }
      } catch { return new Response('imagem ilegível', { status: 415 }); }
    }
    const over = overridePath(opts.dataDir, path);
    mkdirSync(dirname(over), { recursive: true });
    writeFileSync(over, bytes);
    return Response.json({ ok: true, bytes: bytes.length });
  }

  return {
    list,
    async handle(req: Request, url: URL): Promise<Response | null> {
      if (!url.pathname.startsWith('/api/admin/')) return null;
      if (!passOk(req.headers.get(ADMIN_HEADER), hash)) {
        if (failDelay) await new Promise((r) => setTimeout(r, failDelay));
        return new Response('senha errada', { status: 401 });
      }
      const rest = url.pathname.slice('/api/admin/'.length);
      if (rest === 'assets') {
        if (req.method !== 'GET') return new Response('method not allowed', { status: 405 });
        return Response.json({ assets: await list(), server: opts.stats() }, { headers: { 'cache-control': 'no-store' } });
      }
      if (!rest.startsWith('assets/')) return new Response('not found', { status: 404 });
      let path: string;
      try { path = decodeURIComponent(rest.slice('assets/'.length)); } catch { return new Response('bad path', { status: 400 }); }
      if (!ASSET_PATH_RE.test(path) || !(formatOf(path) in TYPES)) return new Response('caminho não gerenciado', { status: 400 });
      if (req.method === 'GET') {
        const over = overridePath(opts.dataDir, path);
        const file = Bun.file(url.searchParams.get('original') !== '1' && size(over) !== null ? over : join(opts.distDir, path));
        if (!(await file.exists())) return new Response('not found', { status: 404 });
        return new Response(file, { headers: { 'content-type': TYPES[formatOf(path)], 'cache-control': 'no-store', 'content-disposition': `attachment; filename="${path.split('/').pop()}"` } });
      }
      if (req.method === 'PUT') return put(req, path);
      if (req.method === 'DELETE') {
        rmSync(overridePath(opts.dataDir, path), { force: true });
        return Response.json({ ok: true });
      }
      return new Response('method not allowed', { status: 405 });
    },
  };
}
