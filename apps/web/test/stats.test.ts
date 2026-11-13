import { describe, expect, test } from 'bun:test';
import type { PlayerStats } from '@guess/protocol';
import { endStats } from '../src/lib/room/stats';
import { member, snapshot } from './snapshots';

const st = (p: Partial<PlayerStats> = {}): PlayerStats => ({ falls: 0, shoves: 0, shovedByPlayers: 0, shovedByBots: 0, ...p });
/** Zé, Ana e Bia jogaram; Caio chegou depois (fantasma) */
const members = [member('m1', 'Zé'), member('m2', 'Ana'), member('m3', 'Bia'), member('m4', 'Caio', { ghost: true })];
const ended = (p: Parameters<typeof snapshot>[0] = {}) => snapshot({ phase: 'ended', members, order: ['m2', 'm1', 'm3'], ...p });

describe('estatísticas do fim do jogo', () => {
  test('uma linha por pessoa da turma, na ordem das vezes e os fantasmas depois; quem não tem número tem zero', () => {
    const s = endStats(ended({ stats: { m1: st({ falls: 2, shoves: 5 }), m4: st({ shovedByBots: 3 }), b1: st({ falls: 9 }) }, turns: { m1: 3, m2: 4 } }))!;
    expect(s.rows.map((r) => [r.member.nickname, r.turns, r.falls, r.shoves, r.shovedByPlayers, r.shovedByBots])).toEqual([
      ['Ana', 4, 0, 0, 0, 0],
      ['Zé', 3, 2, 5, 0, 0],
      ['Bia', 0, 0, 0, 0, 0],
      ['Caio', 0, 0, 0, 0, 3],
    ]);
    expect(s.hasTurns).toBe(true);
    // o maior de cada coluna, para destacar; coluna toda zerada não destaca nada
    expect(s.top).toEqual({ turns: 4, falls: 2, shoves: 5, shovedByPlayers: 0, shovedByBots: 3 });
  });

  test('os destaques: quem mais caiu, quem mais empurrou e a vítima preferida dos bots; empate divide, zero não aparece', () => {
    const s = endStats(ended({
      stats: { m1: st({ falls: 2, shoves: 1 }), m2: st({ falls: 2, shoves: 4, shovedByPlayers: 7 }), m3: st({ falls: 1 }) },
    }))!;
    expect(s.awards.map((a) => [a.kind, a.value, a.winners.map((m) => m.nickname)])).toEqual([
      ['falls', 2, ['Ana', 'Zé']],
      ['shoves', 4, ['Ana']],
    ]);
    expect(endStats(ended({ stats: {} }))!.awards).toEqual([]);
    const bots = endStats(ended({ stats: { m3: st({ shovedByBots: 1 }) } }))!;
    expect(bots.awards.map((a) => [a.kind, a.value, a.winners.map((m) => m.nickname)])).toEqual([['botVictim', 1, ['Bia']]]);
  });

  test('servidor antigo: sem `stats` não há o que mostrar; sem `turns`, a coluna de vezes some', () => {
    const old = ended();
    delete (old as Partial<typeof old>).stats;
    expect(endStats(old)).toBeNull();
    const noTurns = ended({ stats: { m1: st({ falls: 1 }) } });
    delete (noTurns as Partial<typeof noTurns>).turns;
    const s = endStats(noTurns)!;
    expect(s.hasTurns).toBe(false);
    expect(s.rows.every((r) => r.turns === 0)).toBe(true);
  });

  test('só no fim do jogo', () => {
    expect(endStats(snapshot({ phase: 'playing', stats: {} }))).toBeNull();
    expect(endStats(snapshot({ phase: 'lobby', stats: {} }))).toBeNull();
  });
});
