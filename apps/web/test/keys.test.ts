import { describe, expect, test } from 'bun:test';
import { isTextField, keyAction, type KeyContext } from '../src/lib/keys';

const myTurn: KeyContext = { inTextField: false, canClaim: true, canSkip: true };
const notMine: KeyContext = { inTextField: false, canClaim: false, canSkip: false };
const typing: KeyContext = { inTextField: true, canClaim: true, canSkip: true };
const press = (key: string, extra = {}) => ({ key, ...extra });

describe('teclado', () => {
  test('Enter é Acertei e Tab passa a vez, só na própria vez', () => {
    expect(keyAction(press('Enter'), myTurn)).toBe('claim');
    expect(keyAction(press('Tab'), myTurn)).toBe('skip');
    expect(keyAction(press('Enter'), notMine)).toBeNull();
    expect(keyAction(press('Tab'), notMine)).toBeNull(); // o Tab de sempre: anda entre os botões
  });

  test('N abre o bloco e Esc o menu, a qualquer momento', () => {
    expect(keyAction(press('n'), notMine)).toBe('notepad');
    expect(keyAction(press('N'), notMine)).toBe('notepad');
    expect(keyAction(press('Escape'), notMine)).toBe('menu');
  });

  test('num campo de texto as teclas são do texto; Esc só sai do campo', () => {
    expect(keyAction(press('Enter'), typing)).toBeNull();
    expect(keyAction(press('Tab'), typing)).toBeNull();
    expect(keyAction(press('n'), typing)).toBeNull();
    expect(keyAction(press('Escape'), typing)).toBe('blur');
  });

  test('com Ctrl, Alt, Meta ou Shift, ou tecla repetida, não é atalho', () => {
    for (const mod of [{ ctrlKey: true }, { altKey: true }, { metaKey: true }]) {
      expect(keyAction(press('n', mod), myTurn)).toBeNull();
      expect(keyAction(press('Enter', mod), myTurn)).toBeNull();
    }
    expect(keyAction(press('Tab', { shiftKey: true }), myTurn)).toBeNull();
    expect(keyAction(press('Enter', { repeat: true }), myTurn)).toBeNull();
  });

  test('outras teclas não fazem nada', () => {
    for (const k of ['a', ' ', 'ArrowLeft', 'j', '1']) expect(keyAction(press(k), myTurn)).toBeNull();
  });

  test('campo de texto: input de texto, textarea, select e editável; botão e caixa de marcar não', () => {
    expect(isTextField({ tagName: 'INPUT', type: 'text' })).toBe(true);
    expect(isTextField({ tagName: 'INPUT', type: 'search' })).toBe(true);
    expect(isTextField({ tagName: 'TEXTAREA' })).toBe(true);
    expect(isTextField({ tagName: 'SELECT' })).toBe(true);
    expect(isTextField({ tagName: 'DIV', isContentEditable: true })).toBe(true);
    expect(isTextField({ tagName: 'INPUT', type: 'checkbox' })).toBe(false);
    expect(isTextField({ tagName: 'INPUT', type: 'file' })).toBe(false);
    expect(isTextField({ tagName: 'BUTTON' })).toBe(false);
    expect(isTextField(null)).toBe(false);
  });
});
