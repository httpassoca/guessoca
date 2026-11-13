import { describe, expect, test } from 'bun:test';
import { CHAT_INTERVAL, CHAT_MAX } from '@guess/protocol';
import { keyAction, type KeyContext } from '../src/lib/keys';
import { RemoteRoom, type SocketLike } from '../src/lib/room/remote';
import { alive, bubbleMs, BUBBLE_MAX, BUBBLE_MIN, canSend, nextExpiry, say, SEND_GAP, snapShift, type Bubble } from '../src/lib/world/bubbles';

describe('balões de fala: quanto duram', () => {
  test('de 3 a 6 s, crescendo com o tamanho', () => {
    expect(bubbleMs('oi')).toBeGreaterThanOrEqual(BUBBLE_MIN);
    expect(bubbleMs('oi')).toBeLessThan(3500);
    expect(bubbleMs('x'.repeat(30))).toBeGreaterThan(bubbleMs('x'.repeat(10)));
    expect(bubbleMs('x'.repeat(CHAT_MAX))).toBe(BUBBLE_MAX);
    expect(bubbleMs('x'.repeat(500))).toBe(BUBBLE_MAX);
    expect(BUBBLE_MIN).toBe(3000);
    expect(BUBBLE_MAX).toBe(6000);
  });

  test('um emoji conta como um caractere', () => {
    expect(bubbleMs('😀')).toBe(bubbleMs('a'));
  });
});

describe('balões de fala: a lista', () => {
  test('quem fala ganha um balão que vence depois do tempo dele', () => {
    const list = say([], 'm1', 'oi', 1000);
    expect(list).toEqual([{ id: 'm1', text: 'oi', until: 1000 + bubbleMs('oi'), seq: 1 }]);
    expect(alive(list, 1000 + bubbleMs('oi') - 1)).toBe(list);
    expect(alive(list, 1000 + bubbleMs('oi'))).toEqual([]);
  });

  test('uma fala nova da mesma pessoa troca a anterior e recomeça o tempo; a dos outros fica', () => {
    let list: readonly Bubble[] = say([], 'm1', 'um', 0);
    list = say(list, 'm2', 'outro', 500);
    list = say(list, 'm1', 'dois', 1000);
    expect(list.map((b) => [b.id, b.text])).toEqual([['m2', 'outro'], ['m1', 'dois']]);
    expect(list.find((b) => b.id === 'm1')!.until).toBe(1000 + bubbleMs('dois'));
    // o número de cada fala é novo, mesmo com o mesmo texto (a tela recria o balão)
    const again = say(list, 'm1', 'dois', 1100);
    expect(again.find((b) => b.id === 'm1')!.seq).toBeGreaterThan(list.find((b) => b.id === 'm1')!.seq);
  });

  test('falar tira os que já venceram', () => {
    const list = say(say([], 'm1', 'um', 0), 'm2', 'dois', 10_000);
    expect(list.map((b) => b.id)).toEqual(['m2']);
  });

  test('quando vence o próximo', () => {
    expect(nextExpiry([])).toBeNull();
    const list = say(say([], 'm1', 'x'.repeat(40), 0), 'm2', 'oi', 100);
    expect(nextExpiry(list)).toBe(100 + bubbleMs('oi'));
  });
});

describe('fala: o ritmo de quem manda', () => {
  test('a primeira sai na hora; a seguinte, só depois do intervalo do servidor mais a folga', () => {
    expect(canSend(null, 0)).toBe(true);
    expect(canSend(1000, 1000 + CHAT_INTERVAL)).toBe(false);
    expect(canSend(1000, 1000 + SEND_GAP - 1)).toBe(false);
    expect(canSend(1000, 1000 + SEND_GAP)).toBe(true);
    expect(SEND_GAP).toBeGreaterThan(CHAT_INTERVAL);
  });
});

describe('balões de fala: na grade de pixels', () => {
  test('largura par fica onde está; ímpar anda meio pixel, para a borda cair num pixel inteiro', () => {
    expect(snapShift(98)).toBe(0);
    expect(snapShift(99)).toBe(0.5);
    for (const w of [66, 99, 105, 312]) expect(Number.isInteger(1000 - w / 2 + snapShift(w))).toBe(true);
  });
});

describe('teclado: Enter abre a fala', () => {
  const free: KeyContext = { inTextField: false, canSkip: false, canNotepad: true, canPanel: true, canChat: true };
  test('Enter foca o campo da fala quando dá para falar', () => {
    expect(keyAction({ key: 'Enter' }, free)).toBe('chat');
    expect(keyAction({ key: 'Enter' }, { ...free, canChat: false })).toBeNull();
  });
  test('num campo de texto, com modificador ou repetido, não', () => {
    expect(keyAction({ key: 'Enter' }, { ...free, inTextField: true })).toBeNull();
    for (const mod of [{ ctrlKey: true }, { altKey: true }, { metaKey: true }, { shiftKey: true }, { repeat: true }]) expect(keyAction({ key: 'Enter', ...mod }, free)).toBeNull();
  });
});

/** um socket de mentira: guarda o que foi mandado e deixa o teste abrir e entregar mensagens */
function fakeSocket() {
  const ws: SocketLike & { sent: string[] } = { sent: [], send(d) { ws.sent.push(d); }, close() {}, onopen: null, onmessage: null, onclose: null, onerror: null };
  return ws;
}

describe('RemoteRoom: fala', () => {
  function setup() {
    const ws = fakeSocket();
    const room = new RemoteRoom({ url: 'ws://x/ws', room: 'ABCD', token: 'token-aaaa' }, { socket: () => ws, clock: { setTimeout: () => 0, clearTimeout: () => {} }, now: () => 0 });
    room.connect(); ws.onopen?.({});
    const receive = (m: unknown) => ws.onmessage?.({ data: JSON.stringify(m) });
    return { room, ws, receive };
  }

  test('falar manda a mensagem; não é um pedido (não mexe na recusa da tela)', () => {
    const { room, ws, receive } = setup();
    receive({ type: 'error', error: 'refused' });
    room.chat('oi, gente');
    expect(JSON.parse(ws.sent.at(-1)!)).toEqual({ type: 'chat', text: 'oi, gente' });
    expect(room.state.error).toBe('refused');
  });

  test('quem ouve fica sabendo quem falou e o quê, com o texto limpo de novo; parar de ouvir funciona', () => {
    const { room, receive } = setup();
    const got: unknown[] = [];
    const off = room.onChat((e) => got.push(e));
    receive({ type: 'chat', member: 'm2', text: 'olá\n<b>você</b>‮' });
    off();
    receive({ type: 'chat', member: 'm3', text: 'tchau' });
    expect(got).toEqual([{ member: 'm2', text: 'olá <b>você</b>' }]);
  });

  test('fala torta ou vazia é ignorada, e não avisa quem observa o estado', () => {
    const { room, receive } = setup();
    const got: unknown[] = [];
    room.onChat((e) => got.push(e));
    let changes = -1; // o `watch` chama uma vez ao entrar
    room.watch(() => changes++);
    for (const bad of [{ type: 'chat' }, { type: 'chat', member: 7, text: 'oi' }, { type: 'chat', member: 'm2', text: 7 }, { type: 'chat', member: 'm2', text: ' \n ' }]) receive(bad);
    receive({ type: 'chat', member: 'm2', text: 'oi' });
    expect(got).toEqual([{ member: 'm2', text: 'oi' }]);
    expect(changes).toBe(0);
  });
});
