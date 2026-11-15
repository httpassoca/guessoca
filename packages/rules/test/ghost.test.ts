import { describe, expect, test } from 'bun:test';
import { circle, revealed } from '../src';
import { Sim } from './sim';

/** a, b, c (…) já jogando, vez de a; a é o moderador */
function playing(...ids: string[]) {
  const s = new Sim(...(ids.length ? ids : ['a', 'b', 'c']));
  s.start();
  return s;
}

const ghost = (member: string, on = true) => ({ type: 'ghost' as const, member, on });

describe('virar fantasma: quem pode', () => {
  test('qualquer pessoa vira fantasma e volta, sozinha', () => {
    const s = playing();
    s.do('b', ghost('b'));
    expect(s.game.ghosted).toEqual(['b']);
    s.do('b', ghost('b', false));
    expect(s.game.ghosted).toEqual([]);
  });

  test('o moderador vira e desvira qualquer pessoa; os outros, só a si mesmos', () => {
    const s = playing();
    s.do('a', ghost('c'));
    expect(s.game.ghosted).toEqual(['c']);
    s.refuse('b', ghost('c', false), 'notModerator');
    s.refuse('b', ghost('a'), 'notModerator');
    s.do('a', ghost('c', false));
    s.do('a', ghost('a'));
    expect(s.game.ghosted).toEqual(['a']);
  });

  test('quem o moderador pôs como fantasma volta sozinho, sem trava', () => {
    const s = playing();
    s.do('a', ghost('b'));
    s.do('b', ghost('b', false));
    expect(s.game.ghosted).toEqual([]);
  });

  test('o mesmo pedido de novo, ou para quem não é da turma, é recusado', () => {
    const s = playing();
    s.refuse('b', ghost('b', false), 'invalid');
    s.do('b', ghost('b'));
    s.refuse('b', ghost('b'), 'invalid');
    s.refuse('a', ghost('z'), 'invalid');
  });

  test('vale em qualquer fase: lobby, jogo e fim', () => {
    const s = new Sim('a', 'b', 'c');
    s.do('c', ghost('c'));
    s.do('c', ghost('c', false));
    s.start();
    s.do('a', { type: 'endGame' });
    s.do('b', ghost('b'));
    expect(s.game.ghosted).toEqual(['b']);
  });

  test('não muda o estado que recebeu', () => {
    const s = playing();
    const before = structuredClone(s.game);
    const frozen = s.game;
    s.do('b', ghost('b'));
    expect(frozen).toEqual(before);
  });
});

describe('fantasma no lobby', () => {
  test('sai da ordem (e o círculo fecha sem ele) e volta para o fim dela ao desvirar', () => {
    const s = new Sim('a', 'b', 'c', 'd');
    s.do('b', ghost('b'));
    expect(s.game.order).toEqual(['a', 'c', 'd']);
    expect(s.game.authors).toEqual(circle(['a', 'c', 'd']));
    expect(Object.keys(s.game.postits).sort()).toEqual(['a', 'c', 'd']);
    s.do('b', ghost('b', false));
    expect(s.game.order).toEqual(['a', 'c', 'd', 'b']);
    expect(s.game.postits.b).toEqual({ text: '', image: null, ready: false });
  });

  test('o fantasma não conta para começar: dois jogando bastam, e com um só não começa', () => {
    const s = new Sim('a', 'b', 'c');
    s.do('c', ghost('c'));
    s.start();
    expect(s.game.order).toEqual(['a', 'b']);
    const t = new Sim('a', 'b');
    t.do('b', ghost('b'));
    expect(t.game.order).toEqual(['a']);
    t.refuse('a', { type: 'start' }, 'invalid');
  });

  test('fantasma que desvira com o jogo rodando continua fora da ordem até o próximo lobby', () => {
    const s = new Sim('a', 'b', 'c');
    s.do('c', ghost('c'));
    s.start();
    s.do('c', ghost('c', false));
    expect(s.game.order).toEqual(['a', 'b']);
    s.do('a', { type: 'endGame' });
    s.do('a', { type: 'playAgain' });
    expect(s.game.order).toEqual(['a', 'b', 'c']);
  });

  test('o fantasma conectado não volta sozinho para a ordem no lobby', () => {
    const s = new Sim('a', 'b', 'c');
    s.do('b', ghost('b'));
    s.drop('b');
    s.back('b');
    expect(s.game.order).toEqual(['a', 'c']);
  });
});

describe('fantasma no jogo: as vezes', () => {
  test('é pulado na ordem das vezes, e entra de novo quando desvira', () => {
    const s = playing('a', 'b', 'c');
    s.do('b', ghost('b'));
    expect(s.do('a', { type: 'skip' })).toEqual([{ type: 'turn', owner: 'c' }]);
    s.do('c', { type: 'skip' });
    expect(s.owner).toBe('a');
    s.do('b', ghost('b', false));
    s.do('a', { type: 'skip' });
    expect(s.owner).toBe('b');
  });

  test('a dona da vez vira fantasma: a próxima vez começa na hora', () => {
    const s = playing('a', 'b', 'c');
    expect(s.do('a', ghost('a'))).toEqual([{ type: 'turn', owner: 'b' }]);
    expect(s.game.order).toEqual(['a', 'b', 'c']);
  });

  test('o moderador põe como fantasma a dona da vez (ausente): a vez passa', () => {
    const s = playing('a', 'b', 'c');
    s.do('a', { type: 'skip' });
    expect(s.do('a', ghost('b'))).toEqual([{ type: 'turn', owner: 'c' }]);
  });

  test('a vez de quem desvira não começa no meio da vez de outra pessoa', () => {
    const s = playing('a', 'b', 'c');
    s.do('a', ghost('b'));
    s.do('a', { type: 'skip' });
    expect(s.owner).toBe('c');
    s.do('b', ghost('b', false));
    expect(s.owner).toBe('c');
  });

  test('fantasma não diz acertei, não desiste e não pode ser marcado como acertou', () => {
    const s = playing('a', 'b', 'c');
    s.do('b', ghost('b'));
    s.refuse('b', { type: 'claim' }, 'notYourTurn');
    s.refuse('b', { type: 'giveUp' }, 'invalid');
    s.refuse('a', { type: 'mark', member: 'b', right: true }, 'invalid');
  });

  test('o moderador ainda desfaz a revelação de um fantasma', () => {
    const s = playing('a', 'b', 'c');
    s.do('b', { type: 'giveUp' });
    s.do('b', ghost('b'));
    s.do('a', { type: 'mark', member: 'b', right: false });
    expect(s.game.gaveUp).toEqual([]);
  });

  test('o post-it do fantasma fica guardado e não é revelado por virar fantasma', () => {
    const s = playing('a', 'b', 'c');
    const postit = s.game.postits.b;
    s.do('b', ghost('b'));
    expect(s.game.postits.b).toEqual(postit);
    expect(revealed(s.game, 'b')).toBe(false);
    s.do('b', ghost('b', false));
    expect(s.game.postits.b).toEqual(postit);
  });

  test('quem já acertou e vira fantasma continua no ranking', () => {
    const s = playing('a', 'b', 'c');
    s.do('a', { type: 'mark', member: 'b', right: true });
    s.do('b', ghost('b'));
    expect(s.game.got).toEqual(['b']);
  });

  test('todos viram fantasma: o jogo espera sem vez, e volta quando alguém desvira', () => {
    const s = playing('a', 'b');
    s.do('a', ghost('a'));
    s.do('b', ghost('b'));
    expect(s.game.phase).toBe('playing');
    expect(s.game.turn).toBeNull();
    s.do('b', ghost('b', false));
    expect(s.owner).toBe('b');
  });

  test('quem sobra sozinho jogando continua tendo vezes', () => {
    const s = playing('a', 'b');
    s.do('b', ghost('b'));
    s.do('a', { type: 'skip' });
    expect(s.owner).toBe('a');
  });
});

describe('fantasma no jogo: votação', () => {
  test('fantasma não entra entre quem vota', () => {
    const s = playing('a', 'b', 'c', 'd');
    s.do('d', ghost('d'));
    s.do('a', { type: 'claim' });
    expect(s.game.vote!.voters).toEqual(['b', 'c']);
    s.refuse('d', { type: 'vote', yes: true }, 'invalid');
  });

  test('quem vota vira fantasma: sai dos votantes, o voto dele sai, e a votação fecha se só faltava ele', () => {
    const s = playing('a', 'b', 'c');
    s.do('a', { type: 'claim' });
    s.do('b', { type: 'vote', yes: false });
    const events = s.do('c', ghost('c'));
    expect(events).toContainEqual({ type: 'voted', owner: 'a', yes: false, yesVotes: 0, noVotes: 1 });
    const t = playing('a', 'b', 'c');
    t.do('a', { type: 'claim' });
    t.do('b', { type: 'vote', yes: false });
    t.do('b', ghost('b'));
    expect(t.game.vote).toEqual({ ...t.game.vote!, voters: ['c'], ballots: {} });
  });

  test('quem pediu acertei vira fantasma: a votação é cancelada e a vez passa', () => {
    const s = playing('a', 'b', 'c');
    s.do('a', { type: 'claim' });
    const events = s.do('a', ghost('a'));
    expect(s.game.vote).toBeNull();
    expect(s.game.got).toEqual([]);
    expect(events).toEqual([{ type: 'turn', owner: 'b' }]);
  });

  test('desvirar no meio da votação não dá voto', () => {
    const s = playing('a', 'b', 'c');
    s.do('c', ghost('c'));
    s.do('a', { type: 'claim' });
    s.do('c', ghost('c', false));
    s.refuse('c', { type: 'vote', yes: true }, 'invalid');
  });
});

describe('fantasma no jogo: fim', () => {
  test('o fantasma não segura o fim: acaba quando todo mundo que joga acertou ou desistiu', () => {
    const s = playing('a', 'b', 'c');
    s.do('c', ghost('c'));
    s.do('a', { type: 'mark', member: 'b', right: true });
    expect(s.game.phase).toBe('playing');
    const events = s.do('a', { type: 'giveUp' });
    expect(events).toContainEqual({ type: 'ended' });
    expect(s.game.phase).toBe('ended');
  });

  test('virar fantasma sendo o último jogando acaba o jogo', () => {
    const s = playing('a', 'b', 'c');
    s.do('a', { type: 'mark', member: 'b', right: true });
    s.do('a', { type: 'mark', member: 'c', right: true });
    expect(s.do('a', ghost('a'))).toContainEqual({ type: 'ended' });
  });

  test('jogar de novo: o fantasma fica de fora até desvirar', () => {
    const s = playing('a', 'b', 'c');
    s.do('c', ghost('c'));
    s.do('a', { type: 'endGame' });
    s.do('a', { type: 'playAgain' });
    expect(s.game.order).toEqual(['a', 'b']);
    expect(s.game.ghosted).toEqual(['c']);
    s.do('c', ghost('c', false));
    expect(s.game.order).toEqual(['a', 'b', 'c']);
  });

  test('expulsar tira de fantasma', () => {
    const s = playing('a', 'b', 'c');
    s.do('c', ghost('c'));
    s.kick('c');
    expect(s.game.ghosted).toEqual([]);
  });
});
