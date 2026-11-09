import { describe, expect, test } from 'bun:test';
import { CLOSE_REPLACED, CLOSE_ROOM_ENDED, type ServerMessage } from '@guess/protocol';
import { RoomHost, type Socket } from '../src/host';
import { silentLog } from '../src/log';

/** O mínimo de um socket do Bun que o host usa, com o que ele fez guardado. */
function fakeSocket(token: string) {
  const ws = {
    data: { code: 'ABCD', token }, sent: [] as string[], closedWith: null as number | null, terminated: false,
    send(d: string) { ws.sent.push(d); }, close(code?: number) { ws.closedWith = code ?? 1000; }, terminate() { ws.terminated = true; },
  };
  return ws as unknown as Socket & typeof ws;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const say = (host: RoomHost, ws: Socket, msg: object) => host.message(ws, JSON.stringify(msg));
const received = (ws: { sent: string[] }) => ws.sent.map((d) => JSON.parse(d) as ServerMessage);

describe('host: silêncio no socket', () => {
  test('quem fica em silêncio pelo tempo limite é derrubado como se tivesse caído; ping mantém vivo', async () => {
    const host = new RoomHost('ABCD', silentLog, () => {}, { silence: 40 });
    const a = fakeSocket('token-a'), b = fakeSocket('token-b');
    const heardAt = Date.now(); // antes do último sinal de Zé, senão o relógio do host pode ficar 1 ms atrás deste
    host.connect(a); say(host, a, { type: 'join', nickname: 'Zé' });
    host.connect(b); say(host, b, { type: 'join', nickname: 'Dita' });
    await sleep(25);
    say(host, b, { type: 'ping' });
    await sleep(25); // a: 50 ms calado; b: 25 ms
    expect(a.terminated).toBe(true);
    expect(b.terminated).toBe(false);
    // o lugar de Zé fica guardado, só desconectado
    expect(host.state.members.map((m) => [m.nickname, m.connected])).toEqual([['Zé', false], ['Dita', true]]);
    expect(host.connections).toBe(1);
    // a queda conta como atividade desde o último sinal de vida dele, não desde que o silêncio foi notado
    expect(host.state.lastActivity).toBeGreaterThanOrEqual(heardAt);
    expect(host.state.lastActivity).toBeLessThan(heardAt + 20);
    // o fechamento que o Bun avisa depois não conta duas vezes
    host.disconnect(a);
    expect(host.state.members.filter((m) => !m.connected)).toHaveLength(1);
    host.dispose();
  });

  test('a aba que assumiu o lugar de outra não herda o silêncio da velha', async () => {
    const host = new RoomHost('ABCD', silentLog, () => {}, { silence: 40 });
    const old = fakeSocket('token-a');
    host.connect(old); say(host, old, { type: 'join', nickname: 'Zé' });
    await sleep(30);
    const fresh = fakeSocket('token-a');
    host.connect(fresh);
    await sleep(25); // a velha teria vencido agora; a nova tem 25 ms
    expect(fresh.terminated).toBe(false);
    expect(host.state.members[0].connected).toBe(true);
    host.dispose();
  });
});

describe('host: sockets', () => {
  test('um socket novo com o mesmo token fecha o velho, sem a sala ver queda, e recebe o snapshot', () => {
    const host = new RoomHost('ABCD', silentLog, () => {});
    const old = fakeSocket('token-a'), other = fakeSocket('token-b');
    host.connect(old); say(host, old, { type: 'join', nickname: 'Zé' });
    host.connect(other);
    other.sent = [];
    const fresh = fakeSocket('token-a');
    host.connect(fresh);
    expect(old.closedWith).toBe(CLOSE_REPLACED);
    expect(received(fresh).at(-1)).toMatchObject({ type: 'snapshot', snapshot: { you: 'm1', members: [{ nickname: 'Zé', connected: true }] } });
    // o Bun avisa o fechamento do velho depois: não derruba quem assumiu
    host.disconnect(old);
    expect(host.state.members[0].connected).toBe(true);
    expect(host.connections).toBe(2);
    expect(received(other).every((m) => m.type !== 'snapshot' || m.snapshot.members[0].connected)).toBe(true);
    host.dispose();
  });

  test('mensagem malformada é descartada sem mudar a sala', () => {
    const host = new RoomHost('ABCD', silentLog, () => {});
    const a = fakeSocket('token-a');
    host.connect(a);
    const before = structuredClone(host.state);
    host.message(a, '{"type":"join"}');
    host.message(a, 'lixo');
    expect(host.state).toEqual(before);
    host.dispose();
  });

  test('ping recebe pong', () => {
    const host = new RoomHost('ABCD', silentLog, () => {});
    const a = fakeSocket('token-a');
    host.connect(a);
    say(host, a, { type: 'ping' });
    expect(received(a).at(-1)).toEqual({ type: 'pong' });
    host.dispose();
  });
});

describe('host: morte da sala', () => {
  test('quando a sala morre, todo socket é fechado com o código de sala encerrada e o dono é avisado', async () => {
    const dead: string[] = [];
    const host = new RoomHost('ABCD', silentLog, (c) => dead.push(c), { ttl: 30 });
    const a = fakeSocket('token-a'), b = fakeSocket('token-b');
    host.connect(a); say(host, a, { type: 'join', nickname: 'Zé' });
    host.connect(b);
    await sleep(60);
    expect(a.closedWith).toBe(CLOSE_ROOM_ENDED);
    expect(b.closedWith).toBe(CLOSE_ROOM_ENDED);
    expect(host.connections).toBe(0);
    expect(dead).toEqual(['ABCD']);
    host.dispose();
  });
});
