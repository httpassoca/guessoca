import type { MemberView, PostitView, RoomSnapshot } from '@guess/protocol';

/** Uma pessoa da turma, conectada e jogando, salvo o que o teste mudar. */
export const member = (id: string, nickname: string, extra: Partial<MemberView> = {}): MemberView => ({ id, nickname, connected: true, character: null, ghost: false, fake: false, ...extra });

/** Um post-it como alguém o vê, pronto para o teste mudar. */
export const postit = (author: string | null, extra: Partial<PostitView> = {}): PostitView => ({ text: '', image: null, ready: false, written: false, revealed: false, author, ...extra });

/**
 * Um snapshot da sala ABCD visto por Zé (m1, moderador), com Zé, Ana e Bia jogando nessa ordem, salvo o que o teste
 * mudar. `order` segue quem não é fantasma, a não ser que o teste passe outra.
 */
export function snapshot(p: Partial<RoomSnapshot> = {}): RoomSnapshot {
  const members = p.members ?? [member('m1', 'Zé'), member('m2', 'Ana'), member('m3', 'Bia')];
  return {
    code: 'ABCD', phase: 'lobby', you: 'm1', moderator: 'm1', dev: false, maxPlayers: 8, members, order: members.filter((x) => !x.ghost).map((x) => x.id),
    authors: {}, turnMs: 60_000, postits: {}, turn: null, paused: false, vote: null, got: [], gaveUp: [], ...p,
  };
}
