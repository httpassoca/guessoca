import { describe, expect, test } from 'bun:test';
import { CLOSE_KICKED, imageUrl, type ClientMessage } from '@guess/protocol';
import { MAX_MEMBERS, TURN_DEFAULT, VOTE_MS } from '@guess/rules';
import { FAKE_IDENTITIES, MODERATOR_GRACE, snapshotFor } from '../src/room';
import { Sim, T0 } from './sim';

/** `n` pessoas na sala, t1…tn, apelidos P1…Pn, ids m1…mn; t1 é o moderador */
function lobby(n: number, opts: { dev?: boolean } = {}) {
  const s = new Sim(T0, opts);
  for (let i = 1; i <= n; i++) s.enter(`t${i}`, `P${i}`);
  return s;
}
const tokenOf = (s: Sim, id: string) => s.state.members.find((m) => m.id === id)!.token!;
const isFake = (s: Sim, id: string) => s.state.members.find((m) => m.id === id)!.fake;

/** no lobby, cada autor de verdade escreve o post-it do seu dono (se ainda vazio) e aperta "Pronto"; os falsos já escreveram */
function writeAll(s: Sim) {
  for (const owner of s.game.order) {
    const author = s.game.authors[owner];
    if (isFake(s, author) || s.game.postits[owner].ready) continue;
    if (s.game.postits[owner].text === '') s.say(tokenOf(s, author), { type: 'write', owner, text: `quem é ${owner}`, image: null });
    s.say(tokenOf(s, author), { type: 'ready' });
  }
  expect(Object.values(s.game.postits).every((p) => p.ready)).toBe(true);
  expect(s.game.phase).toBe('lobby'); // ninguém começa sozinho
}

/** do lobby até a primeira vez, que é de m1: todos escrevem e o moderador começa */
function playing(n: number) {
  const s = lobby(n);
  writeAll(s);
  s.say('t1', { type: 'start' });
  expect(s.game.phase).toBe('playing');
  expect(s.game.turn?.owner).toBe('m1');
  return s;
}

/** a sala manda isto, e só isto, para este token, ao receber `message` dele */
function expectRefused(s: Sim, token: string, message: ClientMessage) {
  const before = structuredClone(s.state);
  s.out = [];
  s.say(token, message);
  expect(s.out).toEqual([{ to: token, message: { type: 'error', error: 'refused' } }]);
  expect(s.state.game).toEqual(before.game);
  expect(s.state.members).toEqual(before.members);
  expect(s.state.moderator).toBe(before.moderator);
}

describe('sala: mensagens de jogo', () => {
  test('passam para as regras e todo mundo recebe o resultado', () => {
    const s = lobby(2);
    s.say('t1', { type: 'turnMs', ms: 90_000 });
    expect(s.snapshotFor('t2')!.turnMs).toBe(90_000);
    s.say('t2', { type: 'character', character: 5 });
    expect(s.snapshotFor('t1')!.members.map((m) => m.character)).toEqual([0, 5]);
  });

  test('uma ação recusada pelas regras devolve erro só para quem pediu e não muda nada', () => {
    const s = lobby(2);
    expectRefused(s, 't2', { type: 'turnMs', ms: 90_000 }); // não é moderador
    expectRefused(s, 't1', { type: 'claim' }); // fase errada
    expect(s.events).toContainEqual({ type: 'refused', error: 'refused', action: 'claim' });
  });

  test('visitante (sem apelido) não age', () => {
    const s = lobby(2);
    s.connect('t9');
    expectRefused(s, 't9', { type: 'character', character: 7 });
    expectRefused(s, 't9', { type: 'start' });
  });

  test('mensagens de jogo são atividade: adiam a morte', () => {
    const s = lobby(2);
    s.say('t2', { type: 'character', character: 5 }, T0 + 60_000);
    expect(s.deathAt()).toEqual([T0 + 60_000 + 10 * 60_000]);
  });

  test('o sorteio vem da opção rng do step', () => {
    const a = lobby(4), b = lobby(4);
    a.say('t1', { type: 'shuffleAuthors' });
    b.say('t1', { type: 'shuffleAuthors' });
    expect(a.game.authors).toEqual(b.game.authors);
    for (const [owner, author] of Object.entries(a.game.authors)) expect(owner).not.toBe(author);
  });

  test('o snapshot leva a sala inteira: ordem, autores, vez, votação e ranking', () => {
    const s = playing(3);
    s.feed({ kind: 'message', token: 't1', message: { type: 'claim' } }, T0 + 10_000);
    s.say('t2', { type: 'vote', yes: false }, T0 + 12_000);
    const snap = snapshotFor(s.state, 't2', T0 + 13_000);
    expect(snap).toMatchObject({
      phase: 'playing', you: 'm2', moderator: 'm1', dev: false, order: ['m1', 'm2', 'm3'],
      authors: { m2: 'm1', m3: 'm2', m1: 'm3' }, turnMs: TURN_DEFAULT, paused: false, got: [], gaveUp: [],
      turn: { owner: 'm1', left: TURN_DEFAULT - 10_000, running: false },
      vote: { claimer: 'm1', voters: ['m2', 'm3'], voted: ['m2'], left: VOTE_MS - 3_000, yours: false },
    });
    expect(snapshotFor(s.state, 't3', T0 + 13_000).vote!.yours).toBeNull();
    expect(snap.postits.m3).toEqual({ text: 'quem é m3', image: null, ready: true, written: true, revealed: false, author: 'm2' });
  });

  test('a vez corre: left desconta o tempo e running diz se o relógio anda', () => {
    const s = playing(2);
    expect(snapshotFor(s.state, 't1', s.now + 5_000).turn).toEqual({ owner: 'm1', left: TURN_DEFAULT - 5_000, running: true });
  });
});

describe('sala: o próprio post-it nunca passa pelo fio antes da revelação', () => {
  test('no lobby só o autor vê; no jogo, todos menos o dono; e chega ao dono quando ele desiste', () => {
    const s = lobby(3);
    s.connect('t9'); // visitante
    const owner = 'm3', author = s.game.authors[owner];
    const image = 'abcdef0123456789';
    // escrito tecla a tecla, como o cliente manda
    for (const text of ['M', 'Mo', 'Mona', 'Mona Lisa']) s.say(tokenOf(s, author), { type: 'write', owner, text, image });
    // no lobby: só o autor vê o que escreveu; nem o moderador, nem os outros, nem o visitante (e nada vai pelo fio)
    expect(s.snapshotFor(tokenOf(s, author))!.postits[owner]).toMatchObject({ text: 'Mona Lisa', image: imageUrl('ABCD', image) });
    for (const t of ['t1', 't2', 't3', 't9'].filter((t) => t !== tokenOf(s, author))) {
      expect(s.snapshotFor(t)!.postits[owner]).toMatchObject({ text: null, image: null, written: true });
      expect(JSON.stringify(s.snapshotFor(t))).not.toContain('Mona');
    }
    writeAll(s);
    s.say('t1', { type: 'start' });
    // começou: todos veem, menos o dono
    expect(s.snapshotFor('t1')!.postits[owner]).toMatchObject({ text: 'Mona Lisa', image: imageUrl('ABCD', image) });
    expect(s.snapshotFor('t9')!.postits[owner]).toMatchObject({ text: 'Mona Lisa', image: imageUrl('ABCD', image) });
    s.say('t1', { type: 'mark', member: 'm1', right: true }); // m1 acerta; o jogo segue
    expect(s.snapshotFor('t3')!.postits[owner]).toEqual({ text: null, image: null, ready: true, written: true, revealed: false, author });
    const wire = s.wire('t3');
    expect(wire).not.toContain('Mona');
    expect(wire).not.toContain(image);

    s.say('t3', { type: 'giveUp' });
    expect(s.snapshotFor('t3')!.postits[owner]).toMatchObject({ text: 'Mona Lisa', image: imageUrl('ABCD', image), revealed: true });
  });

  test('o fantasma vê todos os post-its', () => {
    const s = playing(2);
    s.enter('t3', 'Atrasado');
    const snap = s.snapshotFor('t3')!;
    expect(snap.members[2].ghost).toBe(true);
    expect(snap.postits.m1.text).toBe('quem é m1');
    expect(snap.postits.m2.text).toBe('quem é m2');
  });

  test('no fim, todo post-it é revelado a todo mundo', () => {
    const s = playing(2);
    s.say('t1', { type: 'endGame' });
    expect(s.snapshotFor('t1')!.postits.m1).toMatchObject({ text: 'quem é m1', revealed: true });
  });
});

describe('sala: expulsar', () => {
  test('o expulso sai da turma e do jogo, o socket dele fecha com 4403 e o token não volta', () => {
    const s = lobby(3);
    s.out = [];
    s.say('t1', { type: 'kick', member: 'm2' });
    expect(s.out).toContainEqual({ to: 't2', close: CLOSE_KICKED });
    expect(s.state.members.map((m) => m.id)).toEqual(['m1', 'm3']);
    expect(s.game.order).toEqual(['m1', 'm3']);
    expect(s.snapshotFor('t3')!.members.map((m) => m.id)).toEqual(['m1', 'm3']);
    expect(s.events).toContainEqual({ type: 'kicked', id: 'm2', nickname: 'P2' });

    s.out = [];
    s.connect('t2');
    expect(s.out).toEqual([{ to: 't2', close: CLOSE_KICKED }]);
    expect(s.state.visitors).not.toContain('t2');
    s.join('t2', 'De novo');
    expect(s.state.members).toHaveLength(2);
  });

  test('só o moderador expulsa, e nunca a si mesmo', () => {
    const s = lobby(3);
    expectRefused(s, 't2', { type: 'kick', member: 'm3' });
    expectRefused(s, 't1', { type: 'kick', member: 'm1' });
    expectRefused(s, 't1', { type: 'kick', member: 'm9' });
  });

  test('expulsar a dona da vez passa a vez', () => {
    const s = playing(3);
    s.say('t1', { type: 'skip' });
    s.say('t1', { type: 'kick', member: 'm2' });
    expect(s.game.turn?.owner).toBe('m3');
  });
});

describe('sala: passar o moderador', () => {
  test('o moderador passa o papel para outra pessoa, e perde os poderes', () => {
    const s = lobby(3);
    writeAll(s);
    s.say('t1', { type: 'handOver', member: 'm2' });
    expect(s.snapshotFor('t3')!.moderator).toBe('m2');
    expect(s.events).toContainEqual({ type: 'handedOver', from: 'm1', to: 'm2' });
    expectRefused(s, 't1', { type: 'start' });
    s.say('t2', { type: 'start' });
    expect(s.game.phase).toBe('playing');
  });

  test('quem só moderava e passa o papel volta a jogar: no lobby já, durante o jogo no próximo', () => {
    const s = lobby(3);
    s.say('t1', { type: 'onlyModerate', on: true });
    expect(s.game.order).not.toContain('m1');
    s.say('t1', { type: 'handOver', member: 'm2' });
    expect(s.game.order).toContain('m1');
    expect(s.game.onlyModerate).toEqual([]);

    const p = lobby(3);
    p.say('t1', { type: 'onlyModerate', on: true });
    writeAll(p);
    p.say('t1', { type: 'start' });
    p.say('t1', { type: 'handOver', member: 'm2' });
    expect(p.game.order).not.toContain('m1');
    expect(p.game.onlyModerate).toEqual([]);
  });

  test('só o moderador passa, para outra pessoa da turma que não seja falsa', () => {
    const s = lobby(2, { dev: true });
    s.say('t1', { type: 'addFake' });
    expectRefused(s, 't2', { type: 'handOver', member: 'm2' });
    expectRefused(s, 't1', { type: 'handOver', member: 'm1' });
    expectRefused(s, 't1', { type: 'handOver', member: 'm3' }); // falso
    expectRefused(s, 't1', { type: 'handOver', member: 'm9' });
  });
});

describe('sala: sucessão do moderador', () => {
  test(`o moderador offline por ${MODERATOR_GRACE / 1000} s passa o papel para a pessoa conectada mais antiga`, () => {
    expect(MODERATOR_GRACE).toBe(20_000);
    const s = lobby(4, { dev: true });
    s.say('t1', { type: 'addFake' }); // m5, falso: nunca modera
    s.disconnect('t2', T0 + 1_000); // m2 é mais antiga, mas está fora
    s.disconnect('t1', T0 + 2_000);
    expect(s.timer('moderator')).toEqual({ kind: 'moderator', at: T0 + 2_000 + MODERATOR_GRACE });
    expect(s.snapshotFor('t3')!.moderator).toBe('m1');
    s.fire('moderator');
    expect(s.snapshotFor('t3')!.moderator).toBe('m3');
    expect(s.events).toContainEqual({ type: 'moderatorSucceeded', from: 'm1', to: 'm3' });
    expect(s.timer('moderator')).toBeUndefined();
    // o velho moderador volta como qualquer um
    s.connect('t1');
    expect(s.state.moderator).toBe('m3');
  });

  test('o moderador que volta antes cancela a sucessão', () => {
    const s = lobby(2);
    s.disconnect('t1', T0 + 1_000);
    const pending = s.timer('moderator')!;
    s.connect('t1', T0 + 5_000);
    expect(s.timer('moderator')).toBeUndefined();
    s.feed({ kind: 'timer', timer: pending }, pending.at); // o host atrasado entrega mesmo assim
    expect(s.state.moderator).toBe('m1');
  });

  test('sem ninguém conectado, o moderador fica; quem conectar depois assume', () => {
    const s = lobby(2);
    s.disconnect('t2', T0 + 1_000);
    s.disconnect('t1', T0 + 2_000);
    s.fire('moderator');
    expect(s.state.moderator).toBe('m1');
    expect(s.timer('moderator')).toBeUndefined();
    s.connect('t2', T0 + 60_000);
    expect(s.state.moderator).toBe('m2');
    expect(s.snapshotFor('t2')!.moderator).toBe('m2');
  });

  test('passar o papel para alguém offline também tem tolerância', () => {
    const s = lobby(3);
    s.disconnect('t2', T0 + 1_000);
    s.say('t1', { type: 'handOver', member: 'm2' }, T0 + 2_000);
    expect(s.timer('moderator')).toEqual({ kind: 'moderator', at: T0 + 2_000 + MODERATOR_GRACE });
    s.fire('moderator');
    expect(s.state.moderator).toBe('m1');
  });
});

describe('sala: o relógio do jogo', () => {
  test('há um timer de jogo no fim da vez; quando vence, a próxima vez começa', () => {
    const s = playing(3);
    expect(s.state.timers.filter((t) => t.kind === 'game')).toEqual([{ kind: 'game', at: T0 + TURN_DEFAULT }]);
    s.fire('game');
    expect(s.game.turn?.owner).toBe('m2');
    expect(s.events).toContainEqual({ type: 'turn', owner: 'm2' });
    expect(s.snapshotFor('t1')!.turn).toEqual({ owner: 'm2', left: TURN_DEFAULT, running: true });
    expect(s.timer('game')).toEqual({ kind: 'game', at: T0 + 2 * TURN_DEFAULT });
  });

  test('a votação aberta troca o timer pelo fechamento; quando vence, fecha com os votos dados', () => {
    const s = playing(3);
    s.say('t1', { type: 'claim' }, T0 + 10_000);
    expect(s.state.timers.filter((t) => t.kind === 'game')).toEqual([{ kind: 'game', at: T0 + 10_000 + VOTE_MS }]);
    s.say('t2', { type: 'vote', yes: false });
    s.fire('game'); // m3 se absteve
    expect(s.events).toContainEqual({ type: 'voted', owner: 'm1', yes: false, yesVotes: 0, noVotes: 1 });
    expect(s.game.turn).toMatchObject({ owner: 'm1', left: TURN_DEFAULT - 10_000 });
    expect(s.timer('game')).toEqual({ kind: 'game', at: s.now + TURN_DEFAULT - 10_000 });
  });

  test('pausado, não há timer de jogo', () => {
    const s = playing(2);
    s.say('t1', { type: 'pause', on: true });
    expect(s.timer('game')).toBeUndefined();
    expect(s.snapshotFor('t2')!.paused).toBe(true);
  });

  test('cair na própria vez passa a vez', () => {
    const s = playing(3);
    s.disconnect('t1');
    expect(s.game.turn?.owner).toBe('m2');
    expect(s.snapshotFor('t2')!.turn?.owner).toBe('m2');
  });

  test('o último votante que cai fecha a votação', () => {
    const s = playing(2);
    s.say('t1', { type: 'claim' });
    s.disconnect('t2');
    expect(s.game.got).toEqual(['m1']);
  });
});

describe('sala: jogadores falsos', () => {
  test('fora de desenvolvimento, addFake é recusado', () => {
    const s = lobby(1);
    expect(s.snapshotFor('t1')!.dev).toBe(false);
    expectRefused(s, 't1', { type: 'addFake' });
  });

  test('em desenvolvimento, o falso entra conectado, sem token, com apelido de robô', () => {
    const s = lobby(1, { dev: true });
    s.say('t1', { type: 'addFake' });
    s.say('t1', { type: 'addFake' });
    const snap = s.snapshotFor('t1')!;
    expect(snap.dev).toBe(true);
    expect(snap.members.slice(1)).toEqual([
      { id: 'm2', nickname: 'Robô 1', connected: true, character: 1, ghost: false, fake: true },
      { id: 'm3', nickname: 'Robô 2', connected: true, character: 2, ghost: false, fake: true },
    ]);
    expect(s.state.members[1].token).toBeNull();
    expect(s.events).toContainEqual({ type: 'fakeAdded', id: 'm2', nickname: 'Robô 1' });
  });

  test('o falso conta para a lotação', () => {
    const s = lobby(MAX_MEMBERS - 1, { dev: true });
    s.say('t1', { type: 'addFake' });
    s.out = [];
    s.say('t1', { type: 'addFake' });
    expect(s.out).toEqual([{ to: 't1', message: { type: 'error', error: 'roomFull' } }]);
    expect(s.state.members).toHaveLength(MAX_MEMBERS);
  });

  /** todo post-it que um falso escreve está pronto, com uma identidade da lista */
  const expectFakesWrote = (s: Sim) => {
    const owners = Object.keys(s.game.postits).filter((o) => isFake(s, s.game.authors[o]));
    expect(owners.length).toBeGreaterThan(0);
    for (const o of owners) {
      expect(s.game.postits[o].ready).toBe(true);
      expect(FAKE_IDENTITIES).toContain(s.game.postits[o].text);
    }
  };

  test('no lobby, o falso escreve uma identidade da lista e fica pronto na hora; o jogo não começa', () => {
    const s = lobby(2, { dev: true });
    s.say('t1', { type: 'addFake' });
    expect(s.game.authors.m1).toBe('m3');
    expectFakesWrote(s);
    expect(s.game.phase).toBe('lobby');
  });

  test('o post-it do falso apagado (alguém entrou, sorteio, ordem) é escrito de novo na hora', () => {
    const s = lobby(2, { dev: true });
    s.say('t1', { type: 'addFake' });
    s.enter('t4', 'P4'); // m1 passa a ser escrito por m4; o falso m3 passa a escrever o de m4
    expect(s.game.authors.m4).toBe('m3');
    expect(s.game.postits.m1).toEqual({ text: '', image: null, ready: false });
    expectFakesWrote(s);
    s.say('t1', { type: 'shuffleAuthors' });
    expectFakesWrote(s);
    s.say('t1', { type: 'order', order: ['m4', 'm3', 'm2', 'm1'] });
    expectFakesWrote(s);
  });

  test('o falso respeita o limite de pessoas da sala', () => {
    const s = new Sim(T0, { dev: true, init: { maxPlayers: 2 } });
    s.enter('t1', 'P1');
    s.say('t1', { type: 'addFake' });
    s.out = [];
    s.say('t1', { type: 'addFake' });
    expect(s.out).toEqual([{ to: 't1', message: { type: 'error', error: 'roomFull' } }]);
  });

  test('uma pessoa e dois falsos jogam até o fim: o acertei sem votantes vale sim', () => {
    const s = lobby(1, { dev: true });
    s.say('t1', { type: 'addFake' });
    s.say('t1', { type: 'addFake' });
    writeAll(s);
    s.say('t1', { type: 'start' });
    expect(s.game.phase).toBe('playing');
    expect(s.snapshotFor('t1')!.postits.m1.text).toBeNull();
    expect(s.game.turn?.owner).toBe('m1');
    s.say('t1', { type: 'claim' });
    expect(s.game.phase).toBe('ended');
    expect(s.snapshotFor('t1')!.got).toEqual(['m1']);
    expect(FAKE_IDENTITIES).toContain(s.snapshotFor('t1')!.postits.m1.text!);
    s.say('t1', { type: 'playAgain' });
    expect(s.snapshotFor('t1')!.phase).toBe('lobby');
    expectFakesWrote(s); // os post-its novos dos falsos já vêm escritos
    expect(s.game.postits.m2.text).toBe(''); // o de m2 é de m1, que ainda não escreveu
  });

  test('expulsar um falso não fecha socket nenhum', () => {
    const s = lobby(1, { dev: true });
    s.say('t1', { type: 'addFake' });
    s.out = [];
    s.say('t1', { type: 'kick', member: 'm2' });
    expect(s.out.every((o) => 'message' in o)).toBe(true);
    expect(s.state.members).toHaveLength(1);
  });
});
