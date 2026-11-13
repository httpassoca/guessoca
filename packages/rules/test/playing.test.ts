import { describe, expect, test } from 'bun:test';
import { circle, nextDeadline, revealed, turnLeft, VOTE_MS } from '../src';
import { Sim } from './sim';

const TURN = 60_000;

/** a, b, c (…) já jogando, vez de a; a é o moderador */
function playing(...ids: string[]) {
  const s = new Sim(...(ids.length ? ids : ['a', 'b', 'c']));
  s.start();
  return s;
}

describe('vezes', () => {
  test('as vezes seguem a ordem e dão a volta', () => {
    const s = playing();
    expect(s.owner).toBe('a');
    expect(s.do('a', { type: 'skip' })).toEqual([{ type: 'turn', owner: 'b' }]);
    s.do('b', { type: 'skip' });
    expect(s.owner).toBe('c');
    s.do('c', { type: 'skip' });
    expect(s.owner).toBe('a');
  });

  test('só a dona da vez passa; o moderador passa a de quem for', () => {
    const s = playing();
    s.refuse('b', { type: 'skip' }, 'notYourTurn');
    s.do('a', { type: 'skip' });
    s.refuse('c', { type: 'skip' }, 'notYourTurn');
    s.do('a', { type: 'skip' });
    expect(s.owner).toBe('c');
  });

  test('a vez nova começa cheia e com o relógio correndo', () => {
    const s = playing();
    s.advance(10_000);
    s.do('a', { type: 'skip' });
    expect(s.game.turn).toEqual({ owner: 'b', left: TURN, since: s.now });
  });

  test('pula quem está offline, e a vez de quem cai passa na hora', () => {
    const s = playing('a', 'b', 'c', 'd');
    s.drop('c');
    s.do('a', { type: 'skip' });
    s.do('b', { type: 'skip' });
    expect(s.owner).toBe('d');
    expect(s.drop('d')).toEqual([{ type: 'turn', owner: 'a' }]);
    s.back('c');
    s.do('a', { type: 'skip' });
    expect(s.owner).toBe('b');
    s.do('b', { type: 'skip' });
    expect(s.owner).toBe('c');
  });

  test('pula jogador falso', () => {
    const s = new Sim('a', 'b');
    s.join('f', { fake: true });
    s.start();
    s.do('a', { type: 'skip' });
    s.do('b', { type: 'skip' });
    expect(s.owner).toBe('a');
  });

  test('pula quem já acertou ou desistiu', () => {
    const s = playing('a', 'b', 'c', 'd');
    s.do('c', { type: 'giveUp' });
    s.do('a', { type: 'mark', member: 'b', right: true });
    s.do('a', { type: 'skip' });
    expect(s.owner).toBe('d');
  });

  test('a vez acaba sozinha quando o tempo acaba', () => {
    const s = playing();
    expect(s.advance(TURN - 1)).toEqual([]);
    expect(turnLeft(s.game, s.now)).toBe(1);
    expect(s.advance(1)).toEqual([{ type: 'turn', owner: 'b' }]);
    expect(s.game.turn).toEqual({ owner: 'b', left: TURN, since: s.now });
  });

  test('quem sobra sozinho jogando ganha outra vez quando a sua acaba', () => {
    const s = playing();
    s.do('b', { type: 'giveUp' });
    s.do('c', { type: 'giveUp' });
    expect(s.advance(TURN)).toEqual([{ type: 'turn', owner: 'a' }]);
  });

  test('o moderador reordena no meio do jogo sem mexer na vez', () => {
    const s = playing();
    s.do('a', { type: 'order', order: ['c', 'b', 'a'] });
    expect(s.owner).toBe('a');
    s.do('a', { type: 'skip' });
    expect(s.owner).toBe('c');
  });
});

describe('acertei e votação', () => {
  test('acertei para o relógio e abre a votação para as outras pessoas conectadas', () => {
    const s = playing('a', 'b', 'c', 'd');
    s.drop('d');
    s.advance(20_000);
    expect(s.do('a', { type: 'claim' })).toEqual([{ type: 'claimed', owner: 'a' }]);
    expect(s.game.turn).toEqual({ owner: 'a', left: 40_000, since: null });
    expect(s.game.vote).toEqual({ claimer: 'a', voters: ['b', 'c'], ballots: {}, closesAt: s.now + VOTE_MS });
  });

  test('só a dona da vez diz acertei', () => {
    const s = playing();
    s.refuse('b', { type: 'claim' }, 'notYourTurn');
    s.do('a', { type: 'skip' });
    s.refuse('a', { type: 'claim' }, 'invalid');
  });

  test('sim: entra no ranking e a próxima vez começa; o último voto fecha na hora', () => {
    const s = playing();
    s.do('a', { type: 'claim' });
    expect(s.do('b', { type: 'vote', yes: true })).toEqual([]);
    expect(s.do('c', { type: 'vote', yes: true })).toEqual([
      { type: 'voted', owner: 'a', yes: true, yesVotes: 2, noVotes: 0 },
      { type: 'gotIt', owner: 'a', by: 'vote' },
      { type: 'turn', owner: 'b' },
    ]);
    expect(s.game.got).toEqual(['a']);
    expect(s.game.vote).toBeNull();
    expect(revealed(s.game, 'a')).toBe(true);
  });

  test('não: a vez continua com o tempo que sobrava', () => {
    const s = playing();
    s.advance(20_000);
    s.do('a', { type: 'claim' });
    s.advance(5_000);
    s.do('b', { type: 'vote', yes: false });
    expect(s.do('c', { type: 'vote', yes: false })).toEqual([
      { type: 'voted', owner: 'a', yes: false, yesVotes: 0, noVotes: 2 },
    ]);
    expect(s.game.turn).toEqual({ owner: 'a', left: 40_000, since: s.now });
    expect(s.game.got).toEqual([]);
    expect(s.advance(39_999)).toEqual([]);
    expect(s.advance(1)).toEqual([{ type: 'turn', owner: 'b' }]);
  });

  test('empate conta como sim', () => {
    const s = playing();
    s.do('a', { type: 'claim' });
    s.do('b', { type: 'vote', yes: true });
    s.do('c', { type: 'vote', yes: false });
    expect(s.game.got).toEqual(['a']);
  });

  test('quem não vota se abstém: a votação fecha no prazo com os votos dados', () => {
    const s = playing('a', 'b', 'c', 'd');
    s.do('a', { type: 'claim' });
    s.do('b', { type: 'vote', yes: false });
    s.do('c', { type: 'vote', yes: true });
    expect(nextDeadline(s.game)).toBe(s.now + VOTE_MS);
    expect(s.advance(VOTE_MS - 1)).toEqual([]);
    expect(s.advance(1)).toEqual([
      { type: 'voted', owner: 'a', yes: true, yesVotes: 1, noVotes: 1 },
      { type: 'gotIt', owner: 'a', by: 'vote' },
      { type: 'turn', owner: 'b' },
    ]);
  });

  test('ninguém vota: zero votos é sim', () => {
    const s = playing('a', 'b', 'c');
    s.do('a', { type: 'claim' });
    s.advance(VOTE_MS);
    expect(s.game.got).toEqual(['a']);
  });

  test('sem ninguém para votar, a votação fecha na hora como sim', () => {
    const s = playing('a', 'b', 'c');
    s.drop('b');
    s.drop('c');
    const events = s.do('a', { type: 'claim' });
    expect(events).toContainEqual({ type: 'voted', owner: 'a', yes: true, yesVotes: 0, noVotes: 0 });
    expect(events).toContainEqual({ type: 'gotIt', owner: 'a', by: 'vote' });
    expect(s.game.got).toEqual(['a']);
  });

  test('quem já acertou ou desistiu vota; fantasma e falso não', () => {
    const s = new Sim('a', 'b', 'c');
    s.join('f', { fake: true });
    s.start();
    s.do('b', { type: 'giveUp' });
    s.join('g');
    s.do('a', { type: 'claim' });
    expect(s.game.vote!.voters).toEqual(['b', 'c']);
    s.refuse('g', { type: 'vote', yes: true }, 'invalid');
    s.refuse('f', { type: 'vote', yes: true }, 'invalid');
    s.refuse('a', { type: 'vote', yes: true }, 'invalid');
    s.do('b', { type: 'vote', yes: false });
  });

  test('o voto muda até a votação fechar; o mesmo voto de novo não faz nada', () => {
    const s = new Sim('a', 'b', 'c', 'd');
    s.start();
    s.do('a', { type: 'claim' });
    s.do('b', { type: 'vote', yes: false });
    expect(s.do('b', { type: 'vote', yes: true })).toEqual([]);
    expect(s.game.vote!.ballots).toEqual({ b: true });
    expect(s.do('b', { type: 'vote', yes: true })).toEqual([]);
    s.do('c', { type: 'vote', yes: false });
    expect(s.do('d', { type: 'vote', yes: false })).toContainEqual({ type: 'voted', owner: 'a', yes: false, yesVotes: 1, noVotes: 2 });
    s.refuse('b', { type: 'vote', yes: false }, 'invalid'); // fechou
  });

  test('votar sem votação aberta é recusado', () => {
    const s = playing();
    s.refuse('b', { type: 'vote', yes: true }, 'invalid');
  });

  test('a votação fecha quando quem falta votar cai', () => {
    const s = playing();
    s.do('a', { type: 'claim' });
    s.do('b', { type: 'vote', yes: false });
    expect(s.drop('c')).toContainEqual({ type: 'voted', owner: 'a', yes: false, yesVotes: 0, noVotes: 1 });
  });

  test('com votação aberta, ninguém passa a vez nem diz acertei de novo', () => {
    const s = playing();
    s.do('a', { type: 'claim' });
    s.refuse('a', { type: 'skip' }, 'invalid');
    s.refuse('a', { type: 'claim' }, 'invalid');
  });

  test('a dona cai durante a votação: a votação segue, e um não passa a vez', () => {
    const s = playing();
    s.do('a', { type: 'claim' });
    s.drop('a');
    expect(s.game.vote).not.toBeNull();
    s.do('b', { type: 'vote', yes: false });
    s.do('c', { type: 'vote', yes: false });
    expect(s.owner).toBe('b');
  });
});

describe('desistir', () => {
  test('na própria vez: vai para quem desistiu e a próxima vez começa', () => {
    const s = playing();
    expect(s.do('a', { type: 'giveUp' })).toEqual([{ type: 'gaveUp', owner: 'a' }, { type: 'turn', owner: 'b' }]);
    expect(s.game.gaveUp).toEqual(['a']);
    expect(revealed(s.game, 'a')).toBe(true);
  });

  test('fora da vez: a vez continua com quem estava', () => {
    const s = playing();
    s.advance(5_000);
    expect(s.do('c', { type: 'giveUp' })).toEqual([{ type: 'gaveUp', owner: 'c' }]);
    expect(s.game.turn).toEqual({ owner: 'a', left: TURN, since: s.now - 5_000 });
  });

  test('desistir durante a própria votação a cancela', () => {
    const s = playing();
    s.do('a', { type: 'claim' });
    s.do('a', { type: 'giveUp' });
    expect(s.game.vote).toBeNull();
    expect(s.game.got).toEqual([]);
    expect(s.owner).toBe('b');
  });

  test('quem já terminou ou é fantasma não desiste', () => {
    const s = playing();
    s.do('b', { type: 'giveUp' });
    s.refuse('b', { type: 'giveUp' }, 'invalid');
    s.join('g');
    s.refuse('g', { type: 'giveUp' }, 'invalid');
    const lobby = new Sim('a', 'b');
    lobby.refuse('a', { type: 'giveUp' }, 'wrongPhase');
  });
});

describe('poderes do moderador', () => {
  test('marcar acertou fora da vez: entra no ranking sem mexer na vez', () => {
    const s = playing();
    expect(s.do('a', { type: 'mark', member: 'c', right: true })).toEqual([{ type: 'gotIt', owner: 'c', by: 'moderator' }]);
    expect(s.game.got).toEqual(['c']);
    expect(s.owner).toBe('a');
  });

  test('marcar acertou a dona da vez passa a vez', () => {
    const s = playing();
    s.do('a', { type: 'skip' });
    expect(s.do('a', { type: 'mark', member: 'b', right: true })).toEqual([
      { type: 'gotIt', owner: 'b', by: 'moderator' },
      { type: 'turn', owner: 'c' },
    ]);
  });

  test('marcar acertou quem desistiu tira de quem desistiu', () => {
    const s = playing();
    s.do('c', { type: 'giveUp' });
    s.do('a', { type: 'mark', member: 'c', right: true });
    expect(s.game.got).toEqual(['c']);
    expect(s.game.gaveUp).toEqual([]);
  });

  test('marcar acertou passa por cima de uma votação aberta', () => {
    const s = playing();
    s.do('a', { type: 'claim' });
    s.do('b', { type: 'vote', yes: false });
    expect(s.do('a', { type: 'mark', member: 'a', right: true })).toEqual([
      { type: 'gotIt', owner: 'a', by: 'moderator' },
      { type: 'turn', owner: 'b' },
    ]);
    expect(s.game.vote).toBeNull();
    expect(s.game.got).toEqual(['a']);
  });

  test('marcar errou passa por cima de uma votação aberta: a vez continua', () => {
    const s = playing();
    s.advance(10_000);
    s.do('a', { type: 'claim' });
    s.advance(3_000);
    s.do('b', { type: 'vote', yes: true });
    s.do('a', { type: 'mark', member: 'a', right: false });
    expect(s.game.vote).toBeNull();
    expect(s.game.got).toEqual([]);
    expect(s.game.turn).toEqual({ owner: 'a', left: 50_000, since: s.now });
  });

  test('marcar errou desfaz uma revelação, e a pessoa volta às vezes', () => {
    const s = playing();
    s.do('a', { type: 'claim' });
    s.do('b', { type: 'vote', yes: true });
    s.do('c', { type: 'vote', yes: true });
    s.do('c', { type: 'giveUp' });
    expect(s.do('a', { type: 'mark', member: 'a', right: false })).toEqual([{ type: 'unrevealed', owner: 'a' }]);
    expect(s.do('a', { type: 'mark', member: 'c', right: false })).toEqual([{ type: 'unrevealed', owner: 'c' }]);
    expect(s.game.got).toEqual([]);
    expect(s.game.gaveUp).toEqual([]);
    expect(revealed(s.game, 'a')).toBe(false);
    s.do('b', { type: 'skip' });
    expect(s.owner).toBe('c');
    s.do('c', { type: 'skip' });
    expect(s.owner).toBe('a');
  });

  test('marcar sem efeito, quem não joga, ou sem ser moderador é recusado', () => {
    const s = playing();
    s.refuse('a', { type: 'mark', member: 'b', right: false }, 'invalid');
    s.do('a', { type: 'mark', member: 'b', right: true });
    s.refuse('a', { type: 'mark', member: 'b', right: true }, 'invalid');
    s.join('g');
    s.refuse('a', { type: 'mark', member: 'g', right: true }, 'invalid');
    s.refuse('c', { type: 'mark', member: 'c', right: true }, 'notModerator');
  });

  test('pausar guarda o que sobra e soltar volta a correr', () => {
    const s = playing();
    s.advance(10_000);
    s.do('a', { type: 'pause', on: true });
    expect(s.game.paused).toBe(true);
    expect(s.game.turn).toEqual({ owner: 'a', left: 50_000, since: null });
    expect(nextDeadline(s.game)).toBeNull();
    expect(s.advance(10 * TURN)).toEqual([]);
    expect(turnLeft(s.game, s.now)).toBe(50_000);
    s.do('a', { type: 'pause', on: false });
    expect(s.game.turn).toEqual({ owner: 'a', left: 50_000, since: s.now });
    expect(nextDeadline(s.game)).toBe(s.now + 50_000);
    s.refuse('a', { type: 'pause', on: false }, 'invalid');
    s.refuse('b', { type: 'pause', on: true }, 'notModerator');
  });

  test('pausado, a vez passada começa parada', () => {
    const s = playing();
    s.do('a', { type: 'pause', on: true });
    s.do('a', { type: 'skip' });
    expect(s.game.turn).toEqual({ owner: 'b', left: TURN, since: null });
  });

  test('pausa durante a votação: um não deixa a vez parada até soltar', () => {
    const s = playing();
    s.advance(10_000);
    s.do('a', { type: 'claim' });
    s.do('a', { type: 'pause', on: true });
    s.do('b', { type: 'vote', yes: false });
    s.do('c', { type: 'vote', yes: false });
    expect(s.game.turn).toEqual({ owner: 'a', left: 50_000, since: null });
    s.advance(5_000);
    s.do('a', { type: 'pause', on: false });
    expect(s.game.turn).toEqual({ owner: 'a', left: 50_000, since: s.now });
  });

  test('soltar a pausa durante a votação não solta o relógio da vez', () => {
    const s = playing();
    s.do('a', { type: 'pause', on: true });
    s.do('a', { type: 'claim' });
    s.do('a', { type: 'pause', on: false });
    expect(s.game.turn!.since).toBeNull();
    expect(nextDeadline(s.game)).toBe(s.game.vote!.closesAt);
  });
});

describe('fim', () => {
  test('acaba quando toda pessoa conectada acertou ou desistiu', () => {
    const s = playing();
    s.do('a', { type: 'claim' });
    s.do('b', { type: 'vote', yes: true });
    s.do('c', { type: 'vote', yes: true });
    s.do('c', { type: 'giveUp' });
    expect(s.do('b', { type: 'giveUp' })).toEqual([{ type: 'gaveUp', owner: 'b' }, { type: 'ended' }]);
    expect(s.game.phase).toBe('ended');
    expect(s.game.got).toEqual(['a']);
    expect(s.game.gaveUp).toEqual(['c', 'b']);
    expect(s.game.turn).toBeNull();
    expect(nextDeadline(s.game)).toBeNull();
    expect(revealed(s.game, 'a')).toBe(true);
    expect(revealed(s.game, 'b')).toBe(true);
  });

  test('quem está offline não segura o fim', () => {
    const s = playing();
    s.drop('c');
    s.do('a', { type: 'giveUp' });
    s.do('b', { type: 'giveUp' });
    expect(s.game.phase).toBe('ended');
  });

  test('quem cai sendo o último jogando faz o jogo acabar', () => {
    const s = playing();
    s.do('a', { type: 'giveUp' });
    s.do('b', { type: 'giveUp' });
    expect(s.drop('c')).toContainEqual({ type: 'ended' });
  });

  test('jogador falso não segura o fim', () => {
    const s = new Sim('a', 'b');
    s.join('f', { fake: true });
    s.start();
    s.do('a', { type: 'giveUp' });
    s.do('b', { type: 'giveUp' });
    expect(s.game.phase).toBe('ended');
  });

  test('sem ninguém conectado, o jogo espera em vez de acabar', () => {
    const s = playing();
    s.drop('b');
    s.drop('c');
    s.drop('a');
    expect(s.game.phase).toBe('playing');
    expect(s.game.turn).toBeNull();
    expect(nextDeadline(s.game)).toBeNull();
    expect(s.back('b')).toEqual([{ type: 'turn', owner: 'b' }]);
  });

  test('o moderador encerra o jogo; no lobby e no fim não há o que encerrar', () => {
    const s = playing();
    s.refuse('b', { type: 'endGame' }, 'notModerator');
    expect(s.do('a', { type: 'endGame' })).toEqual([{ type: 'ended' }]);
    expect(s.game.phase).toBe('ended');
    expect(s.game.turn).toBeNull();
    s.refuse('a', { type: 'endGame' }, 'wrongPhase');
    const w = new Sim('a', 'b');
    w.writeAll();
    w.refuse('a', { type: 'endGame' }, 'wrongPhase');
  });

  test('ações do jogo fora do jogo são recusadas', () => {
    const s = new Sim('a', 'b');
    s.refuse('a', { type: 'claim' }, 'wrongPhase');
    s.refuse('a', { type: 'skip' }, 'wrongPhase');
    s.refuse('a', { type: 'vote', yes: true }, 'wrongPhase');
    s.refuse('a', { type: 'mark', member: 'b', right: true }, 'wrongPhase');
    s.refuse('a', { type: 'pause', on: true }, 'wrongPhase');
    s.refuse('a', { type: 'playAgain' }, 'wrongPhase');
  });
});

describe('jogar de novo', () => {
  test('o moderador leva a turma de volta ao lobby, com o fantasma que chegou depois e post-its vazios', () => {
    const s = playing();
    s.join('d');
    s.do('a', { type: 'endGame' });
    s.refuse('c', { type: 'playAgain' }, 'notModerator');
    expect(s.do('a', { type: 'playAgain' })).toEqual([{ type: 'lobby' }]);
    const empty = { text: '', image: null, ready: false };
    expect(s.game).toEqual({
      ...s.game,
      phase: 'lobby',
      order: ['a', 'b', 'c', 'd'],
      authors: circle(['a', 'b', 'c', 'd']),
      customAuthors: false,
      postits: { a: empty, b: empty, c: empty, d: empty },
      turn: null,
      vote: null,
      paused: false,
      got: [],
      gaveUp: [],
      turns: {},
    });
  });

  test('quem só modera continua de fora, e os autores trocados voltam ao círculo', () => {
    const s = new Sim('a', 'b', 'c', 'd');
    s.do('a', { type: 'onlyModerate', on: true });
    s.do('a', { type: 'shuffleAuthors' });
    expect(s.game.customAuthors).toBe(true);
    s.do('a', { type: 'turnMs', ms: 90_000 });
    s.start();
    s.do('a', { type: 'pause', on: true });
    s.do('a', { type: 'endGame' });
    s.do('a', { type: 'playAgain' });
    expect(s.game.order).toEqual(['b', 'c', 'd']);
    expect(Object.keys(s.game.postits).sort()).toEqual(['b', 'c', 'd']);
    expect(s.game.onlyModerate).toEqual(['a']);
    expect(s.game.customAuthors).toBe(false);
    expect(s.game.authors).toEqual(circle(['b', 'c', 'd']));
    expect(s.game.turnMs).toBe(90_000);
    expect(s.game.paused).toBe(false);
  });

  test('quem está desconectado fica de fora (fantasma), e ninguém escreve para ele nem espera o post-it dele', () => {
    const s = playing('a', 'b', 'c', 'd');
    s.drop('c');
    s.do('a', { type: 'endGame' });
    s.do('a', { type: 'playAgain' });
    expect(s.game.order).toEqual(['a', 'b', 'd']);
    expect(s.game.authors).toEqual(circle(['a', 'b', 'd']));
    expect(Object.keys(s.game.postits).sort()).toEqual(['a', 'b', 'd']);
    expect(s.game.characters.c).toBeDefined(); // continua na turma
  });

  test('quem estava de fora e volta ainda no lobby entra de novo no fim da ordem', () => {
    const s = playing('a', 'b', 'c', 'd');
    s.drop('c');
    s.do('a', { type: 'endGame' });
    s.do('a', { type: 'playAgain' });
    s.writeAll();
    s.back('c');
    expect(s.game.order).toEqual(['a', 'b', 'd', 'c']);
    expect(s.game.authors).toEqual(circle(['a', 'b', 'd', 'c']));
    expect(Object.keys(s.game.postits).sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(s.game.postits.c).toEqual({ text: '', image: null, ready: false });
  });

  test('o fantasma que volta com o jogo rodando continua fantasma', () => {
    const s = playing('a', 'b', 'c');
    s.drop('c');
    s.do('a', { type: 'endGame' });
    s.do('a', { type: 'playAgain' });
    s.writeAll();
    s.do('a', { type: 'start' });
    s.back('c');
    expect(s.game.order).toEqual(['a', 'b']);
  });

  test('a ordem nova segue a antiga, mesmo reordenada no jogo', () => {
    const s = playing();
    s.do('a', { type: 'order', order: ['c', 'a', 'b'] });
    s.do('a', { type: 'endGame' });
    s.do('a', { type: 'playAgain' });
    expect(s.game.order).toEqual(['c', 'a', 'b']);
  });
});

describe('expulsar', () => {
  test('no lobby: sai da ordem e do personagem, e o círculo fecha', () => {
    const s = new Sim('a', 'b', 'c');
    s.kick('b');
    expect(s.game.order).toEqual(['a', 'c']);
    expect(s.game.characters).toEqual({ a: 0, c: 2 });
    expect(s.game.authors).toEqual(circle(['a', 'c']));
  });

  test('no lobby, depois de sortear: o sorteio deixa de valer e volta ao círculo', () => {
    const s = new Sim('a', 'b', 'c', 'd');
    s.do('a', { type: 'shuffleAuthors' });
    s.kick('c');
    expect(s.game.customAuthors).toBe(false);
    expect(s.game.authors).toEqual(circle(['a', 'b', 'd']));
  });

  test('quem só moderava sai de só moderar', () => {
    const s = new Sim('a', 'b', 'c');
    s.do('a', { type: 'onlyModerate', on: true });
    s.kick('a');
    expect(s.game.onlyModerate).toEqual([]);
  });

  test('no jogo: o post-it dele some e o dono para quem escrevia fica sem autor', () => {
    const s = playing('a', 'b', 'c', 'd');
    s.kick('c'); // c escrevia para d
    expect(Object.keys(s.game.postits).sort()).toEqual(['a', 'b', 'd']);
    expect(s.game.authors).toEqual({ b: 'a', a: 'd' });
    expect(s.game.postits.d.text).toBe('quem é d');
  });

  test('no jogo: se era a vez dele, a próxima da ordem começa', () => {
    const s = playing('a', 'b', 'c', 'd');
    s.do('a', { type: 'skip' });
    expect(s.kick('b')).toEqual([{ type: 'turn', owner: 'c' }]);
    expect(s.game.order).toEqual(['a', 'c', 'd']);
  });

  test('no jogo: a última da ordem expulsa na própria vez passa para a primeira', () => {
    const s = playing();
    s.do('a', { type: 'skip' });
    s.do('a', { type: 'skip' });
    expect(s.kick('c')).toEqual([{ type: 'turn', owner: 'a' }]);
  });

  test('no jogo: sai do ranking', () => {
    const s = playing('a', 'b', 'c', 'd');
    s.do('a', { type: 'mark', member: 'c', right: true });
    s.do('d', { type: 'giveUp' });
    s.kick('c');
    s.kick('d');
    expect(s.game.got).toEqual([]);
    expect(s.game.gaveUp).toEqual([]);
  });

  test('no jogo: expulsar quem pediu acertei cancela a votação', () => {
    const s = playing();
    s.do('a', { type: 'claim' });
    expect(s.kick('a')).toEqual([{ type: 'turn', owner: 'b' }]);
    expect(s.game.vote).toBeNull();
  });

  test('no jogo: expulsar quem faltava votar fecha a votação', () => {
    const s = playing();
    s.do('a', { type: 'claim' });
    s.do('b', { type: 'vote', yes: false });
    expect(s.kick('c')).toContainEqual({ type: 'voted', owner: 'a', yes: false, yesVotes: 0, noVotes: 1 });
    expect(s.game.vote).toBeNull();
  });

  test('no jogo: expulsar quem votou tira o voto', () => {
    const s = playing('a', 'b', 'c', 'd');
    s.do('a', { type: 'claim' });
    s.do('b', { type: 'vote', yes: false });
    s.kick('b');
    expect(s.game.vote).toEqual({ ...s.game.vote!, voters: ['c', 'd'], ballots: {} });
  });

  test('no jogo: expulsar o último jogando acaba o jogo', () => {
    const s = playing();
    s.do('a', { type: 'giveUp' });
    s.do('b', { type: 'giveUp' });
    expect(s.kick('c')).toEqual([{ type: 'ended' }]);
  });

  test('no fim: sai sem mais nada', () => {
    const s = playing();
    s.do('a', { type: 'endGame' });
    s.kick('b');
    expect(s.game.phase).toBe('ended');
    expect(s.game.order).toEqual(['a', 'c']);
    expect(s.game.postits.b).toBeUndefined();
  });

  test('expulsar não muda o estado que recebeu', () => {
    const s = playing();
    const before = structuredClone(s.game);
    const frozen = s.game;
    s.kick('a');
    expect(frozen).toEqual(before);
  });
});

describe('consultas', () => {
  test('o prazo é o da votação, senão o fim da vez com o relógio correndo, senão nenhum', () => {
    const s = new Sim('a', 'b', 'c');
    expect(nextDeadline(s.game)).toBeNull();
    expect(turnLeft(s.game, s.now)).toBe(0);
    s.start();
    expect(nextDeadline(s.game)).toBe(s.now + TURN);
    s.advance(20_000);
    expect(turnLeft(s.game, s.now)).toBe(40_000);
    expect(turnLeft(s.game, s.now + 100_000)).toBe(0);
    s.do('a', { type: 'claim' });
    expect(nextDeadline(s.game)).toBe(s.now + VOTE_MS);
    expect(turnLeft(s.game, s.now + 5_000)).toBe(40_000);
  });

  test('revelado: acertou, desistiu, ou o jogo acabou', () => {
    const s = playing();
    expect(revealed(s.game, 'a')).toBe(false);
    s.do('b', { type: 'giveUp' });
    expect(revealed(s.game, 'b')).toBe(true);
    expect(revealed(s.game, 'c')).toBe(false);
    s.do('a', { type: 'endGame' });
    expect(revealed(s.game, 'c')).toBe(true);
  });
});

describe('contador de vezes', () => {
  test('conta a vez quando ela começa, para quem a tem', () => {
    const s = playing();
    expect(s.game.turns).toEqual({ a: 1 });
    s.do('a', { type: 'skip' });
    s.do('b', { type: 'skip' });
    s.advance(TURN); // a vez de c vence sozinha
    expect(s.owner).toBe('a');
    expect(s.game.turns).toEqual({ a: 2, b: 1, c: 1 });
  });

  test('a vez pulada de quem está offline (ou é falso) não conta', () => {
    const s = new Sim('a', 'b', 'c');
    s.join('f', { fake: true });
    s.start();
    s.drop('b');
    s.do('a', { type: 'skip' });
    expect(s.owner).toBe('c');
    s.do('c', { type: 'skip' });
    expect(s.owner).toBe('a');
    expect(s.game.turns).toEqual({ a: 2, c: 1 });
  });

  test('a votação recusada não começa outra vez; o acerto passa a vez para a próxima', () => {
    const s = playing();
    s.do('a', { type: 'claim' });
    s.do('b', { type: 'vote', yes: false });
    s.do('c', { type: 'vote', yes: false });
    expect(s.owner).toBe('a');
    expect(s.game.turns).toEqual({ a: 1 });
    s.do('a', { type: 'claim' });
    s.do('b', { type: 'vote', yes: true });
    s.do('c', { type: 'vote', yes: true });
    expect(s.game.turns).toEqual({ a: 1, b: 1 });
  });

  test('pausar e soltar o relógio não conta', () => {
    const s = playing();
    s.do('a', { type: 'pause', on: true });
    s.do('a', { type: 'pause', on: false });
    expect(s.game.turns).toEqual({ a: 1 });
  });

  test('quem é expulso sai da conta', () => {
    const s = playing();
    s.do('a', { type: 'skip' });
    s.kick('b');
    expect(s.game.turns).toEqual({ a: 1, c: 1 });
  });

  test('zera em "jogar de novo" e ao começar outro jogo', () => {
    const s = playing();
    s.do('a', { type: 'skip' });
    s.do('a', { type: 'endGame' });
    expect(s.game.turns).toEqual({ a: 1, b: 1 }); // no fim ainda se vê
    s.do('a', { type: 'playAgain' });
    expect(s.game.turns).toEqual({});
    s.start();
    expect(s.game.turns).toEqual({ a: 1 });
  });
});
