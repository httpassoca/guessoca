/**
 * Quem esta aba é para o servidor, e o que o navegador lembra entre visitas (ADR 0003). O token é por sala e por
 * navegador (localStorage, emenda do ADR 0003): sobrevive a refresh, queda de rede, fechar a aba e fechar o navegador;
 * duas abas na mesma sala são a mesma pessoa (a nova assume, a velha mostra "outra aba assumiu").
 * O apelido, o último personagem e o zoom do telhado são lembrados pelo navegador inteiro (localStorage); o bloco (o texto e se está
 * minimizado), a coluna recolhida e a entrada automática de quem acabou de criar a sala, só pela aba.
 */
import { TOKEN_RE } from '@guess/protocol';
import { CHARACTERS } from '@guess/rules';

const SEATS_KEY = 'guess.seats';
const NICKNAME_KEY = 'guess.nickname';
const CHARACTER_KEY = 'guess.character';
const NOTEPAD_KEY = 'guess.notepad.';
const NOTEPAD_MIN_KEY = 'guess.notepadMin';
const SIDE_KEY = 'guess.sideCollapsed';
const AUTO_JOIN_KEY = 'guess.autoJoin';
const ZOOM_KEY = 'guess.zoom';

/** O storage, ou nada (teste, modo privado): aí nada fica lembrado e segue sem quebrar. */
export type MaybeStore = Pick<Storage, 'getItem' | 'setItem'> | null;
export const local = (): MaybeStore => (typeof localStorage === 'undefined' ? null : localStorage);
export const session = (): MaybeStore => (typeof sessionStorage === 'undefined' ? null : sessionStorage);

/** Lê uma chave; nada guardado (ou storage bloqueado) é ''. */
export function readKey(store: MaybeStore, key: string) { try { return store?.getItem(key) ?? ''; } catch { return ''; } }
export function writeKey(store: MaybeStore, key: string, value: string) { try { store?.setItem(key, value); } catch { /* modo privado ou bloqueado: segue sem lembrar */ } }
const read = readKey;
const write = writeKey;

/** Um token sem uso por este tempo é esquecido: a sala morre bem antes (dez minutos parada, ADR 0003). */
export const SEAT_TTL = 24 * 60 * 60_000;

type Seats = Record<string, { token: string; at: number }>;

/** Os lugares guardados, só os bem formados (lixo some sem quebrar). */
function seatsIn(store: MaybeStore): Seats {
  let raw: unknown;
  try { raw = JSON.parse(read(store, SEATS_KEY) || '{}'); } catch { return {}; }
  if (!raw || typeof raw !== 'object') return {};
  const seats: Seats = {};
  for (const [code, s] of Object.entries(raw as Record<string, unknown>)) {
    const seat = s as { token?: unknown; at?: unknown } | null;
    if (seat && typeof seat.token === 'string' && TOKEN_RE.test(seat.token) && typeof seat.at === 'number') seats[code] = { token: seat.token, at: seat.at };
  }
  return seats;
}

/**
 * O token desta sala neste navegador (ADR 0003, emenda): o mesmo enquanto foi usado há menos de `SEAT_TTL`, senão um
 * novo (UUID: 36 caracteres de `TOKEN_RE`). Usar renova a hora; os vencidos de outras salas são limpos aqui. É só um
 * número aleatório por sala: não diz quem é a pessoa nem liga uma sala a outra.
 */
export function tokenIn(store: MaybeStore, code: string, now: number): string {
  const key = code.toUpperCase();
  const seats = seatsIn(store);
  for (const [c, s] of Object.entries(seats)) if (now - s.at > SEAT_TTL) delete seats[c];
  const token = seats[key]?.token ?? crypto.randomUUID();
  seats[key] = { token, at: now };
  write(store, SEATS_KEY, JSON.stringify(seats));
  return token;
}
export const nicknameIn = (store: MaybeStore) => read(store, NICKNAME_KEY);
export const rememberNicknameIn = (store: MaybeStore, nickname: string) => write(store, NICKNAME_KEY, nickname);

/** Sem `localStorage` (bloqueado), o token fica pelo menos na aba, como era antes. */
export const token = (code: string) => tokenIn(local() ?? session(), code, Date.now());
export const rememberedNickname = () => nicknameIn(local());
export const rememberNickname = (nickname: string) => rememberNicknameIn(local(), nickname);

/** O último personagem escolhido neste navegador, ou null (nenhum, ou algo fora da faixa). */
export function characterIn(store: MaybeStore): number | null {
  const s = read(store, CHARACTER_KEY);
  const n = s === '' ? NaN : Number(s);
  return Number.isInteger(n) && n >= 0 && n < CHARACTERS ? n : null;
}
export const rememberCharacterIn = (store: MaybeStore, character: number) => write(store, CHARACTER_KEY, String(character));

/** O zoom do telhado lembrado neste navegador, em passos da escala automática (0 = sem zoom; lixo vira 0). */
export function zoomIn(store: MaybeStore): number {
  const n = Number(read(store, ZOOM_KEY));
  return Number.isInteger(n) && Math.abs(n) <= 8 ? n : 0;
}
export const rememberZoomIn = (store: MaybeStore, zoom: number) => write(store, ZOOM_KEY, String(zoom));
export const rememberedZoom = () => zoomIn(local());
export const rememberZoom = (zoom: number) => rememberZoomIn(local(), zoom);

/** O bloco desta aba nesta sala: pessoal, nunca sai da aba. */
export const notepadIn = (store: MaybeStore, code: string) => read(store, NOTEPAD_KEY + code);
export const rememberNotepadIn = (store: MaybeStore, code: string, text: string) => write(store, NOTEPAD_KEY + code, text);

export const rememberedCharacter = () => characterIn(local());
export const rememberCharacter = (character: number) => rememberCharacterIn(local(), character);
export const notepad = (code: string) => notepadIn(session(), code);
export const rememberNotepad = (code: string, text: string) => rememberNotepadIn(session(), code, text);

/** Bloco minimizado (só a aba presa embaixo) nesta aba. */
export const notepadMinimizedIn = (store: MaybeStore) => read(store, NOTEPAD_MIN_KEY) === '1';
export const rememberNotepadMinimizedIn = (store: MaybeStore, on: boolean) => write(store, NOTEPAD_MIN_KEY, on ? '1' : '0');
/** A coluna da sala recolhida nesta aba. */
export const sideCollapsedIn = (store: MaybeStore) => read(store, SIDE_KEY) === '1';
export const rememberSideCollapsedIn = (store: MaybeStore, on: boolean) => write(store, SIDE_KEY, on ? '1' : '0');

/**
 * Quem cria a sala no pré-lobby entra nela sozinho ao chegar em `/sala/CODE`, com o apelido e o personagem lembrados:
 * `rememberAutoJoinIn` marca a sala, `takeAutoJoinIn` usa a marca (uma vez só).
 */
export const autoJoinIn = (store: MaybeStore, code: string) => read(store, AUTO_JOIN_KEY) === code;
export const rememberAutoJoinIn = (store: MaybeStore, code: string) => write(store, AUTO_JOIN_KEY, code);
export function takeAutoJoinIn(store: MaybeStore, code: string): boolean {
  if (!autoJoinIn(store, code)) return false;
  write(store, AUTO_JOIN_KEY, '');
  return true;
}

export const notepadMinimized = () => notepadMinimizedIn(session());
export const rememberNotepadMinimized = (on: boolean) => rememberNotepadMinimizedIn(session(), on);
export const sideCollapsed = () => sideCollapsedIn(session());
export const rememberSideCollapsed = (on: boolean) => rememberSideCollapsedIn(session(), on);
export const rememberAutoJoin = (code: string) => rememberAutoJoinIn(session(), code);
export const takeAutoJoin = (code: string) => takeAutoJoinIn(session(), code);
