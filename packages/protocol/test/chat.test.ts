import { describe, expect, test } from 'bun:test';
import { CHAT_MAX, cleanChat, parseClientMessage } from '../src';

const p = (m: object) => parseClientMessage(JSON.stringify(m));

describe('fala: o texto limpo', () => {
  test('fica como está o texto comum, com acentos e emoji', () => {
    expect(cleanChat('Você é o João? Não, coração!')).toBe('Você é o João? Não, coração!');
    expect(cleanChat('boa 😀')).toBe('boa 😀');
  });

  test('junta os espaços, apara as pontas e põe tudo numa linha', () => {
    expect(cleanChat('  oi   gente \n tudo\tbem  ')).toBe('oi gente tudo bem');
    expect(cleanChat('a b  c')).toBe('a b c');
  });

  test('tira caracteres de controle e de formatação (zero-width, inversão de direção)', () => {
    expect(cleanChat('a\u0000b\u0007c\u007f')).toBe('a b c');
    expect(cleanChat('oi​‮tchau⁦﻿')).toBe('oitchau');
    expect(cleanChat('\u0000​  \n')).toBe('');
  });

  test('mantém o emoji de várias partes (o junta-emoji U+200D fica)', () => {
    for (const e of ['👨\u200d👩\u200d👧', '🏳\ufe0f\u200d🌈', '👩🏽\u200d💻']) expect(cleanChat(`oi ${e}`)).toBe(`oi ${e}`);
    expect(cleanChat('a\u200d\u200d\u200db')).toBe('a\u200db'); // em fila, vira um só
  });

  test('não é HTML: as marcas ficam como texto', () => {
    expect(cleanChat('<b>oi</b> &amp;')).toBe('<b>oi</b> &amp;');
  });

  test('junta o acento solto com a letra (NFC)', () => {
    expect(cleanChat('coração')).toBe('coração');
  });

  test(`corta em ${CHAT_MAX} caracteres, sem partir um emoji nem deixar espaço no fim`, () => {
    expect(cleanChat('x'.repeat(200))).toBe('x'.repeat(CHAT_MAX));
    expect([...cleanChat('😀'.repeat(100))]).toHaveLength(CHAT_MAX);
    expect(cleanChat('x'.repeat(CHAT_MAX - 1) + ' yyy')).toBe('x'.repeat(CHAT_MAX - 1));
  });
});

describe('fala: parseClientMessage', () => {
  test('aceita um texto e já o devolve limpo', () => {
    expect(p({ type: 'chat', text: 'oi' })).toEqual({ type: 'chat', text: 'oi' });
    expect(p({ type: 'chat', text: '  oi \n\u0000 você  ', extra: 1 })).toEqual({ type: 'chat', text: 'oi você' });
    expect(p({ type: 'chat', text: 'x'.repeat(CHAT_MAX + 20) })).toEqual({ type: 'chat', text: 'x'.repeat(CHAT_MAX) });
  });

  test('descarta o que não é texto, o vazio e o grande demais', () => {
    expect(p({ type: 'chat' })).toBeNull();
    expect(p({ type: 'chat', text: 7 })).toBeNull();
    expect(p({ type: 'chat', text: ['oi'] })).toBeNull();
    expect(p({ type: 'chat', text: '' })).toBeNull();
    expect(p({ type: 'chat', text: ' \n​ ' })).toBeNull();
    expect(p({ type: 'chat', text: 'x'.repeat(CHAT_MAX * 4 + 1) })).toBeNull();
  });
});
