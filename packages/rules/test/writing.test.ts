import { describe, expect, test } from 'bun:test';
import { Sim } from './sim';

/** a, b, c no círculo (b←a, c←b, a←c), já na escrita; a é o moderador */
function writing(...ids: string[]) {
  const s = new Sim(...(ids.length ? ids : ['a', 'b', 'c']));
  s.do('a', { type: 'startWriting' });
  return s;
}

describe('escrita', () => {
  test('o autor escreve o post-it do dono, com o texto limpo', () => {
    const s = writing();
    s.do('b', { type: 'write', owner: 'c', text: '  o cachorro   da tia  ', image: 'img1' });
    expect(s.game.postits.c).toEqual({ text: 'o cachorro da tia', image: 'img1', ready: false });
    s.do('b', { type: 'write', owner: 'c', text: 'Neide', image: null });
    expect(s.game.postits.c).toEqual({ text: 'Neide', image: null, ready: false });
  });

  test('quem não é o autor não escreve; o dono nunca escreve o próprio', () => {
    const s = writing();
    s.refuse('c', { type: 'write', owner: 'c', text: 'eu', image: null }, 'invalid');
    s.refuse('a', { type: 'write', owner: 'a', text: 'eu', image: null }, 'invalid');
    s.refuse('c', { type: 'write', owner: 'b', text: 'x', image: null }, 'invalid');
    s.refuse('b', { type: 'write', owner: 'x', text: 'x', image: null }, 'invalid');
  });

  test('o moderador escreve para qualquer dono menos ele mesmo', () => {
    const s = writing();
    s.do('a', { type: 'write', owner: 'c', text: 'pelo moderador', image: null });
    expect(s.game.postits.c.text).toBe('pelo moderador');
  });

  test('pronto precisa de texto e é definitivo', () => {
    const s = writing();
    s.refuse('b', { type: 'ready' }, 'invalid');
    s.do('b', { type: 'write', owner: 'c', text: '   ', image: 'img' });
    s.refuse('b', { type: 'ready' }, 'invalid');
    s.do('b', { type: 'write', owner: 'c', text: 'Pelé', image: null });
    expect(s.do('b', { type: 'ready' })).toEqual([]);
    expect(s.game.postits.c.ready).toBe(true);
    s.refuse('b', { type: 'ready' }, 'invalid');
    s.refuse('b', { type: 'write', owner: 'c', text: 'outro', image: null }, 'invalid');
    s.refuse('a', { type: 'write', owner: 'c', text: 'outro', image: null }, 'invalid');
  });

  test('quem não escreve post-it nenhum não marca pronto', () => {
    const s = new Sim('a', 'b', 'c');
    s.do('a', { type: 'startWriting' });
    s.join('d');
    s.refuse('d', { type: 'ready' }, 'invalid');
  });

  test('todos prontos: o jogo começa com a vez da primeira pessoa da ordem', () => {
    const s = writing();
    s.do('a', { type: 'write', owner: 'b', text: 'B', image: null });
    s.do('b', { type: 'write', owner: 'c', text: 'C', image: null });
    s.do('c', { type: 'write', owner: 'a', text: 'A', image: null });
    s.do('a', { type: 'ready' });
    s.do('b', { type: 'ready' });
    expect(s.game.phase).toBe('writing');
    const events = s.do('c', { type: 'ready' });
    expect(events).toEqual([{ type: 'started' }, { type: 'turn', owner: 'a' }]);
    expect(s.game.phase).toBe('playing');
    expect(s.game.turn).toEqual({ owner: 'a', left: s.game.turnMs, since: s.now });
  });

  test('a primeira vez pula quem está offline', () => {
    const s = writing();
    for (const [author, owner] of [['a', 'b'], ['b', 'c'], ['c', 'a']]) s.do(author, { type: 'write', owner, text: owner, image: null });
    s.do('b', { type: 'ready' });
    s.do('c', { type: 'ready' });
    s.drop('a');
    s.do('a', { type: 'ready' });
    expect(s.owner).toBe('b');
  });

  test('forçar começa mesmo sem todos prontos, mas não com post-it vazio', () => {
    const s = writing();
    s.do('a', { type: 'write', owner: 'b', text: 'B', image: null });
    s.do('b', { type: 'write', owner: 'c', text: 'C', image: null });
    s.refuse('a', { type: 'forceStart' }, 'invalid');
    s.refuse('b', { type: 'forceStart' }, 'notModerator');
    // o moderador não escreve o próprio: o autor dele (c) tem de escrever
    s.refuse('a', { type: 'write', owner: 'a', text: 'A', image: null }, 'invalid');
    s.do('c', { type: 'write', owner: 'a', text: 'A', image: null });
    s.do('a', { type: 'forceStart' });
    expect(s.game.phase).toBe('playing');
  });

  test('forçar começa com a vez da primeira pessoa', () => {
    const s = writing();
    s.do('a', { type: 'write', owner: 'b', text: 'B', image: null });
    s.do('b', { type: 'write', owner: 'c', text: 'C', image: null });
    s.do('c', { type: 'write', owner: 'a', text: 'A', image: null });
    s.do('b', { type: 'ready' });
    const events = s.do('a', { type: 'forceStart' });
    expect(events).toEqual([{ type: 'started' }, { type: 'turn', owner: 'a' }]);
    expect(s.game.phase).toBe('playing');
  });

  test('ações da escrita fora da escrita são recusadas', () => {
    const s = new Sim('a', 'b');
    s.refuse('a', { type: 'write', owner: 'b', text: 'x', image: null }, 'wrongPhase');
    s.refuse('a', { type: 'ready' }, 'wrongPhase');
    s.refuse('a', { type: 'forceStart' }, 'wrongPhase');
  });
});
