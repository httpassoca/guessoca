/**
 * Quem esta aba é para o servidor, e o que o navegador lembra entre visitas (ADR 0003). O token vive na aba
 * (sessionStorage): sobrevive a refresh e queda de rede, e duas abas do mesmo navegador são duas pessoas na sala.
 * O apelido e o último personagem são lembrados pelo navegador inteiro (localStorage); o bloco, só pela aba.
 */
import { TOKEN_RE } from '@guess/protocol';
import { CHARACTERS } from '@guess/rules';

const TOKEN_KEY = 'guess.token';
const NICKNAME_KEY = 'guess.nickname';
const CHARACTER_KEY = 'guess.character';
const NOTEPAD_KEY = 'guess.notepad.';

/** O storage, ou nada (teste, modo privado): aí nada fica lembrado e segue sem quebrar. */
export type MaybeStore = Pick<Storage, 'getItem' | 'setItem'> | null;
export const local = (): MaybeStore => (typeof localStorage === 'undefined' ? null : localStorage);
const session = (): MaybeStore => (typeof sessionStorage === 'undefined' ? null : sessionStorage);

/** Lê uma chave; nada guardado (ou storage bloqueado) é ''. */
export function readKey(store: MaybeStore, key: string) { try { return store?.getItem(key) ?? ''; } catch { return ''; } }
export function writeKey(store: MaybeStore, key: string, value: string) { try { store?.setItem(key, value); } catch { /* modo privado ou bloqueado: segue sem lembrar */ } }
const read = readKey;
const write = writeKey;

/** O token guardado em `store`, ou um novo (UUID: 36 caracteres de `TOKEN_RE`) se não há um válido. */
export function tokenIn(store: MaybeStore): string {
  let t = read(store, TOKEN_KEY);
  if (!TOKEN_RE.test(t)) { t = crypto.randomUUID(); write(store, TOKEN_KEY, t); }
  return t;
}
export const nicknameIn = (store: MaybeStore) => read(store, NICKNAME_KEY);
export const rememberNicknameIn = (store: MaybeStore, nickname: string) => write(store, NICKNAME_KEY, nickname);

export const token = () => tokenIn(session());
export const rememberedNickname = () => nicknameIn(local());
export const rememberNickname = (nickname: string) => rememberNicknameIn(local(), nickname);

/** O último personagem escolhido neste navegador, ou null (nenhum, ou algo fora de 0..7). */
export function characterIn(store: MaybeStore): number | null {
  const s = read(store, CHARACTER_KEY);
  const n = s === '' ? NaN : Number(s);
  return Number.isInteger(n) && n >= 0 && n < CHARACTERS ? n : null;
}
export const rememberCharacterIn = (store: MaybeStore, character: number) => write(store, CHARACTER_KEY, String(character));

/** O bloco desta aba nesta sala: pessoal, nunca sai da aba. */
export const notepadIn = (store: MaybeStore, code: string) => read(store, NOTEPAD_KEY + code);
export const rememberNotepadIn = (store: MaybeStore, code: string, text: string) => write(store, NOTEPAD_KEY + code, text);

export const rememberedCharacter = () => characterIn(local());
export const rememberCharacter = (character: number) => rememberCharacterIn(local(), character);
export const notepad = (code: string) => notepadIn(session(), code);
export const rememberNotepad = (code: string, text: string) => rememberNotepadIn(session(), code, text);
