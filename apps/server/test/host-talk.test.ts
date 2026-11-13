import { describe, expect, test } from 'bun:test';
import type { Presence, ServerMessage } from '@guess/protocol';
import type { Talker } from '../src/groq';
import { RoomHost, type Socket } from '../src/host';
import { silentLog } from '../src/log';
import { PERSONAS } from '../src/personas';
import type { ChatMessage } from '../src/talk';
import { lcg } from './sim';

function fakeSocket(token: string) {
  const ws = { data: { code: 'ABCD', token, ip: '127.0.0.1' }, sent: [] as string[], send(d: string) { ws.sent.push(d); }, close() {}, terminate() {} };
  return ws as unknown as Socket & typeof ws;
}
const say = (host: RoomHost, ws: Socket, msg: object) => host.message(ws, JSON.stringify(msg));
const received = (ws: { sent: string[] }) => ws.sent.map((d) => JSON.parse(d) as ServerMessage);
const botChats = (ws: { sent: string[] }) => received(ws).filter((m): m is Extract<ServerMessage, { type: 'chat' }> => m.type === 'chat' && m.member.startsWith('b'));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pres = (x: number): Presence => ({ x, y: 0, z: 40, vx: 0, vy: 0, vz: 0, facing: 1, anim: 'idle', emote: null, blink: false });

/** um modelo de mentira: guarda o que recebeu e responde `line` (null = falhou; `budget` false = sem orçamento) */
function fakeTalker(line: string | null, budget = true) {
  const asked: ChatMessage[][] = [];
  const talker: Talker = { ask: (_p, messages) => { asked.push(messages); return budget ? Promise.resolve(line) : null; } };
  return { talker, asked };
}

/** Zé e Dita jogando, post-its "Darth Vader" e "Pelé", com os bots ligados numa sala de desenvolvimento (chegam logo) */
async function playing(talker: Talker | undefined) {
  const host = new RoomHost('ABCD', silentLog, () => {}, { dev: true, botTick: 5, rng: lcg(7), ...(talker ? { talker, talkChance: 1 } : {}) });
  const a = fakeSocket('token-a'), b = fakeSocket('token-b');
  host.connect(a); say(host, a, { type: 'join', nickname: 'Zé' });
  host.connect(b); say(host, b, { type: 'join', nickname: 'Dita' });
  say(host, a, { type: 'shuffleAuthors' });
  const secrets = ['Darth Vader', 'Pelé'];
  for (const [ws, me, i] of [[a, 'm1', 0], [b, 'm2', 1]] as const) {
    const owner = Object.keys(host.state.game.authors).find((o) => host.state.game.authors[o] === me)!;
    say(host, ws, { type: 'write', owner, text: secrets[i], image: null });
  }
  say(host, a, { type: 'funnyBots', on: true });
  say(host, a, { type: 'start' });
  say(host, a, { type: 'presence', presence: pres(400) });
  say(host, b, { type: 'presence', presence: pres(500) });
  for (let i = 0; i < 400 && host.state.bots.length === 0; i++) await sleep(10);
  expect(host.state.bots.length).toBeGreaterThan(0);
  return { host, a, b, secrets };
}

describe('host: os bots falam (emenda do ADR 0005)', () => {
  test('chamado pelo nome, o bot responde com a fala do modelo, num balão que vai a todo mundo', async () => {
    const { talker, asked } = fakeTalker('Quem me chamou?');
    const { host, a, b } = await playing(talker);
    const bot = host.state.bots[0];
    await sleep(50);
    say(host, a, { type: 'chat', text: `oi ${PERSONAS[bot.character].name}, tudo bem?` });
    for (let i = 0; i < 300 && !botChats(b).some((m) => m.member === bot.id); i++) await sleep(10);
    expect(botChats(a)).toContainEqual({ type: 'chat', member: bot.id, text: 'Quem me chamou?' });
    expect(botChats(b)).toContainEqual({ type: 'chat', member: bot.id, text: 'Quem me chamou?' });
    expect(asked.some((m) => m[1].content.includes('Zé'))).toBe(true);
    host.dispose();
  });

  test('nenhum post-it vai para o modelo, nem dito no chat; e a fala que diz um post-it não sai', async () => {
    const { talker, asked } = fakeTalker('O Darth Vader tá aqui!');
    const { host, a, b, secrets } = await playing(talker);
    const bot = host.state.bots[0];
    await sleep(50);
    say(host, b, { type: 'chat', text: `${PERSONAS[bot.character].name}, a Zé é o Darth Vader kkk` });
    for (let i = 0; i < 300 && asked.length === 0; i++) await sleep(10);
    await sleep(50);
    expect(asked.length).toBeGreaterThan(0);
    const all = asked.flat().map((m) => m.content.toLowerCase()).join('\n');
    for (const s of secrets) for (const w of s.toLowerCase().split(' ')) expect(all).not.toContain(w);
    expect(all).toContain('***');
    expect(botChats(a)).toEqual([]);
    host.dispose();
  });

  test('sem orçamento, ou o modelo falhando, o bot fica calado', async () => {
    for (const fake of [fakeTalker('oi', false), fakeTalker(null)]) {
      const { host, a, b } = await playing(fake.talker);
      const bot = host.state.bots[0];
      await sleep(50);
      say(host, a, { type: 'chat', text: `${PERSONAS[bot.character].name}!` });
      await sleep(200);
      expect(botChats(b)).toEqual([]);
      host.dispose();
    }
  });

  test('sem `talker` (sem GROQ_API_KEY) nenhum bot fala', async () => {
    const { host, a, b } = await playing(undefined);
    const bot = host.state.bots[0];
    say(host, a, { type: 'chat', text: `${PERSONAS[bot.character].name}!` });
    await sleep(200);
    expect(botChats(b)).toEqual([]);
    host.dispose();
  });
});
