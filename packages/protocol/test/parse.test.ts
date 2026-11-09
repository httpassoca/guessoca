import { describe, expect, test } from 'bun:test';
import { CODE_RE, parseClientMessage, TOKEN_RE } from '../src';

describe('parseClientMessage', () => {
  test('aceita as mensagens válidas', () => {
    expect(parseClientMessage('{"type":"ping"}')).toEqual({ type: 'ping' });
    expect(parseClientMessage('{"type":"join","nickname":"Zé"}')).toEqual({ type: 'join', nickname: 'Zé' });
    expect(parseClientMessage('{"type":"nickname","nickname":"Ana"}')).toEqual({ type: 'nickname', nickname: 'Ana' });
  });

  test('descarta o que não é JSON, não é objeto ou não tem tipo conhecido', () => {
    for (const raw of ['', 'oi', '[]', 'null', '42', '{"type":"voar"}', '{}']) expect(parseClientMessage(raw)).toBeNull();
    expect(parseClientMessage(123)).toBeNull();
  });

  test('descarta campos com o tipo errado ou grandes demais', () => {
    expect(parseClientMessage('{"type":"join"}')).toBeNull();
    expect(parseClientMessage('{"type":"join","nickname":7}')).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: 'join', nickname: 'x'.repeat(500) }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: 'ping', pad: 'x'.repeat(5000) }))).toBeNull();
  });

  test('só leva os campos conhecidos', () => {
    expect(parseClientMessage('{"type":"ping","extra":1}')).toEqual({ type: 'ping' });
  });
});

describe('formatos', () => {
  test('código de sala: quatro letras sem I nem O', () => {
    expect(CODE_RE.test('ABCD')).toBe(true);
    expect(CODE_RE.test('ABCI')).toBe(false);
    expect(CODE_RE.test('abcd')).toBe(false);
    expect(CODE_RE.test('ABCDE')).toBe(false);
  });

  test('token: 8 a 64 caracteres seguros para URL', () => {
    expect(TOKEN_RE.test('abcdEFGH_-12')).toBe(true);
    expect(TOKEN_RE.test('short')).toBe(false);
    expect(TOKEN_RE.test('com espaço aqui')).toBe(false);
  });
});
