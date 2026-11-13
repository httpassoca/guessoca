import { describe, expect, test } from 'bun:test';
import { CHAT_INTERVAL, type ServerMessage } from '@guess/protocol';
import { RoomHost, type Socket } from '../src/host';
import { silentLog } from '../src/log';

/** O mínimo de um socket do Bun que o host usa, com o que ele mandou guardado. */
function fakeSocket(token: string) {
  const ws = { data: { code: 'ABCD', token }, sent: [] as string[], send(d: string) { ws.sent.push(d); }, close() {}, terminate() {} };
  return ws as unknown as Socket & typeof ws;
}
const say = (host: RoomHost, ws: Socket, msg: object) => host.message(ws, JSON.stringify(msg));
const chats = (ws: { sent: string[] }) => ws.sent.map((d) => JSON.parse(d) as ServerMessage).filter((m) => m.type === 'chat');

/** um host com relógio de mentira, Zé (moderador) e Dita na turma e um visitante que não entrou */
function setup() {
  let now = 1_000_000;
  const host = new RoomHost('ABCD', silentLog, () => {}, { clock: () => now });
  const a = fakeSocket('token-a'), b = fakeSocket('token-b'), v = fakeSocket('token-v');
  host.connect(a); say(host, a, { type: 'join', nickname: 'Zé' });
  host.connect(b); say(host, b, { type: 'join', nickname: 'Dita' });
  host.connect(v);
  for (const ws of [a, b, v]) ws.sent.length = 0;
  return { host, a, b, v, advance: (ms: number) => { now += ms; } };
}

describe('host: fala', () => {
  test('a fala vai para todo mundo, inclusive quem falou, com quem falou e o texto limpo', () => {
    const { host, a, b } = setup();
    say(host, a, { type: 'chat', text: '  olá,\n <b>você</b>  ' });
    const want = [{ type: 'chat' as const, member: 'm1', text: 'olá, <b>você</b>' }];
    expect(chats(a)).toEqual(want);
    expect(chats(b)).toEqual(want);
    host.dispose();
  });

  test('não entra na sala: nenhum snapshot sai e não conta como atividade', () => {
    const { host, a, b, advance } = setup();
    const before = host.state.lastActivity;
    advance(5000);
    say(host, a, { type: 'chat', text: 'oi' });
    expect(host.state.lastActivity).toBe(before);
    expect([...a.sent, ...b.sent].map((d) => JSON.parse(d).type)).toEqual(['chat', 'chat']);
    host.dispose();
  });

  test('uma fala por segundo por pessoa: as a mais são descartadas; cada pessoa tem a sua conta', () => {
    const { host, a, b, advance } = setup();
    say(host, a, { type: 'chat', text: 'um' });
    advance(CHAT_INTERVAL - 1);
    say(host, a, { type: 'chat', text: 'dois' });
    say(host, b, { type: 'chat', text: 'eu posso' });
    advance(1);
    say(host, a, { type: 'chat', text: 'três' });
    advance(10);
    say(host, a, { type: 'chat', text: 'quatro' });
    expect(chats(b).map((m) => [m.member, m.text])).toEqual([['m1', 'um'], ['m2', 'eu posso'], ['m1', 'três']]);
    host.dispose();
  });

  test('a fala descartada não empurra a janela: quem insiste volta a falar um segundo depois da última que saiu', () => {
    const { host, a, b, advance } = setup();
    say(host, a, { type: 'chat', text: 'um' });
    for (let i = 0; i < 9; i++) { advance(100); say(host, a, { type: 'chat', text: 'spam' }); }
    advance(100);
    say(host, a, { type: 'chat', text: 'dois' });
    expect(chats(b).map((m) => m.text)).toEqual(['um', 'dois']);
    host.dispose();
  });

  test('visitante (ainda sem apelido) não fala; a fala vazia ou torta de alguém da turma também não sai', () => {
    const { host, a, b, v } = setup();
    say(host, v, { type: 'chat', text: 'oi' });
    say(host, a, { type: 'chat', text: ' \n ' });
    say(host, a, { type: 'chat', text: 7 });
    expect([...chats(a), ...chats(b), ...chats(v)]).toEqual([]);
    host.dispose();
  });
});
