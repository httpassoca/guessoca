import { describe, expect, test } from 'bun:test';
import { DEFAULT_VOLUME, gainOf, rememberMutedIn, rememberVolumeIn, soundIn } from '../src/lib/sound/settings';
import { fakeStorage } from './fake-storage';

describe('volume e mudo, por navegador', () => {
  test('sem nada guardado: volume 60, com som', () => {
    expect(DEFAULT_VOLUME).toBe(60);
    expect(soundIn(fakeStorage())).toEqual({ volume: 60, muted: false });
    expect(soundIn(null)).toEqual({ volume: 60, muted: false });
  });

  test('o volume é lembrado, inteiro entre 0 e 100', () => {
    const browser = fakeStorage();
    rememberVolumeIn(browser, 35);
    expect(soundIn(browser).volume).toBe(35);
    rememberVolumeIn(browser, 140);
    expect(soundIn(browser).volume).toBe(100);
    rememberVolumeIn(browser, -3);
    expect(soundIn(browser).volume).toBe(0);
    rememberVolumeIn(browser, 42.6);
    expect(soundIn(browser).volume).toBe(43);
  });

  test('um volume guardado estragado volta ao padrão ou ao limite', () => {
    const browser = fakeStorage();
    browser.setItem('guess.volume', 'alto');
    expect(soundIn(browser).volume).toBe(60);
    browser.setItem('guess.volume', '250');
    expect(soundIn(browser).volume).toBe(100);
  });

  test('o mudo é lembrado', () => {
    const browser = fakeStorage();
    rememberMutedIn(browser, true);
    expect(soundIn(browser)).toEqual({ volume: 60, muted: true });
    rememberMutedIn(browser, false);
    expect(soundIn(browser).muted).toBe(false);
  });

  test('o ganho: zero no mudo ou no volume 0, cheio no 100, e cresce com o volume', () => {
    expect(gainOf({ volume: 80, muted: true })).toBe(0);
    expect(gainOf({ volume: 0, muted: false })).toBe(0);
    expect(gainOf({ volume: 100, muted: false })).toBe(1);
    expect(gainOf({ volume: 30, muted: false })).toBeLessThan(gainOf({ volume: 60, muted: false }));
  });
});
