/**
 * As estatísticas do fim do jogo (issue #59), puras: do snapshot para as linhas da tabela e os destaques. Quem conta é o
 * servidor; aqui só se arruma para mostrar.
 */
import type { MemberView, PlayerStats, RoomSnapshot } from '@guess/protocol';

/** As colunas da tabela, na ordem: as vezes (do contador de vezes, issue #57) e o que a pessoa fez no telhado. */
export const STAT_COLUMNS = ['turns', 'falls', 'shoves', 'shovedByPlayers', 'shovedByBots'] as const;
export type StatColumn = (typeof STAT_COLUMNS)[number];

export type StatsRow = { member: MemberView } & Record<StatColumn, number>;

/** Um destaque: quem mais caiu, quem mais empurrou, a vítima preferida dos bots. Empate divide o destaque. */
export interface Award { kind: 'falls' | 'shoves' | 'botVictim'; value: number; winners: MemberView[] }

export interface EndStats {
  /** uma linha por pessoa da turma: quem jogou, na ordem das vezes, e depois os fantasmas (quem chegou tarde, quem só moderou) */
  rows: StatsRow[];
  /** o maior valor de cada coluna, para destacar na tabela; 0 = ninguém */
  top: Record<StatColumn, number>;
  /** só os destaques cujo maior valor não é zero */
  awards: Award[];
  /** o servidor manda o contador de vezes; sem ele (servidor antigo), a coluna some */
  hasTurns: boolean;
}

const AWARDS: readonly (readonly [Award['kind'], StatColumn])[] = [['falls', 'falls'], ['shoves', 'shoves'], ['botVictim', 'shovedByBots']];
const ZERO: PlayerStats = { falls: 0, shoves: 0, shovedByPlayers: 0, shovedByBots: 0 };

/** O que mostrar no fim do jogo; null fora do fim, ou se o servidor (antigo, no meio de um deploy) não manda os números. */
export function endStats(s: RoomSnapshot): EndStats | null {
  const stats = (s as Partial<RoomSnapshot>).stats;
  if (s.phase !== 'ended' || !stats) return null;
  const turns = (s as { turns?: Record<string, number> }).turns;
  const byId = new Map(s.members.map((m) => [m.id, m]));
  const players = s.order.flatMap((id) => byId.get(id) ?? []);
  const ghosts = s.members.filter((m) => !s.order.includes(m.id));
  const rows = [...players, ...ghosts].map((member): StatsRow => ({ member, turns: turns?.[member.id] ?? 0, ...ZERO, ...stats[member.id] }));
  const top = Object.fromEntries(STAT_COLUMNS.map((c) => [c, Math.max(0, ...rows.map((r) => r[c]))])) as Record<StatColumn, number>;
  const awards = AWARDS.flatMap(([kind, column]): Award[] =>
    top[column] > 0 ? [{ kind, value: top[column], winners: rows.filter((r) => r[column] === top[column]).map((r) => r.member) }] : []);
  return { rows, top, awards, hasTurns: !!turns };
}
