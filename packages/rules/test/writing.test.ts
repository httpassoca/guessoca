import { describe, expect, test } from 'bun:test';
import { circle, type Postit } from '../src';
import { Sim } from './sim';

const EMPTY: Postit = { text: '', image: null, ready: false };

/** a, b, c no lobby, no círculo (b←a, c←b, a←c); a é o moderador */
function lobby(...ids: string[]) {
  return new Sim(...(ids.length ? ids : ['a', 'b', 'c']));
}

/** cada autor escreve o post-it do seu dono, com imagem, sem apertar "Pronto"; o primeiro dono também fica pronto */
function fill(s: Sim) {
  for (const owner of s.game.order) s.do(s.game.authors[owner], { type: 'write', owner, text: `para ${owner}`, image: `img-${owner}` });
  const first = s.game.order[0];
  s.do(s.game.authors[first], { type: 'ready' });
}

/**
 * Depois de mudar os autores: o post-it de quem continua com o mesmo autor fica como estava; o de quem mudou de autor
 * (ou é novo) está vazio, e só os que tinham alguma coisa geram `cleared`. `events` null: quem entrou (`addMember` não
 * devolve eventos).
 */
function expectCleared(s: Sim, before: { authors: Record<string, string>; postits: Record<string, Postit> }, events: unknown[] | null) {
  const cleared: string[] = [];
  expect(Object.keys(s.game.postits).sort()).toEqual([...s.game.order].sort());
  for (const owner of s.game.order) {
    if (before.authors[owner] === s.game.authors[owner]) {
      expect(s.game.postits[owner]).toEqual(before.postits[owner]);
    } else {
      expect(s.game.postits[owner]).toEqual(EMPTY);
      const old = before.postits[owner];
      if (old && (old.text !== '' || old.image !== null)) cleared.push(owner);
    }
  }
  if (events) expect(events.filter((e) => (e as { type: string }).type === 'cleared')).toEqual(cleared.map((owner) => ({ type: 'cleared', owner })));
  return cleared;
}

const snapshot = (s: Sim) => structuredClone({ authors: s.game.authors, postits: s.game.postits });

describe('escrita no lobby', () => {
  test('o autor escreve o post-it do dono, com o texto limpo', () => {
    const s = lobby();
    s.do('b', { type: 'write', owner: 'c', text: '  o cachorro   da tia  ', image: 'img1' });
    expect(s.game.postits.c).toEqual({ text: 'o cachorro da tia', image: 'img1', ready: false });
    s.do('b', { type: 'write', owner: 'c', text: 'Neide', image: null });
    expect(s.game.postits.c).toEqual({ text: 'Neide', image: null, ready: false });
    expect(s.game.phase).toBe('lobby');
  });

  test('quem não é o autor não escreve; o dono nunca escreve o próprio', () => {
    const s = lobby();
    s.refuse('c', { type: 'write', owner: 'c', text: 'eu', image: null }, 'invalid');
    s.refuse('a', { type: 'write', owner: 'a', text: 'eu', image: null }, 'invalid');
    s.refuse('c', { type: 'write', owner: 'b', text: 'x', image: null }, 'invalid');
    s.refuse('b', { type: 'write', owner: 'x', text: 'x', image: null }, 'invalid');
  });

  test('o moderador escreve para qualquer dono menos ele mesmo', () => {
    const s = lobby();
    s.do('a', { type: 'write', owner: 'c', text: 'pelo moderador', image: null });
    expect(s.game.postits.c.text).toBe('pelo moderador');
  });

  test('quem só modera escreve qualquer post-it, mas não fica pronto por ninguém', () => {
    const s = lobby();
    s.do('a', { type: 'onlyModerate', on: true });
    s.do('a', { type: 'write', owner: 'b', text: 'B', image: null });
    expect(s.game.postits.b.text).toBe('B');
    s.refuse('a', { type: 'ready' }, 'invalid');
  });

  test('sozinho na ordem, o círculo põe a pessoa escrevendo para si: mesmo assim ela não escreve o próprio', () => {
    const s = lobby('a', 'b');
    s.do('a', { type: 'onlyModerate', on: true });
    expect(s.game.authors).toEqual({ b: 'b' });
    s.refuse('b', { type: 'write', owner: 'b', text: 'eu', image: null }, 'invalid');
    s.refuse('b', { type: 'ready' }, 'invalid');
  });

  test('pronto precisa de texto e é definitivo', () => {
    const s = lobby();
    s.refuse('b', { type: 'ready' }, 'invalid');
    s.do('b', { type: 'write', owner: 'c', text: '   ', image: 'img' });
    s.refuse('b', { type: 'ready' }, 'invalid');
    s.do('b', { type: 'write', owner: 'c', text: 'Pelé', image: null });
    expect(s.do('b', { type: 'ready' })).toEqual([]);
    expect(s.game.postits.c.ready).toBe(true);
    s.refuse('b', { type: 'ready' }, 'invalid');
    s.refuse('b', { type: 'write', owner: 'c', text: 'outro', image: null }, 'invalid');
    // desfazer o pronto: só o autor, só de um post-it pronto; o texto fica e volta a dar para escrever
    s.refuse('a', { type: 'unready' }, 'invalid');
    expect(s.do('b', { type: 'unready' })).toEqual([]);
    expect(s.game.postits.c).toEqual({ text: 'Pelé', image: null, ready: false });
    s.refuse('b', { type: 'unready' }, 'invalid');
    s.do('b', { type: 'write', owner: 'c', text: 'Garrincha', image: null });
    s.do('b', { type: 'ready' });
    expect(s.game.postits.c).toEqual({ text: 'Garrincha', image: null, ready: true });
    s.refuse('a', { type: 'write', owner: 'c', text: 'outro', image: null }, 'invalid');
  });

  test('todos prontos não começa o jogo sozinho: o moderador começa', () => {
    const s = lobby();
    s.writeAll();
    expect(Object.values(s.game.postits).every((p) => p.ready)).toBe(true);
    expect(s.game.phase).toBe('lobby');
    expect(s.settle()).toEqual([]);
    expect(s.game.phase).toBe('lobby');
    expect(s.game.turn).toBeNull();
  });
});

describe('o post-it é apagado quando o autor muda', () => {
  test('alguém entra: o post-it de quem passa a ter outro autor é apagado; os outros ficam; o novo ganha um vazio', () => {
    const s = lobby();
    fill(s);
    const before = snapshot(s);
    s.events = [];
    s.join('d'); // círculo a, b, c, d: a passa a ser escrito por d; b e c continuam
    expect(s.game.postits.a).toEqual(EMPTY);
    expect(s.game.postits.b).toEqual({ text: 'para b', image: 'img-b', ready: false });
    expect(s.game.postits.c).toEqual({ text: 'para c', image: 'img-c', ready: false });
    expect(s.game.postits.d).toEqual(EMPTY);
    expect(expectCleared(s, before, null)).toEqual(['a']);
  });

  test('alguém é expulso: o post-it dele some e o de quem perdeu o autor é apagado', () => {
    const s = lobby('a', 'b', 'c', 'd');
    fill(s);
    const before = snapshot(s);
    const events = s.kick('c'); // círculo a, b, d: d passa a ser escrito por b
    expect(s.game.postits.c).toBeUndefined();
    expect(s.game.postits.d).toEqual(EMPTY);
    expect(s.game.postits.b).toEqual(before.postits.b);
    expect(expectCleared(s, before, events)).toEqual(['d']);
  });

  test('a ordem muda: só os post-its cujo autor mudou são apagados', () => {
    const s = lobby('a', 'b', 'c', 'd');
    fill(s);
    const before = snapshot(s);
    const events = s.do('a', { type: 'order', order: ['a', 'b', 'd', 'c'] }); // b←a fica; d←b, c←d, a←c mudam
    expect(s.game.authors).toEqual(circle(['a', 'b', 'd', 'c']));
    expect(s.game.postits.b).toEqual(before.postits.b);
    expect(expectCleared(s, before, events).sort()).toEqual(['a', 'c', 'd']);
  });

  test('a ordem muda depois de sortear: o sorteio vale, nenhum autor muda, nada é apagado', () => {
    const s = lobby('a', 'b', 'c', 'd');
    s.do('a', { type: 'shuffleAuthors' });
    fill(s);
    const before = snapshot(s);
    const events = s.do('a', { type: 'order', order: ['d', 'c', 'b', 'a'] });
    expect(events).toEqual([]);
    expect(s.game.postits).toEqual(before.postits);
  });

  test('só moderar e voltar a jogar: o círculo muda e apaga o que mudou de autor', () => {
    const s = lobby('a', 'b', 'c', 'd');
    fill(s);
    let before = snapshot(s);
    let events = s.do('a', { type: 'onlyModerate', on: true }); // círculo b, c, d: b passa a ser escrito por d
    expect(s.game.postits.a).toBeUndefined();
    expect(expectCleared(s, before, events)).toEqual(['b']);
    fill(s);
    before = snapshot(s);
    events = s.do('a', { type: 'onlyModerate', on: false }); // círculo b, c, d, a: b passa a ser escrito por a
    expect(s.game.postits.a).toEqual(EMPTY);
    expect(expectCleared(s, before, events)).toEqual(['b']);
  });

  test('sortear apaga os post-its cujo autor mudou e mantém os outros', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const s = lobby('a', 'b', 'c', 'd', 'e');
      for (let i = 0; i < seed; i++) s.rng();
      fill(s);
      const before = snapshot(s);
      const events = s.do('a', { type: 'shuffleAuthors' });
      expectCleared(s, before, events);
    }
  });

  test('o sorteio deixa de valer e volta ao círculo: apaga o que mudou de autor', () => {
    const s = lobby('a', 'b', 'c', 'd');
    s.do('a', { type: 'shuffleAuthors' });
    fill(s);
    const before = snapshot(s);
    const events = s.kick('d');
    expect(s.game.customAuthors).toBe(false);
    expect(s.game.authors).toEqual(circle(['a', 'b', 'c']));
    expectCleared(s, before, events);
  });

  test('um post-it ainda vazio que muda de autor não gera evento', () => {
    const s = lobby('a', 'b', 'c', 'd');
    const events = s.do('a', { type: 'order', order: ['d', 'c', 'b', 'a'] });
    expect(events).toEqual([]);
    expect(Object.values(s.game.postits)).toEqual([EMPTY, EMPTY, EMPTY, EMPTY]);
  });

  test('um autor novo pode escrever e ficar pronto no post-it apagado', () => {
    const s = lobby();
    fill(s);
    s.join('d');
    s.do('d', { type: 'write', owner: 'a', text: 'novo', image: null });
    s.do('d', { type: 'ready' });
    expect(s.game.postits.a).toEqual({ text: 'novo', image: null, ready: true });
    s.refuse('c', { type: 'write', owner: 'a', text: 'velho', image: null }, 'invalid');
  });
});

describe('começar', () => {
  test('o moderador começa com todo post-it escrito, mesmo sem todos prontos', () => {
    const s = lobby();
    s.do('a', { type: 'write', owner: 'b', text: 'B', image: null });
    s.do('b', { type: 'write', owner: 'c', text: 'C', image: null });
    s.do('c', { type: 'write', owner: 'a', text: 'A', image: null });
    s.do('b', { type: 'ready' });
    const events = s.do('a', { type: 'start' });
    expect(events).toEqual([{ type: 'started' }, { type: 'turn', owner: 'a' }]);
    expect(s.game.phase).toBe('playing');
    expect(s.game.turn).toEqual({ owner: 'a', left: s.game.turnMs, since: s.now });
    expect(s.game.postits.b).toEqual({ text: 'B', image: null, ready: false });
  });

  test('só o moderador começa', () => {
    const s = lobby();
    s.writeAll();
    s.refuse('b', { type: 'start' }, 'notModerator');
  });

  test('com algum post-it vazio, não começa; o moderador escreve o que falta', () => {
    const s = lobby();
    s.do('a', { type: 'write', owner: 'b', text: 'B', image: null });
    s.do('b', { type: 'write', owner: 'c', text: 'C', image: 'só-imagem' });
    s.refuse('a', { type: 'start' }, 'invalid');
    // o moderador não escreve o próprio: o autor dele (c) tem de escrever
    s.refuse('a', { type: 'write', owner: 'a', text: 'A', image: null }, 'invalid');
    s.do('c', { type: 'write', owner: 'a', text: 'A', image: null });
    s.do('a', { type: 'start' });
    expect(s.game.phase).toBe('playing');
  });

  test('precisa de pelo menos duas pessoas na ordem', () => {
    const s = lobby('a', 'b');
    s.writeAll();
    s.do('a', { type: 'onlyModerate', on: true });
    expect(s.game.order).toEqual(['b']);
    s.refuse('a', { type: 'start' }, 'invalid');
    s.do('a', { type: 'onlyModerate', on: false });
    s.writeAll();
    s.do('a', { type: 'start' });
    expect(s.game.phase).toBe('playing');
  });

  test('a primeira vez pula quem está offline', () => {
    const s = lobby();
    s.writeAll();
    s.drop('a');
    s.do('a', { type: 'start' });
    expect(s.owner).toBe('b');
  });

  test('do começo em diante, os autores ficam congelados', () => {
    const s = lobby('a', 'b', 'c', 'd');
    s.start();
    const before = structuredClone({ authors: s.game.authors, postits: s.game.postits });
    s.do('a', { type: 'order', order: ['d', 'c', 'b', 'a'] });
    s.join('e');
    expect(s.game.authors).toEqual(before.authors);
    expect(s.game.postits).toEqual(before.postits);
  });
});
