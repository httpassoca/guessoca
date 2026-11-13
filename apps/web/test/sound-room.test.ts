import { describe, expect, test } from 'bun:test';
import type { RoomSnapshot } from '@guess/protocol';
import { roomSounds, roomSoundsTracker } from '../src/lib/sound/room';
import { snapshot } from './snapshots';

/** Jogo correndo, vez de `owner` com `left` ms sobrando, salvo o que o teste mudar. */
const playing = (owner: string, p: Partial<RoomSnapshot> = {}, left = 30_000): RoomSnapshot =>
  snapshot({ phase: 'playing', turn: { owner, left, running: true }, ...p });
const vote = (claimer: string) => ({ claimer, voters: ['m1', 'm2', 'm3'].filter((id) => id !== claimer), voted: [], yours: null, left: 15_000 });

describe('os sons da sala, entre dois snapshots', () => {
  test('o primeiro snapshot não toca nada', () => {
    expect(roomSounds(null, playing('m2', { vote: vote('m2') }), 'm1')).toEqual([]);
  });

  test('nada mudou, nada toca', () => {
    expect(roomSounds(playing('m2'), playing('m2', {}, 20_000), 'm1')).toEqual([]);
  });

  test('a votação abriu: vote', () => {
    expect(roomSounds(playing('m2'), playing('m2', { vote: vote('m2') }), 'm1')).toEqual(['vote']);
  });

  test('a votação continua aberta: não toca de novo', () => {
    expect(roomSounds(playing('m2', { vote: vote('m2') }), playing('m2', { vote: { ...vote('m2'), voted: ['m1'] } }), 'm1')).toEqual([]);
  });

  test('alguém acertou: gotIt, mesmo com a vez passando junto (sem turnEnd)', () => {
    const prev = playing('m2', { vote: vote('m2') });
    const next = playing('m3', { got: ['m2'] }, 60_000);
    expect(roomSounds(prev, next, 'm1')).toEqual(['gotIt']);
  });

  test('o moderador marcou alguém que não era da vez: gotIt', () => {
    expect(roomSounds(playing('m2'), playing('m2', { got: ['m3'] }), 'm1')).toEqual(['gotIt']);
  });

  test('a vez passou sem ninguém acertar (tempo acabou, passou, desistiu): turnEnd', () => {
    expect(roomSounds(playing('m2', {}, 200), playing('m3', {}, 60_000), 'm1')).toEqual(['turnEnd']);
    expect(roomSounds(playing('m2'), playing('m3', { gaveUp: ['m2'] }, 60_000), 'm1')).toEqual(['turnEnd']);
  });

  test('só sobrou uma pessoa e a vez dela recomeçou: turnEnd', () => {
    expect(roomSounds(playing('m2', {}, 300), playing('m2', {}, 60_000), 'm1')).toEqual(['turnEnd']);
  });

  test('a votação deu não e a vez volta a correr: nada', () => {
    expect(roomSounds(playing('m2', { vote: vote('m2') }, 20_000), playing('m2', {}, 20_000), 'm1')).toEqual([]);
  });

  test('pausar e voltar: nada', () => {
    const paused = playing('m2', { paused: true, turn: { owner: 'm2', left: 20_000, running: false } });
    expect(roomSounds(playing('m2', {}, 20_000), paused, 'm1')).toEqual([]);
    expect(roomSounds(paused, playing('m2', {}, 20_000), 'm1')).toEqual([]);
  });

  test('o jogo acabou de começar: a primeira vez não é fim de vez', () => {
    expect(roomSounds(snapshot({ phase: 'lobby' }), playing('m2', {}, 60_000), 'm1')).toEqual([]);
  });

  test('o jogo acabou: sem turnEnd', () => {
    expect(roomSounds(playing('m2'), snapshot({ phase: 'ended', gaveUp: ['m1', 'm2', 'm3'] }), 'm1')).toEqual([]);
  });

  test('a minha vez começou: yourTurn (no lugar de turnEnd), também na primeira vez do jogo', () => {
    expect(roomSounds(playing('m2', {}, 200), playing('m1', {}, 60_000), 'm1')).toEqual(['yourTurn']);
    expect(roomSounds(snapshot({ phase: 'lobby' }), playing('m1', {}, 60_000), 'm1')).toEqual(['yourTurn']);
    expect(roomSounds(playing('m2', { vote: vote('m2') }), playing('m1', { got: ['m2'] }, 60_000), 'm1')).toEqual(['gotIt', 'yourTurn']);
    expect(roomSounds(playing('m1', {}, 300), playing('m1', {}, 60_000), 'm1')).toEqual(['yourTurn']); // só sobrei eu
  });

  test('a minha vez continua (votação deu não, pausa): nada', () => {
    expect(roomSounds(playing('m1', { vote: vote('m1') }, 20_000), playing('m1', {}, 20_000), 'm1')).toEqual([]);
    expect(roomSounds(playing('m1', {}, 20_000), playing('m1', { paused: true, turn: { owner: 'm1', left: 20_000, running: false } }), 'm1')).toEqual([]);
  });

  test('acabei de entrar na turma (o snapshot anterior não era meu): nada', () => {
    expect(roomSounds(playing('m2', { you: null }), playing('m3', { got: ['m2'], vote: vote('m3') }), 'm1')).toEqual([]);
  });
});

describe('os sons da sala, snapshot a snapshot', () => {
  test('o primeiro snapshot é só a base; o mesmo snapshot de novo não toca', () => {
    const feed = roomSoundsTracker();
    const a = playing('m2');
    expect(feed('open', a, 'm1')).toEqual([]);
    expect(feed('open', a, 'm1')).toEqual([]);
    const b = playing('m2', { vote: vote('m2') });
    expect(feed('open', b, 'm1')).toEqual(['vote']);
    expect(feed('open', b, 'm1')).toEqual([]); // o estado mudou por outra coisa (erro, status), o snapshot é o mesmo
  });

  test('ao reconectar, o que aconteceu enquanto estava fora não toca', () => {
    const feed = roomSoundsTracker();
    const a = playing('m2');
    feed('open', a, 'm1');
    expect(feed('reconnecting', a, 'm1')).toEqual([]);
    expect(feed('open', a, 'm1')).toEqual([]); // abriu, mas o snapshot ainda é o velho
    const replay = playing('m3', { got: ['m2'], vote: vote('m3') }, 60_000);
    expect(feed('open', replay, 'm1')).toEqual([]); // o snapshot inteiro que o servidor manda ao voltar
    expect(feed('open', playing('m1', { got: ['m2'] }, 60_000), 'm1')).toEqual(['yourTurn']); // daí em diante, normal
  });

  test('sem sala, nada', () => {
    expect(roomSoundsTracker()('open', null, 'm1')).toEqual([]);
  });
});
