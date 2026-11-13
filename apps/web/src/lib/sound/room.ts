/**
 * Os sons que a sala faz, tirados da diferença entre dois snapshots seguidos (puro e testado): abriu uma votação,
 * alguém acertou, uma vez acabou sem ninguém acertar, a minha vez começou. O servidor só manda o estado; o que "aconteceu" sai daqui.
 */
import type { RoomSnapshot } from '@guess/protocol';
import type { RemoteStatus } from '../room/remote';
import type { SfxName } from './sfx';

/**
 * Os sons de passar de `prev` para `next`, vistos por `me`. Nada no primeiro snapshot (`prev` null) nem quando o
 * anterior não era meu (acabei de entrar). Acertar ganha de fim de vez: a vez passa junto, mas só toca `gotIt`. A vez
 * que começa sendo minha (a primeira do jogo também) toca `yourTurn` no lugar de `turnEnd`, para não passar batido.
 */
export function roomSounds(prev: RoomSnapshot | null, next: RoomSnapshot, me: string | null): SfxName[] {
  if (!prev || !me || prev.you !== me || next.you !== me) return [];
  const out: SfxName[] = [];
  if (next.vote && next.vote.claimer !== prev.vote?.claimer) out.push('vote');
  const got = new Set(prev.got);
  const someoneGot = next.got.some((id) => !got.has(id));
  const ended = turnEnded(prev, next);
  const mineNow = next.phase === 'playing' && next.turn?.owner === me;
  const myTurnStarted = mineNow && (ended || (prev.turn?.owner !== me && !next.vote));
  if (someoneGot) out.push('gotIt');
  else if (ended && !myTurnStarted) out.push('turnEnd');
  if (myTurnStarted) out.push('yourTurn');
  return out;
}

/**
 * A vez de `prev` acabou e outra começou, com o jogo correndo antes e depois (a primeira vez do jogo não conta, nem o
 * fim do jogo). Outra dona, ou a mesma recomeçando com mais tempo do que tinha (só sobrou ela): votação que deu não
 * devolve o tempo que sobrava, e pausar não aumenta o relógio.
 */
function turnEnded(prev: RoomSnapshot, next: RoomSnapshot): boolean {
  if (prev.phase !== 'playing' || next.phase !== 'playing' || !prev.turn || !next.turn) return false;
  if (next.turn.owner !== prev.turn.owner) return true;
  return !prev.vote && !next.vote && next.turn.left > prev.turn.left;
}

/**
 * `roomSounds` snapshot a snapshot, como chegam no `RemoteRoom`: o estado avisa a cada mudança (status, recusa), então
 * o mesmo snapshot de novo não toca. Ao cair a conexão, esquece o anterior: o snapshot inteiro que chega ao voltar é
 * só a nova base, e o que aconteceu enquanto estava fora não toca.
 */
export function roomSoundsTracker() {
  let prev: RoomSnapshot | null = null;
  /** o snapshot de antes da queda, que continua no estado até chegar o novo */
  let stale: RoomSnapshot | null = null;
  return (status: RemoteStatus, room: RoomSnapshot | null, me: string | null): SfxName[] => {
    if (status !== 'open') { if (prev) stale = prev; prev = null; return []; }
    if (!room || room === prev || room === stale) return [];
    stale = null;
    const out = roomSounds(prev, room, me);
    prev = room;
    return out;
  };
}
