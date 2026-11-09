import { describe, expect, test } from 'bun:test';
import { CLOSE_KICKED, CLOSE_REPLACED, CLOSE_ROOM_ENDED, IMAGE_BYTES_MAX, IMAGE_ID_RE, type Presence, type ServerMessage } from '@guess/protocol';
import { IMAGE_GRACE, IMAGES_PER_UPLOADER, RoomHost, type Socket } from '../src/host';
import { silentLog } from '../src/log';
import { webp } from './sim';

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

const idOf = (r: ReturnType<RoomHost['addImage']>) => { if (!r.ok) throw new Error(r.error); return r.id; };

/** um host com relógio de mentira e duas pessoas, Zé (moderador) e Dita */
function hostWithTwo() {
  let now = 1_000_000;
  const clock = { advance: (ms: number) => { now += ms; } };
  const host = new RoomHost('ABCD', silentLog, () => {}, { clock: () => now });
  const a = fakeSocket('token-a'), b = fakeSocket('token-b');
  host.connect(a); say(host, a, { type: 'join', nickname: 'Zé' });
  host.connect(b); say(host, b, { type: 'join', nickname: 'Dita' });
  return { host, a, b, clock };
}

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

describe('host: expulsar', () => {
  test('o socket do expulso fecha com 4403 e o mesmo token não entra de novo', () => {
    const host = new RoomHost('ABCD', silentLog, () => {});
    const a = fakeSocket('token-a'), b = fakeSocket('token-b');
    host.connect(a); say(host, a, { type: 'join', nickname: 'Zé' });
    host.connect(b); say(host, b, { type: 'join', nickname: 'Dita' });
    say(host, a, { type: 'kick', member: 'm2' });
    expect(b.closedWith).toBe(CLOSE_KICKED);
    expect(host.connections).toBe(1);
    host.disconnect(b); // o Bun avisa depois; nada muda
    const again = fakeSocket('token-b');
    host.connect(again);
    expect(again.closedWith).toBe(CLOSE_KICKED);
    expect(host.connections).toBe(1);
    expect(host.state.members.map((m) => m.nickname)).toEqual(['Zé']);
    host.dispose();
  });
});

describe('host: imagens', () => {
  test('guarda o WebP de um membro e devolve um id; recusa visitante, desconhecido, grande demais e não WebP', () => {
    const { host } = hostWithTwo();
    const visitor = fakeSocket('token-v');
    host.connect(visitor);
    const bytes = webp(100);
    const r = host.addImage('token-a', bytes);
    expect(r.ok).toBe(true);
    const id = idOf(r);
    expect(id).toMatch(IMAGE_ID_RE);
    expect(host.image(id)).toEqual(bytes);
    expect(host.addImage('token-v', webp())).toEqual({ ok: false, error: 'notMember' });
    expect(host.addImage('token-zzz', webp())).toEqual({ ok: false, error: 'notMember' });
    expect(host.addImage('token-a', webp(IMAGE_BYTES_MAX + 1))).toEqual({ ok: false, error: 'tooBig' });
    expect(host.addImage('token-a', new Uint8Array(100))).toEqual({ ok: false, error: 'notWebp' });
    expect(idOf(host.addImage('token-a', webp(IMAGE_BYTES_MAX)))).toMatch(IMAGE_ID_RE);
    expect(host.image('0123456789abcdef')).toBeUndefined();
    host.dispose();
  });

  test('o expulso não sobe imagem', () => {
    const { host, a } = hostWithTwo();
    say(host, a, { type: 'kick', member: 'm2' });
    expect(host.addImage('token-b', webp())).toEqual({ ok: false, error: 'notMember' });
    host.dispose();
  });

  test('uma imagem que nenhum post-it usa morre depois da tolerância; uma usada fica; a trocada morre na hora', () => {
    expect(IMAGE_GRACE).toBe(2 * 60_000);
    const { host, a, b, clock } = hostWithTwo();
    const orphan = idOf(host.addImage('token-a', webp()));
    clock.advance(IMAGE_GRACE - 1);
    say(host, a, { type: 'ping' });
    expect(host.image(orphan)).toBeDefined(); // ainda esperando o write
    clock.advance(2);
    say(host, a, { type: 'ping' });
    expect(host.image(orphan)).toBeUndefined();

    say(host, a, { type: 'startWriting' });
    const used = idOf(host.addImage('token-a', webp()));
    say(host, a, { type: 'write', owner: 'm2', text: 'Pelé', image: used });
    clock.advance(10 * IMAGE_GRACE);
    say(host, b, { type: 'ping' });
    expect(host.image(used)).toBeDefined();

    const replacement = idOf(host.addImage('token-a', webp()));
    say(host, a, { type: 'write', owner: 'm2', text: 'Pelé', image: replacement });
    expect(host.image(used)).toBeUndefined();
    expect(host.image(replacement)).toBeDefined();
    host.dispose();
  });

  test(`cada pessoa guarda no máximo ${IMAGES_PER_UPLOADER} imagens soltas: a mais velha sai`, () => {
    expect(IMAGES_PER_UPLOADER).toBe(2);
    const { host, clock } = hostWithTwo();
    const first = idOf(host.addImage('token-a', webp()));
    clock.advance(1);
    const second = idOf(host.addImage('token-a', webp()));
    clock.advance(1);
    const other = idOf(host.addImage('token-b', webp()));
    clock.advance(1);
    const third = idOf(host.addImage('token-a', webp()));
    expect(host.image(first)).toBeUndefined();
    expect([second, third, other].map((id) => host.image(id) !== undefined)).toEqual([true, true, true]);
    host.dispose();
  });

  test('um write com imagem que a sala não tem é recusado antes de chegar à sala', () => {
    const { host, a } = hostWithTwo();
    say(host, a, { type: 'startWriting' });
    a.sent = [];
    say(host, a, { type: 'write', owner: 'm2', text: 'Pelé', image: '0123456789abcdef' });
    expect(received(a)).toEqual([{ type: 'error', error: 'refused' }]);
    expect(host.state.game.postits.m2.text).toBe('');
    say(host, a, { type: 'write', owner: 'm2', text: 'Pelé', image: null });
    expect(host.state.game.postits.m2.text).toBe('Pelé');
    host.dispose();
  });

  test('quando a sala morre, as imagens morrem junto', async () => {
    const host = new RoomHost('ABCD', silentLog, () => {}, { ttl: 30 });
    const a = fakeSocket('token-a');
    host.connect(a); say(host, a, { type: 'join', nickname: 'Zé' });
    const id = idOf(host.addImage('token-a', webp()));
    await sleep(60);
    expect(host.image(id)).toBeUndefined();
    expect(host.addImage('token-a', webp())).toEqual({ ok: false, error: 'notMember' });
    host.dispose();
  });
});

describe('host: presença e empurrão (por fora da sala, ADR 0005)', () => {
  const at = (x: number): Presence => ({ x, y: 0, z: 10, vx: 0, vy: 0, vz: 0, facing: 1, anim: 'idle', emote: null, blink: false });
  const presences = (ws: { sent: string[] }): ServerMessage[] => received(ws).filter((m) => m.type === 'presence');

  test('a presença de um vai aos outros, com o id de quem é, e não volta para quem mandou', () => {
    const { host, a, b } = hostWithTwo();
    a.sent.length = 0; b.sent.length = 0;
    say(host, a, { type: 'presence', presence: at(100) });
    expect(presences(b)).toEqual([{ type: 'presence', member: 'm1', presence: at(100) } as ServerMessage]);
    expect(presences(a)).toEqual([]);
    host.dispose();
  });

  test('no máximo uma por intervalo por pessoa, e a que sai depois é a mais recente', async () => {
    const host = new RoomHost('ABCD', silentLog, () => {}, { presenceInterval: 30 });
    const a = fakeSocket('token-a'), b = fakeSocket('token-b');
    host.connect(a); say(host, a, { type: 'join', nickname: 'Zé' });
    host.connect(b); say(host, b, { type: 'join', nickname: 'Dita' });
    b.sent.length = 0;
    for (const x of [1, 2, 3, 4]) say(host, a, { type: 'presence', presence: at(x) });
    expect(presences(b).map((m) => m.type === 'presence' && m.presence.x)).toEqual([1]);
    await sleep(45);
    expect(presences(b).map((m) => m.type === 'presence' && m.presence.x)).toEqual([1, 4]);
    host.dispose();
  });

  test('presença não é atividade e não muda a sala; visitante não tem presença', () => {
    const { host, a, clock } = hostWithTwo();
    const before = host.state;
    clock.advance(5_000);
    say(host, a, { type: 'presence', presence: at(5) });
    expect(host.state).toBe(before);
    const v = fakeSocket('token-v');
    host.connect(v);
    a.sent.length = 0;
    say(host, v, { type: 'presence', presence: at(9) });
    expect(presences(a)).toEqual([]);
    host.dispose();
  });

  test('quem conecta recebe a última presença de cada um, sem esperar a próxima', () => {
    const { host, a } = hostWithTwo();
    say(host, a, { type: 'presence', presence: at(42) });
    const c = fakeSocket('token-c');
    host.connect(c);
    expect(presences(c)).toEqual([{ type: 'presence', member: 'm1', presence: at(42) } as ServerMessage]);
    host.dispose();
  });

  test('o empurrão vai só para quem foi empurrado, com quem empurrou e o lado', () => {
    const { host, a, b } = hostWithTwo();
    a.sent.length = 0; b.sent.length = 0;
    say(host, a, { type: 'shove', target: 'm2', dir: -1 });
    expect(received(b).filter((m) => m.type === 'shoved')).toEqual([{ type: 'shoved', by: 'm1', dir: -1 }]);
    expect(received(a).filter((m) => m.type === 'shoved')).toEqual([]);
    host.dispose();
  });

  test('empurrar a si mesmo, alguém que não existe ou estando fora da turma não faz nada', () => {
    const { host, a, b } = hostWithTwo();
    a.sent.length = 0; b.sent.length = 0;
    say(host, a, { type: 'shove', target: 'm1', dir: 1 });
    say(host, a, { type: 'shove', target: 'm9', dir: 1 });
    const v = fakeSocket('token-v');
    host.connect(v);
    say(host, v, { type: 'shove', target: 'm2', dir: 1 });
    expect([...received(a), ...received(b)].filter((m) => m.type === 'shoved')).toEqual([]);
    host.dispose();
  });
});
