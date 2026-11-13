import { describe, expect, test } from 'bun:test';
import { DEFAULT_VOLUME, gainOf, mixerOf, rememberMutedIn, rememberVolumeIn, soundIn } from '../src/lib/sound/settings';
import { fakeStorage } from './fake-storage';

describe('duas mesas de som e o mudo, por navegador', () => {
  test('sem nada guardado: as duas em 60, com som', () => {
    expect(DEFAULT_VOLUME).toBe(60);
    expect(soundIn(fakeStorage())).toEqual({ map: 60, game: 60, muted: false });
    expect(soundIn(null)).toEqual({ map: 60, game: 60, muted: false });
  });

  test('cada mesa lembra o seu volume, inteiro entre 0 e 100, sem mexer na outra', () => {
    const browser = fakeStorage();
    rememberVolumeIn(browser, 'map', 35);
    expect(soundIn(browser)).toEqual({ map: 35, game: 60, muted: false });
    rememberVolumeIn(browser, 'game', 140);
    expect(soundIn(browser)).toEqual({ map: 35, game: 100, muted: false });
    rememberVolumeIn(browser, 'map', -3);
    expect(soundIn(browser).map).toBe(0);
    rememberVolumeIn(browser, 'game', 42.6);
    expect(soundIn(browser).game).toBe(43);
  });

  test('o volume único de antes vale para as duas até cada uma ter o seu', () => {
    const browser = fakeStorage();
    browser.setItem('guess.volume', '20');
    expect(soundIn(browser)).toEqual({ map: 20, game: 20, muted: false });
    rememberVolumeIn(browser, 'game', 80);
    expect(soundIn(browser)).toEqual({ map: 20, game: 80, muted: false });
  });

  test('um volume guardado estragado volta ao padrão ou ao limite', () => {
    const browser = fakeStorage();
    browser.setItem('guess.volume.map', 'alto');
    expect(soundIn(browser).map).toBe(60);
    browser.setItem('guess.volume.map', '250');
    expect(soundIn(browser).map).toBe(100);
  });

  test('o mudo é lembrado e cala as duas', () => {
    const browser = fakeStorage();
    rememberMutedIn(browser, true);
    expect(soundIn(browser)).toEqual({ map: 60, game: 60, muted: true });
    expect(gainOf(soundIn(browser), 'map')).toBe(0);
    expect(gainOf(soundIn(browser), 'game')).toBe(0);
    rememberMutedIn(browser, false);
    expect(soundIn(browser).muted).toBe(false);
  });

  test('o ganho de cada mesa: zero no volume 0, cheio no 100, cresce com o volume, e uma não mexe na outra', () => {
    const s = { map: 0, game: 100, muted: false };
    expect(gainOf(s, 'map')).toBe(0);
    expect(gainOf(s, 'game')).toBe(1);
    expect(gainOf({ map: 30, game: 60, muted: false }, 'map')).toBeLessThan(gainOf({ map: 30, game: 60, muted: false }, 'game'));
  });

  test('pular, empurrar, a trilha, o trovão e a sirene são do mapa; votação, acerto e fim de vez são do jogo', () => {
    expect((['jump', 'shove', 'music', 'thunder', 'siren', 'strike'] as const).map(mixerOf)).toEqual(['map', 'map', 'map', 'map', 'map', 'map']);
    expect((['vote', 'gotIt', 'turnEnd', 'yourTurn'] as const).map(mixerOf)).toEqual(['game', 'game', 'game', 'game']);
  });
});
