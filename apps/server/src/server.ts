import { CLOSE_ROOM_NOT_FOUND, IMAGE_BYTES_MAX, IMAGE_ID_RE, isWebp, parseRoomInit, SOCKET_IDLE_TIMEOUT, SOCKET_MESSAGE_BYTES_MAX, TOKEN_RE, type RoomPeek } from '@guess/protocol';
import type { SocketData } from './host';
import type { Log } from './log';
import { Rooms, ROOMS_MAX } from './rooms';
import { staticHandler } from './static';
import { createAdmin } from './admin';
import { clientIp, KeyedBuckets } from './limits';
import { join } from 'node:path';

/** `dev`: as salas aceitam jogadores falsos (nunca em produção). */
export interface ServerOptions {
  port: number; distDir: string; log: Log; hostname?: string; dev?: boolean;
  /** onde ficam as trocas de arquivos do sistema (`admin.ts`): as que existem são servidas mesmo com o sistema desligado */
  dataDir?: string;
  /** o SHA-256 da senha do sistema (`GUESS_ADMIN_HASH`); sem isto, ou sem `dataDir`, o sistema fica desligado (404) */
  adminHash?: string;
  /** os limites contra abuso (`LIMITS`); os testes apertam */
  limits?: Partial<Limits>;
}

/**
 * Contra abuso (issue #72). `createBurst` salas de uma vez por IP, depois uma a cada `1 / createPerSecond` s; no máximo
 * `roomsMax` salas vivas; no máximo `socketsPerIp` sockets abertos do mesmo IP (uma turma inteira atrás do mesmo
 * roteador, com abas a mais, cabe folgada), abertos a no máximo `connectBurst` de uma vez e `connectPerSecond` depois (a
 * reconexão do cliente espera pelo menos meio segundo, e cresce): fechar um socket por enxurrada não vira reabrir na hora.
 */
export interface Limits { createBurst: number; createPerSecond: number; roomsMax: number; socketsPerIp: number; connectBurst: number; connectPerSecond: number }
export const LIMITS: Limits = { createBurst: 10, createPerSecond: 1 / 6, roomsMax: ROOMS_MAX, socketsPerIp: 24, connectBurst: 30, connectPerSecond: 2 };

/** O corpo de `POST /api/rooms` (as escolhas do pré-lobby) não passa disto. */
const ROOM_INIT_BYTES_MAX = 1024;

const PEEK_PATH = /^\/api\/rooms\/([A-Za-z]+)$/;
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
 * `GET /api/rooms/CODE?token=T`: uma olhada na sala antes de entrar (`RoomPeek`), ou 404.
 * Imagens (ADR 0002): `POST /api/rooms/CODE/images?token=T` com um WebP → `{ id }`; `GET /api/rooms/CODE/images/ID`.
 */
export function createServer(opts: ServerOptions) {
  const limits: Limits = { ...LIMITS, ...opts.limits };
  const rooms = new Rooms(opts.log, Math.random, { dev: opts.dev ?? false }, { max: limits.roomsMax });
  const creations = new KeyedBuckets(limits.createBurst, limits.createPerSecond);
  const connects = new KeyedBuckets(limits.connectBurst, limits.connectPerSecond);
  /** sockets abertos por IP */
  const socketsOf = new Map<string, number>();
  /** recusas por limite desde o último registro no log: uma linha por minuto no máximo, não uma por recusa */
  let refusedSince = 0, refusedLoggedAt = 0;
  const refused = (what: string) => {
    refusedSince++;
    const now = Date.now();
    if (now - refusedLoggedAt < 60_000) return;
    opts.log('server.limited', { what, refused: refusedSince });
    refusedSince = 0; refusedLoggedAt = now;
  };

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
  const serveStatic = staticHandler(opts.distDir, opts.dataDir && join(opts.dataDir, 'overrides'));
  const startedAt = Date.now();
  const admin = opts.dataDir === undefined || !opts.adminHash ? null : createAdmin({
    distDir: opts.distDir, dataDir: opts.dataDir, hash: opts.adminHash,
    stats: () => ({ rooms: rooms.size, startedAt, now: Date.now(), dev: opts.dev ?? false, bun: Bun.version }),
    failDelay: opts.dev ? 0 : undefined,
  });

  const server = Bun.serve<SocketData>({
    port: opts.port,
    hostname: opts.hostname,
    async fetch(req, srv) {
      const url = new URL(req.url);
      if (url.pathname === '/health') return Response.json({ ok: true, rooms: rooms.size });
      const ip = clientIp(req, srv.requestIP(req)?.address);
      if (url.pathname === '/api/rooms') {
        if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
        if (Number(req.headers.get('content-length') ?? 0) > ROOM_INIT_BYTES_MAX) return new Response('too big', { status: 413 });
        if (!creations.take(ip, Date.now())) {
          refused('create');
          return new Response('too many rooms', { status: 429, headers: { 'retry-after': String(Math.ceil(1 / limits.createPerSecond)) } });
        }
        const body = await readCapped(req, ROOM_INIT_BYTES_MAX);
        if (!body) return new Response('too big', { status: 413 });
        const host = rooms.create(parseRoomInit(parseJson(body)));
        if (!host) { refused('roomsFull'); return new Response('no room left', { status: 503, headers: { 'retry-after': '60' } }); }
        return Response.json({ code: host.code });
      }
      if (url.pathname.startsWith('/api/admin/')) return (await admin?.handle(req, url)) ?? new Response('sistema desligado', { status: 404 });
      const peek = PEEK_PATH.exec(url.pathname);
      if (peek) {
        if (req.method !== 'GET') return new Response('method not allowed', { status: 405 });
        const st = rooms.get(peek[1])?.state;
        if (!st || st.phase === 'dead') return Response.json({ found: false }, { status: 404 });
        const token = url.searchParams.get('token');
        const body: RoomPeek = { phase: st.game.phase, members: st.members.length, maxPlayers: st.maxPlayers, member: !!token && st.members.some((m) => m.token === token) };
        return Response.json(body, { headers: { 'cache-control': 'no-store' } });
      }
      const image = IMAGES_PATH.exec(url.pathname);
      if (image) return images(req, url, image[1].toUpperCase(), image[2]);
      if (url.pathname === '/ws') {
        const code = (url.searchParams.get('room') ?? '').toUpperCase();
        const token = url.searchParams.get('token') ?? '';
        if (!TOKEN_RE.test(token) || !code) return new Response('room and token required', { status: 400 });
        if ((socketsOf.get(ip) ?? 0) >= limits.socketsPerIp || !connects.take(ip, Date.now())) { refused('sockets'); return new Response('too many sockets', { status: 429 }); }
        return srv.upgrade(req, { data: { code, token, ip } }) ? undefined : new Response('upgrade failed', { status: 400 });
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('method not allowed', { status: 405 });
      return serveStatic(url.pathname);
    },
    websocket: {
      idleTimeout: SOCKET_IDLE_TIMEOUT / 1000,
      // acima disto o Bun fecha o socket (1009) sem nem montar a mensagem; a maior de verdade é bem menor
      maxPayloadLength: SOCKET_MESSAGE_BYTES_MAX,
      open(ws) {
        socketsOf.set(ws.data.ip, (socketsOf.get(ws.data.ip) ?? 0) + 1);
        const host = rooms.get(ws.data.code);
        if (!host) { ws.close(CLOSE_ROOM_NOT_FOUND, 'sala não existe'); return; }
        host.connect(ws);
      },
      message(ws, raw) { rooms.get(ws.data.code)?.message(ws, raw); },
      close(ws) {
        const n = (socketsOf.get(ws.data.ip) ?? 1) - 1;
        if (n > 0) socketsOf.set(ws.data.ip, n); else socketsOf.delete(ws.data.ip);
        rooms.get(ws.data.code)?.disconnect(ws);
      },
    },
  });

  return { server, rooms, stop: () => server.stop(true) };
}
