import { describe, expect, test } from 'bun:test';
import { TOKEN_RE } from '@guess/protocol';
import { CHARACTERS } from '@guess/rules';
import { nicknameIn, rememberNicknameIn, SEAT_TTL, tokenIn } from '../src/lib/identity';
import { fakeStorage } from './fake-storage';

describe('identidade', () => {
  const H = 60 * 60_000;

  test('o token é sorteado uma vez por sala e por navegador, no formato do protocolo, e se repete', () => {
    const browser = fakeStorage();
    const t = tokenIn(browser, 'ABCD', 0);
    expect(t).toMatch(TOKEN_RE);
    expect(tokenIn(browser, 'ABCD', 1000)).toBe(t); // a aba fechou e abriu de novo: mesmo lugar
    expect(tokenIn(browser, 'abcd', 2000)).toBe(t); // o código não liga para maiúsculas
    expect(tokenIn(browser, 'WXYZ', 0)).not.toBe(t); // outra sala, outro token
    expect(tokenIn(fakeStorage(), 'ABCD', 0)).not.toBe(t); // outro navegador, outra pessoa
  });

  test('um token sem uso há mais de um dia é esquecido, e os velhos são limpos ao guardar outro', () => {
    const browser = fakeStorage();
    const old = tokenIn(browser, 'ABCD', 0);
    tokenIn(browser, 'WXYZ', 0);
    expect(tokenIn(browser, 'ABCD', SEAT_TTL - 1)).toBe(old); // usar renova
    const fresh = tokenIn(browser, 'QQQQ', SEAT_TTL + 1);
    expect(Object.keys(JSON.parse(browser.getItem('guess.seats')!)).sort()).toEqual(['ABCD', 'QQQQ']); // WXYZ venceu
    expect(tokenIn(browser, 'ABCD', 3 * SEAT_TTL)).not.toBe(old);
    expect(fresh).toMatch(TOKEN_RE);
    expect(SEAT_TTL).toBe(24 * H);
  });

  test('lixo guardado é trocado sem quebrar', () => {
    const browser = fakeStorage();
    browser.setItem('guess.seats', 'x');
    expect(tokenIn(browser, 'ABCD', 0)).toMatch(TOKEN_RE);
    browser.setItem('guess.seats', JSON.stringify({ ABCD: { token: 'x', at: 0 }, WXYZ: 5 }));
    const t = tokenIn(browser, 'ABCD', 0);
    expect(t).toMatch(TOKEN_RE);
    expect(t).not.toBe('x');
  });

  test('sem storage (modo privado) ainda há um token válido', () => {
    expect(tokenIn(null, 'ABCD', 0)).toMatch(TOKEN_RE);
  });

  test('o apelido é lembrado pelo navegador', () => {
    const browser = fakeStorage();
    expect(nicknameIn(browser)).toBe('');
    rememberNicknameIn(browser, 'Zé');
    expect(nicknameIn(browser)).toBe('Zé');
  });
});

describe('o que mais o navegador e a aba lembram', () => {
  test('o último personagem, por navegador; fora da faixa é nenhum', async () => {
    const { characterIn, rememberCharacterIn } = await import('../src/lib/identity');
    const browser = fakeStorage();
    expect(characterIn(browser)).toBeNull();
    rememberCharacterIn(browser, 5);
    expect(characterIn(browser)).toBe(5);
    browser.setItem('guess.character', String(CHARACTERS));
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
