/**
 * A tabela de tradução (ADR 0004): toda frase que a pessoa lê passa por aqui. Português é o padrão; inglês é a outra
 * língua, escolhida por navegador. O que a turma escreve (apelidos, post-its) não passa por aqui.
 *
 * Módulo puro (sem runas): `i18n.svelte.ts` põe a língua atual num `$state` e expõe `t`.
 */
export type Lang = 'pt-BR' | 'en-US';
export const LANGS: readonly Lang[] = ['pt-BR', 'en-US'];
export const DEFAULT_LANG: Lang = 'pt-BR';
export type Params = Record<string, string | number>;

const pt = {
  // línguas
  'lang.label': 'Idioma',
  'lang.pt-BR': 'português',
  'lang.en-US': 'English',
  // início
  'home.brand': 'guessoca',
  'home.tagline': 'quem sou eu? com a turma, num telhado neon',
  'home.open': 'Abrir uma sala',
  'home.opening': 'Abrindo…',
  'home.openFailed': 'Não deu para abrir a sala. O servidor está fora do ar?',
  'home.code': 'Entrar com código',
  'home.codeInvalid': 'O código tem quatro letras (sem I nem O).',
  'home.enter': 'Entrar',
  'credit.character': 'Personagem: Ozzbit Games',
  'nav.home': 'Início',
  // conexão
  'status.connecting': 'conectando…',
  'status.open': 'ao vivo',
  'status.reconnecting': 'sem conexão, tentando de novo…',
  // sala que não dá para usar
  'gone.notFound.title': 'Essa sala não existe',
  'gone.notFound.msg': 'O código pode estar errado, ou a sala já acabou.',
  'gone.ended.title': 'Essa sala acabou',
  'gone.ended.msg': 'Ficou dez minutos sem ninguém fazer nada e fechou.',
  'gone.replaced.title': 'Outra aba assumiu',
  'gone.replaced.msg': 'Esta sala continua aberta em outra aba deste navegador.',
  'gone.openNew': 'Abrir uma sala nova',
  // sala
  'sala.title': 'Sala {code}',
  'sala.share': 'Mande o código ou o link para a turma.',
  'sala.copy': 'Copiar link',
  'sala.copied': 'Copiado!',
  'sala.nickname': 'Seu apelido',
  'sala.nicknamePlaceholder': 'como a turma te chama',
  'sala.join': 'Entrar',
  'sala.rename': 'Trocar',
  'sala.full': 'A sala está cheia: já tem {max} pessoas.',
  'sala.turma': 'Turma ({count}/{max})',
  'sala.empty': 'Ninguém ainda.',
  'badge.you': 'você',
  'badge.moderator': 'moderador',
  'badge.offline': 'caiu',
};
export type MsgKey = keyof typeof pt;

const en: Record<MsgKey, string> = {
  'lang.label': 'Language',
  'lang.pt-BR': 'português',
  'lang.en-US': 'English',
  'home.brand': 'guessoca',
  'home.tagline': 'who am I? with your friends, on a neon rooftop',
  'home.open': 'Open a room',
  'home.opening': 'Opening…',
  'home.openFailed': "Couldn't open a room. Is the server down?",
  'home.code': 'Join with a code',
  'home.codeInvalid': 'The code is four letters (no I or O).',
  'home.enter': 'Join',
  'credit.character': 'Character: Ozzbit Games',
  'nav.home': 'Home',
  'status.connecting': 'connecting…',
  'status.open': 'live',
  'status.reconnecting': 'connection lost, retrying…',
  'gone.notFound.title': "This room doesn't exist",
  'gone.notFound.msg': 'The code may be wrong, or the room is already over.',
  'gone.ended.title': 'This room is over',
  'gone.ended.msg': 'Nobody did anything for ten minutes, so it closed.',
  'gone.replaced.title': 'Another tab took over',
  'gone.replaced.msg': 'This room is still open in another tab of this browser.',
  'gone.openNew': 'Open a new room',
  'sala.title': 'Room {code}',
  'sala.share': 'Send the code or the link to your friends.',
  'sala.copy': 'Copy link',
  'sala.copied': 'Copied!',
  'sala.nickname': 'Your nickname',
  'sala.nicknamePlaceholder': 'what your friends call you',
  'sala.join': 'Join',
  'sala.rename': 'Change',
  'sala.full': 'The room is full: it already has {max} people.',
  'sala.turma': 'Friends ({count}/{max})',
  'sala.empty': 'Nobody yet.',
  'badge.you': 'you',
  'badge.moderator': 'moderator',
  'badge.offline': 'dropped',
};

export const messages: Record<Lang, Record<MsgKey, string>> = { 'pt-BR': pt, 'en-US': en };

/** A frase na língua pedida; `{param}` sem valor fica à mostra (o erro aparece na tela, não some). */
export function translate(lang: Lang, key: MsgKey, params?: Params): string {
  const text = messages[lang][key];
  return params ? text.replace(/\{(\w+)\}/g, (m, p: string) => (p in params ? String(params[p]) : m)) : text;
}

const LANG_KEY = 'guess.lang';
/** O localStorage, ou nada (teste, modo privado): aí a escolha vale só para a aba. */
type MaybeStore = Pick<Storage, 'getItem' | 'setItem'> | null | undefined;

const isLang = (s: string): s is Lang => (LANGS as string[]).includes(s);
/** A língua lembrada pelo navegador; português quando não há nada (ou algo que não é língua) guardado. */
export function readLang(store: MaybeStore): Lang {
  let s = '';
  try { s = store?.getItem(LANG_KEY) ?? ''; } catch { /* bloqueado */ }
  return isLang(s) ? s : DEFAULT_LANG;
}
export function writeLang(store: MaybeStore, lang: Lang) { try { store?.setItem(LANG_KEY, lang); } catch { /* modo privado ou bloqueado: segue sem lembrar */ } }
