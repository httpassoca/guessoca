import { describe, expect, test } from 'bun:test';
import { MAX_MEMBERS, MIN_PLAYERS, NICKNAME_MAX, TURN_DEFAULT, TURN_MAX, TURN_MIN } from '@guess/rules';
import { checkCreate, checkJoin, createSettingsIn, DEFAULT_CREATE, maxPlayersOptions, rememberCreateSettingsIn } from '../src/lib/create';
import { fakeStorage } from './fake-storage';

const form = (extra = {}) => ({ nickname: 'Zé', character: 3, turnMs: 45_000, maxPlayers: 6, onlyModerate: true, ...extra });

describe('criar a sala', () => {
  test('um formulário bom vira o corpo do POST, o apelido aparado e o personagem', () => {
    expect(checkCreate(form({ nickname: '  Zé  ' }))).toEqual({ ok: true, nickname: 'Zé', character: 3, init: { turnMs: 45_000, maxPlayers: 6, onlyModerate: true } });
  });

  test('sem apelido não cria; apelido comprido é cortado', () => {
    expect(checkCreate(form({ nickname: '   ' }))).toEqual({ ok: false, problems: ['nickname'] });
    const long = checkCreate(form({ nickname: 'x'.repeat(NICKNAME_MAX + 5) }));
    expect(long.ok && long.nickname.length).toBe(NICKNAME_MAX);
  });

  test('o personagem tem de ser um dos sete', () => {
    expect(checkCreate(form({ character: null }))).toEqual({ ok: false, problems: ['character'] });
    expect(checkCreate(form({ character: 7 }))).toEqual({ ok: false, problems: ['character'] });
    expect(checkCreate(form({ character: -1 }))).toEqual({ ok: false, problems: ['character'] });
  });

  test('tamanho da vez e limite de pessoas fora da faixa são problemas', () => {
    expect(checkCreate(form({ turnMs: TURN_MIN - 15_000 }))).toEqual({ ok: false, problems: ['turnMs'] });
    expect(checkCreate(form({ turnMs: TURN_MAX + 15_000 }))).toEqual({ ok: false, problems: ['turnMs'] });
    expect(checkCreate(form({ turnMs: 50_000 }))).toEqual({ ok: false, problems: ['turnMs'] });
    expect(checkCreate(form({ maxPlayers: MIN_PLAYERS - 1 }))).toEqual({ ok: false, problems: ['maxPlayers'] });
    expect(checkCreate(form({ maxPlayers: MAX_MEMBERS + 1 }))).toEqual({ ok: false, problems: ['maxPlayers'] });
  });

  test('vários problemas de uma vez, na ordem do formulário', () => {
    expect(checkCreate(form({ nickname: '', character: null, maxPlayers: 1 }))).toEqual({ ok: false, problems: ['nickname', 'character', 'maxPlayers'] });
  });

  test('o limite de pessoas vai de 2 a 8', () => {
    expect(maxPlayersOptions()).toEqual([2, 3, 4, 5, 6, 7, 8]);
    expect(maxPlayersOptions(5)).toEqual([5, 6, 7, 8]);
    expect(maxPlayersOptions(1)).toEqual([2, 3, 4, 5, 6, 7, 8]);
  });
});

describe('entrar na sala', () => {
  test('apelido e um personagem livre', () => {
    expect(checkJoin('  Ana ', 2)).toEqual({ ok: true, nickname: 'Ana', character: 2 });
  });

  test('sem apelido ou sem personagem não entra', () => {
    expect(checkJoin('', 2)).toEqual({ ok: false, problems: ['nickname'] });
    expect(checkJoin('Ana', 7)).toEqual({ ok: false, problems: ['character'] });
    expect(checkJoin('Ana', null)).toEqual({ ok: false, problems: ['character'] });
  });
});

describe('as últimas configurações de quem cria, por navegador', () => {
  test('sem nada guardado, o padrão: 60 s, oito pessoas, jogando', () => {
    expect(DEFAULT_CREATE).toEqual({ turnMs: TURN_DEFAULT, maxPlayers: MAX_MEMBERS, onlyModerate: false });
    expect(createSettingsIn(fakeStorage())).toEqual(DEFAULT_CREATE);
    expect(createSettingsIn(null)).toEqual(DEFAULT_CREATE);
  });

  test('lembra o que foi usado da última vez', () => {
    const browser = fakeStorage();
    rememberCreateSettingsIn(browser, { turnMs: 90_000, maxPlayers: 4, onlyModerate: true });
    expect(createSettingsIn(browser)).toEqual({ turnMs: 90_000, maxPlayers: 4, onlyModerate: true });
  });

  test('o que estiver estragado volta ao padrão, campo a campo', () => {
    const browser = fakeStorage();
    browser.setItem('guess.create', JSON.stringify({ turnMs: 7, maxPlayers: 3, onlyModerate: 'sim' }));
    expect(createSettingsIn(browser)).toEqual({ ...DEFAULT_CREATE, maxPlayers: 3 });
    browser.setItem('guess.create', '{não é json');
    expect(createSettingsIn(browser)).toEqual(DEFAULT_CREATE);
  });
});
