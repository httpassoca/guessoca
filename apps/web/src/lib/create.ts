/**
 * O pré-lobby, puro: o formulário de criar a sala (apelido, personagem, tamanho da vez, limite de pessoas, só moderar) e o
 * de entrar numa (apelido e um personagem livre), conferidos antes de pedir algo ao servidor; e as últimas configurações
 * de quem cria, lembradas pelo navegador (localStorage).
 */
import { parseRoomInit, type RoomInit } from '@guess/protocol';
import { CHARACTERS, MAX_MEMBERS, MIN_PLAYERS, NICKNAME_MAX, TURN_DEFAULT } from '@guess/rules';
import { readKey, writeKey, type MaybeStore } from './identity';

/** O que se escolhe para a sala ao criá-la (o corpo de `POST /api/rooms`, inteiro). */
export interface CreateSettings { turnMs: number; maxPlayers: number; onlyModerate: boolean }
export const DEFAULT_CREATE: CreateSettings = { turnMs: TURN_DEFAULT, maxPlayers: MAX_MEMBERS, onlyModerate: false };

export interface CreateForm extends CreateSettings { nickname: string; character: number | null }
export type FormProblem = 'nickname' | 'character' | 'turnMs' | 'maxPlayers';
export type Checked<T> = ({ ok: true } & T) | { ok: false; problems: FormProblem[] };

const cleanNickname = (raw: string) => raw.replace(/\s+/g, ' ').trim().slice(0, NICKNAME_MAX);
const isCharacter = (c: number | null): c is number => c !== null && Number.isInteger(c) && c >= 0 && c < CHARACTERS;

/** O formulário de criar: tudo certo vira o apelido aparado, o personagem e o corpo do POST; senão, os problemas na ordem dos campos. */
export function checkCreate(f: CreateForm): Checked<{ nickname: string; character: number; init: Required<RoomInit> }> {
  const problems: FormProblem[] = [];
  const nickname = cleanNickname(f.nickname);
  if (!nickname) problems.push('nickname');
  if (!isCharacter(f.character)) problems.push('character');
  // a mesma validação do servidor: o que não passa em `parseRoomInit` não vai
  const parsed = parseRoomInit({ turnMs: f.turnMs, maxPlayers: f.maxPlayers, onlyModerate: f.onlyModerate });
  if (parsed.turnMs === undefined) problems.push('turnMs');
  if (parsed.maxPlayers === undefined) problems.push('maxPlayers');
  if (problems.length) return { ok: false, problems };
  return { ok: true, nickname, character: f.character as number, init: { turnMs: f.turnMs, maxPlayers: f.maxPlayers, onlyModerate: f.onlyModerate } };
}

/** O formulário de entrar: apelido e um dos seis personagens (não são exclusivos). */
export function checkJoin(nickname: string, character: number | null): Checked<{ nickname: string; character: number }> {
  const problems: FormProblem[] = [];
  const n = cleanNickname(nickname);
  if (!n) problems.push('nickname');
  if (!isCharacter(character)) problems.push('character');
  return problems.length ? { ok: false, problems } : { ok: true, nickname: n, character: character as number };
}

/** Os limites de pessoas que dá para escolher: de `MIN_PLAYERS` (ou `atLeast`, a turma de agora) a `MAX_MEMBERS`. */
export function maxPlayersOptions(atLeast = MIN_PLAYERS): number[] {
  const out: number[] = [];
  for (let n = Math.max(MIN_PLAYERS, atLeast); n <= MAX_MEMBERS; n++) out.push(n);
  return out;
}

const CREATE_KEY = 'guess.create';

/** As últimas configurações de criar deste navegador; o que faltar ou estiver estragado fica no padrão, campo a campo. */
export function createSettingsIn(store: MaybeStore): CreateSettings {
  let raw: unknown = null;
  try { raw = JSON.parse(readKey(store, CREATE_KEY) || 'null'); } catch { /* estragado: padrão */ }
  return { ...DEFAULT_CREATE, ...parseRoomInit(raw) };
}
export const rememberCreateSettingsIn = (store: MaybeStore, s: CreateSettings) => writeKey(store, CREATE_KEY, JSON.stringify(s));
