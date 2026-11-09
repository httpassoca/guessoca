import { describe, expect, test } from 'bun:test';
import { cleanNickname, FALLBACK_NICKNAME, NICKNAME_MAX, uniqueNickname } from '../src';

describe('apelido', () => {
  test('junta espaços e apara', () => {
    expect(cleanNickname('  Zé   da  Silva ')).toBe('Zé da Silva');
  });

  test('vazio vira o apelido padrão', () => {
    expect(cleanNickname('   ')).toBe(FALLBACK_NICKNAME);
  });

  test('corta no tamanho máximo', () => {
    expect(cleanNickname('a'.repeat(50))).toHaveLength(NICKNAME_MAX);
  });

  test('apelido repetido ganha sufixo, sem diferenciar maiúsculas', () => {
    expect(uniqueNickname('zé', ['Zé'])).toBe('zé 2');
    expect(uniqueNickname('Zé', ['Zé', 'zé 2'])).toBe('Zé 3');
  });

  test('apelido livre fica como está', () => {
    expect(uniqueNickname('Ana', ['Zé'])).toBe('Ana');
  });

  test('o sufixo cabe no tamanho máximo', () => {
    const long = 'b'.repeat(NICKNAME_MAX);
    const got = uniqueNickname(long, [long]);
    expect(got).toHaveLength(NICKNAME_MAX);
    expect(got.endsWith(' 2')).toBe(true);
  });
});
