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

describe('o que mais o navegador e a aba lembram', () => {
  test('o último personagem, por navegador; fora de 0..7 é nenhum', async () => {
    const { characterIn, rememberCharacterIn } = await import('../src/lib/identity');
    const browser = fakeStorage();
    expect(characterIn(browser)).toBeNull();
    rememberCharacterIn(browser, 5);
    expect(characterIn(browser)).toBe(5);
    browser.setItem('guess.character', '9');
    expect(characterIn(browser)).toBeNull();
    browser.setItem('guess.character', 'x');
    expect(characterIn(browser)).toBeNull();
    expect(characterIn(null)).toBeNull();
  });

  test('o bloco, por aba e por sala', async () => {
    const { notepadIn, rememberNotepadIn } = await import('../src/lib/identity');
    const tab = fakeStorage();
    expect(notepadIn(tab, 'ABCD')).toBe('');
    rememberNotepadIn(tab, 'ABCD', 'sou bicho?\nnão');
    expect(notepadIn(tab, 'ABCD')).toBe('sou bicho?\nnão');
    expect(notepadIn(tab, 'WXYZ')).toBe('');
  });
});
