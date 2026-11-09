import { readLang, translate, writeLang, type Lang, type MsgKey, type Params } from './i18n';

const store = typeof localStorage === 'undefined' ? null : localStorage;

/** A língua desta aba, reativa: todo texto lido por `t` acompanha a troca. Lembrada pelo navegador (localStorage). */
export const i18n = $state({ lang: readLang(store) });

/** A frase na língua da hora. Em componentes, ler `t(...)` já reage à troca de língua. */
export const t = (key: MsgKey, params?: Params) => translate(i18n.lang, key, params);

/** O `<html lang>` acompanha, para o navegador (leitor de tela, corretor, tradução automática) saber a língua da página. */
const applyToDocument = (lang: Lang) => { if (typeof document !== 'undefined') document.documentElement.lang = lang; };
applyToDocument(i18n.lang);

export function setLang(lang: Lang) {
  i18n.lang = lang;
  writeLang(store, lang);
  applyToDocument(lang);
}
