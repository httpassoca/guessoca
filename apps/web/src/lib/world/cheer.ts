/**
 * Quem acabou de acertar (issue #58), tirado da diferença entre dois snapshots seguidos, como os sons da sala
 * (`sound/room.ts`): o servidor só manda o estado, e "fulano acertou agora" sai daqui. Puro e testado
 * (`apps/web/test/world-cheer.test.ts`). `runtime.ts` usa isto para a comemoração: confete em volta de quem acertou
 * e, se fui eu, o meu corpo lançado para cima.
 */
import type { RoomSnapshot } from '@guess/protocol';
import type { RemoteStatus } from '../room/remote';

/**
 * Quem está em `got` em `next` e não estava em `prev`, na ordem de `next`. Ninguém no primeiro snapshot (`prev` null)
 * nem ao trocar de sala: quem já tinha acertado é só a base. Desistir e ser desmarcado não entram; desmarcado e marcado
 * de novo, entra outra vez.
 */
export function newlyGot(prev: RoomSnapshot | null, next: RoomSnapshot): string[] {
  if (!prev || prev.code !== next.code) return [];
  const had = new Set(prev.got);
  return next.got.filter((id) => !had.has(id));
}

/**
 * `newlyGot` snapshot a snapshot, como chegam no `RemoteRoom`: o estado avisa a cada mudança (status, recusa), então o
 * mesmo snapshot de novo não comemora. Ao cair a conexão, esquece o anterior: o snapshot inteiro que chega ao voltar é
 * só a nova base, e quem acertou enquanto eu estava fora não comemora atrasado.
 */
export function cheerTracker() {
  let prev: RoomSnapshot | null = null;
  /** o snapshot de antes da queda, que continua no estado até chegar o novo */
  let stale: RoomSnapshot | null = null;
  return (status: RemoteStatus, room: RoomSnapshot | null): string[] => {
    if (status !== 'open') { if (prev) stale = prev; prev = null; return []; }
    if (!room || room === prev || room === stale) return [];
    stale = null;
    const out = newlyGot(prev, room);
    prev = room;
    return out;
  };
}
