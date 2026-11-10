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
  test('o último personagem, por navegador; fora de 0..12 é nenhum', async () => {
    const { characterIn, rememberCharacterIn } = await import('../src/lib/identity');
    const browser = fakeStorage();
    expect(characterIn(browser)).toBeNull();
    rememberCharacterIn(browser, 5);
    expect(characterIn(browser)).toBe(5);
    browser.setItem('guess.character', '13');
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

describe('o que atravessa a ida do pré-lobby para a sala', () => {
  test('quem criou a sala entra sozinho nela, uma vez, nesta aba', async () => {
    const { autoJoinIn, rememberAutoJoinIn, takeAutoJoinIn } = await import('../src/lib/identity');
    const tab = fakeStorage();
    expect(autoJoinIn(tab, 'ABCD')).toBe(false);
    rememberAutoJoinIn(tab, 'ABCD');
    expect(autoJoinIn(tab, 'WXYZ')).toBe(false); // outra sala
    expect(autoJoinIn(tab, 'ABCD')).toBe(true);
    expect(takeAutoJoinIn(tab, 'ABCD')).toBe(true);
    expect(autoJoinIn(tab, 'ABCD')).toBe(false); // já usado
    expect(takeAutoJoinIn(tab, 'ABCD')).toBe(false);
    expect(autoJoinIn(null, 'ABCD')).toBe(false);
  });

  test('o bloco aberto ou minimizado, por aba; começa aberto', async () => {
    const { notepadMinimizedIn, rememberNotepadMinimizedIn } = await import('../src/lib/identity');
    const tab = fakeStorage();
    expect(notepadMinimizedIn(tab)).toBe(false);
    rememberNotepadMinimizedIn(tab, true);
    expect(notepadMinimizedIn(tab)).toBe(true);
    rememberNotepadMinimizedIn(tab, false);
    expect(notepadMinimizedIn(tab)).toBe(false);
    expect(notepadMinimizedIn(null)).toBe(false);
  });

  test('a coluna recolhida ou não, por aba; começa aberta', async () => {
    const { sideCollapsedIn, rememberSideCollapsedIn } = await import('../src/lib/identity');
    const tab = fakeStorage();
    expect(sideCollapsedIn(tab)).toBe(false);
    rememberSideCollapsedIn(tab, true);
    expect(sideCollapsedIn(tab)).toBe(true);
  });
});

describe('o zoom do telhado', () => {
  test('lembrado no navegador; nada guardado ou lixo é 0', async () => {
    const { zoomIn, rememberZoomIn } = await import('../src/lib/identity');
    const data = new Map<string, string>();
    const store = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
    expect(zoomIn(store)).toBe(0);
    rememberZoomIn(store, -1);
    expect(zoomIn(store)).toBe(-1);
    data.set('guess.zoom', 'muito');
    expect(zoomIn(store)).toBe(0);
    data.set('guess.zoom', '99');
    expect(zoomIn(store)).toBe(0);
    expect(zoomIn(null)).toBe(0);
  });
});
