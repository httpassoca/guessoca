import { describe, expect, test } from 'bun:test';
import { CLOSE_TOO_MANY, type Presence } from '@guess/protocol';
import { RoomHost, type Socket } from '../src/host';
import { silentLog } from '../src/log';
import type { UsageEvent } from '../src/usage';
import { lcg } from './sim';

function fakeSocket(token: string) {
  const ws = {
    data: { code: 'ABCD', token }, sent: [] as string[], closedWith: null as number | null, terminated: false,
    send(d: string) { ws.sent.push(d); }, close(code?: number) { ws.closedWith = code ?? 1000; }, terminate() { ws.terminated = true; },
  };
  return ws as unknown as Socket & typeof ws;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const say = (host: RoomHost, ws: Socket, msg: object) => host.message(ws, JSON.stringify(msg));
const pres = (x: number, y = 0): Presence => ({ x, y, z: 40, vx: 0, vy: 0, vz: 0, facing: 1, anim: 'idle', emote: null, blink: false });

/** todo mundo escreve o post-it de quem lhe coube */
function writeAll(host: RoomHost, people: [Socket, string][]) {
  say(host, people[0][0], { type: 'shuffleAuthors' });
  for (const [ws, me] of people) {
    const owner = Object.keys(host.state.game.authors).find((o) => host.state.game.authors[o] === me)!;
    say(host, ws, { type: 'write', owner, text: 'Batman', image: null });
  }
}

describe('host: o uso para o sistema (emenda do ADR 0009)', () => {
  test('conta pelos eventos, fora da sala: jogo começado e acabado, desistências, fantasmas, falas; nada de quem', () => {
    let now = 1_000_000;
    const events: UsageEvent[] = [];
    const host = new RoomHost('ABCD', silentLog, () => {}, { clock: () => now, meter: (e) => events.push(e) });
    const a = fakeSocket('token-a'), b = fakeSocket('token-b'), c = fakeSocket('token-c');
    host.connect(a); say(host, a, { type: 'join', nickname: 'Zé' });
    host.connect(b); say(host, b, { type: 'join', nickname: 'Dita' });
    host.connect(c); say(host, c, { type: 'join', nickname: 'Lu' });
    say(host, a, { type: 'character', character: 4 });
    say(host, b, { type: 'character', character: 2 });
    say(host, c, { type: 'character', character: 6 });
    writeAll(host, [[a, 'm1'], [b, 'm2'], [c, 'm3']]);
    const before = events.length;
    say(host, a, { type: 'start' });
    expect(host.state.game.phase).toBe('playing');
    const started = events.slice(before).find((e) => e.type === 'gameStarted');
    expect(started && 'characters' in started && [...started.characters].sort()).toEqual([2, 4, 6]);
    say(host, b, { type: 'chat', text: 'é o Batman?' });
    say(host, a, { type: 'presence', presence: pres(100) });
    say(host, b, { type: 'presence', presence: pres(110) });
    say(host, a, { type: 'shove', target: 'm2', dir: 1 });
    const owner = host.state.game.turn!.owner;
    say(host, { m1: a, m2: b, m3: c }[owner as 'm1'], { type: 'giveUp' });
    const other = (['m1', 'm2', 'm3'] as const).find((m) => m !== owner && !host.state.game.ghosted.includes(m) && m !== 'm1')!;
    say(host, a, { type: 'ghost', member: other, on: true });
    now += 90_000;
    say(host, a, { type: 'endGame' });
    expect(host.state.game.phase).toBe('ended');
    const types = events.map((e) => e.type);
    expect(types.filter((t) => t === 'chat')).toHaveLength(1);
    expect(types).toContain('gaveUp');
    expect(types).toContain('ghost');
    expect(events.find((e) => e.type === 'gameFinished')).toEqual({ type: 'gameFinished', ms: 90_000, shoves: 1, falls: 0 });
    // nenhum evento leva apelido, texto, post-it ou token
    const text = JSON.stringify(events);
    for (const secret of ['Zé', 'Dita', 'Batman', 'token-']) expect(text).not.toContain(secret);
    host.dispose();
  });

  test('quem é fechado por enxurrada conta como 4429; quem conta e quebra não derruba a sala', () => {
    const now = 1_000_000;
    const events: string[] = [];
    const host = new RoomHost('ABCD', silentLog, () => {}, { clock: () => now, meter: (e) => { events.push(e.type); throw new Error('quebrou'); } });
    const a = fakeSocket('token-a');
    host.connect(a); say(host, a, { type: 'join', nickname: 'Zé' });
    for (let i = 0; i < 5000 && a.closedWith === null; i++) say(host, a, { type: 'nickname', nickname: `n${i % 2}` });
    expect(a.closedWith).toBe(CLOSE_TOO_MANY);
    expect(events).toEqual(['floodKick']);
    host.dispose();
  });

  test('o chefão que aparece e o que cai contam uma vez cada', async () => {
    const events: string[] = [];
    const host = new RoomHost('ABCD', silentLog, () => {}, { botTick: 5, rng: lcg(3), meter: (e) => events.push(e.type) });
    const a = fakeSocket('token-a'), b = fakeSocket('token-b');
    host.connect(a); say(host, a, { type: 'join', nickname: 'Zé' });
    host.connect(b); say(host, b, { type: 'join', nickname: 'Dita' });
    writeAll(host, [[a, 'm1'], [b, 'm2']]);
    say(host, a, { type: 'funnyBots', on: true });
    say(host, a, { type: 'start' });
    const boss = { id: 'b1', character: 3, boss: true, body: { x: 0, y: 0, z: 0 } };
    let ticks = 0;
    const fake = {
      bots: [boss], roster: () => [{ id: 'b1', character: 3 }], presence: () => pres(0),
      tick: () => { ticks++; return { shoves: [], rosterChanged: ticks <= 3, downs: ticks === 4 ? [{ id: 'b1', x: 1, y: 0, z: 0 }] : [], hits: [], falls: [] }; },
      shoved: () => false,
    };
    (host as unknown as { botWorld: unknown }).botWorld = fake;
    for (let i = 0; i < 200 && ticks < 8; i++) await sleep(5);
    expect(events.filter((t) => t === 'bossSpawned')).toHaveLength(1);
    expect(events.filter((t) => t === 'bossDown')).toHaveLength(1);
    host.dispose();
  });
});
