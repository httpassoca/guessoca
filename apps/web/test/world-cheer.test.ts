import { describe, expect, test } from 'bun:test';
import type { RoomSnapshot } from '@guess/protocol';
import { cheerTracker, newlyGot } from '../src/lib/world/cheer';
import { snapshot } from './snapshots';

const playing = (p: Partial<RoomSnapshot> = {}): RoomSnapshot => snapshot({ phase: 'playing', turn: { owner: 'm2', left: 30_000, running: true }, ...p });

describe('quem acabou de acertar, entre dois snapshots', () => {
  test('o primeiro snapshot não comemora ninguém, nem quem já tinha acertado', () => {
    expect(newlyGot(null, playing({ got: ['m2', 'm3'] }))).toEqual([]);
  });

  test('nada mudou: ninguém', () => {
    expect(newlyGot(playing({ got: ['m2'] }), playing({ got: ['m2'] }))).toEqual([]);
  });

  test('quem entrou em `got` (pela votação ou pelo moderador), eu inclusive', () => {
    expect(newlyGot(playing(), playing({ got: ['m2'] }))).toEqual(['m2']);
    expect(newlyGot(playing({ got: ['m2'] }), playing({ got: ['m2', 'm1'] }))).toEqual(['m1']);
    expect(newlyGot(playing(), playing({ got: ['m2', 'm3'] }))).toEqual(['m2', 'm3']);
  });

  test('o último acerto, que acaba o jogo, também', () => {
    expect(newlyGot(playing({ got: ['m2', 'm3'] }), snapshot({ phase: 'ended', got: ['m2', 'm3', 'm1'] }))).toEqual(['m1']);
  });

  test('desistir, errar e ser desmarcado não comemoram', () => {
    expect(newlyGot(playing(), playing({ gaveUp: ['m2'] }))).toEqual([]);
    expect(newlyGot(playing({ got: ['m2'] }), playing())).toEqual([]);
  });

  test('desmarcado e marcado de novo: comemora outra vez', () => {
    expect(newlyGot(playing({ got: ['m2'] }), playing())).toEqual([]);
    expect(newlyGot(playing(), playing({ got: ['m2'] }))).toEqual(['m2']);
  });

  test('visto por quem ainda não entrou na turma: comemora igual', () => {
    expect(newlyGot(playing({ you: null }), playing({ you: null, got: ['m2'] }))).toEqual(['m2']);
  });

  test('outra sala: é só a nova base', () => {
    expect(newlyGot(playing({ code: 'WXYZ' }), playing({ got: ['m2'] }))).toEqual([]);
  });
});

describe('o rastreador, snapshot a snapshot', () => {
  test('cada acerto comemora uma vez só, mesmo com o estado avisando de novo', () => {
    const track = cheerTracker();
    const b = playing({ got: ['m2'] });
    expect(track('open', playing())).toEqual([]);
    expect(track('open', b)).toEqual(['m2']);
    expect(track('open', b)).toEqual([]);
    expect(track('open', playing({ got: ['m2'] }))).toEqual([]);
  });

  test('quem já tinha acertado quando a aba abriu não comemora', () => {
    const track = cheerTracker();
    expect(track('connecting', null)).toEqual([]);
    expect(track('open', null)).toEqual([]);
    expect(track('open', playing({ got: ['m2'] }))).toEqual([]);
    expect(track('open', playing({ got: ['m2', 'm3'] }))).toEqual(['m3']);
  });

  test('o que aconteceu enquanto a conexão estava caída não comemora ao voltar', () => {
    const track = cheerTracker();
    const before = playing();
    expect(track('open', before)).toEqual([]);
    expect(track('reconnecting', before)).toEqual([]);
    expect(track('open', before)).toEqual([]); // abriu de novo, ainda com o snapshot velho
    expect(track('open', playing({ got: ['m2'] }))).toEqual([]);
    expect(track('open', playing({ got: ['m2', 'm3'] }))).toEqual(['m3']);
  });
});
