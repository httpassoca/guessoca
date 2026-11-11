import { describe, expect, test } from 'bun:test';
import { NO_SECRET, SEQUENCE, secretKey, stepCharacter, type Secret } from '../src/lib/secret';

const CODES = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' } as const;
const type = (codes: string[], from: Secret = NO_SECRET, blocked = false) => codes.reduce((s, code) => secretKey(s, { code }, blocked).secret, from);
const whole = SEQUENCE.map((d) => CODES[d]);

describe('o segredo', () => {
  test('a sequência inteira destrava, com as setas ou com WASD; antes disso as teclas de passo não fazem nada', () => {
    expect(secretKey(NO_SECRET, { code: 'Period' }, false).step).toBeNull();
    expect(type(whole).unlocked).toBe(true);
    expect(type(['KeyW', 'KeyW', 'KeyS', 'KeyS', 'KeyA', 'KeyD', 'KeyA', 'KeyD']).unlocked).toBe(true);
    expect(type(whole.slice(0, 7)).unlocked).toBe(false);
  });

  test('uma tecla errada recomeça; um cima a mais não perde os dois primeiros', () => {
    expect(type([...whole.slice(0, 5), 'KeyJ', ...whole.slice(5)]).unlocked).toBe(false);
    expect(type(['ArrowUp', ...whole]).unlocked).toBe(true);
    expect(type(['ArrowLeft', ...whole]).unlocked).toBe(true);
  });

  test('destravado, vírgula e ponto dão o passo; segurar a tecla, um atalho ou um campo de texto não', () => {
    const open = type(whole);
    expect(secretKey(open, { code: 'Period' }, false).step).toBe(1);
    expect(secretKey(open, { code: 'Comma' }, false).step).toBe(-1);
    expect(secretKey(open, { code: 'Period', repeat: true }, false).step).toBeNull();
    expect(secretKey(open, { code: 'Period', ctrlKey: true }, false).step).toBeNull();
    expect(secretKey(open, { code: 'Period' }, true).step).toBeNull();
    expect(secretKey(open, { code: 'KeyJ' }, false)).toEqual({ secret: open, step: null });
  });

  test('num campo de texto a sequência não anda', () => {
    expect(type(whole, NO_SECRET, true)).toEqual(NO_SECRET);
  });

  test('o passo dá a volta', () => {
    expect(stepCharacter(0, -1, 23)).toBe(22);
    expect(stepCharacter(22, 1, 23)).toBe(0);
    expect(stepCharacter(4, 1, 23)).toBe(5);
  });
});
