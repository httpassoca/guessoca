import { describe, expect, test } from 'bun:test';
import { effectsIn, rememberEffectsIn } from '../src/lib/effects';
import { fakeStorage } from './fake-storage';

describe('efeitos de tela', () => {
  test('ligados por padrão, e sem storage também', () => {
    expect(effectsIn(fakeStorage())).toBe(true);
    expect(effectsIn(null)).toBe(true);
  });

  test('desligar fica lembrado pelo navegador; ligar de novo também', () => {
    const browser = fakeStorage();
    rememberEffectsIn(browser, false);
    expect(effectsIn(browser)).toBe(false);
    rememberEffectsIn(browser, true);
    expect(effectsIn(browser)).toBe(true);
  });

  test('um valor estranho guardado conta como ligado', () => {
    const browser = fakeStorage();
    browser.setItem('guess.effects', 'talvez');
    expect(effectsIn(browser)).toBe(true);
  });
});
