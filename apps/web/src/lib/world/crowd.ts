/**
 * Quem está no telhado além de mim, como este navegador o conhece agora, puro: cada pessoa conectada com personagem e
 * presença, interpolada (`samplePresence`); os jogadores falsos, que não mandam presença, parados num lugar fixo perto
 * do ponto de volta. Quem nunca mandou presença ainda não aparece.
 */
import type { EmoteName, MemberView, RoomSnapshot } from '@guess/protocol';
import { groundAt, MAP, spawnPoint, type Anim, type Other, type Platform, type Vec3 } from '@guess/world';
import { samplePresence, type PresenceTrack } from './presence';

export interface CrowdBody extends Vec3 {
  id: string;
  character: number;
  vx: number; vy: number; vz: number;
  facing: 1 | -1;
  anim: Anim;
  emote: EmoteName | null;
  blink: boolean;
  fake: boolean;
}

/** a distância do primeiro falso ao ponto de volta, e entre um e o seguinte do mesmo lado */
const FAKE_FIRST = 44;
const FAKE_STEP = 20;
/** quanto o falso fica longe da beirada do telhado */
const FAKE_EDGE = 10;

/**
 * O lugar do falso número `index` (pela ordem entre os falsos da turma): alternando à direita e à esquerda do ponto de
 * volta, num degrau de profundidade, sempre no mesmo telhado e no chão dele.
 */
export function fakeSpot(index: number, platforms: readonly Platform[] = MAP): Vec3 {
  const spawn = spawnPoint(platforms);
  const side = index % 2 === 0 ? 1 : -1;
  let x = spawn.x + side * (FAKE_FIRST + FAKE_STEP * Math.floor(index / 2));
  const roof = platforms.find((p) => p.kind === 'roof' && spawn.x >= p.x0 && spawn.x <= p.x1);
  if (roof) x = Math.max(roof.x0 + FAKE_EDGE, Math.min(roof.x1 - FAKE_EDGE, x));
  const z = spawn.z + ((index % 3) - 1) * 8;
  return { x, y: groundAt(platforms, x, z) ?? spawn.y, z };
}

export function crowd(
  room: Pick<RoomSnapshot, 'members' | 'you'>,
  trackOf: (id: string) => PresenceTrack | undefined,
  now: number,
  platforms: readonly Platform[] = MAP,
): CrowdBody[] {
  const out: CrowdBody[] = [];
  let fakes = 0;
  for (const m of room.members as MemberView[]) {
    const fakeIndex = m.fake ? fakes++ : -1;
    if (m.id === room.you || m.character === null || !m.connected) continue;
    if (m.fake) {
      out.push({ id: m.id, character: m.character, ...fakeSpot(fakeIndex, platforms), vx: 0, vy: 0, vz: 0, facing: fakeIndex % 2 === 0 ? -1 : 1, anim: 'idle', emote: null, blink: false, fake: true });
      continue;
    }
    const track = trackOf(m.id);
    if (!track) continue;
    const p = samplePresence(track, now);
    out.push({ id: m.id, character: m.character, x: p.x, y: p.y, z: p.z, vx: p.vx, vy: p.vy, vz: p.vz, facing: p.facing, anim: p.anim, emote: p.emote, blink: p.blink, fake: false });
  }
  return out;
}

/** Para a física: sólido quem não está piscando (caído ou voltando). */
export function othersOf(bodies: readonly CrowdBody[]): Other[] {
  return bodies.map((b) => ({ id: b.id, x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz, solid: !b.blink }));
}
