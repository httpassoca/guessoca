import { describe, expect, test } from 'bun:test';
import { BOTS_MAX, parsePresence } from '@guess/protocol';
import { CHARACTERS } from '@guess/rules';
import { MAP, spawnPoint } from '@guess/world';
import { ACTIONS, BOT_SHOVE_PLAYER_MS, BOTS_FLEE_MS, BotWorld, type Seen } from '../src/bots';
import { lcg } from './sim';

const DT = 1 / 30;
const spawn = spawnPoint(MAP);
/** uma pessoa parada no ponto de volta */
const person = (id: string, dx = 0): Seen => ({ id, x: spawn.x + dx, y: spawn.y, z: spawn.z, vx: 0, vy: 0, vz: 0, solid: true });

/** Roda `minutes` de jogo com a opção ligada e devolve o que se viu. */
function run(seed: number, minutes: number, players: Seen[] = [person('m1'), person('m2', 40)], taken = new Set<number>([0, 1])) {
  const world = new BotWorld(lcg(seed), { characters: CHARACTERS });
  const counts: number[] = [];
  const shoves: { at: number; target: string }[] = [];
  const doing = new Set<string>();
  const characters = new Set<number>();
  let now = 0, ids = 0;
  for (let i = 0; i < minutes * 60 * 30; i++) {
    now += DT * 1000;
    const r = world.tick(now, DT, players, { enabled: true, taken });
    for (const s of r.shoves) shoves.push({ at: now, target: s.target });
    counts.push(world.bots.length);
    for (const b of world.bots) { doing.add(b.doing); characters.add(b.character); ids = Math.max(ids, Number(b.id.slice(1))); }
  }
  return { world, counts, shoves, doing, characters, now, ids };
}

describe('bots engraçados', () => {
  test('aparecem, somem, e nunca passam do máximo', () => {
    for (const seed of [1, 2, 3]) {
      const { counts, ids } = run(seed, 40);
      expect(Math.max(...counts)).toBeLessThanOrEqual(BOTS_MAX);
      expect(Math.max(...counts)).toBeGreaterThan(2);
      expect(counts.some((c) => c === 0)).toBe(true); // tem hora sem nenhum
      expect(ids).toBeGreaterThan(10); // vieram muitos ao longo do jogo, e foram embora
    }
  });

  test('o mesmo sorteio dá a mesma história; outro sorteio, outra', () => {
    const a = run(7, 10), b = run(7, 10), c = run(8, 10);
    expect(a.counts).toEqual(b.counts);
    expect(a.counts).not.toEqual(c.counts);
  });

  test('fazem de tudo um pouco', () => {
    const seen = new Set<string>();
    for (const seed of [11, 12, 13, 14]) for (const d of run(seed, 30).doing) seen.add(d);
    for (const a of ACTIONS) expect(seen).toContain(a);
  });

  test('todos os bots juntos empurram a mesma pessoa no máximo uma vez a cada 20 s', () => {
    let total = 0;
    for (const seed of [21, 22, 23]) {
      const { shoves } = run(seed, 40);
      total += shoves.length;
      for (const id of ['m1', 'm2']) {
        const times = shoves.filter((s) => s.target === id).map((s) => s.at);
        for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(BOT_SHOVE_PLAYER_MS);
      }
    }
    expect(total).toBeGreaterThan(0);
  });

  test('preferem os personagens que ninguém da sala usa', () => {
    const taken = new Set([0, 1, 2, 3]);
    const { characters } = run(31, 20, [person('m1')], taken);
    expect(characters.size).toBeGreaterThan(3);
    for (const c of characters) expect(taken.has(c)).toBe(false);
  });

  test('a presença de um bot é uma presença válida do protocolo', () => {
    const world = new BotWorld(lcg(5), { characters: CHARACTERS });
    let now = 0, checked = 0;
    for (let i = 0; i < 20 * 60 * 30; i++) {
      now += DT * 1000;
      world.tick(now, DT, [person('m1')], { enabled: true, taken: new Set() });
      if (i % 15 === 0) for (const b of world.bots) { expect(parsePresence(world.presence(b, now))).not.toBeNull(); checked++; }
    }
    expect(checked).toBeGreaterThan(100);
  });

  test('desligada a opção, fogem e somem em poucos segundos', () => {
    const { world, now: t0 } = run(41, 12);
    // garante que há alguém para fugir
    let now = t0;
    while (world.bots.length === 0) { now += DT * 1000; world.tick(now, DT, [person('m1')], { enabled: true, taken: new Set() }); }
    const off = now;
    while (now < off + BOTS_FLEE_MS + 500) { now += DT * 1000; world.tick(now, DT, [person('m1')], { enabled: false, taken: new Set() }); }
    expect(world.bots).toHaveLength(0);
  });

  test('um bot empurrado é jogado para o lado e reage', () => {
    const world = new BotWorld(lcg(51), { characters: CHARACTERS });
    let now = 0;
    const grounded = () => world.bots.find((b) => b.body.grounded && b.doing !== 'arrive' && b.doing !== 'leave' && now > b.body.blinkUntil);
    while (!grounded()) { now += DT * 1000; world.tick(now, DT, [person('m1')], { enabled: true, taken: new Set() }); }
    const bot = grounded()!;
    world.shoved(bot.id, 1, 'm1', now);
    expect(bot.body.vx).toBeGreaterThan(0);
    expect(bot.grudge).toBe('m1');
    expect(['flee', 'revenge', 'leave']).toContain(bot.doing);
  });

  test('sem ninguém no telhado também funciona', () => {
    const { counts } = run(61, 15, []);
    expect(Math.max(...counts)).toBeGreaterThan(0);
  });
});
