import { describe, expect, test } from 'bun:test';
import type { RoomSnapshot, ServerMessage } from '@guess/protocol';
import { MAX_MEMBERS } from '@guess/rules';
import { createRoom, ROOM_TTL, snapshotFor, step, type RoomEvent, type RoomInput, type RoomState } from '../src/room';

const T0 = 1_000_000;

/** Enfileira entradas numa sala e guarda tudo o que saiu, para asserções no que a sala manda e no que ela vira. */
class Sim {
  state: RoomState;
  out: { to: string; message: ServerMessage }[] = [];
  events: RoomEvent[] = [];
  constructor(public now = T0) { this.state = createRoom('ABCD', now); }
  feed(input: RoomInput, at = this.now) {
    this.now = at;
    const r = step(this.state, input, at);
    this.state = r.state; this.out.push(...r.out); this.events.push(...r.events);
    return r;
  }
  connect(token: string, at?: number) { return this.feed({ kind: 'connect', token }, at); }
  disconnect(token: string, at?: number) { return this.feed({ kind: 'disconnect', token }, at); }
  join(token: string, nickname: string, at?: number) { return this.feed({ kind: 'message', token, message: { type: 'join', nickname } }, at); }
  rename(token: string, nickname: string, at?: number) { return this.feed({ kind: 'message', token, message: { type: 'nickname', nickname } }, at); }
  ping(token: string, at?: number) { return this.feed({ kind: 'message', token, message: { type: 'ping' } }, at); }
  /** conecta e entra com apelido, como uma aba nova faz */
  enter(token: string, nickname: string, at?: number) { this.connect(token, at); return this.join(token, nickname, at); }
  /** dispara o timer de morte pendente, como o adaptador faria quando ele vence */
  fireDeath() {
    const t = this.state.timers.find((x) => x.kind === 'death')!;
    return this.feed({ kind: 'timer', timer: t }, t.at);
  }
  deathAt() { return this.state.timers.filter((t) => t.kind === 'death').map((t) => t.at); }
  /** último snapshot entregue a este token */
  snapshotFor(token: string): RoomSnapshot | undefined {
    for (let i = this.out.length - 1; i >= 0; i--) {
      const o = this.out[i];
      if (o.to === token && o.message.type === 'snapshot') return o.message.snapshot;
    }
  }
  names(token: string) { return this.snapshotFor(token)?.members.map((m) => m.nickname); }
}

describe('sala: entrar', () => {
  test('quem conecta sem entrar recebe o snapshot da sala como visitante', () => {
    const s = new Sim();
    s.connect('t1');
    expect(s.snapshotFor('t1')).toEqual({ code: 'ABCD', phase: 'lobby', you: null, moderator: null, members: [] });
  });

  test('entrar com apelido cria o membro e todo mundo recebe a lista nova', () => {
    const s = new Sim();
    s.enter('t1', '  Zé  ');
    s.enter('t2', 'Dita');
    expect(s.names('t1')).toEqual(['Zé', 'Dita']);
    expect(s.names('t2')).toEqual(['Zé', 'Dita']);
    expect(s.snapshotFor('t2')!.you).toBe('m2');
    expect(s.events).toContainEqual({ type: 'joined', id: 'm1', nickname: 'Zé' });
    expect(s.events).toContainEqual({ type: 'joined', id: 'm2', nickname: 'Dita' });
  });

  test('apelido repetido ganha sufixo em vez de ser recusado', () => {
    const s = new Sim();
    s.enter('t1', 'Zé');
    s.enter('t2', 'zé');
    s.enter('t3', 'Zé');
    expect(s.names('t3')).toEqual(['Zé', 'zé 2', 'Zé 3']);
  });

  test('trocar de apelido passa pelo mesmo sufixo, sem contar o próprio', () => {
    const s = new Sim();
    s.enter('t1', 'Zé');
    s.enter('t2', 'Dita');
    s.rename('t2', 'Zé');
    expect(s.names('t1')).toEqual(['Zé', 'Zé 2']);
    s.rename('t1', 'ZÉ');
    expect(s.names('t2')).toEqual(['ZÉ', 'Zé 2']);
    expect(s.events).toContainEqual({ type: 'renamed', id: 'm2', from: 'Dita', to: 'Zé 2' });
  });

  test('join de quem já é membro vale como troca de apelido', () => {
    const s = new Sim();
    s.enter('t1', 'Zé');
    s.join('t1', 'Zezinho');
    expect(s.names('t1')).toEqual(['Zezinho']);
    expect(s.state.members).toHaveLength(1);
  });

  test('entrar sem ter conectado, ou trocar apelido sem ser membro, não muda nada', () => {
    const s = new Sim();
    const before = structuredClone(s.state);
    s.join('desconhecido', 'Zé');
    s.rename('desconhecido', 'Zé');
    expect(s.state).toEqual(before);
    expect(s.out).toEqual([]);
  });

  test(`a pessoa além de ${MAX_MEMBERS} é recusada só para ela e continua visitante`, () => {
    const s = new Sim();
    for (let i = 1; i <= MAX_MEMBERS; i++) s.enter(`t${i}`, `P${i}`);
    s.connect('t9');
    s.out = [];
    s.join('t9', 'Nona');
    expect(s.out).toEqual([{ to: 't9', message: { type: 'error', error: 'roomFull' } }]);
    expect(s.state.members).toHaveLength(MAX_MEMBERS);
    expect(s.state.visitors).toEqual(['t9']);
    expect(s.events).toContainEqual({ type: 'refused', error: 'roomFull' });
  });

  test('o primeiro a entrar é o moderador, e continua sendo quando outros entram', () => {
    const s = new Sim();
    s.connect('t0'); // visitante não é moderador
    s.enter('t1', 'Zé');
    s.enter('t2', 'Dita');
    expect(s.snapshotFor('t2')!.moderator).toBe('m1');
    expect(s.snapshotFor('t0')!.moderator).toBe('m1');
  });
});

describe('sala: snapshot', () => {
  test('cada token recebe o próprio snapshot, com a turma na ordem em que entrou', () => {
    const s = new Sim();
    s.enter('t1', 'Zé');
    s.enter('t2', 'Dita');
    s.connect('t3');
    const members = [{ id: 'm1', nickname: 'Zé', connected: true }, { id: 'm2', nickname: 'Dita', connected: true }];
    expect(snapshotFor(s.state, 't1')).toEqual({ code: 'ABCD', phase: 'lobby', you: 'm1', moderator: 'm1', members });
    expect(snapshotFor(s.state, 't2')).toEqual({ code: 'ABCD', phase: 'lobby', you: 'm2', moderator: 'm1', members });
    expect(snapshotFor(s.state, 't3')).toEqual({ code: 'ABCD', phase: 'lobby', you: null, moderator: 'm1', members });
  });

  test('uma mudança chega a todo token conectado, membro ou visitante', () => {
    const s = new Sim();
    s.enter('t1', 'Zé');
    s.connect('t2');
    s.out = [];
    s.enter('t3', 'Dita');
    for (const t of ['t1', 't2', 't3']) expect(s.names(t)).toEqual(['Zé', 'Dita']);
  });

  test('o snapshot nunca carrega o token de ninguém', () => {
    const s = new Sim();
    s.enter('token-secreto', 'Zé');
    expect(JSON.stringify(s.snapshotFor('token-secreto'))).not.toContain('token-secreto');
  });
});

describe('sala: conexão', () => {
  test('quem cai continua na turma, desconectado, e os outros veem', () => {
    const s = new Sim();
    s.enter('t1', 'Zé');
    s.enter('t2', 'Dita');
    s.disconnect('t2');
    expect(s.snapshotFor('t1')!.members.map((m) => [m.nickname, m.connected])).toEqual([['Zé', true], ['Dita', false]]);
    expect(s.state.members).toHaveLength(2);
    expect(s.events).toContainEqual({ type: 'disconnected', id: 'm2', nickname: 'Dita' });
  });

  test('o lugar de quem caiu continua guardado: conta para a lotação e o apelido segue ocupado', () => {
    const s = new Sim();
    for (let i = 1; i <= MAX_MEMBERS; i++) s.enter(`t${i}`, `P${i}`);
    s.disconnect('t8');
    s.connect('t9');
    s.join('t9', 'P8');
    expect(s.state.members.map((m) => m.nickname)).not.toContain('P8 2');
    expect(s.out.at(-1)).toEqual({ to: 't9', message: { type: 'error', error: 'roomFull' } });
  });

  test('voltar com o mesmo token restaura o membro e ele recebe o snapshot na hora', () => {
    const s = new Sim();
    s.enter('t1', 'Zé');
    s.enter('t2', 'Dita');
    s.disconnect('t2', T0 + 1_000);
    s.out = [];
    s.connect('t2', T0 + 5 * 60_000);
    const snap = s.snapshotFor('t2')!;
    expect(snap.you).toBe('m2');
    expect(snap.members.map((m) => [m.nickname, m.connected])).toEqual([['Zé', true], ['Dita', true]]);
    expect(s.snapshotFor('t1')!.members[1].connected).toBe(true);
    expect(s.events).toContainEqual({ type: 'reconnected', id: 'm2', nickname: 'Dita' });
  });

  test('o moderador que cai continua moderador (sucessão é outra história)', () => {
    const s = new Sim();
    s.enter('t1', 'Zé');
    s.enter('t2', 'Dita');
    s.disconnect('t1');
    expect(s.snapshotFor('t2')!.moderator).toBe('m1');
  });

  test('visitante que desconecta some sem deixar rastro', () => {
    const s = new Sim();
    s.enter('t1', 'Zé');
    s.connect('t2');
    s.out = [];
    s.disconnect('t2');
    expect(s.state.visitors).toEqual([]);
    expect(s.state.members).toHaveLength(1);
    expect(s.out).toEqual([]);
  });

  test('ping responde pong só para quem pediu', () => {
    const s = new Sim();
    s.enter('t1', 'Zé');
    s.enter('t2', 'Dita');
    s.out = [];
    s.ping('t1');
    expect(s.out).toEqual([{ to: 't1', message: { type: 'pong' } }]);
  });
});

describe('sala: morte', () => {
  test('nasce com o timer de morte marcado para dez minutos', () => {
    const s = new Sim();
    expect(ROOM_TTL).toBe(10 * 60_000);
    expect(s.state.timers).toEqual([{ kind: 'death', at: T0 + ROOM_TTL }]);
  });

  test('ações na sala adiam a morte; ping não', () => {
    const s = new Sim();
    s.enter('t1', 'Zé', T0 + 60_000);
    expect(s.deathAt()).toEqual([T0 + 60_000 + ROOM_TTL]);
    s.ping('t1', T0 + 120_000);
    expect(s.deathAt()).toEqual([T0 + 60_000 + ROOM_TTL]);
    expect(s.state.lastActivity).toBe(T0 + 60_000);
    s.rename('t1', 'Zezinho', T0 + 180_000);
    expect(s.deathAt()).toEqual([T0 + 180_000 + ROOM_TTL]);
  });

  test('conectar, cair e voltar não adiam a morte: uma aba instável não segura a sala viva', () => {
    const s = new Sim();
    s.enter('t1', 'Zé', T0 + 60_000);
    s.disconnect('t1', T0 + 90_000);
    s.connect('t1', T0 + 100_000);
    s.feed({ kind: 'disconnect', token: 't1', since: T0 + 110_000 }, T0 + 140_000);
    s.connect('t2', T0 + 150_000);
    expect(s.deathAt()).toEqual([T0 + 60_000 + ROOM_TTL]);
  });

  test('a recusa por sala cheia não é atividade', () => {
    const s = new Sim();
    for (let i = 1; i <= MAX_MEMBERS; i++) s.enter(`t${i}`, `P${i}`);
    s.connect('t9', T0 + 1_000);
    s.join('t9', 'Nona', T0 + 2_000);
    expect(s.deathAt()).toEqual([T0 + ROOM_TTL]);
  });

  test('a sala morre dez minutos depois da última ação e não aceita mais nada', () => {
    const s = new Sim();
    s.enter('t1', 'Zé');
    s.fireDeath();
    expect(s.state.phase).toBe('dead');
    expect(s.now).toBe(T0 + ROOM_TTL);
    expect(s.state.timers).toEqual([]);
    expect(s.events).toContainEqual({ type: 'died' });
    const before = structuredClone(s.state);
    s.out = [];
    s.enter('t2', 'Dita');
    s.ping('t1');
    expect(s.state).toEqual(before);
    expect(s.out).toEqual([]);
  });

  test('um timer de morte que já foi adiado é ignorado', () => {
    const s = new Sim();
    const stale = s.state.timers[0];
    s.enter('t1', 'Zé', T0 + 60_000);
    const before = structuredClone(s.state);
    s.feed({ kind: 'timer', timer: stale }, stale.at);
    expect(s.state).toEqual(before);
  });

  test('step não mexe no estado que recebeu', () => {
    const s = new Sim();
    s.enter('t1', 'Zé');
    const before = structuredClone(s.state);
    step(s.state, { kind: 'connect', token: 't2' }, T0);
    step(s.state, { kind: 'message', token: 't1', message: { type: 'nickname', nickname: 'Outro' } }, T0);
    step(s.state, { kind: 'disconnect', token: 't1' }, T0);
    expect(s.state).toEqual(before);
  });
});
