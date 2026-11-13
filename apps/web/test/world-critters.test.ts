import { describe, expect, test } from 'bun:test';
import { MAP } from '@guess/world';
import {
  BIRD_AWAY_MS, BIRDS, CAT_SPOTS, CAT_VISIT_MS, CATS, Cat, Critters, FLIGHT_MS, Flocks, MEOW_MS, ROOF_LIST, Watcher,
  floorOf, route, routeAt, scheduled, seedOf, type Folk, type Stir,
} from '../src/lib/world/critters';
import { CRITTERS, stripFrame } from '../src/lib/sprites/critters';

const SEED = seedOf('GATO');
/** um começo qualquer no relógio de parede */
const T0 = 1_800_000_000_000;
const person = (o: Partial<Folk> = {}): Folk => ({ id: 'p', x: 0, y: 0, z: 20, anim: 'idle', bot: false, scale: 1, ...o });
const insideBox = (x: number, z: number) => MAP.some((b) => b.kind === 'box' && x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1);

/** o tigrado (o 1) só tem batidas paradas do lado da chaminé: bom para testar as reações sem a rotina andar */
const TIGRADO = 1;
const SIDE = CAT_SPOTS['chimney-side'];

/** roda um gato quadro a quadro (60 Hz) de `from` a `to`, com `folk` (fixo ou por hora) */
function run(cat: Cat, from: number, to: number, folk: (t: number) => Folk[], watcher = new Watcher()) {
  for (let t = from; t <= to; t += 16) {
    const f = folk(t);
    const stirs = watcher.tick(f, t);
    cat.step(f, stirs, (id) => watcher.stillFor(id, t), t);
    cat.pose(f, t);
  }
  return watcher;
}

describe('os caminhos dos gatos', () => {
  test('saem de um lugar e chegam no outro, sem buraco entre os trechos', () => {
    for (const [a, b] of [['ac', 'tank'], ['tank', 'roof0-corner'], ['parapet', 'ledge-a'], ['chimney-side', 'chimney']] as const) {
      const r = route(CAT_SPOTS[a], CAT_SPOTS[b], 'run');
      expect(routeAt(r, 0).at).toEqual({ x: CAT_SPOTS[a].x, y: CAT_SPOTS[a].y, z: CAT_SPOTS[a].z });
      const end = routeAt(r, r.ms).at;
      expect(end.x).toBeCloseTo(CAT_SPOTS[b].x); expect(end.y).toBeCloseTo(CAT_SPOTS[b].y); expect(end.z).toBeCloseTo(CAT_SPOTS[b].z);
      r.legs.slice(1).forEach((l, i) => expect(l.from).toEqual(r.legs[i].to));
    }
  });

  test('no chão nunca passa por dentro de uma caixa; o vão se atravessa num pulo de beirada a beirada', () => {
    const r = route(CAT_SPOTS.ac, CAT_SPOTS.tank, 'run');
    for (const l of r.legs) {
      if (l.arc > 0) continue;
      for (let u = 0; u <= 1; u += 0.05) expect(insideBox(l.from.x + (l.to.x - l.from.x) * u, l.from.z + (l.to.z - l.from.z) * u)).toBe(false);
    }
    const leaps = r.legs.filter((l) => Math.abs(l.to.x - l.from.x) > 40 && l.arc > 0);
    expect(leaps).toHaveLength(2);
    for (const l of leaps) expect(ROOF_LIST.some((roof) => Math.abs(roof.x1 - l.from.x) <= 3)).toBe(true);
  });

  test('o pé de cada lugar fica no chão do telhado e fora das caixas', () => {
    for (const s of Object.values(CAT_SPOTS)) {
      const f = floorOf(s);
      expect(f.y).toBe(ROOF_LIST[s.roof].top);
      expect(insideBox(f.x, f.z)).toBe(false);
    }
  });

  test('cada lugar está em cima de algo: tampo do telhado, tampa da caixa, mureta da frente (+4) ou do fundo (+5)', () => {
    for (const s of Object.values(CAT_SPOTS)) {
      const roof = ROOF_LIST[s.roof];
      expect(s.x).toBeGreaterThan(roof.x0); expect(s.x).toBeLessThan(roof.x1);
      const box = MAP.find((b) => b.kind === 'box' && s.x >= b.x0 && s.x <= b.x1 && s.z >= b.z0 && s.z <= b.z1);
      expect([roof.top, roof.top + 4, roof.top + 5, box?.top]).toContain(s.y);
    }
  });
});

describe('a rotina no relógio de parede', () => {
  test('a mesma sala e a mesma hora dão a mesma batida; outra sala, outra defasagem', () => {
    for (let i = 0; i < CATS.length; i++) expect(scheduled(i, SEED, T0)).toEqual(scheduled(i, SEED, T0));
    const differs = Array.from({ length: 20 }, (_, k) => T0 + k * 3000).some((t) => JSON.stringify(scheduled(0, SEED, t)) !== JSON.stringify(scheduled(0, seedOf('OUTRA'), t)));
    expect(differs).toBe(true);
  });

  test('num ciclo o gato faz de tudo: parado, lambe, coça, espreguiça, deita, dorme', () => {
    for (let i = 0; i < CATS.length; i++) {
      const acts = new Set<string>();
      for (let t = T0; t < T0 + 200_000; t += 250) { const s = scheduled(i, SEED, t); if (s.kind === 'perch') acts.add(s.act); }
      for (const a of ['idle', 'lick', 'itch', 'stretch', 'lie', 'sleep']) expect(acts).toContain(a);
    }
  });

  test('o branco passeia da mureta da frente para a do fundo, sem pular de lugar', () => {
    let last: { x: number; y: number; z: number } | null = null;
    let moved = false;
    const cat = new Cat(2, SEED);
    for (let t = T0; t < T0 + 200_000; t += 16) {
      const p = cat.pose([], t);
      if (last) expect(Math.hypot(p.x - last.x, p.y - last.y, p.z - last.z)).toBeLessThan(4); // 16 ms: no máximo o pulo da mureta
      if (p.strip === 'walk') moved = true;
      last = p;
    }
    expect(moved).toBe(true);
  });

  test('duas abas com a mesma sala veem o mesmo gato no mesmo quadro', () => {
    const a = new Critters(SEED), b = new Critters(SEED);
    for (let t = T0; t < T0 + 60_000; t += 997) expect(a.tick([], t)).toEqual(b.tick([], t));
  });
});

/** uma hora em que o tigrado está numa batida parada que não é dormir nem deitar */
function calmAt(): number {
  for (let t = T0; ; t += 500) { const s = scheduled(TIGRADO, SEED, t); if (s.kind === 'perch' && s.act === 'idle' && s.ends - t > 3000) return t; }
}

describe('as reações dos gatos', () => {
  test('alguém chega perto: o gato senta e olha para ele', () => {
    const t = calmAt();
    const cat = new Cat(TIGRADO, SEED);
    const left = cat.pose([person({ x: SIDE.x - 20, y: 24, z: 40 })], t);
    expect(left.strip).toBe('sitting');
    expect(left.facing).toBe(-1);
    const right = cat.pose([person({ x: SIDE.x + 20, y: 24, z: 40 })], t);
    expect(right.facing).toBe(1);
    // bot não conta, e longe também não
    expect(cat.pose([person({ x: SIDE.x - 20, y: 24, z: 40, bot: true })], t).strip).toBe('idle');
    expect(cat.pose([person({ x: SIDE.x - 80, y: 24, z: 40 })], t).strip).toBe('idle');
  });

  test('correr para ele: mia, foge pulando o vão, fica no refúgio e depois volta para casa', () => {
    const t = calmAt();
    const cat = new Cat(TIGRADO, SEED);
    run(cat, t, t + 100, () => [person({ x: SIDE.x - 30, y: 24, z: 40, anim: 'run' })]);
    expect(cat.mind.kind).toBe('travel');
    expect(cat.pose([], t + 120).strip).toBe('meow');
    expect(cat.pose([], t + MEOW_MS + 200).strip).toBe('run');
    const m = cat.mind as Extract<typeof cat.mind, { kind: 'travel' }>;
    expect(m.to.roof).not.toBe(1); // foi para outro prédio
    run(cat, t + 200, t + 200 + m.route.ms + 1000, () => []);
    expect(cat.mind.kind).toBe('away');
    // depois de um tempo volta andando e, chegando, segue a rotina
    run(cat, t + m.route.ms + 1200, t + m.route.ms + 60_000, () => [], new Watcher());
    expect(cat.mind.kind).toBe('home');
    const p = cat.pose([], t + m.route.ms + 60_000);
    expect([p.x, p.y, p.z]).toEqual([SIDE.x, SIDE.y, SIDE.z]);
  });

  test('um empurrão ou um pouso perto também espantam; um pulo no lugar, não', () => {
    for (const [from, to] of [['idle', 'shove'], ['fall', 'idle']] as const) {
      const t = calmAt();
      const cat = new Cat(TIGRADO, SEED);
      run(cat, t, t + 64, (now) => [person({ x: SIDE.x - 25, y: 24, z: 40, anim: now < t + 32 ? from : to })]);
      expect(cat.mind.kind).toBe('travel');
    }
    const t = calmAt();
    const cat = new Cat(TIGRADO, SEED);
    run(cat, t, t + 64, (now) => [person({ x: SIDE.x - 25, y: 24, z: 40, anim: now < t + 32 ? 'idle' : 'jump' })]);
    expect(cat.mind.kind).toBe('home');
  });

  test('um bot perto: o gato vai embora sem miar', () => {
    const t = calmAt();
    const cat = new Cat(TIGRADO, SEED);
    run(cat, t, t + 32, () => [person({ x: SIDE.x - 20, y: 24, z: 40, bot: true })]);
    expect(cat.mind.kind).toBe('travel');
    expect(cat.meowAt).toBeNull();
  });

  test('o chefão pousando no telhado espanta o gato de longe', () => {
    const t = calmAt();
    const cat = new Cat(TIGRADO, SEED);
    run(cat, t, t + 64, (now) => [person({ id: 'boss', x: 330, y: 24, z: 20, bot: true, scale: 2, anim: now < t + 32 ? 'fall' : 'idle' })]);
    expect(cat.mind.kind).toBe('travel');
    expect(cat.meowAt).not.toBeNull();
  });

  test('ficar parado perto uns 4 s: o gato vem sentar do lado e depois dorme; quando a pessoa sai, ele volta', () => {
    const t = calmAt();
    const cat = new Cat(TIGRADO, SEED);
    const me = person({ x: SIDE.x + 60, y: 24, z: 20 });
    const w = run(cat, t, t + CAT_VISIT_MS - 200, () => [me]);
    expect(cat.mind.kind).toBe('home');
    run(cat, t + CAT_VISIT_MS - 184, t + CAT_VISIT_MS + 400, () => [me], w);
    expect(cat.mind.kind).toBe('travel');
    run(cat, t + CAT_VISIT_MS + 416, t + CAT_VISIT_MS + 6000, () => [me], w);
    expect(cat.mind.kind).toBe('beside');
    const p = cat.pose([me], t + CAT_VISIT_MS + 6000);
    expect(Math.abs(p.x - me.x)).toBe(20);
    expect(p.facing).toBe(p.x < me.x ? 1 : -1);
    expect(cat.pose([me], t + CAT_VISIT_MS + 20_000).strip).toBe('sleep1');
    run(cat, t + CAT_VISIT_MS + 20_000, t + CAT_VISIT_MS + 20_100, () => [{ ...me, x: me.x + 100, anim: 'walk' }], w);
    expect(cat.mind.kind).toBe('travel');
  });

  test('alguém acertou: o gato mais perto dele mia', () => {
    const c = new Critters(SEED);
    const t = calmAt();
    const near = person({ id: 'acertou', x: SIDE.x + 50, y: 24, z: 10 });
    c.tick([near], t);
    c.cheer('acertou');
    const { cats } = c.tick([near], t + 16);
    expect(cats[TIGRADO].meow).not.toBeNull();
    expect(cats.filter((k) => k.meow !== null)).toHaveLength(1);
  });
});

describe('os pássaros', () => {
  const pigeon = BIRDS.findIndex((b) => b.flock === 0);
  const crow = BIRDS.findIndex((b) => b.kind === 'crow');
  const runner = (x: number): Stir => ({ id: 'p', x, y: 24, z: 30, kind: 'run', bot: false, boss: false });

  test('são no máximo seis, cinco pombos e um corvo, e cada poleiro está em algum telhado', () => {
    expect(BIRDS.length).toBeLessThanOrEqual(6);
    expect(BIRDS.filter((b) => b.kind === 'crow')).toHaveLength(1);
    for (const b of BIRDS) expect(b.perch.x).toBeGreaterThan(ROOF_LIST[b.perch.roof].x0);
  });

  test('alguém correndo perto: o bando inteiro sai voando para cima, some, e volta entre 20 e 60 s depois', () => {
    const f = new Flocks(SEED);
    f.step([runner(BIRDS[pigeon].perch.x + 10)], T0);
    expect(f.minds[0].kind).toBe('away');
    expect(f.minds[2].kind).toBe('perched');
    expect(f.feathers.length).toBeGreaterThan(0);
    const going = f.poses(T0 + 1000);
    for (const [i, b] of BIRDS.entries()) if (b.flock === 0) { expect(going[i].strip).toBe('pigeon/fly'); expect(going[i].y).toBeGreaterThan(b.perch.y + 40); }
    expect(f.poses(T0 + FLIGHT_MS + 1000).filter((p, i) => BIRDS[i].flock === 0).every((p) => !p.visible)).toBe(true);
    const m = f.minds[0] as Extract<typeof f.minds[0], { kind: 'away' }>;
    expect(m.back - T0).toBeGreaterThanOrEqual(BIRD_AWAY_MS[0]);
    expect(m.back - T0).toBeLessThanOrEqual(BIRD_AWAY_MS[1]);
    // voltando: cai do alto até o poleiro
    const mid = f.poses(m.back + FLIGHT_MS / 2)[pigeon];
    expect(mid.visible).toBe(true);
    expect(mid.y).toBeGreaterThan(BIRDS[pigeon].perch.y);
    f.step([], m.back + FLIGHT_MS + 2000);
    expect(f.minds[0].kind).toBe('perched');
    expect(f.poses(m.back + FLIGHT_MS + 2000)[pigeon]).toMatchObject({ x: BIRDS[pigeon].perch.x, y: BIRDS[pigeon].perch.y, strip: 'pigeon/idle' });
  });

  test('o corvo só sai pelo chefão', () => {
    const f = new Flocks(SEED);
    f.step([runner(BIRDS[crow].perch.x)], T0);
    expect(f.minds[BIRDS[crow].flock].kind).toBe('perched');
    f.step([{ id: 'boss', x: 800, y: 8, z: 20, kind: 'land', bot: true, boss: true }], T0 + 100);
    expect(f.minds[BIRDS[crow].flock].kind).toBe('away');
    expect(f.minds[1].kind).toBe('away'); // o outro bando do mesmo telhado também
    expect(f.minds[0].kind).toBe('perched');
  });

  test('o parado de cada pássaro começa num ponto diferente, o mesmo em toda aba', () => {
    const a = new Flocks(SEED).poses(T0), b = new Flocks(SEED).poses(T0);
    expect(a).toEqual(b);
    expect(new Set(a.map((p) => p.since)).size).toBeGreaterThan(3);
  });
});

describe('quem espanta e quem está parado', () => {
  test('pulo, empurrão, pouso e corrida viram estímulos; parado conta o tempo', () => {
    const w = new Watcher();
    const at = (anim: Folk['anim'], x = 0) => [person({ anim, x })];
    expect(w.tick(at('idle'), 0)).toEqual([]);
    expect(w.tick(at('jump'), 16).map((s) => s.kind)).toEqual(['jump']);
    expect(w.tick(at('fall'), 32)).toEqual([]);
    expect(w.tick(at('idle'), 48).map((s) => s.kind)).toEqual(['land']);
    expect(w.tick(at('shove'), 64).map((s) => s.kind)).toEqual(['shove']);
    expect(w.tick(at('run', 10), 80).map((s) => s.kind)).toEqual(['run']);
    w.tick(at('idle', 10), 100);
    w.tick(at('idle', 11), 5000);
    expect(w.stillFor('p', 5000)).toBe(4920); // desde o último quadro correndo
    w.tick(at('walk', 20), 5016);
    expect(w.stillFor('p', 5016)).toBe(0);
  });
});

describe('o atlas dos bichos', () => {
  test('cada gato tem todas as tiras que a rotina e as reações pedem, e o miau', () => {
    for (const c of CATS) for (const s of ['idle', 'walk', 'run', 'meow', 'lying', 'itch', 'sleep1', 'sleep2', 'sitting', 'lick1', 'lick2', 'stretch']) {
      expect(CRITTERS.cats.strips[`${c.name}/${s}`]).toBeDefined();
    }
    expect(CRITTERS.cats.strips['meow/pop']).toBeDefined();
    for (const b of ['pigeon', 'crow']) for (const s of ['idle', 'fly']) expect(CRITTERS.birds.strips[`${b}/${s}`]).toBeDefined();
    expect(CRITTERS.birds.credit).toBe('carysaurus');
  });

  test('a 1×, um gato é do tamanho do cachorro (uns 20×15), não do herói', () => {
    const s = CRITTERS.cats.strips['preto/idle'];
    expect(s.h).toBeLessThanOrEqual(20);
    expect(s.anchor.y).toBe(s.h);
  });

  test('o quadro da tira: dá a volta, ou fica no último', () => {
    expect(stripFrame({ frames: 4, fps: 8, loop: true }, 625)).toBe(1);
    expect(stripFrame({ frames: 4, fps: 8, loop: false }, 5000)).toBe(3);
    expect(stripFrame({ frames: 4, fps: 8, loop: true }, -50)).toBe(0);
  });
});
