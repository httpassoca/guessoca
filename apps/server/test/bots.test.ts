import { describe, expect, test } from 'bun:test';
import { BOSS_SCALE, BOTS_MAX, parsePresence } from '@guess/protocol';
import { CHARACTERS } from '@guess/rules';
import { groundAt, MAP, spawnPoint, WALK } from '@guess/world';
import { ACTIONS, BOSS_ACTIONS, BOSS_BOT_HIT_MS, BOSS_HP, BOT_SHOVE_PLAYER_MS, BOTS_FLEE_MS, BotWorld, type Bot, type Seen } from '../src/bots';
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

  describe('o chefão', () => {
    const taken = new Set<number>();
    /** um mundo em que o primeiro acontecimento é um chefão, já com ele de pé no telhado */
    function withBoss(seed: number, players: Seen[] = [person('m1')]) {
      const world = new BotWorld(lcg(seed), { characters: CHARACTERS, firstWithin: 1000, bossFirst: true });
      let now = 0;
      const step = (enabled = true) => { now += DT * 1000; return world.tick(now, DT, players, { enabled, taken }); };
      const boss = () => world.bots.find((b) => b.boss);
      while (!boss() || boss()!.doing === 'arrive' || !boss()!.body.grounded) step();
      return { world, boss: boss()!, step, now: () => now, wait: (ms: number) => { const end = now + ms; while (now < end) step(); } };
    }

    test('a lista marca o chefão com a escala dele, e só ele', () => {
      const { world, boss, wait } = withBoss(71);
      boss.leaveAt = Infinity;
      for (let i = 0; i < 600 && world.bots.length < 3; i++) wait(1000); // chegam outros
      expect(world.bots.length).toBeGreaterThan(2);
      for (const v of world.roster()) expect(v.scale).toBe(v.id === boss.id ? BOSS_SCALE : undefined);
      expect(world.roster().map((v) => v.id)).toContain(boss.id);
    });

    test('aguenta vários empurrões: os primeiros só o fazem cambalear, o último o joga longe e ele não volta', () => {
      for (const seed of [72, 73, 74]) {
        const { world, boss, wait, now } = withBoss(seed);
        boss.leaveAt = Infinity;
        for (let hit = 1; hit < BOSS_HP; hit++) {
          const x = boss.body.x;
          world.shoved(boss.id, hit % 2 ? 1 : -1, 'm1', now());
          expect(boss.hp).toBe(BOSS_HP - hit);
          expect(boss.emote?.name).toBe('exclaim');
          expect(boss.body.stunnedUntil).toBeGreaterThan(now()); // cambaleia: um instante sem controle
          wait(700);
          expect(world.bots).toContain(boss);
          expect(Math.abs(boss.body.x - x)).toBeLessThan(90); // o tranco é curto (e depois ele só anda)
          expect(boss.body.respawnAt).toBeNull();
        }
        world.shoved(boss.id, 1, 'm1', now());
        expect(Math.abs(boss.body.vx)).toBeGreaterThan(200);
        wait(3000);
        expect(world.bots).not.toContain(boss);
        wait(1000);
        expect(world.bots.some((b) => b.id === boss.id)).toBe(false);
      }
    });

    test('a lista leva os pontos que ainda aguenta (`hp`, de `hpMax`), só no chefão, e muda a cada empurrão que conta', () => {
      const { world, boss, step, now } = withBoss(76);
      boss.leaveAt = Infinity;
      step();
      const view = () => world.roster().find((v) => v.id === boss.id)!;
      expect(view()).toEqual({ id: boss.id, character: boss.character, scale: BOSS_SCALE, hp: BOSS_HP, hpMax: BOSS_HP });
      for (const v of world.roster()) if (v.id !== boss.id) { expect(v.hp).toBeUndefined(); expect(v.hpMax).toBeUndefined(); }
      // o empurrão chega por fora do passo (o host): o passo seguinte avisa que a lista mudou
      world.shoved(boss.id, 1, 'm1', now());
      expect(step().rosterChanged).toBe(true);
      expect(view().hp).toBe(BOSS_HP - 1);
      // nada mudou: não avisa de novo
      expect(step().rosterChanged).toBe(false);
    });

    test('derrubado (os pontos acabaram), o passo avisa uma vez, com onde ele estava; indo embora sozinho, não', () => {
      const { world, boss, step, now, wait } = withBoss(77);
      boss.leaveAt = Infinity;
      step();
      for (let hit = 1; hit < BOSS_HP; hit++) { world.shoved(boss.id, 1, 'm1', now()); expect(step().downs).toEqual([]); wait(700); }
      const x = boss.body.x;
      world.shoved(boss.id, 1, 'm1', now());
      const r = step();
      expect(r.downs).toHaveLength(1);
      expect(r.downs[0].id).toBe(boss.id);
      expect(Math.abs(r.downs[0].x - x)).toBeLessThan(20);
      expect(world.roster().find((v) => v.id === boss.id)?.hp).toBe(0);
      expect(step().downs).toEqual([]);

      // outro chefão que vai embora na hora dele não cai em raio nenhum
      const other = withBoss(78);
      other.boss.leaveAt = other.now() + 100;
      let downs = 0;
      for (let i = 0; i < 400; i++) downs += other.step().downs.length;
      expect(other.world.bots).not.toContain(other.boss);
      expect(downs).toBe(0);
    });

    test('o tranco não o tira do telhado, nem na beirada', () => {
      const { world, boss, wait, now } = withBoss(75);
      boss.leaveAt = Infinity;
      boss.hp = 1000;
      const roof = MAP.find((p) => p.kind === 'roof' && boss.body.x >= p.x0 && boss.body.x <= p.x1)!;
      boss.body = { ...boss.body, x: roof.x1 - 2, y: roof.top };
      for (let i = 0; i < 40; i++) {
        world.shoved(boss.id, 1, 'm1', now());
        wait(350);
        expect(groundAt(MAP, boss.body.x, boss.body.z)).not.toBeNull();
        expect(boss.body.respawnAt).toBeNull();
      }
    });

    test('empurrão de outro bot também conta, mas pouco, e nunca é o que derruba', () => {
      const { world, boss, wait, now } = withBoss(76);
      boss.leaveAt = Infinity;
      // outro bot qualquer no telhado, para bater nele
      while (world.bots.length < 2) wait(1000);
      const other = world.bots.find((b) => !b.boss)!;
      for (const b of world.bots) b.leaveAt = Infinity;
      const hp = boss.hp;
      world.shoved(boss.id, 1, other.id, now());
      expect(boss.hp).toBe(hp - 1);
      wait(1000);
      world.shoved(boss.id, 1, other.id, now()); // cedo demais: nem sente
      expect(boss.hp).toBe(hp - 1);
      for (let i = 0; i < BOSS_HP + 2; i++) { wait(BOSS_BOT_HIT_MS); if (world.bots.includes(other)) world.shoved(boss.id, 1, other.id, now()); }
      expect(world.bots).toContain(boss);
      expect(boss.hp).toBeGreaterThanOrEqual(1);
      // uma pessoa termina
      boss.hp = 1;
      wait(1000);
      world.shoved(boss.id, 1, 'm1', now());
      wait(3000);
      expect(world.bots).not.toContain(boss);
    });

    test('anda devagar, não cai sozinho e só faz coisa de chefão', () => {
      const players = [person('m1'), person('m2', 60)];
      let lived = 0;
      for (const seed of [77, 78, 79, 80]) {
        const { world, boss, step, now } = withBoss(seed, players);
        boss.leaveAt = now() + 240_000;
        // onde e desde quando ele "anda" sem sair do lugar
        let ref = { x: boss.body.x, z: boss.body.z, at: now() };
        while (world.bots.includes(boss) && boss.doing !== 'leave') {
          step();
          lived++;
          const b = boss.body;
          if (b.anim !== 'walk' || Math.abs(b.x - ref.x) > 1.5 || Math.abs(b.z - ref.z) > 1.5) ref = { x: b.x, z: b.z, at: now() };
          expect(now() - ref.at).toBeLessThan(2500); // não fica andando parado, entalado em alguém
          expect(boss.body.respawnAt).toBeNull();
          if ((boss.doing as string) === 'leave') break;
          if (boss.body.grounded) expect(Math.abs(boss.body.vx)).toBeLessThanOrEqual(WALK + 0.01);
          expect([...BOSS_ACTIONS, 'revenge']).toContain(boss.doing);
        }
        expect(now()).toBeGreaterThan(200_000); // ficou até a hora de ir embora
      }
      expect(lived).toBeGreaterThan(1000);
    });

    test('empurra gente, respeitando o limite de todos os bots juntos', () => {
      let total = 0;
      for (const seed of [81, 82, 83]) {
        const world = new BotWorld(lcg(seed), { characters: CHARACTERS, firstWithin: 1000, bossFirst: true });
        const times: number[] = [];
        let now = 0;
        for (let i = 0; i < 10 * 60 * 30; i++) {
          now += DT * 1000;
          const r = world.tick(now, DT, [person('m1')], { enabled: true, taken });
          for (const b of world.bots) if (b.boss) b.leaveAt = Infinity; else b.leaveAt = 0; // só o chefão fica
          for (const s of r.shoves) if (world.bots.find((b) => b.id === s.by)?.boss) times.push(now);
        }
        total += times.length;
        for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(BOT_SHOVE_PLAYER_MS);
      }
      expect(total).toBeGreaterThan(0);
    });

    test('desligada a opção, o chefão foge como os outros', () => {
      const { world, step, now } = withBoss(84);
      const off = now();
      while (now() < off + BOTS_FLEE_MS + 500) step(false);
      expect(world.bots).toHaveLength(0);
    });

    test('em jogos longos aparece, é raro, nunca há dois ao mesmo tempo e o máximo continua valendo', () => {
      const bosses = new Set<string>();
      for (const seed of [91, 92, 93, 94]) {
        const world = new BotWorld(lcg(seed), { characters: CHARACTERS });
        let now = 0;
        for (let i = 0; i < 45 * 60 * 30; i++) {
          now += DT * 1000;
          world.tick(now, DT, [person('m1'), person('m2', 40)], { enabled: true, taken: new Set([0, 1]) });
          expect(world.bots.length).toBeLessThanOrEqual(BOTS_MAX);
          const here = world.bots.filter((b: Bot) => b.boss);
          expect(here.length).toBeLessThanOrEqual(1);
          for (const b of here) bosses.add(`${seed}:${b.id}`);
        }
      }
      // três horas de jogo: alguns chefões (um a cada meia hora, mais ou menos), não muitos
      expect(bosses.size).toBeGreaterThan(2);
      expect(bosses.size).toBeLessThan(16);
    }, 60_000);
  });
});

describe('bots: memória (issue #72)', () => {
  test('quem um bot empurrou há mais que BOT_SHOVE_PLAYER_MS é esquecido: o mapa não cresce sem fim', () => {
    const world = new BotWorld(lcg(1), { characters: CHARACTERS });
    const last = (world as unknown as { lastShoved: Map<string, number> }).lastShoved;
    for (let i = 0; i < 100; i++) last.set(`m${i}`, 0);
    last.set('recente', BOT_SHOVE_PLAYER_MS);
    world.tick(BOT_SHOVE_PLAYER_MS + 1, 0.033, [], { enabled: false, taken: new Set() });
    expect([...last.keys()]).toEqual(['recente']);
  });
});
