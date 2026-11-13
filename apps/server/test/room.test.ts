import { describe, expect, test } from 'bun:test';
import { MAX_MEMBERS, TURN_DEFAULT } from '@guess/rules';
import type { RoomSnapshot } from '@guess/protocol';
import { ROOM_TTL, snapshotFor, step } from '../src/room';
import { Sim, T0 } from './sim';

/** a sala vazia como um visitante a vê */
const EMPTY: RoomSnapshot = {
  code: 'ABCD', phase: 'lobby', you: null, moderator: null, dev: false, maxPlayers: MAX_MEMBERS, funnyBots: false, bots: [], stats: {}, members: [], order: [], authors: {}, turnMs: TURN_DEFAULT,
  postits: {}, turn: null, paused: false, vote: null, got: [], gaveUp: [], turns: {},
};
const view = (id: string, nickname: string, character: number, connected = true) => ({ id, nickname, connected, character, ghost: false, fake: false });

describe('sala: entrar', () => {
  test('quem conecta sem entrar recebe o snapshot da sala como visitante', () => {
    const s = new Sim();
    s.connect('t1');
    expect(s.snapshotFor('t1')).toEqual(EMPTY);
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
    expect(s.events).toContainEqual({ type: 'refused', error: 'roomFull', action: 'join' });
  });

  test('o limite de pessoas escolhido ao criar a sala vale para entrar, e o visitante recusado continua visitante', () => {
    const s = new Sim(T0, { init: { maxPlayers: 3 } });
    for (let i = 1; i <= 3; i++) s.enter(`t${i}`, `P${i}`);
    s.connect('t4');
    expect(s.snapshotFor('t4')!.maxPlayers).toBe(3); // a tela de entrar já sabe que está cheia
    s.out = [];
    s.join('t4', 'Quarta');
    expect(s.out).toEqual([{ to: 't4', message: { type: 'error', error: 'roomFull' } }]);
    expect(s.state.members).toHaveLength(3);
    expect(s.state.visitors).toEqual(['t4']);
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

describe('sala: o que o pré-lobby escolheu', () => {
  test('sem nada escolhido, os padrões: a vez de 60 s, 8 pessoas, o criador joga', () => {
    const s = new Sim();
    expect(s.state.maxPlayers).toBe(MAX_MEMBERS);
    s.enter('t1', 'Zé');
    expect(s.snapshotFor('t1')).toMatchObject({ turnMs: TURN_DEFAULT, maxPlayers: MAX_MEMBERS, order: ['m1'] });
  });

  test('a vez e o limite de pessoas vêm da criação', () => {
    const s = new Sim(T0, { init: { turnMs: 45_000, maxPlayers: 4 } });
    s.connect('t1');
    expect(s.snapshotFor('t1')).toMatchObject({ turnMs: 45_000, maxPlayers: 4 });
  });

  test('só moderar: o criador entra já fora da ordem, como fantasma; quem entra depois joga', () => {
    const s = new Sim(T0, { init: { onlyModerate: true } });
    s.enter('t1', 'Zé');
    expect(s.game.onlyModerate).toEqual(['m1']);
    expect(s.game.order).toEqual([]);
    expect(s.snapshotFor('t1')!.members[0]).toMatchObject({ id: 'm1', ghost: true });
    expect(s.snapshotFor('t1')!.moderator).toBe('m1');
    s.enter('t2', 'Dita');
    s.enter('t3', 'Caio');
    expect(s.game.order).toEqual(['m2', 'm3']);
    expect(s.game.onlyModerate).toEqual(['m1']);
    // o moderador pode voltar a jogar
    s.say('t1', { type: 'onlyModerate', on: false });
    expect(s.game.order).toEqual(['m2', 'm3', 'm1']);
  });
});

describe('sala: o limite de pessoas', () => {
  const room = (n: number) => {
    const s = new Sim();
    for (let i = 1; i <= n; i++) s.enter(`t${i}`, `P${i}`);
    return s;
  };
  const refused = (s: Sim, token: string, n: number) => {
    const before = s.state.maxPlayers;
    s.out = [];
    s.say(token, { type: 'maxPlayers', n });
    expect(s.out).toEqual([{ to: token, message: { type: 'error', error: 'refused' } }]);
    expect(s.state.maxPlayers).toBe(before);
  };

  test('o moderador muda no lobby, e todo mundo vê; o limite novo vale para quem chega', () => {
    const s = room(2);
    s.say('t1', { type: 'maxPlayers', n: 3 });
    expect(s.snapshotFor('t2')!.maxPlayers).toBe(3);
    s.enter('t3', 'P3');
    s.connect('t4');
    s.out = [];
    s.join('t4', 'P4');
    expect(s.out).toEqual([{ to: 't4', message: { type: 'error', error: 'roomFull' } }]);
    s.say('t1', { type: 'maxPlayers', n: 4 });
    s.join('t4', 'P4');
    expect(s.state.members).toHaveLength(4);
  });

  test('igual à turma de agora vale; menos que a turma é recusado', () => {
    const s = room(3);
    s.say('t1', { type: 'maxPlayers', n: 3 });
    expect(s.state.maxPlayers).toBe(3);
    refused(s, 't1', 2);
  });

  test('quem caiu conta para a turma', () => {
    const s = room(3);
    s.disconnect('t3');
    refused(s, 't1', 2);
  });

  test('só o moderador, e só no lobby', () => {
    const s = room(2);
    refused(s, 't2', 4);
    s.say('t1', { type: 'write', owner: 'm2', text: 'B', image: null });
    s.say('t2', { type: 'write', owner: 'm1', text: 'A', image: null });
    s.say('t1', { type: 'start' });
    expect(s.game.phase).toBe('playing');
    refused(s, 't1', 4);
  });
});

describe('sala: snapshot', () => {
  test('cada token recebe o próprio snapshot, com a turma na ordem em que entrou', () => {
    const s = new Sim();
    s.enter('t1', 'Zé');
    s.enter('t2', 'Dita');
    s.connect('t3');
    const lobby = { ...EMPTY, moderator: 'm1', members: [view('m1', 'Zé', 0), view('m2', 'Dita', 1)], order: ['m1', 'm2'], authors: { m1: 'm2', m2: 'm1' } };
    // já no lobby cada um tem um post-it vazio; só quem escreve vê o texto (o dono, os outros e o visitante, não)
    const postit = (author: string, you: string | null) => ({ text: you === author ? '' : null, image: null, ready: false, written: false, revealed: false, author });
    const postits = (you: string | null) => ({ m1: postit('m2', you), m2: postit('m1', you) });
    expect(snapshotFor(s.state, 't1', s.now)).toEqual({ ...lobby, you: 'm1', postits: postits('m1') });
    expect(snapshotFor(s.state, 't2', s.now)).toEqual({ ...lobby, you: 'm2', postits: postits('m2') });
    expect(snapshotFor(s.state, 't3', s.now)).toEqual({ ...lobby, you: null, postits: postits(null) });
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

  test('o moderador que cai continua moderador durante a tolerância', () => {
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
