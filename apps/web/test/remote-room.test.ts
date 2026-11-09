import { describe, expect, test } from 'bun:test';
import { CLOSE_KICKED, CLOSE_REPLACED, CLOSE_ROOM_ENDED, CLOSE_ROOM_NOT_FOUND, PING_INTERVAL, type MemberView, type RoomSnapshot } from '@guess/protocol';
import { BACKOFF_MAX, BACKOFF_START, RemoteRoom, type RemoteState, type SocketLike } from '../src/lib/room/remote';
import { ManualClock } from './manual-clock';

/** Socket falso: guarda o que o cliente mandou e deixa o teste fazer o papel do servidor. */
class FakeSocket implements SocketLike {
  sent: unknown[] = [];
  closedBy: { code?: number } | null = null;
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) {}
  send(data: string) { this.sent.push(JSON.parse(data)); }
  close(code?: number) { this.closedBy = { code }; this.onclose?.({ code: 1005 }); }
  open() { this.onopen?.(); }
  receive(msg: unknown) { this.onmessage?.({ data: JSON.stringify(msg) }); }
  serverClose(code: number) { this.onclose?.({ code }); }
}

const member = (id: string, nickname: string, connected = true): MemberView => ({ id, nickname, connected });
const snapshot = (members: MemberView[], you: string | null): RoomSnapshot => ({ code: 'ABCD', phase: 'lobby', you, moderator: members[0]?.id ?? null, members });

function setup() {
  const clock = new ManualClock();
  const sockets: FakeSocket[] = [];
  const states: RemoteState[] = [];
  const room = new RemoteRoom({ url: 'ws://x/ws', room: 'abcd', token: 'tok-12345' }, { socket: (url) => { const s = new FakeSocket(url); sockets.push(s); return s; }, clock, now: () => clock.now });
  room.watch((s) => states.push(s));
  return { clock, sockets, states, room, last: () => sockets[sockets.length - 1] };
}

describe('RemoteRoom: conexão', () => {
  test('quem observa recebe o estado na hora e a cada mudança, até desistir', () => {
    const { room, states, last } = setup();
    expect(states.map((s) => s.status)).toEqual(['idle']);
    room.connect();
    let heard = 0;
    const off = room.watch(() => { heard++; });
    off();
    last().open();
    expect(heard).toBe(1); // só o estado da hora
    expect(states.map((s) => s.status)).toEqual(['idle', 'connecting', 'open']);
  });

  test('conecta com sala e token na URL e aplica o snapshot', () => {
    const { room, sockets, last } = setup();
    room.connect();
    expect(sockets).toHaveLength(1);
    expect(last().url).toBe('ws://x/ws?room=ABCD&token=tok-12345');
    expect(room.state.status).toBe('connecting');
    last().open();
    expect(room.state.status).toBe('open');
    const snap = snapshot([member('m1', 'Zé'), member('m2', 'Dita', false)], null);
    last().receive({ type: 'snapshot', snapshot: snap });
    expect(room.state.room).toEqual(snap);
  });

  test('entrar e trocar de apelido viram mensagens do protocolo', () => {
    const { room, last } = setup();
    room.connect(); last().open();
    room.join('Zé');
    room.rename('Dita');
    expect(last().sent).toEqual([{ type: 'join', nickname: 'Zé' }, { type: 'nickname', nickname: 'Dita' }]);
  });

  test('nada sai antes do socket abrir', () => {
    const { room, last } = setup();
    room.connect();
    room.join('Zé');
    expect(last().sent).toEqual([]);
  });

  test('manda ping a cada intervalo enquanto o servidor responde', () => {
    const { room, last, clock } = setup();
    room.connect(); last().open();
    clock.step();
    expect(clock.now).toBe(PING_INTERVAL);
    expect(last().sent).toEqual([{ type: 'ping' }]);
    last().receive({ type: 'pong' });
    clock.step();
    expect(last().sent).toEqual([{ type: 'ping' }, { type: 'ping' }]);
    expect(room.state.status).toBe('open');
  });

  test('um intervalo inteiro sem nada do servidor derruba o socket e reconecta; qualquer mensagem conta como resposta', () => {
    const { room, last, clock, sockets } = setup();
    room.connect(); last().open();
    const first = last();
    clock.step(); // 1º ping
    first.receive({ type: 'snapshot', snapshot: snapshot([], null) });
    clock.step(); // 2º ping: houve um snapshot no meio
    expect(room.state.status).toBe('open');
    clock.step(); // nada chegou desde o 2º ping: a conexão está morta
    expect(first.closedBy).not.toBeNull();
    expect(room.state.status).toBe('reconnecting');
    clock.step(); // a espera venceu: socket novo
    expect(sockets).toHaveLength(2);
    last().open();
    expect(room.state.status).toBe('open');
    expect(first.sent).toHaveLength(2); // o socket velho não recebe mais ping
  });
});

describe('RemoteRoom: reconexão', () => {
  test('queda inesperada reconecta com espera crescente até o teto, e zera ao abrir', () => {
    const { room, sockets, last, clock } = setup();
    room.connect(); last().open();
    last().serverClose(1006);
    expect(room.state.status).toBe('reconnecting');
    const waits: number[] = [];
    for (let i = 0; i < 8; i++) {
      const before = clock.now;
      clock.step(); // vence a espera; abre um socket novo
      waits.push(clock.now - before);
      last().serverClose(1006);
    }
    expect(waits[0]).toBe(BACKOFF_START);
    for (let i = 1; i < waits.length; i++) expect(waits[i]).toBeGreaterThanOrEqual(waits[i - 1]);
    expect(waits.at(-1)).toBe(BACKOFF_MAX);
    expect(BACKOFF_MAX).toBe(10_000);
    expect(sockets).toHaveLength(9);
    clock.step(); last().open();
    expect(room.state.status).toBe('open');
    expect(room.state.attempt).toBe(0);
    last().serverClose(1006);
    const before = clock.now; clock.step();
    expect(clock.now - before).toBe(BACKOFF_START);
  });

  test('sala inexistente, encerrada ou assumida por outra aba fecha de vez e diz por quê', () => {
    for (const [code, reason] of [[CLOSE_ROOM_NOT_FOUND, 'notFound'], [CLOSE_ROOM_ENDED, 'ended'], [CLOSE_REPLACED, 'replaced']] as const) {
      const { room, last, clock, sockets } = setup();
      room.connect(); last().open();
      last().serverClose(code);
      expect(room.state.status).toBe('closed');
      expect(room.state.reason).toBe(reason);
      clock.run();
      expect(sockets).toHaveLength(1);
    }
  });

  test('sala inexistente fecha antes mesmo de abrir', () => {
    const { room, last, clock, sockets } = setup();
    room.connect();
    last().serverClose(CLOSE_ROOM_NOT_FOUND);
    expect(room.state).toMatchObject({ status: 'closed', reason: 'notFound' });
    expect(clock.pending).toBe(0);
    expect(sockets).toHaveLength(1);
  });

  test('qualquer outro código 4xxx também é da aplicação: não reconecta', () => {
    const { room, last, clock } = setup();
    room.connect(); last().open();
    last().serverClose(4000);
    expect(room.state.status).toBe('closed');
    expect(clock.pending).toBe(0);
  });

  test('reconnect() derruba o socket (a rede caiu) e retryNow() tenta na hora quando ela volta', () => {
    const { room, last, clock, sockets } = setup();
    room.connect(); last().open();
    room.reconnect();
    expect(sockets[0].closedBy).not.toBeNull();
    expect(room.state.status).toBe('reconnecting');
    expect(sockets).toHaveLength(1);
    room.retryNow();
    expect(sockets).toHaveLength(2);
    expect(clock.pending).toBe(0);
    last().open();
    expect(room.state.status).toBe('open');
  });

  test('retryNow() não faz nada com a conexão aberta ou fechada de vez', () => {
    const { room, last, sockets } = setup();
    room.connect(); last().open();
    room.retryNow();
    expect(sockets).toHaveLength(1);
    last().serverClose(CLOSE_ROOM_ENDED);
    room.retryNow(); room.reconnect();
    expect(sockets).toHaveLength(1);
  });

  test('se a sala esqueceu a pessoa enquanto ela caiu, entra de novo com o mesmo apelido', () => {
    const { room, last, clock } = setup();
    room.connect(); last().open();
    room.join('Zé');
    last().receive({ type: 'snapshot', snapshot: snapshot([member('m1', 'Zé')], 'm1') });
    last().serverClose(1006);
    clock.step(); last().open();
    last().receive({ type: 'snapshot', snapshot: snapshot([], null) });
    expect(last().sent).toEqual([{ type: 'join', nickname: 'Zé' }]);
  });

  test('dispose fecha o socket e não deixa timer nenhum', () => {
    const { room, last, clock } = setup();
    room.connect(); last().open();
    room.dispose();
    expect(last().closedBy).not.toBeNull();
    expect(clock.pending).toBe(0);
    expect(room.state.status).toBe('closed');
    expect(room.state.reason).toBeNull();
  });
});

describe('RemoteRoom: sala cheia', () => {
  test('a recusa fica no estado, o snapshot continua valendo, e some ao tentar de novo', () => {
    const { room, last } = setup();
    room.connect(); last().open();
    const full = snapshot(Array.from({ length: 8 }, (_, i) => member(`m${i + 1}`, `P${i + 1}`)), null);
    last().receive({ type: 'snapshot', snapshot: full });
    room.join('Zé');
    last().receive({ type: 'error', error: 'roomFull' });
    expect(room.state.error).toBe('roomFull');
    expect(room.state.room).toEqual(full);
    expect(room.state.status).toBe('open');
    last().receive({ type: 'snapshot', snapshot: full }); // a sala mudou, mas a pessoa continua de fora
    expect(room.state.error).toBe('roomFull');
    expect(last().sent).toEqual([{ type: 'join', nickname: 'Zé' }]); // não insiste sozinha
    room.join('Zé');
    expect(room.state.error).toBeNull();
  });

  test('entrar na turma limpa a recusa', () => {
    const { room, last } = setup();
    room.connect(); last().open();
    room.join('Zé');
    last().receive({ type: 'error', error: 'roomFull' });
    last().receive({ type: 'snapshot', snapshot: snapshot([member('m9', 'Zé')], 'm9') });
    expect(room.state.error).toBeNull();
  });
});

describe('RemoteRoom: o jogo', () => {
  test('cada pedido do jogo vira a mensagem do protocolo, como está', () => {
    const { room, last } = setup();
    room.connect(); last().open();
    const asks = [
      { type: 'character', character: 3 }, { type: 'order', order: ['m2', 'm1'] }, { type: 'swapAuthors', a: 'm1', b: 'm2' }, { type: 'shuffleAuthors' },
      { type: 'turnMs', ms: 45_000 }, { type: 'onlyModerate', on: true }, { type: 'startWriting' },
      { type: 'write', owner: 'm2', text: 'Pelé', image: null }, { type: 'ready' }, { type: 'forceStart' },
      { type: 'claim' }, { type: 'vote', yes: true }, { type: 'skip' }, { type: 'giveUp' },
      { type: 'mark', member: 'm2', right: false }, { type: 'pause', on: true }, { type: 'kick', member: 'm3' }, { type: 'handOver', member: 'm2' },
      { type: 'endGame' }, { type: 'playAgain' }, { type: 'addFake' },
    ] as const;
    for (const a of asks) room.send(a);
    expect(last().sent).toEqual([...asks]);
  });

  test('expulso pela moderação: fecha de vez, diz por quê e não reconecta', () => {
    const { room, last, clock, sockets } = setup();
    room.connect(); last().open();
    last().serverClose(CLOSE_KICKED);
    expect(room.state).toMatchObject({ status: 'closed', reason: 'kicked' });
    clock.run();
    expect(sockets).toHaveLength(1);
  });

  test('pedido recusado: fica no estado por um momento, o snapshot continua valendo; some no próximo pedido ou snapshot', () => {
    const { room, last } = setup();
    room.connect(); last().open();
    const inside = snapshot([member('m1', 'Zé')], 'm1');
    last().receive({ type: 'snapshot', snapshot: inside });
    room.send({ type: 'claim' });
    last().receive({ type: 'error', error: 'refused' });
    expect(room.state.error).toBe('refused');
    expect(room.state.room).toEqual(inside);
    const seq = room.state.errorSeq;
    room.send({ type: 'skip' });
    expect(room.state.error).toBeNull();
    last().receive({ type: 'error', error: 'refused' });
    expect(room.state.errorSeq).toBe(seq + 1); // cada recusa é uma recusa nova, mesmo repetida
    last().receive({ type: 'snapshot', snapshot: inside });
    expect(room.state.error).toBeNull();
  });

  test('guarda quando o snapshot chegou, para o relógio contar dali', () => {
    const { room, last, clock } = setup();
    room.connect(); last().open();
    clock.now = 1234;
    last().receive({ type: 'snapshot', snapshot: snapshot([], null) });
    expect(room.state.receivedAt).toBe(1234);
  });
});
