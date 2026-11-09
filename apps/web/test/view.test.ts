import { describe, expect, test } from 'bun:test';
import { CHARACTERS, TURN_MAX, TURN_MIN, TURN_STEP } from '@guess/rules';
import { characterToClaim, clockText, countdown, devTools, moveBefore, roomView, turnOptions } from '../src/lib/room/view';
import { member, postit, snapshot } from './snapshots';

/** Escrita com o círculo Zé → Ana → Bia → Zé (dono → autor: Ana é escrita por Zé, e assim por diante). */
const circle = { m2: 'm1', m3: 'm2', m1: 'm3' };

describe('quem sou eu na sala', () => {
  test('eu, moderador e jogador', () => {
    const v = roomView(snapshot());
    expect(v.me?.nickname).toBe('Zé');
    expect(v.isModerator).toBe(true);
    expect(v.isPlayer).toBe(true);
    expect(v.isGhost).toBe(false);
  });

  test('visitante ainda sem apelido não é ninguém', () => {
    const v = roomView(snapshot({ you: null }));
    expect(v.me).toBeNull();
    expect(v.isModerator).toBe(false);
    expect(v.isPlayer).toBe(false);
  });

  test('fantasma: fora da ordem, listado à parte', () => {
    const members = [member('m1', 'Zé'), member('m2', 'Ana'), member('m3', 'Bia', { ghost: true })];
    const v = roomView(snapshot({ members, you: 'm3', phase: 'playing' }));
    expect(v.isGhost).toBe(true);
    expect(v.isPlayer).toBe(false);
    expect(v.isModerator).toBe(false);
    expect(v.players.map((p) => p.id)).toEqual(['m1', 'm2']);
    expect(v.ghosts.map((p) => p.id)).toEqual(['m3']);
  });

  test('os jogadores seguem a ordem das vezes, não a de chegada', () => {
    const v = roomView(snapshot({ order: ['m3', 'm1', 'm2'] }));
    expect(v.players.map((p) => p.nickname)).toEqual(['Bia', 'Zé', 'Ana']);
  });

  test('quem caiu', () => {
    const members = [member('m1', 'Zé'), member('m2', 'Ana', { connected: false }), member('m3', 'Bia')];
    expect(roomView(snapshot({ members })).offline.map((p) => p.id)).toEqual(['m2']);
  });
});

describe('lobby', () => {
  test('o círculo aparece como "X escreve para Y", na ordem das vezes', () => {
    const v = roomView(snapshot({ authors: circle }));
    expect(v.assignments.map((a) => [a.author?.nickname, a.owner.nickname])).toEqual([['Bia', 'Zé'], ['Zé', 'Ana'], ['Ana', 'Bia']]);
  });

  test('os oito personagens, com quem pegou cada um', () => {
    const members = [member('m1', 'Zé', { character: 0 }), member('m2', 'Ana', { character: 5 }), member('m3', 'Bia')];
    const v = roomView(snapshot({ members }));
    expect(v.characters).toHaveLength(CHARACTERS);
    expect(v.characters[0]?.id).toBe('m1');
    expect(v.characters[5]?.id).toBe('m2');
    expect(v.characters.filter(Boolean)).toHaveLength(2);
  });

  test('o moderador começa a escrita com pelo menos dois jogadores', () => {
    expect(roomView(snapshot()).canStartWriting).toBe(true);
    expect(roomView(snapshot({ order: ['m1'] })).canStartWriting).toBe(false);
    expect(roomView(snapshot({ you: 'm2' })).canStartWriting).toBe(false);
    expect(roomView(snapshot({ phase: 'writing' })).canStartWriting).toBe(false);
  });
});

describe('escrita', () => {
  const writing = (extra = {}) => snapshot({
    phase: 'writing', authors: circle,
    postits: { m1: postit('m3', { text: null }), m2: postit('m1', { text: 'Pelé' }), m3: postit('m2', { text: 'Xuxa', ready: true }) },
    ...extra,
  });

  test('moderador sabe quando o próprio post-it, que não vê, ainda está vazio', () => {
    const empty = roomView(writing({ moderator: 'm1' }));
    expect(empty.postits.find((p) => p.mine)?.progress).toBe('empty');
    expect(empty.ownPostitEmpty).toBe(true);
    const written = roomView(writing({ moderator: 'm1', postits: { m1: postit('m3', { text: null, written: true }), m2: postit('m1', { text: 'Pelé' }), m3: postit('m2', { text: 'Xuxa', ready: true }) } }));
    expect(written.postits.find((p) => p.mine)?.progress).toBe('writing');
    expect(written.ownPostitEmpty).toBe(false);
    expect(roomView(writing({ moderator: 'm2' })).ownPostitEmpty).toBe(false);
  });

  test('escrevo para o dono de quem sou autor, e vejo o post-it como está', () => {
    const v = roomView(writing());
    expect(v.writeFor?.owner.nickname).toBe('Ana');
    expect(v.writeFor?.postit.text).toBe('Pelé');
    expect(v.writeFor?.progress).toBe('writing');
  });

  test('o estado do post-it que escrevo: vazio, escrevendo, pronto', () => {
    expect(roomView(writing({ postits: { m2: postit('m1') } })).writeFor?.progress).toBe('empty');
    expect(roomView(writing({ postits: { m2: postit('m1', { text: '', image: '/api/rooms/ABCD/images/abcdefabcdefabcd' }) } })).writeFor?.progress).toBe('writing');
    expect(roomView(writing({ postits: { m2: postit('m1', { text: 'Pelé', ready: true }) } })).writeFor?.progress).toBe('ready');
  });

  test('fantasma não escreve para ninguém', () => {
    const members = [member('m1', 'Zé'), member('m2', 'Ana'), member('m3', 'Bia'), member('m4', 'Edu', { ghost: true })];
    expect(roomView(writing({ members, you: 'm4' })).writeFor).toBeNull();
  });

  test('o meu post-it fica escondido até ser revelado; o dos outros aparece ao vivo', () => {
    const v = roomView(writing());
    const mine = v.postits.find((p) => p.owner.id === 'm1')!;
    expect(mine.mine).toBe(true);
    expect(mine.hidden).toBe(true);
    expect(mine.text).toBeNull();
    expect(v.postits.find((p) => p.owner.id === 'm2')!.text).toBe('Pelé');
    expect(v.postits.map((p) => p.owner.id)).toEqual(['m1', 'm2', 'm3']);
    expect(v.postits.find((p) => p.owner.id === 'm3')!.author?.nickname).toBe('Ana');
  });

  test('quem está pronto', () => {
    const v = roomView(writing());
    expect(v.readyCount).toBe(1);
    expect(v.postits.filter((p) => p.ready).map((p) => p.owner.id)).toEqual(['m3']);
  });

  test('o moderador ganha um editor para post-it sem autor ou sem texto, menos o próprio e o que já escreve', () => {
    const members = [member('m1', 'Zé'), member('m2', 'Ana'), member('m3', 'Bia'), member('m4', 'Edu')];
    const v = roomView(writing({
      members,
      authors: { m2: 'm1', m3: 'm2', m4: 'm3', m1: 'm4' },
      postits: { m1: postit('m4', { text: null }), m2: postit('m1'), m3: postit(null, { text: 'Xuxa' }), m4: postit('m3') },
    }));
    expect(v.moderatorEditors.map((p) => p.owner.id)).toEqual(['m3', 'm4']);
    expect(roomView(writing({ you: 'm2' })).moderatorEditors).toEqual([]);
  });
});

describe('jogo', () => {
  const playing = (extra = {}) => snapshot({
    phase: 'playing', authors: circle,
    postits: { m1: postit('m3', { text: null, ready: true }), m2: postit('m1', { text: 'Pelé', ready: true }), m3: postit('m2', { text: 'Xuxa', ready: true }) },
    turn: { owner: 'm1', left: 42_000, running: true },
    ...extra,
  });

  test('na minha vez posso dizer Acertei, passar e desistir', () => {
    const v = roomView(playing());
    expect(v.turn?.owner.id).toBe('m1');
    expect(v.turn?.mine).toBe(true);
    expect(v.canClaim).toBe(true);
    expect(v.canSkip).toBe(true);
    expect(v.canGiveUp).toBe(true);
  });

  test('fora da minha vez só desisto', () => {
    const v = roomView(playing({ you: 'm2', moderator: 'm1' }));
    expect(v.turn?.mine).toBe(false);
    expect(v.canClaim).toBe(false);
    expect(v.canSkip).toBe(false);
    expect(v.canGiveUp).toBe(true);
  });

  test('com o relógio parado (pausa ou votação) não peço Acertei', () => {
    expect(roomView(playing({ paused: true, turn: { owner: 'm1', left: 42_000, running: false } })).canClaim).toBe(false);
    const voting = roomView(playing({ turn: { owner: 'm1', left: 42_000, running: false }, vote: { claimer: 'm1', voters: ['m2', 'm3'], voted: [], left: 15_000, yours: null } }));
    expect(voting.canClaim).toBe(false);
    expect(voting.canSkip).toBe(false);
  });

  test('quem já acertou ou desistiu não desiste de novo; fantasma não desiste', () => {
    expect(roomView(playing({ got: ['m1'] })).canGiveUp).toBe(false);
    expect(roomView(playing({ gaveUp: ['m1'] })).canGiveUp).toBe(false);
    const members = [member('m1', 'Zé'), member('m2', 'Ana'), member('m3', 'Bia'), member('m4', 'Edu', { ghost: true })];
    expect(roomView(playing({ members, you: 'm4' })).canGiveUp).toBe(false);
    expect(roomView(snapshot()).canGiveUp).toBe(false); // lobby
  });

  test('o moderador passa a vez de quem for, menos com votação aberta', () => {
    const v = roomView(playing({ turn: { owner: 'm2', left: 1000, running: true } }));
    expect(v.canSkip).toBe(false);
    expect(v.moderatorCanSkip).toBe(true);
    expect(roomView(playing({ vote: { claimer: 'm1', voters: ['m2'], voted: [], left: 1, yours: null } })).moderatorCanSkip).toBe(false);
    expect(roomView(playing({ you: 'm2' })).moderatorCanSkip).toBe(false);
  });

  test('a vez em destaque no post-it de quem pergunta', () => {
    const v = roomView(playing({ turn: { owner: 'm2', left: 1000, running: true } }));
    expect(v.postits.filter((p) => p.turn).map((p) => p.owner.id)).toEqual(['m2']);
  });

  test('votação: quem pode votar vota uma vez; quem pediu e os fantasmas esperam', () => {
    const vote = { claimer: 'm1', voters: ['m2', 'm3'], voted: ['m3'], left: 9_000, yours: null };
    const asAna = roomView(playing({ you: 'm2', vote }));
    expect(asAna.vote?.claimer.nickname).toBe('Zé');
    expect(asAna.vote?.canVote).toBe(true);
    expect(asAna.vote?.waiting).toBe(false);
    expect(asAna.vote?.voters.map((x) => [x.member.id, x.voted])).toEqual([['m2', false], ['m3', true]]);

    const asBia = roomView(playing({ you: 'm3', vote: { ...vote, yours: true } }));
    expect(asBia.vote?.canVote).toBe(false);
    expect(asBia.vote?.voted).toBe(true);
    expect(asBia.vote?.yours).toBe(true);

    const asZe = roomView(playing({ vote }));
    expect(asZe.vote?.mine).toBe(true);
    expect(asZe.vote?.canVote).toBe(false);
    expect(asZe.vote?.waiting).toBe(true);

    const members = [member('m1', 'Zé'), member('m2', 'Ana'), member('m3', 'Bia'), member('m4', 'Edu', { ghost: true })];
    const asGhost = roomView(playing({ members, you: 'm4', vote }));
    expect(asGhost.vote?.canVote).toBe(false);
    expect(asGhost.vote?.waiting).toBe(true);
  });

  test('revelado, o meu post-it aparece', () => {
    const v = roomView(playing({ got: ['m1'], postits: { m1: postit('m3', { text: 'Pelé', ready: true, revealed: true }) } }));
    const mine = v.postits.find((p) => p.mine)!;
    expect(mine.hidden).toBe(false);
    expect(mine.text).toBe('Pelé');
    expect(mine.status).toBe('got');
  });

  test('ranking: quem acertou em ordem, depois quem desistiu', () => {
    const members = [member('m1', 'Zé'), member('m2', 'Ana'), member('m3', 'Bia'), member('m4', 'Edu')];
    const postits = { m1: postit('m4', { text: 'Pelé', revealed: true }), m2: postit('m1', { text: 'Xuxa' }), m3: postit('m2', { text: 'Didi', revealed: true }), m4: postit('m3', { text: 'Gugu', revealed: true }) };
    const v = roomView(playing({ members, postits, got: ['m3', 'm1'], gaveUp: ['m4'] }));
    expect(v.ranking.map((r) => [r.place, r.member.nickname, r.gaveUp])).toEqual([[1, 'Bia', false], [2, 'Zé', false], [3, 'Edu', true]]);
    expect(v.postits.find((p) => p.owner.id === 'm2')!.status).toBe('playing');
    expect(v.postits.find((p) => p.owner.id === 'm4')!.status).toBe('gaveUp');
    expect(v.done).toBe(true);
  });

  test('no fim todo post-it chega revelado', () => {
    const v = roomView(playing({ phase: 'ended', turn: null, postits: { m1: postit('m3', { text: 'Pelé', ready: true, revealed: true }) } }));
    expect(v.postits.every((p) => !p.hidden)).toBe(true);
    expect(v.canGiveUp).toBe(false);
  });
});

describe('relógio', () => {
  test('conta para baixo a partir de quando o snapshot chegou, sem passar de zero', () => {
    expect(countdown(42_000, 1000, 1000)).toBe(42_000);
    expect(countdown(42_000, 1000, 3500)).toBe(39_500);
    expect(countdown(1000, 0, 5000)).toBe(0);
  });

  test('parado (pausa ou votação), fica no que sobrou', () => {
    expect(countdown(42_000, 1000, 9000, false)).toBe(42_000);
  });

  test('mostra minutos e segundos, arredondando para cima', () => {
    expect(clockText(60_000)).toBe('1:00');
    expect(clockText(59_001)).toBe('1:00');
    expect(clockText(59_000)).toBe('0:59');
    expect(clockText(5_000)).toBe('0:05');
    expect(clockText(0)).toBe('0:00');
    expect(clockText(180_000)).toBe('3:00');
  });

  test('o tamanho da vez: de 30 s a 3 min, de 15 em 15 s', () => {
    const opts = turnOptions();
    expect(opts[0]).toBe(TURN_MIN);
    expect(opts.at(-1)).toBe(TURN_MAX);
    expect(opts).toHaveLength((TURN_MAX - TURN_MIN) / TURN_STEP + 1);
    expect(opts.map(clockText).slice(0, 3)).toEqual(['0:30', '0:45', '1:00']);
  });
});

describe('reordenar a turma', () => {
  test('arrastar alguém para antes de outra pessoa', () => {
    expect(moveBefore(['a', 'b', 'c', 'd'], 'd', 'b')).toEqual(['a', 'd', 'b', 'c']);
    expect(moveBefore(['a', 'b', 'c', 'd'], 'a', 'c')).toEqual(['b', 'a', 'c', 'd']);
  });

  test('soltar no fim', () => {
    expect(moveBefore(['a', 'b', 'c'], 'a', null)).toEqual(['b', 'c', 'a']);
  });

  test('soltar em si mesmo ou com id desconhecido não muda nada', () => {
    expect(moveBefore(['a', 'b', 'c'], 'b', 'b')).toEqual(['a', 'b', 'c']);
    expect(moveBefore(['a', 'b', 'c'], 'x', 'b')).toEqual(['a', 'b', 'c']);
  });
});

describe('personagem lembrado', () => {
  test('ao entrar, pede o último personagem do navegador se estiver livre', () => {
    expect(characterToClaim(roomView(snapshot()), 4)).toBe(4);
  });

  test('não pede se é o que já tenho, se outra pessoa pegou, se não lembro nenhum ou se ainda não entrei', () => {
    const members = [member('m1', 'Zé', { character: 4 }), member('m2', 'Ana', { character: 2 }), member('m3', 'Bia')];
    expect(characterToClaim(roomView(snapshot({ members })), 4)).toBeNull();
    expect(characterToClaim(roomView(snapshot({ members })), 2)).toBeNull();
    expect(characterToClaim(roomView(snapshot()), null)).toBeNull();
    expect(characterToClaim(roomView(snapshot()), CHARACTERS)).toBeNull();
    expect(characterToClaim(roomView(snapshot({ you: null })), 4)).toBeNull();
  });
});

describe('ferramentas de desenvolvimento', () => {
  test('só em localhost ou com ?dev, e só se o servidor aceita jogadores falsos', () => {
    expect(devTools({ hostname: 'localhost', search: '' }, true)).toBe(true);
    expect(devTools({ hostname: '127.0.0.1', search: '' }, true)).toBe(true);
    expect(devTools({ hostname: 'guess.passoca.dev', search: '?dev' }, true)).toBe(true);
    expect(devTools({ hostname: 'guess.passoca.dev', search: '?x=1&dev' }, true)).toBe(true);
    expect(devTools({ hostname: 'guess.passoca.dev', search: '' }, true)).toBe(false);
    expect(devTools({ hostname: 'localhost', search: '?dev' }, false)).toBe(false);
  });
});
