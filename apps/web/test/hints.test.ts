import { describe, expect, test } from 'bun:test';
import { keysHintSeenIn, rememberKeysHintSeenIn } from '../src/lib/hints';
import { fakeStorage } from './fake-storage';

describe('dicas de primeira vez', () => {
  test('o cartão das teclas aparece até ser fechado, uma vez por navegador', () => {
    const store = fakeStorage();
    expect(keysHintSeenIn(store)).toBe(false);
    rememberKeysHintSeenIn(store);
    expect(keysHintSeenIn(store)).toBe(true);
    expect(keysHintSeenIn(null)).toBe(false);
    rememberKeysHintSeenIn(null); // sem armazenamento: não quebra
  });
});
