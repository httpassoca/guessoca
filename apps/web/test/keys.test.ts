import { describe, expect, test } from 'bun:test';
import { isTextField, keyAction, swallowsSpace, worldKey, type KeyContext } from '../src/lib/keys';

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

describe('teclado do telhado', () => {
  const free = { blocked: false };
  const key = (code: string, extra = {}) => ({ key: '', code, ...extra });

  test('A/D e ←/→ andam; W/S e ↑/↓ mudam a profundidade (W/↑ = para o fundo); Shift corre', () => {
    expect(worldKey(key('KeyA'), free)).toEqual({ hold: 'left' });
    expect(worldKey(key('ArrowLeft'), free)).toEqual({ hold: 'left' });
    expect(worldKey(key('KeyD'), free)).toEqual({ hold: 'right' });
    expect(worldKey(key('ArrowRight'), free)).toEqual({ hold: 'right' });
    expect(worldKey(key('KeyW'), free)).toEqual({ hold: 'up' });
    expect(worldKey(key('ArrowUp'), free)).toEqual({ hold: 'up' });
    expect(worldKey(key('KeyS'), free)).toEqual({ hold: 'down' });
    expect(worldKey(key('ArrowDown'), free)).toEqual({ hold: 'down' });
    expect(worldKey(key('ShiftLeft', { shiftKey: true }), free)).toEqual({ hold: 'run' });
    expect(worldKey(key('ShiftRight', { shiftKey: true }), free)).toEqual({ hold: 'run' });
  });

  test('pela posição da tecla, não pela letra: correndo (Shift) a letra vira maiúscula e ainda anda', () => {
    expect(worldKey({ key: 'A', code: 'KeyA', shiftKey: true }, free)).toEqual({ hold: 'left' });
    expect(worldKey({ key: '!', code: 'Digit1', shiftKey: true }, free)).toEqual({ emote: 0 });
  });

  test('Espaço pula e J empurra, só no aperto (tecla repetida não conta)', () => {
    expect(worldKey(key('Space'), free)).toEqual({ press: 'jump' });
    expect(worldKey(key('KeyJ'), free)).toEqual({ press: 'shove' });
    expect(worldKey(key('Space', { repeat: true }), free)).toBeNull();
    expect(worldKey(key('KeyJ', { repeat: true }), free)).toBeNull();
    expect(worldKey(key('KeyA', { repeat: true }), free)).toEqual({ hold: 'left' }); // segurar é segurar
  });

  test('1–4 são os emotes, na ordem', () => {
    expect(worldKey(key('Digit1'), free)).toEqual({ emote: 0 });
    expect(worldKey(key('Digit4'), free)).toEqual({ emote: 3 });
    expect(worldKey(key('Numpad2'), free)).toEqual({ emote: 1 });
    expect(worldKey(key('Digit5'), free)).toBeNull();
    expect(worldKey(key('Digit1', { repeat: true }), free)).toBeNull();
  });

  test('num campo de texto ou com o menu/bloco aberto, o telhado não ouve', () => {
    for (const code of ['KeyA', 'ArrowLeft', 'Space', 'KeyJ', 'Digit1', 'ShiftLeft']) expect(worldKey(key(code), { blocked: true })).toBeNull();
  });

  test('com Ctrl, Alt ou Meta é atalho do navegador, não do telhado', () => {
    for (const mod of [{ ctrlKey: true }, { altKey: true }, { metaKey: true }]) expect(worldKey(key('KeyA', mod), free)).toBeNull();
  });

  test('as teclas do jogo não viram teclas do telhado, e vice-versa', () => {
    for (const k of [{ key: 'Enter', code: 'Enter' }, { key: 'Tab', code: 'Tab' }, { key: 'n', code: 'KeyN' }, { key: 'Escape', code: 'Escape' }]) expect(worldKey(k, free)).toBeNull();
    for (const k of [{ key: 'a', code: 'KeyA' }, { key: ' ', code: 'Space' }, { key: 'j', code: 'KeyJ' }, { key: '1', code: 'Digit1' }]) expect(keyAction(k, myTurn)).toBeNull();
  });

  test('Espaço é do telhado mesmo com um botão focado (não aperta o botão nem rola a página); num campo é do texto', () => {
    expect(swallowsSpace({ key: ' ', code: 'Space' }, { blocked: false })).toBe(true);
    expect(swallowsSpace({ key: ' ', code: 'Space' }, { blocked: true })).toBe(false);
    expect(swallowsSpace({ key: 'a', code: 'KeyA' }, { blocked: false })).toBe(false);
  });
});
