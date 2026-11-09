import { CLOSE_ROOM_NOT_FOUND, IMAGE_BYTES_MAX, IMAGE_ID_RE, isWebp, parseRoomInit, SOCKET_IDLE_TIMEOUT, TOKEN_RE } from '@guess/protocol';
import type { SocketData } from './host';
import type { Log } from './log';
import { Rooms } from './rooms';
import { staticHandler } from './static';

/** `dev`: as salas aceitam jogadores falsos (nunca em produção). */
export interface ServerOptions { port: number; distDir: string; log: Log; hostname?: string; dev?: boolean }

/** O corpo de `POST /api/rooms` (as escolhas do pré-lobby) não passa disto. */
const ROOM_INIT_BYTES_MAX = 1024;

const IMAGES_PATH = /^\/api\/rooms\/([A-Za-z]+)\/images(?:\/([^/]+))?$/;

/** Lê o corpo até `max` bytes; passou disso, null (sem guardar o resto). */
async function readCapped(req: Request, max: number): Promise<Uint8Array<ArrayBuffer> | null> {
  if (!req.body) return new Uint8Array(0);
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of req.body) {
    total += chunk.length;
    if (total > max) return null;
    chunks.push(chunk);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

/** O corpo de `POST /api/rooms` como JSON; vazio ou não JSON vira `undefined` (e a sala fica nos padrões). */
function parseJson(bytes: Uint8Array): unknown {
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { return undefined; }
}

/**
 * HTTP: `/health`, `POST /api/rooms` (abre uma sala com as escolhas do pré-lobby no corpo JSON, `RoomInit`: o que falta
 * ou não vale fica no padrão; corpo acima de `ROOM_INIT_BYTES_MAX` → 413), as imagens dos post-its e o cliente estático. WebSocket em
 * `/ws?room=CODE&token=T`. Sala inexistente: o upgrade é aceito e fechado com um código que o cliente sabe explicar.
 * Imagens (ADR 0002): `POST /api/rooms/CODE/images?token=T` com um WebP → `{ id }`; `GET /api/rooms/CODE/images/ID`.
 */
export function createServer(opts: ServerOptions) {
  const rooms = new Rooms(opts.log, Math.random, { dev: opts.dev ?? false });

  async function images(req: Request, url: URL, code: string, id: string | undefined): Promise<Response> {
    const host = rooms.get(code);
    if (id !== undefined) {
      if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('method not allowed', { status: 405 });
      const bytes = IMAGE_ID_RE.test(id) ? host?.image(id) : undefined;
      if (!bytes) return new Response('not found', { status: 404 });
      return new Response(bytes, { headers: { 'content-type': 'image/webp', 'cache-control': 'private, max-age=86400, immutable' } });
    }
    if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
    if (!host) return new Response('room not found', { status: 404 });
    // recusa o que dá para recusar antes de ler o corpo
    const token = url.searchParams.get('token') ?? '';
    if (!host.state.members.some((m) => m.token === token)) return new Response('not a member', { status: 403 });
    if (Number(req.headers.get('content-length') ?? 0) > IMAGE_BYTES_MAX) return new Response('too big', { status: 413 });
    const bytes = await readCapped(req, IMAGE_BYTES_MAX);
    if (!bytes) return new Response('too big', { status: 413 });
    if (!isWebp(bytes)) return new Response('not webp', { status: 415 });
    const r = host.addImage(token, bytes);
    if (r.ok) return Response.json({ id: r.id });
    const status = { notMember: 403, tooBig: 413, notWebp: 415 }[r.error];
    return new Response(r.error, { status });
  }
  const serveStatic = staticHandler(opts.distDir);

  const server = Bun.serve<SocketData>({
    port: opts.port,
    hostname: opts.hostname,
    async fetch(req, srv) {
      const url = new URL(req.url);
      if (url.pathname === '/health') return Response.json({ ok: true, rooms: rooms.size });
      if (url.pathname === '/api/rooms') {
        if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
        if (Number(req.headers.get('content-length') ?? 0) > ROOM_INIT_BYTES_MAX) return new Response('too big', { status: 413 });
        const body = await readCapped(req, ROOM_INIT_BYTES_MAX);
        if (!body) return new Response('too big', { status: 413 });
        return Response.json({ code: rooms.create(parseRoomInit(parseJson(body))).code });
      }
      const image = IMAGES_PATH.exec(url.pathname);
      if (image) return images(req, url, image[1].toUpperCase(), image[2]);
      if (url.pathname === '/ws') {
        const code = (url.searchParams.get('room') ?? '').toUpperCase();
        const token = url.searchParams.get('token') ?? '';
        if (!TOKEN_RE.test(token) || !code) return new Response('room and token required', { status: 400 });
        return srv.upgrade(req, { data: { code, token } }) ? undefined : new Response('upgrade failed', { status: 400 });
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('method not allowed', { status: 405 });
      return serveStatic(url.pathname);
    },
    websocket: {
      idleTimeout: SOCKET_IDLE_TIMEOUT / 1000,
      open(ws) {
        const host = rooms.get(ws.data.code);
        if (!host) { ws.close(CLOSE_ROOM_NOT_FOUND, 'sala não existe'); return; }
        host.connect(ws);
      },
      message(ws, raw) { rooms.get(ws.data.code)?.message(ws, raw); },
      close(ws) { rooms.get(ws.data.code)?.disconnect(ws); },
    },
  });

  return { server, rooms, stop: () => server.stop(true) };
}
