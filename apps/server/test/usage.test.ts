import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dayKey, parseUsage, Usage, USAGE_DAYS, VISITORS_PER_DAY_MAX } from '../src/usage';

const HOUR = 3600_000, DAY = 24 * HOUR;
/** 15 de novembro de 2026, meio-dia em São Paulo (15:00 UTC) */
const NOON = Date.UTC(2026, 10, 15, 15);
const dirs: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'guess-usage-')); dirs.push(d); return d; };
afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function usageAt(start = NOON, more: Partial<ConstructorParameters<typeof Usage>[0]> = {}) {
  let now = start;
  const u = new Usage({ clock: () => now, ...more });
  return { u, advance: (ms: number) => { now += ms; }, set: (t: number) => { now = t; } };
}

describe('uso: os dias', () => {
  test('o dia é o de São Paulo, não o do relógio UTC do container', () => {
    expect(dayKey(Date.UTC(2026, 10, 16, 2), 'America/Sao_Paulo')).toBe('2026-11-15'); // 23h de lá
    expect(dayKey(Date.UTC(2026, 10, 16, 3), 'America/Sao_Paulo')).toBe('2026-11-16');
    expect(dayKey(Date.UTC(2026, 10, 16, 2), 'UTC')).toBe('2026-11-16');
  });

  test('cada evento soma no balde do dia; o dia seguinte começa outro', () => {
    const { u, advance } = usageAt();
    u.record({ type: 'roomCreated' });
    u.record({ type: 'roomCreated' });
    u.record({ type: 'gameStarted', characters: [3, 3, 5] });
    u.record({ type: 'gameFinished', ms: 90_000, shoves: 7, falls: 2 });
    u.record({ type: 'chat' });
    advance(DAY);
    u.record({ type: 'roomCreated' });
    const s = u.snapshot(30);
    expect(s.days).toHaveLength(30);
    const [yesterday, today] = s.days.slice(-2);
    expect(yesterday.day).toBe('2026-11-15');
    expect(yesterday.counts).toMatchObject({ roomsCreated: 2, gamesStarted: 1, players: 3, gamesFinished: 1, gameMs: 90_000, shoves: 7, falls: 2, chats: 1 });
    expect(today).toMatchObject({ day: '2026-11-16', counts: { roomsCreated: 1 } });
    // os dias sem nada vêm zerados, do mais velho para o mais novo
    expect(s.days[0]).toEqual({ day: '2026-10-18', counts: {}, visitors: 0, peakOnline: 0 });
    expect(s.totals).toMatchObject({ roomsCreated: 3, gamesStarted: 1, players: 3 });
    expect(s.topCharacters).toEqual([{ character: 3, picks: 2 }, { character: 5, picks: 1 }]);
    expect(s.since).toBe('2026-11-15');
  });

  test(`só os últimos ${USAGE_DAYS} dias ficam: o arquivo não cresce sem fim`, () => {
    const { u, advance } = usageAt();
    for (let i = 0; i < USAGE_DAYS + 40; i++) { u.record({ type: 'roomCreated' }); advance(DAY); }
    u.record({ type: 'roomCreated' });
    const file = u.toJSON();
    expect(file.days.length).toBeLessThanOrEqual(USAGE_DAYS);
    expect(file.days.at(-1)!.counts.roomsCreated).toBe(1);
    expect(u.snapshot(30).totals.roomsCreated).toBe(USAGE_DAYS);
  });

  test('o pico de gente conectada é o maior do dia', () => {
    const { u, advance } = usageAt();
    for (const n of [1, 4, 2]) u.record({ type: 'online', n });
    advance(DAY);
    u.record({ type: 'online', n: 1 });
    const [a, b] = u.snapshot(2).days;
    expect([a.peakOnline, b.peakOnline]).toEqual([4, 1]);
  });

  test('um evento estranho não derruba nada', () => {
    const { u } = usageAt();
    expect(() => u.record({ type: 'nada' } as never)).not.toThrow();
    expect(() => u.record({ type: 'gameStarted', characters: [-1, 1e9, 2.5, Number.NaN] })).not.toThrow();
    expect(u.snapshot(1).topCharacters).toEqual([]);
    expect(() => u.record({ type: 'groqTokens', n: -50 })).not.toThrow();
    expect(u.snapshot(1).days[0].counts.groqTokens ?? 0).toBe(0);
  });
});

describe('uso: visitantes distintos', () => {
  const tok = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

  test('o mesmo token conta uma vez por dia; no dia seguinte conta de novo', () => {
    const { u, advance } = usageAt();
    u.record({ type: 'visit', token: tok(1) });
    u.record({ type: 'visit', token: tok(1) });
    u.record({ type: 'visit', token: tok(2) });
    advance(DAY);
    u.record({ type: 'visit', token: tok(1) });
    const [a, b] = u.snapshot(2).days;
    expect([a.visitors, b.visitors]).toEqual([2, 1]);
  });

  test('o arquivo nunca leva um token: só resumos com sal do dia, e de ontem, só o número', () => {
    const { u, advance } = usageAt();
    u.record({ type: 'visit', token: tok(7) });
    const text = JSON.stringify(u.toJSON());
    expect(text).not.toContain(tok(7));
    expect(text).not.toContain('000000000007');
    advance(DAY);
    u.record({ type: 'roomCreated' });
    const file = u.toJSON();
    expect(file.today?.day).toBe('2026-11-16');
    expect(file.today?.seen).toEqual([]);
    expect(file.days.find((d) => d.day === '2026-11-15')?.visitors).toBe(1);
  });

  test(`no máximo ${VISITORS_PER_DAY_MAX} resumos por dia (uma enxurrada não incha o arquivo)`, () => {
    const { u } = usageAt();
    for (let i = 0; i < VISITORS_PER_DAY_MAX + 50; i++) u.record({ type: 'visit', token: tok(i) });
    expect(u.toJSON().today!.seen.length).toBe(VISITORS_PER_DAY_MAX);
    expect(u.snapshot(1).days[0].visitors).toBe(VISITORS_PER_DAY_MAX);
  });
});

describe('uso: no disco', () => {
  test('ida e volta: o que um processo grava o próximo lê, inclusive quem já veio hoje', () => {
    const dir = tmp(), file = join(dir, 'stats.json');
    const a = usageAt(NOON, { file });
    a.u.record({ type: 'roomCreated' });
    a.u.record({ type: 'gameStarted', characters: [1, 2] });
    a.u.record({ type: 'visit', token: '11111111-1111-4111-8111-111111111111' });
    a.u.flush();
    expect(existsSync(file)).toBe(true);
    expect(readdirSync(dir)).toEqual(['stats.json']); // escreveu num temporário e renomeou: nada sobra
    const b = usageAt(NOON + HOUR, { file });
    b.u.load();
    b.u.record({ type: 'visit', token: '11111111-1111-4111-8111-111111111111' }); // a mesma pessoa depois do deploy
    expect(b.u.snapshot(1).days[0]).toMatchObject({ counts: { roomsCreated: 1, gamesStarted: 1, players: 2 }, visitors: 1 });
    a.u.dispose(); b.u.dispose();
  });

  test('grava sozinho, uma vez, um pouco depois da mudança', async () => {
    const dir = tmp(), file = join(dir, 'stats.json');
    const { u } = usageAt(NOON, { file, saveDelay: 20 });
    for (let i = 0; i < 50; i++) u.record({ type: 'chat' });
    expect(existsSync(file)).toBe(false);
    await sleep(60);
    expect(JSON.parse(readFileSync(file, 'utf8')).days[0].counts.chats).toBe(50);
    u.dispose();
  });

  test('arquivo torto, ausente ou pasta que não dá para escrever: começa do zero e o jogo segue', () => {
    const dir = tmp(), file = join(dir, 'stats.json');
    writeFileSync(file, '{ isto não é json');
    const a = usageAt(NOON, { file });
    expect(() => a.u.load()).not.toThrow();
    expect(a.u.snapshot(1).totals).toEqual({});
    const b = usageAt(NOON, { file: join(dir, 'nao', 'existe', 'stats.json') });
    expect(() => b.u.load()).not.toThrow();
    const c = usageAt(NOON, { file: '/proc/nao-da/stats.json' });
    c.u.record({ type: 'chat' });
    expect(() => c.u.flush()).not.toThrow();
    a.u.dispose(); b.u.dispose(); c.u.dispose();
  });

  test('o que vem do disco é conferido: números tortos somem, dias demais são cortados', () => {
    const days = Array.from({ length: 500 }, (_, i) => ({ day: dayKey(NOON - i * DAY, 'America/Sao_Paulo'), counts: { chats: 1, roomsCreated: -4, gameMs: 'x', bogus: 3 }, visitors: 2, peakOnline: 1, characters: { 3: 2, 99999: 1, x: 1 } }));
    const f = parseUsage({ version: 1, days, today: { day: '2026-11-15', salt: 'abc', seen: [1, 'ok', ...Array(30_000).fill('zz')] } }, NOON, 'America/Sao_Paulo');
    expect(f.days.length).toBe(USAGE_DAYS);
    expect(f.days[0].counts).toEqual({ chats: 1 });
    expect(f.days[0].characters).toEqual({ 3: 2 });
    expect(f.today!.seen.length).toBeLessThanOrEqual(VISITORS_PER_DAY_MAX);
    expect(f.today!.seen.every((s) => typeof s === 'string')).toBe(true);
    expect(parseUsage('lixo', NOON, 'UTC')).toEqual({ version: 1, days: [] });
  });
});
