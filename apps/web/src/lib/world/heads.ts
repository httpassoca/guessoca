/**
 * O que vai sobre a cabeça de cada personagem (HTML, ADR 0006), puro: o apelido e, no jogo e no fim, o post-it como eu
 * posso vê-lo (o meu "?" até ser revelado; fantasmas veem todos, porque o snapshot já lhes manda tudo), com a vez marcada.
 * No lobby, só o apelido: os post-its sendo escritos ficam na coluna. Quem não tem personagem não tem cabeça. Onde cada
 * cabeça está na tela é com o `WorldRuntime`, a cada quadro.
 */
import type { RoomSnapshot } from '@guess/protocol';
import type { PostitCard, RoomView } from '../room/view';

export interface Head {
  id: string;
  nickname: string;
  mine: boolean;
  /** null = sem post-it (lobby, ou fantasma) */
  card: PostitCard | null;
}

export function heads(room: RoomSnapshot, v: RoomView): Head[] {
  const cards = room.phase === 'lobby' ? new Map<string, PostitCard>() : new Map(v.postits.map((c) => [c.owner.id, c]));
  return room.members
    .filter((m) => m.character !== null)
    .map((m) => ({ id: m.id, nickname: m.nickname, mine: m.id === room.you, card: cards.get(m.id) ?? null }));
}
