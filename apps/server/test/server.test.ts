import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CLOSE_REPLACED, CLOSE_ROOM_NOT_FOUND, CODE_RE, type RoomSnapshot, type ServerMessage } from '@guess/protocol';
import { createServer } from '../src/server';
import { silentLog } from '../src/log';
import { Rooms } from '../src/rooms';

/** Servidor de verdade numa porta livre; o adaptador de socket é coberto aqui só no que o deploy e o cliente dependem. */
let app: ReturnType<typeof createServer>;
let base: string;
const wsUrl = (room: string, token: string) => `${base.replace('http', 'ws')}/ws?room=${room}&token=${token}`;

beforeAll(() => {
  app = createServer({ port: 0, distDir: '/nonexistent', log: silentLog });
  base = `http://localhost:${app.server.port}`;
});
afterAll(() => app.stop());

function nextMessage(ws: WebSocket): Promise<ServerMessage> {
  return new Promise((res) => ws.addEventListener('message', (e) => res(JSON.parse(String(e.data))), { once: true }));
}
function closed(ws: WebSocket): Promise<CloseEvent> {
  return new Promise((res) => ws.addEventListener('close', (e) => res(e as CloseEvent), { once: true }));
}
const openRoom = async () => ((await (await fetch(`${base}/api/rooms`, { method: 'POST' })).json()) as { code: string }).code;

describe('servidor', () => {
  test('/health responde', async () => {
    const r = await fetch(`${base}/health`);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, rooms: 0 });
  });

  test('sem cliente buildado, a raiz explica em vez de quebrar', async () => {
    const r = await fetch(`${base}/sala/ABCD`);
    expect(r.status).toBe(503);
    expect(await r.text()).toContain('bun run build');
  });

  test('POST /api/rooms abre uma sala com código de quatro letras; outro método é recusado', async () => {
    const code = await openRoom();
    expect(code).toMatch(CODE_RE);
    expect(app.rooms.get(code)).toBeDefined();
    expect((await fetch(`${base}/api/rooms`)).status).toBe(405);
  });

  test('token inválido ou sala ausente no WebSocket: 400 antes do upgrade', async () => {
    const code = await openRoom();
    expect((await fetch(`${base}/ws?room=${code}&token=curto`)).status).toBe(400);
    expect((await fetch(`${base}/ws?token=token-aaaaaaaa`)).status).toBe(400);
  });

  test('sala desconhecida fecha o socket com o código que o cliente entende', async () => {
    const ws = new WebSocket(wsUrl('ZZZZ', 'token-desconhecido-1'));
    const e = await closed(ws);
    expect(e.code).toBe(CLOSE_ROOM_NOT_FOUND);
  });

  test('duas conexões na mesma sala entram e cada uma vê as duas', async () => {
    const code = await openRoom();
    const a = new WebSocket(wsUrl(code, 'token-aaaaaaaa'));
    expect(await nextMessage(a)).toEqual({ type: 'snapshot', snapshot: { code, phase: 'lobby', you: null, moderator: null, members: [] } });
    a.send(JSON.stringify({ type: 'join', nickname: 'Zé' }));
    expect(await nextMessage(a)).toMatchObject({ type: 'snapshot', snapshot: { you: 'm1', moderator: 'm1' } });

    const b = new WebSocket(wsUrl(code.toLowerCase(), 'token-bbbbbbbb'));
    await nextMessage(b);
    const seen = Promise.all([nextMessage(a), nextMessage(b)]);
    b.send(JSON.stringify({ type: 'join', nickname: 'Zé' }));
    const [snapA, snapB] = (await seen) as { snapshot: RoomSnapshot }[];
    const members = [{ id: 'm1', nickname: 'Zé', connected: true }, { id: 'm2', nickname: 'Zé 2', connected: true }];
    expect(snapA.snapshot).toEqual({ code, phase: 'lobby', you: 'm1', moderator: 'm1', members });
    expect(snapB.snapshot).toEqual({ code, phase: 'lobby', you: 'm2', moderator: 'm1', members });

    // quem fecha a aba continua na turma, desconectado
    const after = nextMessage(a);
    b.close();
    expect(((await after) as { snapshot: RoomSnapshot }).snapshot.members[1]).toEqual({ id: 'm2', nickname: 'Zé 2', connected: false });
    a.close();
  });

  test('um socket novo com o mesmo token assume o lugar do velho e recebe o snapshot na hora', async () => {
    const code = await openRoom();
    const a1 = new WebSocket(wsUrl(code, 'token-cccccccc'));
    await nextMessage(a1);
    a1.send(JSON.stringify({ type: 'join', nickname: 'Zé' }));
    await nextMessage(a1);

    const a2 = new WebSocket(wsUrl(code, 'token-cccccccc'));
    const [gone, snap] = await Promise.all([closed(a1), nextMessage(a2)]);
    expect(gone.code).toBe(CLOSE_REPLACED);
    expect(snap).toMatchObject({ type: 'snapshot', snapshot: { you: 'm1', members: [{ nickname: 'Zé', connected: true }] } });
    expect(app.rooms.get(code)!.connections).toBe(1);
    a2.close();
  });
});

describe('servidor: cliente estático', () => {
  test('serve os arquivos do build e cai no index.html em qualquer rota que não seja arquivo', async () => {
    const dist = mkdtempSync(join(tmpdir(), 'guess-dist-'));
    writeFileSync(join(dist, 'index.html'), '<!doctype html><title>guessoca</title>');
    writeFileSync(join(dist, 'app.js'), 'console.log(1)');
    const s = createServer({ port: 0, distDir: dist, log: silentLog });
    try {
      const url = `http://localhost:${s.server.port}`;
      expect(await (await fetch(`${url}/sala/ABCD`)).text()).toContain('guessoca');
      expect(await (await fetch(`${url}/app.js`)).text()).toBe('console.log(1)');
      expect(await (await fetch(`${url}/%2e%2e/%2e%2e/etc/passwd`)).text()).toContain('guessoca'); // vira o index, nunca sai de dist
    } finally { s.stop(); rmSync(dist, { recursive: true }); }
  });
});

describe('salas', () => {
  test('códigos são quatro letras do alfabeto sem I nem O, e nunca repetem uma sala viva', () => {
    const seq = [0, 0, 0, 0, 0, 0, 0, 0, 0.99, 0.99, 0.99, 0.99];
    let i = 0;
    const rooms = new Rooms(silentLog, () => seq[i++]);
    const first = rooms.create(), second = rooms.create();
    expect(first.code).toBe('AAAA');
    expect(second.code).toBe('ZZZZ'); // AAAA de novo foi sorteado e descartado
    expect(rooms.get('zzzz')).toBe(second);
    expect(rooms.size).toBe(2);
    first.dispose(); second.dispose();
  });
});
