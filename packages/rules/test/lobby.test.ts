import { describe, expect, test } from 'bun:test';
import {
  circle,
  cleanPostit,
  createGame,
  derangement,
  POSTIT_MAX,
  TURN_DEFAULT,
  TURN_MAX,
  TURN_MIN,
  TURN_STEP,
} from '../src';
import { lcg, Sim } from './sim';

describe('ajudantes', () => {
  test('o círculo: cada pessoa escreve para a próxima, dando a volta', () => {
    expect(circle(['a', 'b', 'c'])).toEqual({ b: 'a', c: 'b', a: 'c' });
    expect(circle(['a', 'b'])).toEqual({ b: 'a', a: 'b' });
    expect(circle(['a'])).toEqual({ a: 'a' });
    expect(circle([])).toEqual({});
  });

  test('o sorteio nunca põe alguém escrevendo para si, e cada pessoa escreve um só', () => {
    for (let n = 2; n <= 8; n++) {
      const order = Array.from({ length: n }, (_, i) => `m${i + 1}`);
      for (let seed = 1; seed <= 50; seed++) {
        const d = derangement(order, lcg(seed));
        expect(Object.keys(d).sort()).toEqual([...order].sort());
        expect(Object.values(d).sort()).toEqual([...order].sort());
        for (const owner of order) expect(d[owner]).not.toBe(owner);
      }
    }
  });

  test('o sorteio varia com a semente e não é só o círculo', () => {
    const order = ['a', 'b', 'c', 'd', 'e'];
    const seen = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) seen.add(JSON.stringify(derangement(order, lcg(seed))));
    expect(seen.size).toBeGreaterThan(5);
  });

  test('o sorteio não trava com um sorteio viciado', () => {
    for (const rng of [() => 0, () => 0.999999]) {
      const d = derangement(['a', 'b', 'c', 'd'], rng);
      for (const owner of ['a', 'b', 'c', 'd']) expect(d[owner]).not.toBe(owner);
    }
  });

  test('sorteio de uma pessoa só: ela mesma', () => {
    expect(derangement(['a'], lcg(1))).toEqual({ a: 'a' });
  });

  test('texto do post-it: junta espaços, apara e corta', () => {
    expect(cleanPostit('  o  cachorro\n da tia  ')).toBe('o cachorro da tia');
    expect(cleanPostit('x'.repeat(60))).toHaveLength(POSTIT_MAX);
    expect(cleanPostit('   ')).toBe('');
  });
});

describe('lobby', () => {
  test('o jogo nasce no lobby, vazio, com a vez padrão ou a escolhida ao criar a sala', () => {
    const g = createGame();
    expect(g.phase).toBe('lobby');
    expect(g.order).toEqual([]);
    expect(g.postits).toEqual({});
    expect(g.turnMs).toBe(TURN_DEFAULT);
    expect(g.customAuthors).toBe(false);
    expect(createGame({ turnMs: 45_000 }).turnMs).toBe(45_000);
  });

  test('cada pessoa da ordem já tem um post-it vazio no lobby', () => {
    const s = new Sim('a', 'b', 'c');
    const empty = { text: '', image: null, ready: false };
    expect(s.game.postits).toEqual({ a: empty, b: empty, c: empty });
  });

  test('quem entra vai para o fim da ordem e ganha o primeiro personagem livre', () => {
    const s = new Sim('a', 'b', 'c');
    expect(s.game.order).toEqual(['a', 'b', 'c']);
    expect(s.game.characters).toEqual({ a: 0, b: 1, c: 2 });
    s.do('a', { type: 'character', character: 5 });
    s.join('d');
    expect(s.game.characters.d).toBe(0);
  });

  test('personagem ocupado ou fora da faixa é recusado', () => {
    const s = new Sim('a', 'b');
    s.refuse('b', { type: 'character', character: 0 }, 'invalid');
    s.refuse('b', { type: 'character', character: 8 }, 'invalid');
    s.refuse('b', { type: 'character', character: 1.5 }, 'invalid');
  });

  test('o círculo acompanha quem entra e a nova ordem', () => {
    const s = new Sim('a', 'b');
    expect(s.game.authors).toEqual(circle(['a', 'b']));
    s.join('c');
    expect(s.game.authors).toEqual(circle(['a', 'b', 'c']));
    s.do('a', { type: 'order', order: ['c', 'a', 'b'] });
    expect(s.game.order).toEqual(['c', 'a', 'b']);
    expect(s.game.authors).toEqual(circle(['c', 'a', 'b']));
  });

  test('a nova ordem tem de ser uma permutação, e só o moderador reordena', () => {
    const s = new Sim('a', 'b', 'c');
    s.refuse('b', { type: 'order', order: ['c', 'b', 'a'] }, 'notModerator');
    s.refuse('a', { type: 'order', order: ['a', 'b'] }, 'invalid');
    s.refuse('a', { type: 'order', order: ['a', 'b', 'b'] }, 'invalid');
    s.refuse('a', { type: 'order', order: ['a', 'b', 'x'] }, 'invalid');
  });

  test('quem entra depois de sortear volta todo mundo ao círculo', () => {
    const s = new Sim('a', 'b', 'c', 'd');
    s.do('a', { type: 'shuffleAuthors' });
    s.join('e');
    expect(s.game.customAuthors).toBe(false);
    expect(s.game.authors).toEqual(circle(['a', 'b', 'c', 'd', 'e']));
  });

  test('reordenar depois de sortear não desfaz o sorteio', () => {
    const s = new Sim('a', 'b', 'c', 'd');
    s.do('a', { type: 'shuffleAuthors' });
    const drawn = { ...s.game.authors };
    s.do('a', { type: 'order', order: ['d', 'c', 'b', 'a'] });
    expect(s.game.customAuthors).toBe(true);
    expect(s.game.authors).toEqual(drawn);
  });

  test('sortear usa o sorteio de quem chama e ninguém escreve para si', () => {
    const s = new Sim('a', 'b', 'c', 'd', 'e');
    s.do('a', { type: 'shuffleAuthors' });
    expect(s.game.customAuthors).toBe(true);
    for (const o of s.game.order) expect(s.game.authors[o]).not.toBe(o);
    expect(Object.values(s.game.authors).sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
    s.refuse('b', { type: 'shuffleAuthors' }, 'notModerator');
  });

  /** para quem cada um escreve (autor → dono), o avesso de `authors` */
  const targets = (s: Sim) => Object.fromEntries(Object.entries(s.game.authors).map(([owner, author]) => [author, owner]));

  test('o moderador escolhe o alvo de alguém: quem escrevia para o alvo fica com o alvo antigo', () => {
    const s = new Sim('a', 'b', 'c', 'd');
    expect(targets(s)).toEqual({ a: 'b', b: 'c', c: 'd', d: 'a' });
    s.do('a', { type: 'assign', author: 'a', owner: 'd' });
    expect(targets(s)).toEqual({ a: 'd', b: 'c', c: 'b', d: 'a' });
    expect(s.game.customAuthors).toBe(true);
    s.do('a', { type: 'order', order: ['d', 'c', 'b', 'a'] });
    expect(targets(s)).toEqual({ a: 'd', b: 'c', c: 'b', d: 'a' });
  });

  test('se a troca deixaria alguém escrevendo para si, a cadeia é reordenada', () => {
    const s = new Sim('a', 'b', 'c', 'd');
    s.do('a', { type: 'assign', author: 'a', owner: 'c' }); // a→b→c→d vira a→c→b→d
    expect(targets(s)).toEqual({ a: 'c', c: 'b', b: 'd', d: 'a' });
    const three = new Sim('a', 'b', 'c');
    three.do('a', { type: 'assign', author: 'a', owner: 'c' });
    expect(targets(three)).toEqual({ a: 'c', c: 'b', b: 'a' });
    for (const g of [s, three]) for (const o of g.game.order) expect(g.game.authors[o]).not.toBe(o);
  });

  test('escolher o alvo apaga só os post-its cujo autor mudou', () => {
    const s = new Sim('a', 'b', 'c', 'd', 'e');
    for (const [author, owner] of [['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'e'], ['e', 'a']]) s.do(author, { type: 'write', owner, text: owner.toUpperCase(), image: null });
    const events = s.do('a', { type: 'assign', author: 'a', owner: 'e' }); // a↔d trocam de alvo: b e e mudam de autor
    expect(targets(s)).toEqual({ a: 'e', b: 'c', c: 'd', d: 'b', e: 'a' });
    expect(s.game.postits.c.text).toBe('C');
    expect(s.game.postits.d.text).toBe('D');
    expect(s.game.postits.a.text).toBe('A');
    expect(s.game.postits.b.text).toBe('');
    expect(s.game.postits.e.text).toBe('');
    expect(events.filter((e) => e.type === 'cleared').map((e) => (e as { owner: string }).owner).sort()).toEqual(['b', 'e']);
  });

  test('escolher o alvo que já é o dela não muda nada; para si, de fora da turma ou sem ser moderador, recusa', () => {
    const s = new Sim('a', 'b', 'c');
    s.do('b', { type: 'write', owner: 'c', text: 'C', image: null });
    s.do('a', { type: 'assign', author: 'b', owner: 'c' });
    expect(s.game.postits.c.text).toBe('C');
    s.refuse('a', { type: 'assign', author: 'a', owner: 'a' }, 'invalid');
    s.refuse('a', { type: 'assign', author: 'a', owner: 'z' }, 'invalid');
    s.refuse('b', { type: 'assign', author: 'a', owner: 'c' }, 'notModerator');
    const two = new Sim('a', 'b');
    two.do('a', { type: 'assign', author: 'a', owner: 'b' });
    expect(targets(two)).toEqual({ a: 'b', b: 'a' });
    two.start();
    two.refuse('a', { type: 'assign', author: 'a', owner: 'b' }, 'wrongPhase');
  });

  test('tamanho da vez: de 30 s a 3 min, de 15 em 15 s', () => {
    const s = new Sim('a', 'b');
    s.do('a', { type: 'turnMs', ms: TURN_MIN });
    expect(s.game.turnMs).toBe(TURN_MIN);
    s.do('a', { type: 'turnMs', ms: TURN_MAX });
    expect(s.game.turnMs).toBe(TURN_MAX);
    s.do('a', { type: 'turnMs', ms: TURN_MIN + TURN_STEP });
    expect(s.game.turnMs).toBe(45_000);
    s.refuse('a', { type: 'turnMs', ms: TURN_MIN - TURN_STEP }, 'invalid');
    s.refuse('a', { type: 'turnMs', ms: TURN_MAX + TURN_STEP }, 'invalid');
    s.refuse('a', { type: 'turnMs', ms: 50_000 }, 'invalid');
    s.refuse('b', { type: 'turnMs', ms: 90_000 }, 'notModerator');
  });

  test('só moderar tira o moderador da ordem, e voltar põe no fim', () => {
    const s = new Sim('a', 'b', 'c');
    s.do('a', { type: 'onlyModerate', on: true });
    expect(s.game.order).toEqual(['b', 'c']);
    expect(s.game.onlyModerate).toEqual(['a']);
    expect(s.game.authors).toEqual(circle(['b', 'c']));
    s.refuse('a', { type: 'onlyModerate', on: true }, 'invalid');
    s.do('a', { type: 'onlyModerate', on: false });
    expect(s.game.order).toEqual(['b', 'c', 'a']);
    expect(s.game.onlyModerate).toEqual([]);
    expect(s.game.authors).toEqual(circle(['b', 'c', 'a']));
    s.refuse('b', { type: 'onlyModerate', on: true }, 'notModerator');
  });

  test('só moderar depois de sortear volta ao círculo, porque o sorteio deixa de valer', () => {
    const s = new Sim('a', 'b', 'c', 'd');
    s.do('a', { type: 'shuffleAuthors' });
    s.do('a', { type: 'onlyModerate', on: true });
    expect(s.game.customAuthors).toBe(false);
    expect(s.game.authors).toEqual(circle(['b', 'c', 'd']));
  });

  test('ações do lobby fora do lobby são recusadas', () => {
    const s = new Sim('a', 'b');
    s.start();
    s.refuse('a', { type: 'start' }, 'wrongPhase');
    s.refuse('a', { type: 'shuffleAuthors' }, 'wrongPhase');
    s.refuse('a', { type: 'turnMs', ms: 90_000 }, 'wrongPhase');
    s.refuse('a', { type: 'onlyModerate', on: true }, 'wrongPhase');
    s.refuse('b', { type: 'write', owner: 'a', text: 'x', image: null }, 'wrongPhase');
    s.refuse('b', { type: 'ready' }, 'wrongPhase');
    s.do('a', { type: 'endGame' });
    s.refuse('a', { type: 'order', order: ['b', 'a'] }, 'wrongPhase');
    s.refuse('b', { type: 'write', owner: 'a', text: 'x', image: null }, 'wrongPhase');
  });

  test('quem entra fora do lobby fica fantasma, com personagem, e os autores não mudam', () => {
    const s = new Sim('a', 'b');
    s.start();
    const before = structuredClone(s.game.postits);
    s.join('c');
    expect(s.game.order).toEqual(['a', 'b']);
    expect(s.game.characters.c).toBe(2);
    expect(s.game.authors).toEqual(circle(['a', 'b']));
    expect(s.game.postits).toEqual(before);
  });

  test('ninguém muda o estado que recebeu', () => {
    const s = new Sim('a', 'b', 'c');
    const before = structuredClone(s.game);
    const frozen = s.game;
    s.do('b', { type: 'write', owner: 'c', text: 'C', image: null });
    s.do('a', { type: 'shuffleAuthors' });
    expect(frozen).toEqual(before);
  });
});
