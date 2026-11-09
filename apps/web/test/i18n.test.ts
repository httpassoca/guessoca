import { describe, expect, test } from 'bun:test';
import { DEFAULT_LANG, LANGS, messages, readLang, translate, writeLang, type MsgKey } from '../src/lib/i18n';
import { fakeStorage } from './fake-storage';

describe('tabela de tradução', () => {
  test('português é o padrão e o inglês é a outra língua', () => {
    expect(DEFAULT_LANG).toBe('pt-BR');
    expect(LANGS).toEqual(['pt-BR', 'en-US']);
  });

  test('toda chave existe nas duas línguas, sem texto vazio', () => {
    const keys = Object.keys(messages['pt-BR']) as MsgKey[];
    expect(keys.length).toBeGreaterThan(20);
    for (const lang of LANGS) for (const k of keys) expect(messages[lang][k], `${lang}.${k}`).not.toBe('');
    expect(Object.keys(messages['en-US']).sort()).toEqual(keys.slice().sort());
  });

  test('os dois textos de cada chave usam os mesmos parâmetros', () => {
    const params = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const k of Object.keys(messages['pt-BR']) as MsgKey[]) expect(params(messages['en-US'][k]), k).toEqual(params(messages['pt-BR'][k]));
  });

  test('traduz por chave e interpola parâmetros; parâmetro que falta fica à mostra', () => {
    expect(translate('pt-BR', 'home.open')).toBe('Abrir uma sala');
    expect(translate('en-US', 'home.open')).toBe('Open a room');
    expect(translate('pt-BR', 'sala.title', { code: 'ABCD' })).toBe('Sala ABCD');
    expect(translate('en-US', 'sala.title', { code: 'ABCD' })).toBe('Room ABCD');
    expect(translate('pt-BR', 'sala.title')).toBe('Sala {code}');
  });

  test('o crédito do personagem está nas duas línguas', () => {
    for (const lang of LANGS) expect(translate(lang, 'credit.character')).toContain('Ozzbit Games');
  });

  test('a língua é lembrada pelo navegador, com português quando não há nada guardado', () => {
    const store = fakeStorage();
    expect(readLang(store)).toBe('pt-BR');
    writeLang(store, 'en-US');
    expect(readLang(store)).toBe('en-US');
    store.setItem('guess.lang', 'klingon');
    expect(readLang(store)).toBe('pt-BR');
    expect(readLang(null)).toBe('pt-BR');
    writeLang(null, 'en-US'); // sem storage: não quebra
  });
});
