import { afterEach, describe, expect, test } from 'bun:test';
import { createServer } from '../../server/src/server';
import { silentLog } from '../../server/src/log';
import { RemoteRoom, type RemoteState } from '../src/lib/room/remote';

/** A ponta do cliente contra o servidor de verdade numa porta livre, com WebSockets de verdade. */
let stops: (() => void)[] = [];
afterEach(() => { for (const s of stops.splice(0)) s(); });

function start() {
  const srv = createServer({ port: 0, distDir: '/nonexistent', log: silentLog, hostname: '127.0.0.1' });
  stops.push(srv.stop);
  return { base: `http://127.0.0.1:${srv.server.port}`, ws: `ws://127.0.0.1:${srv.server.port}/ws` };
}

function open(ws: string, room: string, token: string) {
  const r = new RemoteRoom({ url: ws, room, token });
  stops.unshift(() => r.dispose());
  r.connect();
  return r;
}

/** Espera até o estado da sala satisfazer `ok` (ou falha em 2 s). */
function until(r: RemoteRoom, ok: (s: RemoteState) => boolean): Promise<RemoteState> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { off(); reject(new Error(`não chegou: ${JSON.stringify(r.state)}`)); }, 2000);
    const off = r.watch((s) => { if (ok(s)) { clearTimeout(timer); queueMicrotask(off); resolve(s); } });
  });
}

describe('sala online: cliente ↔ servidor', () => {
  test('duas abas abrem e entram na mesma sala e se veem', async () => {
    const { base, ws } = start();
    const { code } = (await (await fetch(`${base}/api/rooms`, { method: 'POST' })).json()) as { code: string };

    const ze = open(ws, code, 'token-do-ze');
    await until(ze, (s) => s.status === 'open' && s.room !== null);
    ze.join('Zé');
    const zeIn = await until(ze, (s) => s.room?.you != null);
    expect(zeIn.room!.moderator).toBe(zeIn.room!.you);

    const ana = open(ws, code, 'token-da-ana');
    await until(ana, (s) => s.status === 'open');
    ana.join('zé');
    const both = await until(ze, (s) => s.room?.members.length === 2);
    expect(both.room!.members.map((m) => m.nickname)).toEqual(['Zé', 'zé 2']);
    const fromAna = await until(ana, (s) => s.room?.members.length === 2 && s.room.you !== null);
    expect(fromAna.room!.moderator).toBe(zeIn.room!.you);
  });

  test('a mesma aba que reconecta volta para o mesmo lugar', async () => {
    const { base, ws } = start();
    const { code } = (await (await fetch(`${base}/api/rooms`, { method: 'POST' })).json()) as { code: string };
    const ze = open(ws, code, 'token-do-ze');
    await until(ze, (s) => s.status === 'open');
    ze.join('Zé');
    const first = await until(ze, (s) => s.room?.you != null);
    ze.reconnect();
    const back = await until(ze, (s) => s.status === 'open' && s.room?.you === first.room!.you && s.room.members[0].connected);
    expect(back.room!.members).toHaveLength(1);
  });

  test('sala que não existe para de tentar e diz por quê', async () => {
    const { ws } = start();
    const r = open(ws, 'ZZZZ', 'token-perdido');
    const s = await until(r, (x) => x.status === 'closed');
    expect(s.reason).toBe('notFound');
  });
});
