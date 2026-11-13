import { describe, expect, test } from 'bun:test';
import type { Presence } from '@guess/protocol';
import { BODY_H, groundAt, MAP, spawnPoint } from '@guess/world';
import { crowd, fakeSpot, othersOf } from '../src/lib/world/crowd';
import { pushPresence, type PresenceTrack } from '../src/lib/world/presence';
import { member } from './snapshots';

const p = (extra: Partial<Presence> = {}): Presence => ({ x: 100, y: 0, z: 20, vx: 1, vy: 2, vz: 3, facing: 1, anim: 'walk', emote: null, blink: false, ...extra });

describe('jogadores falsos no telhado', () => {
  test('cada um num lugar fixo perto do ponto de volta, em cima do telhado, sempre o mesmo', () => {
    const spots = Array.from({ length: 7 }, (_, i) => fakeSpot(i, MAP));
    expect(spots).toEqual(Array.from({ length: 7 }, (_, i) => fakeSpot(i, MAP)));
    expect(new Set(spots.map((s) => `${s.x},${s.z}`)).size).toBe(7);
    const spawn = spawnPoint(MAP);
    for (const s of spots) {
      expect(groundAt(MAP, s.x, s.z)).toBe(s.y);
      expect(Math.abs(s.x - spawn.x)).toBeGreaterThanOrEqual(30); // não nasce ninguém em cima deles
      expect(Math.abs(s.x - spawn.x)).toBeLessThan(200);
    }
  });
});

describe('a turma no telhado', () => {
  const room = {
    you: 'm1',
    members: [
      member('m1', 'Eu', { character: 0 }),
      member('m2', 'Ana', { character: 1 }),
      member('m3', 'Fake1', { character: 2, fake: true }),
      member('m4', 'Bia', { character: 3 }),
      member('m5', 'Fake2', { character: 4, fake: true }),
      member('m6', 'Sem personagem', { character: null }),
      member('m7', 'Caiu', { character: 5, connected: false }),
    ],
  };
  const tracks = new Map<string, PresenceTrack>([
    ['m1', pushPresence(undefined, p({ x: 1 }), 0)],
    ['m2', pushPresence(undefined, p({ x: 50 }), 0)],
    ['m6', pushPresence(undefined, p(), 0)],
    ['m7', pushPresence(undefined, p(), 0)],
  ]);
  const bodies = crowd(room, (id) => tracks.get(id), 100, MAP);

  test('sem mim, sem quem nunca mandou presença, sem quem não tem personagem e sem quem caiu', () => {
    expect(bodies.map((b) => b.id)).toEqual(['m2', 'm3', 'm5']);
  });

  test('quem mandou presença está onde ela diz, com o personagem', () => {
    expect(bodies[0]).toMatchObject({ id: 'm2', character: 1, x: 50, anim: 'walk', fake: false });
  });

  test('o falso fica parado no seu lugar (pela ordem entre os falsos), sólido e parado', () => {
    const [f1, f2] = [bodies[1], bodies[2]];
    expect(f1).toMatchObject({ ...fakeSpot(0, MAP), vx: 0, vy: 0, vz: 0, anim: 'idle', emote: null, blink: false, fake: true, character: 2 });
    expect(f2).toMatchObject({ ...fakeSpot(1, MAP), fake: true });
  });

  test('para a física: sólido quem não está piscando', () => {
    const blinking = crowd(room, (id) => (id === 'm2' ? pushPresence(undefined, p({ blink: true }), 0) : undefined), 100, MAP);
    expect(othersOf(blinking)).toEqual([
      { id: 'm2', x: 100, y: 0, z: 20, vx: 1, vy: 2, vz: 3, solid: false },
      { id: 'm3', ...fakeSpot(0, MAP), vx: 0, vy: 0, vz: 0, solid: true },
      { id: 'm5', ...fakeSpot(1, MAP), vx: 0, vy: 0, vz: 0, solid: true },
    ]);
  });
});

describe('os bots engraçados no telhado', () => {
  const room = { you: 'm1', members: [member('m1', 'Eu', { character: 0 })], bots: [{ id: 'b1', character: 4 }, { id: 'b2', character: 26, scale: 2 }, { id: 'b3', character: 5 }] };
  const tracks = new Map<string, PresenceTrack>([['b1', pushPresence(undefined, p({ x: 30 }), 0)], ['b2', pushPresence(undefined, p({ x: 60 }), 0)]]);

  test('aparecem pela presença que o servidor manda; o chefão vem com a escala dele, os outros com 1', () => {
    const c = crowd(room, (id) => tracks.get(id), 0);
    expect(c.map((b) => [b.id, b.character, b.bot, b.scale, b.x])).toEqual([['b1', 4, true, 1, 30], ['b2', 26, true, 2, 60]]);
  });

  test('para a física, o chefão é mais alto e mais largo que os outros', () => {
    const o = othersOf(crowd(room, (id) => tracks.get(id), 0));
    expect(o[0].h).toBeUndefined();
    expect(o[0].wide).toBeUndefined();
    expect(o[1]).toMatchObject({ h: 2 * BODY_H, wide: 1.5 });
  });
});
