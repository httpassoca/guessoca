/**
 * Quem esta aba é para o servidor, e o que o navegador lembra entre visitas (ADR 0003). O token vive na aba
 * (sessionStorage): sobrevive a refresh e queda de rede, e duas abas do mesmo navegador são duas pessoas na sala.
 * O apelido é lembrado pelo navegador inteiro (localStorage).
 */
import { TOKEN_RE } from '@guess/protocol';

const TOKEN_KEY = 'guess.token';
const NICKNAME_KEY = 'guess.nickname';

/** O storage, ou nada (teste, modo privado): aí nada fica lembrado e segue sem quebrar. */
type MaybeStore = Pick<Storage, 'getItem' | 'setItem'> | null;
const local = (): MaybeStore => (typeof localStorage === 'undefined' ? null : localStorage);
const session = (): MaybeStore => (typeof sessionStorage === 'undefined' ? null : sessionStorage);

function read(store: MaybeStore, key: string) { try { return store?.getItem(key) ?? ''; } catch { return ''; } }
function write(store: MaybeStore, key: string, value: string) { try { store?.setItem(key, value); } catch { /* modo privado ou bloqueado: segue sem lembrar */ } }

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
