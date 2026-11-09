import { CLOSE_ROOM_NOT_FOUND, SOCKET_IDLE_TIMEOUT, TOKEN_RE } from '@guess/protocol';
import type { SocketData } from './host';
import type { Log } from './log';
import { Rooms } from './rooms';
import { staticHandler } from './static';

export interface ServerOptions { port: number; distDir: string; log: Log; hostname?: string }

/**
 * HTTP: `/health`, `POST /api/rooms` (abre uma sala) e o cliente estático. WebSocket em `/ws?room=CODE&token=T`.
 * Sala inexistente: o upgrade é aceito e fechado com um código que o cliente sabe explicar.
 */
export function createServer(opts: ServerOptions) {
  const rooms = new Rooms(opts.log);
  const serveStatic = staticHandler(opts.distDir);

  const server = Bun.serve<SocketData>({
    port: opts.port,
    hostname: opts.hostname,
    async fetch(req, srv) {
      const url = new URL(req.url);
      if (url.pathname === '/health') return Response.json({ ok: true, rooms: rooms.size });
      if (url.pathname === '/api/rooms') {
        if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
        return Response.json({ code: rooms.create().code });
      }
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
