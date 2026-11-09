/**
 * Presença (ADR 0005), pura. Saindo: `PresenceSender` decide a cada quadro se a minha sai agora (no máximo uma por
 * `PRESENCE_INTERVAL`, só se mudou, e um sinal de vida a cada `HEARTBEAT_MS` mesmo parado). Chegando: cada pessoa tem as
 * duas últimas com a hora em que chegaram (`PresenceTrack`), e `samplePresence` desenha o corpo andando da penúltima à
 * última no tempo que separou as duas, a partir de quando a última chegou: fica cerca de um intervalo (66–100 ms)
 * atrás do que a outra aba mostra, e não salta quando uma nova chega no ritmo de sempre.
 */
import { EMOTE_MS, EMOTES, PRESENCE_INTERVAL, type EmoteName, type Presence } from '@guess/protocol';
import { blinking, type Body } from '@guess/world';

/** mesmo parado, a minha presença sai pelo menos uma vez por isto (quem entra tarde vê onde estou) */
export const HEARTBEAT_MS = 1000;
/** a interpolação nunca demora mais que isto para chegar à última (a primeira depois de muito tempo parado) */
export const INTERP_SPAN_MAX = 100;
/** mais longe que isto entre as duas últimas (voltou depois de cair), o corpo salta direto */
export const SNAP_DISTANCE = 60;

/** Um décimo de pixel basta na rede e na comparação. */
const q = (n: number) => Math.round(n * 10) / 10;

const rounded = (p: Presence): Presence => ({ ...p, x: q(p.x), y: q(p.y), z: q(p.z), vx: q(p.vx), vy: q(p.vy), vz: q(p.vz) });

export interface Emote { name: EmoteName; since: number }

/** A presença do meu corpo agora: `blink` de `blinking`, o emote enquanto o balão está no ar (`EMOTE_MS`). */
export function presenceOfBody(
  body: Pick<Body, 'x' | 'y' | 'z' | 'vx' | 'vy' | 'vz' | 'facing' | 'anim' | 'respawnAt' | 'blinkUntil'>,
  now: number,
  emote: Emote | null,
  isBlinking: (b: Pick<Body, 'respawnAt' | 'blinkUntil'>, now: number) => boolean = blinking,
): Presence {
  return rounded({
    x: body.x, y: body.y, z: body.z, vx: body.vx, vy: body.vy, vz: body.vz,
    facing: body.facing, anim: body.anim,
    emote: emote && now - emote.since < EMOTE_MS && EMOTES.includes(emote.name) ? emote.name : null,
    blink: isBlinking(body, now),
  });
}

const same = (a: Presence, b: Presence) =>
  a.x === b.x && a.y === b.y && a.z === b.z && a.vx === b.vx && a.vy === b.vy && a.vz === b.vz &&
  a.facing === b.facing && a.anim === b.anim && a.emote === b.emote && a.blink === b.blink;

/** Decide, quadro a quadro, quando a minha presença sai. */
export class PresenceSender {
  private last: { at: number; presence: Presence } | null = null;

  /** A presença a mandar agora (arredondada a um décimo de pixel), ou null. */
  tick(now: number, presence: Presence): Presence | null {
    const p = rounded(presence);
    const last = this.last;
    if (last) {
      const since = now - last.at;
      if (since < PRESENCE_INTERVAL) return null;
      if (same(last.presence, p) && since < HEARTBEAT_MS) return null;
    }
    this.last = { at: now, presence: p };
    return p;
  }

  /** a conexão voltou: a próxima sai na hora */
  reset() { this.last = null; }
}

export interface PresenceSample { presence: Presence; at: number }
/** As duas últimas presenças de uma pessoa, com a hora (do relógio local) em que chegaram. */
export interface PresenceTrack { prev: PresenceSample | null; last: PresenceSample }

export function pushPresence(track: PresenceTrack | undefined, presence: Presence, at: number): PresenceTrack {
  return { prev: track ? track.last : null, last: { presence, at } };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Onde desenhar a pessoa agora: entre as duas últimas (posição), com o resto da última. */
export function samplePresence(track: PresenceTrack, now: number): Presence {
  const { prev, last } = track;
  const b = last.presence;
  if (!prev) return b;
  const a = prev.presence;
  if (Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) > SNAP_DISTANCE) return b;
  const span = Math.min(INTERP_SPAN_MAX, Math.max(1, last.at - prev.at));
  const t = Math.max(0, Math.min(1, (now - last.at) / span));
  if (t >= 1) return b;
  return { ...b, x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) };
}
