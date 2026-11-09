import { describe, expect, test } from 'bun:test';
import { TOKEN_RE } from '@guess/protocol';
import { nicknameIn, rememberNicknameIn, tokenIn } from '../src/lib/identity';
import { fakeStorage } from './fake-storage';

describe('identidade', () => {
  test('o token é sorteado uma vez por aba, no formato do protocolo, e se repete', () => {
    const tab = fakeStorage();
    const t = tokenIn(tab);
    expect(t).toMatch(TOKEN_RE);
    expect(tokenIn(tab)).toBe(t);
    expect(tokenIn(fakeStorage())).not.toBe(t); // outra aba, outra pessoa
  });

  test('um token guardado fora do formato é trocado', () => {
    const tab = fakeStorage();
    tab.setItem('guess.token', 'x');
    const t = tokenIn(tab);
    expect(t).toMatch(TOKEN_RE);
    expect(t).not.toBe('x');
  });

  test('sem storage (modo privado) ainda há um token válido', () => {
    expect(tokenIn(null)).toMatch(TOKEN_RE);
  });

  test('o apelido é lembrado pelo navegador', () => {
    const browser = fakeStorage();
    expect(nicknameIn(browser)).toBe('');
    rememberNicknameIn(browser, 'Zé');
    expect(nicknameIn(browser)).toBe('Zé');
  });
});
