import { describe, expect, test } from 'bun:test';
import { EMOTE_MS, PRESENCE_INTERVAL, type Presence } from '@guess/protocol';
import { HEARTBEAT_MS, INTERP_SPAN_MAX, PresenceSender, presenceOfBody, pushPresence, samplePresence, SNAP_DISTANCE, type PresenceTrack } from '../src/lib/world/presence';

const p = (extra: Partial<Presence> = {}): Presence => ({ x: 100, y: 0, z: 20, vx: 0, vy: 0, vz: 0, facing: 1, anim: 'idle', emote: null, blink: false, ...extra });

describe('presença que sai', () => {
  test('a primeira sai na hora', () => {
    const s = new PresenceSender();
    expect(s.tick(0, p())).toEqual(p());
  });

  test('no máximo uma por intervalo, e a que sai é a da hora', () => {
    const s = new PresenceSender();
    const sent: number[] = [];
    // quadros a 60 Hz, andando 1 px por quadro, durante 1 s
    for (let f = 0; f <= 60; f++) {
      const now = f * (1000 / 60);
      const out = s.tick(now, p({ x: 100 + f }));
      if (out) { sent.push(now); expect(out.x).toBe(100 + f); }
    }
    for (let i = 1; i < sent.length; i++) expect(sent[i] - sent[i - 1]).toBeGreaterThanOrEqual(PRESENCE_INTERVAL);
    expect(sent.length).toBeGreaterThanOrEqual(13); // ~15 por segundo
    expect(sent.length).toBeLessThanOrEqual(16);
  });

  test('parado não repete a mesma presença, mas manda um sinal de vida a cada segundo', () => {
    const s = new PresenceSender();
    const sent: number[] = [];
    for (let f = 0; f * (1000 / 60) < 3100; f++) { const now = f * (1000 / 60); if (s.tick(now, p())) sent.push(now); }
    expect(sent.length).toBe(4); // 0, ~1 s, ~2 s, ~3 s
    for (let i = 1; i < sent.length; i++) {
      expect(sent[i] - sent[i - 1]).toBeGreaterThanOrEqual(HEARTBEAT_MS);
      expect(sent[i] - sent[i - 1]).toBeLessThan(HEARTBEAT_MS + 20);
    }
  });

  test('uma mudança (virar, emote) sai assim que a janela abre', () => {
    const s = new PresenceSender();
    s.tick(0, p());
    expect(s.tick(10, p({ facing: -1 }))).toBeNull();
    expect(s.tick(PRESENCE_INTERVAL, p({ facing: -1 }))).toMatchObject({ facing: -1 });
    expect(s.tick(PRESENCE_INTERVAL * 2, p({ facing: -1, emote: 'haha' }))).toMatchObject({ emote: 'haha' });
  });

  test('mudança de menos de um décimo de pixel não conta como mudança', () => {
    const s = new PresenceSender();
    s.tick(0, p());
    expect(s.tick(200, p({ x: 100.01 }))).toBeNull();
  });

  test('a presença do corpo: piscando quando cai ou volta, e o emote enquanto o balão está no ar', () => {
    const body = { x: 1.234, y: 2, z: 3, vx: 4, vy: 5, vz: 6, facing: -1 as const, anim: 'walk' as const, respawnAt: null, blinkUntil: 0 };
    const blink = (b: { respawnAt: number | null; blinkUntil: number }, now: number) => b.respawnAt !== null || now < b.blinkUntil;
    expect(presenceOfBody(body, 1000, { name: 'me', since: 500 }, blink)).toEqual({ x: 1.2, y: 2, z: 3, vx: 4, vy: 5, vz: 6, facing: -1, anim: 'walk', emote: 'me', blink: false });
    expect(presenceOfBody(body, 500 + EMOTE_MS, { name: 'me', since: 500 }, blink).emote).toBeNull();
    expect(presenceOfBody(body, 1000, null, blink).emote).toBeNull();
    expect(presenceOfBody({ ...body, respawnAt: 2000 }, 1000, null, blink).blink).toBe(true);
  });
});

describe('presença que chega: interpolada', () => {
  const track = (...samples: [Presence, number][]) => samples.reduce<PresenceTrack | undefined>((t, [pr, at]) => pushPresence(t, pr, at), undefined)!;

  test('guarda as duas últimas, com a hora em que chegaram', () => {
    const t = track([p({ x: 0 }), 0], [p({ x: 10 }), 66], [p({ x: 20 }), 132]);
    expect(t.prev).toEqual({ presence: p({ x: 10 }), at: 66 });
    expect(t.last).toEqual({ presence: p({ x: 20 }), at: 132 });
  });

  test('com uma só, fica nela', () => {
    expect(samplePresence(track([p({ x: 5 }), 0]), 500).x).toBe(5);
  });

  test('anda da penúltima à última no tempo que separou as duas, a partir de quando a última chegou', () => {
    const t = track([p({ x: 0, z: 0, y: 0 }), 0], [p({ x: 10, z: 20, y: 30 }), 66]);
    expect(samplePresence(t, 66)).toMatchObject({ x: 0, z: 0, y: 0 });
    expect(samplePresence(t, 99)).toMatchObject({ x: 5, z: 10, y: 15 });
    expect(samplePresence(t, 132)).toMatchObject({ x: 10, z: 20, y: 30 });
    expect(samplePresence(t, 500)).toMatchObject({ x: 10 }); // atrasou: espera na última
  });

  test('sem saltos quando chega uma nova no ritmo de sempre', () => {
    let t = track([p({ x: 0 }), 0], [p({ x: 10 }), 66]);
    const before = samplePresence(t, 132).x;
    t = pushPresence(t, p({ x: 20 }), 132);
    expect(samplePresence(t, 132).x).toBe(before);
  });

  test('depois de muito tempo parado, a primeira que se mexe não se arrasta por um segundo', () => {
    const t = track([p({ x: 0 }), 0], [p({ x: 10 }), 1000]);
    expect(samplePresence(t, 1000 + INTERP_SPAN_MAX).x).toBe(10);
  });

  test('a ~100 ms da última, já está nela', () => expect(INTERP_SPAN_MAX).toBeLessThanOrEqual(100));

  test('um salto grande (voltou depois de cair) não é interpolado', () => {
    const t = track([p({ x: 0 }), 0], [p({ x: SNAP_DISTANCE + 1 }), 66]);
    expect(samplePresence(t, 70).x).toBe(SNAP_DISTANCE + 1);
  });

  test('o resto (lado, animação, emote, piscar) é o da última', () => {
    const t = track([p({ facing: 1, anim: 'idle' }), 0], [p({ facing: -1, anim: 'run', emote: 'haha', blink: true }), 66]);
    expect(samplePresence(t, 70)).toMatchObject({ facing: -1, anim: 'run', emote: 'haha', blink: true });
  });
});
