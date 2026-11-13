import { describe, expect, test } from 'bun:test';
import { CHAT_MAX } from '@guess/protocol';
import { CHARACTERS } from '@guess/rules';
import { PERSONAS } from '../src/personas';
import { language, leaks, redact, TalkBrain, tidy, unsafe, type Figure, type Scene, type TalkRequest } from '../src/talk';

/** um sorteio que devolve sempre o mesmo número */
const fixed = (n: number) => () => n;
const SANJI = 28, KRATOS = 2, MIKU = 21;

const person = (id: string, name: string, character: number, x: number, extra: Partial<Figure> = {}): Figure => ({ id, name, character, x, z: 40, bot: false, ...extra });
const bot = (id: string, character: number, x: number, extra: Partial<Figure> = {}): Figure => ({ id, name: PERSONAS[character].name, character, x, z: 40, bot: true, ...extra });

function scene(figures: Figure[], extra: Partial<Scene> = {}): Scene {
  return { playing: true, turn: null, claim: null, paused: false, figures, ...extra };
}

/** um cérebro em que todo bot fala (`chance` 1), com o Sanji (b1) perto da Ana e o Kratos (b2) longe */
function setup(opts: { chance?: number; rng?: () => number } = {}) {
  const brain = new TalkBrain(opts.rng ?? fixed(0.5), { chance: opts.chance ?? 1 });
  const figures = [person('m1', 'Ana', MIKU, 100), person('m2', 'Beto', KRATOS, 900), bot('b1', SANJI, 130), bot('b2', KRATOS, 1400)];
  const s = scene(figures);
  brain.roster([{ id: 'b1', character: SANJI, boss: false }, { id: 'b2', character: KRATOS, boss: false }], 0);
  return { brain, s, figures };
}

/** pede até sair um pedido (ou o tempo acabar), andando de 250 em 250 ms */
function ask(brain: TalkBrain, s: Scene, from: number, until = from + 15_000): TalkRequest | null {
  for (let t = from; t <= until; t += 250) { const r = brain.next(t, () => s); if (r) return r; }
  return null;
}
const text = (r: TalkRequest) => r.messages.map((m) => m.content).join('\n');

describe('personas', () => {
  test('um retrato por personagem, com nome, jeito e exemplos que cabem num balão', () => {
    expect(PERSONAS).toHaveLength(CHARACTERS);
    for (const p of PERSONAS) {
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.who.length).toBeGreaterThan(20);
      expect(p.tone.length).toBeGreaterThan(10);
      expect(p.lines.length).toBeGreaterThanOrEqual(2);
      for (const l of p.lines) expect([...l].length).toBeLessThanOrEqual(CHAT_MAX);
      for (const a of p.aliases) expect(a).toBe(a.toLowerCase().normalize('NFD').replace(/\p{M}/gu, ''));
    }
  });
});

describe('cérebro da fala: quem fala', () => {
  test('cada bot sorteia uma vez, ao chegar, se fala: 30% por padrão', () => {
    const quiet = new TalkBrain(fixed(0.31));
    quiet.roster([{ id: 'b1', character: SANJI, boss: false }], 0);
    expect(quiet.talkable('b1')).toBe(false);
    const chatty = new TalkBrain(fixed(0.29));
    chatty.roster([{ id: 'b1', character: SANJI, boss: true }], 0);
    expect(chatty.talkable('b1')).toBe(true);
  });

  test('bot que não fala nunca recebe pedido, nem chamado pelo nome', () => {
    const { brain, s } = setup({ chance: 0 });
    brain.hear({ type: 'chat', from: 'm1', text: 'oi Sanji, tudo bem?' }, 0, s);
    expect(ask(brain, s, 0)).toBeNull();
  });

  test('chamado pelo nome (sem acento, qualquer caixa), responde: pedido de resposta com o chat e o retrato dele', () => {
    const { brain, s } = setup();
    brain.hear({ type: 'chat', from: 'm2', text: 'ô KRATÓS, vem cá' }, 0, s);
    const r = ask(brain, s, 0)!;
    expect(r.bot).toBe('b2');
    expect(r.priority).toBe('reply');
    expect(text(r)).toContain('ô KRATÓS, vem cá');
    expect(text(r)).toContain(PERSONAS[KRATOS].who);
    expect(text(r)).toContain('Beto');
  });

  test('sem nome, quem fala perto de um bot às vezes ganha resposta dele; longe, não', () => {
    const near = setup({ rng: fixed(0.1) });
    near.brain.hear({ type: 'chat', from: 'm1', text: 'que fome' }, 0, near.s);
    // até 2,5 s: antes de os dois anunciarem a chegada (o mesmo sorteio baixo os faria falar)
    expect(ask(near.brain, near.s, 0, 2500)?.bot).toBe('b1');
    const far = setup({ rng: fixed(0.1) });
    far.brain.hear({ type: 'chat', from: 'm2', text: 'que fome' }, 0, far.s);
    expect(ask(far.brain, far.s, 0, 2500)).toBeNull();
  });

  test('empurrado por uma pessoa, reage a ela', () => {
    const { brain, s } = setup({ rng: fixed(0.1) });
    brain.hear({ type: 'shoved', bot: 'b1', by: 'm1' }, 0, s);
    const r = ask(brain, s, 0)!;
    expect(r.bot).toBe('b1');
    expect(r.priority).toBe('event');
    expect(text(r)).toMatch(/Ana.*empurrou você/);
  });

  test('o jogo andar (alguém acertou) faz um bot comentar, com o nome de quem acertou', () => {
    const { brain, s } = setup({ rng: fixed(0.1) });
    brain.hear({ type: 'guessed', who: 'm1' }, 0, s);
    const r = ask(brain, s, 0)!;
    expect(text(r)).toContain('Ana acertou');
  });

  test('o chefão que fala se anuncia ao chegar', () => {
    const brain = new TalkBrain(fixed(0.1), { chance: 1 });
    const s = scene([person('m1', 'Ana', MIKU, 100), bot('b9', KRATOS, 120, { boss: true })]);
    brain.roster([{ id: 'b9', character: KRATOS, boss: true }], 0);
    const r = ask(brain, s, 0)!;
    expect(r.bot).toBe('b9');
    expect(text(r)).toMatch(/chefão/);
  });

  test('em silêncio, de vez em quando um bot puxa assunto sozinho', () => {
    const { brain, s } = setup();
    expect(ask(brain, s, 0, 150_000)?.priority).toBe('idle');
  });

  test('sem jogo rodando ninguém fala', () => {
    const { brain, figures } = setup();
    const off = scene(figures, { playing: false });
    brain.hear({ type: 'chat', from: 'm1', text: 'sanji?' }, 0, off);
    expect(ask(brain, off, 0, 150_000)).toBeNull();
  });
});

describe('cérebro da fala: limites', () => {
  test('um pedido por vez na sala: o próximo só depois de `done`', () => {
    const { brain, s } = setup();
    brain.hear({ type: 'chat', from: 'm1', text: 'sanji!' }, 0, s);
    brain.hear({ type: 'chat', from: 'm2', text: 'kratos!' }, 0, s);
    const r1 = ask(brain, s, 0)!;
    expect(ask(brain, s, r1.at + 250, r1.at + 3000)).toBeNull();
    brain.done(r1, null, r1.at + 500, s, []);
    expect(ask(brain, s, r1.at + 500)?.bot).not.toBe(r1.bot);
  });

  test('o mesmo bot não responde duas vezes seguidas em menos de alguns segundos', () => {
    const { brain, s } = setup();
    brain.hear({ type: 'chat', from: 'm1', text: 'sanji!' }, 0, s);
    const r1 = ask(brain, s, 0)!;
    expect(brain.done(r1, 'Tá com fome?', r1.at + 300, s, [])).toBe('Tá com fome?');
    brain.hear({ type: 'chat', from: 'm1', text: 'sanji de novo' }, r1.at + 400, s);
    const r2 = ask(brain, s, r1.at + 400)!;
    expect(r2.at - r1.at).toBeGreaterThanOrEqual(4000);
  });

  test('a sala tem um balde: muitas falas seguidas esgotam e os bots param de responder por um tempo', () => {
    const { brain, s } = setup();
    let t = 0, got = 0;
    for (let i = 0; i < 12; i++) {
      brain.hear({ type: 'chat', from: 'm1', text: i % 2 ? 'sanji' : 'kratos' }, t, s);
      const r = ask(brain, s, t, t + 5000);
      if (r) { got++; brain.done(r, 'ok', r.at + 200, s, []); t = r.at + 300; } else t += 5000;
    }
    // em ~1 minuto: o balde (3) mais o que voltou nesse tempo, nunca as 12
    expect(got).toBeGreaterThanOrEqual(3);
    expect(got).toBeLessThanOrEqual(6);
  });

  test('a conversa entre bots não vira um loop: no máximo duas falas de bot seguidas sem uma pessoa no meio', () => {
    const brain = new TalkBrain(fixed(0.1), { chance: 1 });
    const s = scene([person('m1', 'Ana', MIKU, 100), bot('b1', SANJI, 300), bot('b2', KRATOS, 320)]);
    brain.roster([{ id: 'b1', character: SANJI, boss: false }, { id: 'b2', character: KRATOS, boss: false }], 0);
    brain.hear({ type: 'chat', from: 'm1', text: 'sanji, fala com o kratos' }, 0, s);
    let t = 0;
    const said: string[] = [];
    for (let i = 0; i < 6; i++) {
      const r = ask(brain, s, t, t + 20_000);
      if (!r || r.priority === 'idle') break;
      said.push(r.bot);
      brain.done(r, 'fala', r.at + 200, s, []);
      t = r.at + 300;
    }
    expect(said.length).toBeLessThanOrEqual(3); // a resposta à Ana e no máximo duas de vai e volta
    expect(said.length).toBeGreaterThanOrEqual(2);
  });
});

describe('cérebro da fala: a resposta', () => {
  test('a resposta que chega tarde, de bot que já foi ou com o jogo parado, é descartada', () => {
    const { brain, s, figures } = setup();
    brain.hear({ type: 'chat', from: 'm1', text: 'sanji!' }, 0, s);
    const r = ask(brain, s, 0)!;
    expect(brain.done(r, 'oi', r.at + 30_000, s, [])).toBeNull();
    for (const [late, sc] of [[0, scene(figures.filter((f) => f.id !== r.bot))], [0, scene(figures, { playing: false })]] as const) {
      brain.hear({ type: 'chat', from: 'm1', text: 'sanji!!' }, 60_000, s);
      const again = ask(brain, s, 60_000 + late)!;
      expect(brain.done(again, 'oi', again.at + 200, sc, [])).toBeNull();
    }
  });

  test('a fala sai arrumada: uma linha, sem o nome na frente, sem aspas, no tamanho do balão', () => {
    expect(tidy('Sanji: "Tá com fome?"\nOutra linha', 'Sanji')).toBe('Tá com fome?');
    expect(tidy('  “Oi”  ', 'Sanji')).toBe('Oi');
    const long = tidy('palavra '.repeat(20), 'Sanji');
    expect([...long].length).toBeLessThanOrEqual(CHAT_MAX);
    expect(long.endsWith(' ')).toBe(false);
    expect(tidy('   ', 'Sanji')).toBe('');
  });

  test('o filtro derruba fala imprópria', () => {
    expect(unsafe('vou te matar de rir')).toBe(false);
    expect(unsafe('que putaria é essa')).toBe(true);
    expect(unsafe('he is a NAZI')).toBe(true);
    const { brain, s } = setup();
    brain.hear({ type: 'chat', from: 'm1', text: 'sanji!' }, 0, s);
    const r = ask(brain, s, 0)!;
    expect(brain.done(r, 'que putaria', r.at + 200, s, [])).toBeNull();
  });

  test('nenhum post-it escapa: a fala que diz o post-it de alguém é descartada, e o chat que o diz chega tapado', () => {
    const secrets = ['Darth Vader', 'Pelé'];
    expect(leaks('acho que você é o vader', secrets)).toBe(true);
    expect(leaks('PELE no telhado', secrets)).toBe(true);
    expect(leaks('que pelada boa', secrets)).toBe(false);
    expect(redact('o Darth Vader caiu kkk', secrets)).toBe('o *** *** caiu kkk');
    expect(redact('sou o pelé?', secrets)).toBe('sou o ***?');
    const { brain, s } = setup();
    brain.hear({ type: 'chat', from: 'm1', text: 'sanji!' }, 0, s);
    const r = ask(brain, s, 0)!;
    expect(brain.done(r, 'Ana é o Darth Vader!', r.at + 200, s, secrets)).toBeNull();
  });

  test('responde na língua do chat: português por padrão, inglês se a sala fala inglês', () => {
    expect(language([])).toBe('pt-BR');
    expect(language(['oi gente', 'você é muito ruim kkk'])).toBe('pt-BR');
    expect(language(['hey what is going on', 'you are so bad at this'])).toBe('en');
    const { brain, s } = setup();
    brain.hear({ type: 'chat', from: 'm1', text: 'hey sanji, what are you doing here?' }, 0, s);
    brain.hear({ type: 'chat', from: 'm2', text: 'you are so funny' }, 0, s);
    expect(text(ask(brain, s, 0)!)).toContain('English');
  });

  test('o contexto diz a cena: de quem é a vez, quem está perto e de que personagem, quem já acertou', () => {
    const { brain, figures } = setup();
    const s = scene(figures.map((f) => (f.id === 'm2' ? { ...f, state: 'guessed' as const } : f)), { turn: 'm1' });
    brain.hear({ type: 'chat', from: 'm1', text: 'sanji!' }, 0, s);
    const t = text(ask(brain, s, 0)!);
    expect(t).toContain('vez de Ana');
    expect(t).toContain(`Ana (pessoa, de ${PERSONAS[MIKU].name}`);
    expect(t).toMatch(/Já acertaram: Beto/);
  });
});
