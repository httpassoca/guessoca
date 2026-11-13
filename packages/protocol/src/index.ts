/**
 * Mensagens trocadas entre cliente e servidor pelo WebSocket, nos dois sentidos, e o snapshot da sala que cada pessoa
 * recebe. Cliente e servidor importam daqui; nada é duplicado. Imagens não passam pelo socket (ADR 0002): sobem por
 * `POST /api/rooms/CODE/images?token=T` e o snapshot leva só o endereço.
 */
import { CHARACTERS, MAX_MEMBERS, MIN_PLAYERS, NICKNAME_MAX, POSTIT_MAX, TURN_MAX, TURN_MIN, TURN_STEP, type Phase } from '@guess/rules';
import type { Anim } from '@guess/world';

/** O cliente manda `ping` neste intervalo; o servidor derruba quem fica o dobro em silêncio (e o cliente derruba um socket que não responde nada por um intervalo inteiro). */
export const PING_INTERVAL = 15_000;
export const SOCKET_IDLE_TIMEOUT = 30_000;

/**
 * Presença (ADR 0005): cada aba manda o próprio personagem no máximo uma vez por este intervalo (~15 por segundo), e o
 * servidor repassa a de cada pessoa aos outros no mesmo ritmo, guardando só a mais recente. Não entra na sala e não é
 * atividade.
 */
export const PRESENCE_INTERVAL = 66;

/** Os emotes das teclas 1–4, na ordem; o balão fica uns 2 s sobre a cabeça. */
export const EMOTES = ['question', 'exclaim', 'haha', 'me'] as const;
export type EmoteName = (typeof EMOTES)[number];
export const EMOTE_MS = 2000;

/**
 * Fala: uma mensagem curta que vira um balão perto do personagem de quem falou e some; não fica guardada em lugar nenhum.
 * No máximo `CHAT_MAX` caracteres, e uma por `CHAT_INTERVAL` ms por pessoa (o servidor descarta as a mais).
 */
export const CHAT_MAX = 60;
export const CHAT_INTERVAL = 1000;

/**
 * O texto de uma fala como vai para a tela: só texto, numa linha. Tira os caracteres de controle e de formatação
 * (inclusive os que invertem a direção do texto; o junta-emoji U+200D fica, um só em fila), junta os espaços (quebras de linha viram espaço), apara as pontas e
 * corta em `CHAT_MAX` caracteres (pontos de código, para não partir um emoji no meio). Vazio = não há o que falar.
 */
export function cleanChat(raw: string): string {
  const s = raw.normalize('NFC')
    .replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, ' ')
    // o junta-emoji (U+200D) fica, senão 👨‍👩‍👧 e 🏳️‍🌈 se desmancham; o resto da formatação (inversão de direção, zero-width…) sai
    .replace(/(?:(?!\u200d)[\p{Cf}\p{Co}\p{Cs}\p{Cn}])+/gu, '')
    .replace(/\u200d{2,}/gu, '\u200d')
    .replace(/\s+/gu, ' ')
    .trim();
  return [...s].slice(0, CHAT_MAX).join('').trimEnd();
}

export const ANIMS: readonly Anim[] = ['idle', 'walk', 'run', 'jump', 'fall', 'fall_loop', 'shove'];

/** Onde o personagem de alguém está e o que faz, como a aba dele manda. */
export interface Presence {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  facing: 1 | -1;
  anim: Anim;
  /** o balão que está mostrando agora; null = nenhum */
  emote: EmoteName | null;
  /** caído na rua ou acabando de voltar: pisca e não é sólido para os outros */
  blink: boolean;
}

/** Token por aba (ADR 0003): o que identifica a pessoa entre conexões. */
export const TOKEN_RE = /^[A-Za-z0-9_-]{8,64}$/;
/** Código de sala: quatro letras, sem I nem O (não se confundem com 1 e 0). */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const CODE_LENGTH = 4;
export const CODE_RE = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);
/** Id público de membro: `m` e um número. */
export const MEMBER_ID_RE = /^m\d{1,6}$/;
/** O id de um bot engraçado (`b` e um número): não é da turma, só anda no telhado. */
export const BOT_ID_RE = /^b\d{1,6}$/;
/** Quantos bots engraçados cabem no telhado ao mesmo tempo. */
export const BOTS_MAX = 15;
/** Quantas vezes maior que um personagem normal o chefão (o bot gigante) é desenhado; 2 mantém o pixel art inteiro. */
export const BOSS_SCALE = 2;
/** Id de imagem guardada na sala: hexadecimal. */
export const IMAGE_ID_RE = /^[0-9a-f]{16,32}$/;

/** Imagem de post-it: o navegador reduz a no máximo este lado, em WebP, antes de subir; o servidor recusa acima deste tamanho. */
export const IMAGE_SIDE = 512;
export const IMAGE_BYTES_MAX = 300 * 1024;
/** Endereço de uma imagem da sala; é o que o snapshot leva. */
export const imageUrl = (code: string, id: string) => `/api/rooms/${code}/images/${id}`;

/** Códigos de fechamento do WebSocket que o cliente sabe explicar (4xxx = da aplicação, sem reconectar). */
export const CLOSE_ROOM_NOT_FOUND = 4404;
export const CLOSE_ROOM_ENDED = 4410;
export const CLOSE_REPLACED = 4409;
export const CLOSE_KICKED = 4403;

/** Uma mensagem de texto do cliente não passa disto. */
const MESSAGE_MAX = 4096;

// cliente → servidor
export type ClientMessage =
  /** entra na turma com um apelido (repetido ganha sufixo); quem já está na turma só troca o apelido */
  | { type: 'join'; nickname: string }
  /** troca o próprio apelido */
  | { type: 'nickname'; nickname: string }
  /** escolhe o próprio personagem (não são exclusivos: dois podem usar o mesmo) */
  | { type: 'character'; character: number }
  // moderador, lobby
  /** a ordem das vezes (também durante o jogo) */
  | { type: 'order'; order: string[] }
  /** "Sortear": ninguém escreve para si */
  | { type: 'shuffleAuthors' }
  /** `author` passa a escrever para `owner`; os outros se ajeitam */
  | { type: 'assign'; author: string; owner: string }
  | { type: 'turnMs'; ms: number }
  /** só moderar, como fantasma */
  | { type: 'onlyModerate'; on: boolean }
  /** quantas pessoas cabem na sala, de `MIN_PLAYERS` a `MAX_MEMBERS`; nunca menos que a turma de agora */
  | { type: 'maxPlayers'; n: number }
  /** moderador, a qualquer momento: liga ou desliga os bots engraçados (só aparecem com o jogo rodando) */
  | { type: 'funnyBots'; on: boolean }
  // lobby: a escrita acontece aqui
  /** o post-it de `owner` como está agora (cada tecla); `image` = id devolvido pelo upload, ou null */
  | { type: 'write'; owner: string; text: string; image: string | null }
  | { type: 'ready' }
  /** desfaz o próprio pronto */
  | { type: 'unready' }
  /** moderador: começa o jogo (todo post-it com texto; não precisa estarem todos prontos) */
  | { type: 'start' }
  // jogo
  /** Acertei */
  | { type: 'claim' }
  | { type: 'vote'; yes: boolean }
  /** passa a vez (a própria; o moderador, a de quem for) */
  | { type: 'skip' }
  | { type: 'giveUp' }
  // moderador, a qualquer momento
  | { type: 'mark'; member: string; right: boolean }
  | { type: 'pause'; on: boolean }
  | { type: 'kick'; member: string }
  | { type: 'handOver'; member: string }
  | { type: 'endGame' }
  // fim
  /** "Jogar de novo com a mesma turma" */
  | { type: 'playAgain' }
  /** só em desenvolvimento (o servidor recusa em produção): põe um jogador falso na sala */
  | { type: 'addFake' }
  /** o próprio personagem; passa por fora da sala, repassado aos outros (não é atividade) */
  | { type: 'presence'; presence: Presence }
  /** empurrei `target` (uma pessoa ou um bot) para o lado `dir`; a aba dela aplica em si mesma (o bot, o servidor) */
  | { type: 'shove'; target: string; dir: 1 | -1 }
  /** uma fala; passa por fora da sala, repassada a todo mundo (não é atividade). O texto já sai limpo do parser (`cleanChat`) */
  | { type: 'chat'; text: string }
  | { type: 'ping' };

/**
 * `GET /api/rooms/CODE?token=T`: uma olhada na sala antes de entrar, para o início avisar na hora (código errado, sala
 * cheia, jogo já começado). `member`: o token já é da turma (volta ao lugar, mesmo com a sala cheia). Sala que não
 * existe: 404.
 */
export interface RoomPeek { phase: Phase; members: number; maxPlayers: number; member: boolean }

/** Por que um pedido foi recusado: a sala já tem `MAX_MEMBERS`; ou o pedido não vale agora (fora da vez, fase errada, não é moderador…). */
export type RoomError = 'roomFull' | 'refused';

// servidor → cliente
export type ServerMessage =
  | { type: 'snapshot'; snapshot: RoomSnapshot }
  /** pedido recusado, só para quem pediu; o snapshot que a pessoa tem continua valendo */
  | { type: 'error'; error: RoomError }
  /** a presença de outra pessoa da sala, ou de um bot (`member` é o id dele, `b…`) */
  | { type: 'presence'; member: string; presence: Presence }
  /** alguém (`by`) me empurrou para o lado `dir` */
  | { type: 'shoved'; by: string; dir: 1 | -1 }
  /** `member` falou `text`; chega a todo mundo, inclusive a quem falou */
  | { type: 'chat'; member: string; text: string }
  | { type: 'pong' };

/**
 * Um bot engraçado no telhado agora: quem é. Onde está chega por `presence`, como a de uma pessoa. `scale`: quantas vezes
 * maior ele é desenhado (só o chefão manda, `BOSS_SCALE`); sem isto vale 1 (um servidor ou cliente de antes do chefão).
 */
export interface BotView { id: string; character: number; scale?: number }

/**
 * O que uma pessoa fez no telhado durante um jogo (issue #59), contado pelo servidor: quantas vezes caiu na rua, quantos
 * empurrões deu (em gente ou em bot) e quantos levou, da turma e dos bots.
 */
export interface PlayerStats { falls: number; shoves: number; shovedByPlayers: number; shovedByBots: number }
export type StatName = keyof PlayerStats;

/** Uma pessoa da turma como todo mundo a vê. */
export interface MemberView {
  /** id público, `m` e um número; o token nunca sai do servidor */
  id: string;
  nickname: string;
  connected: boolean;
  /** personagem, 0..`CHARACTERS`−1 */
  character: number | null;
  /** fora de `order`: chegou depois do começo, ou só modera */
  ghost: boolean;
  /** jogador falso (só em desenvolvimento) */
  fake: boolean;
}

/**
 * Um post-it como quem recebe o vê. Para o próprio dono, antes de revelado, `text` e `image` vêm null: nem a tela nem a
 * rede mostram o que está escrito.
 */
export interface PostitView {
  text: string | null;
  /** endereço da imagem (`imageUrl`), ou null */
  image: string | null;
  ready: boolean;
  /** já tem texto; vai até para o dono, que não vê o texto (assim o moderador sabe que o próprio está vazio) */
  written: boolean;
  /** já revelado ao dono (acertou, desistiu ou o jogo acabou) */
  revealed: boolean;
  /** quem escreve; null = ficou sem autor (expulso): o moderador escreve */
  author: string | null;
}

export interface TurnView {
  owner: string;
  /** ms que sobram no momento do snapshot; o cliente conta para baixo a partir de quando recebe */
  left: number;
  /** o relógio está correndo (nem pausa do moderador nem votação aberta) */
  running: boolean;
}

export interface VoteView {
  claimer: string;
  voters: string[];
  /** quem já votou (não como votou) */
  voted: string[];
  /** ms até fechar, no momento do snapshot */
  left: number;
  /** o voto de quem recebe, se votou */
  yours: boolean | null;
}

/** A sala como uma pessoa a vê. Inteira a cada mudança: o cliente nunca faz diff. */
export interface RoomSnapshot {
  code: string;
  phase: Phase;
  /** o id de quem recebe; null = ainda não entrou com apelido (visitante) */
  you: string | null;
  /** o id do moderador; null = turma vazia */
  moderator: string | null;
  /** o servidor aceita jogadores falsos (só em desenvolvimento) */
  dev: boolean;
  /** quantas pessoas cabem na sala (a turma toda, fantasmas inclusive) */
  maxPlayers: number;
  /** a turma, na ordem em que entrou */
  members: MemberView[];
  /** o moderador ligou os bots engraçados */
  funnyBots: boolean;
  /** os bots que estão no telhado agora (só com o jogo rodando) */
  bots: BotView[];
  /** pessoa → o que fez no telhado no jogo que acabou; só no fim (antes, vazio). Quem não aparece tem tudo zero */
  stats: Record<string, PlayerStats>;
  /** quem joga, na ordem das vezes */
  order: string[];
  /** dono → autor */
  authors: Record<string, string>;
  turnMs: number;
  /** dono → post-it, já no lobby */
  postits: Record<string, PostitView>;
  turn: TurnView | null;
  /** o moderador pausou o relógio */
  paused: boolean;
  vote: VoteView | null;
  /** quem acertou, em ordem; depois quem desistiu, em ordem */
  got: string[];
  gaveUp: string[];
  /** quantas vezes cada pessoa teve a vez neste jogo (id → vezes); quem ainda não teve não aparece */
  turns: Record<string, number>;
}

/** Até onde uma presença pode ir em cada eixo, e o máximo de uma velocidade: o que passa disso é lixo e é descartado. */
const POS_RANGE = { x: [-500, 1500], y: [-1000, 1000], z: [-200, 300] } as const;
const SPEED_MAX = 2000;
const inRange = (v: unknown, [lo, hi]: readonly [number, number]): v is number => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

export function parsePresence(raw: unknown): Presence | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const p = raw as Record<string, unknown>;
  if (!inRange(p.x, POS_RANGE.x) || !inRange(p.y, POS_RANGE.y) || !inRange(p.z, POS_RANGE.z)) return null;
  const speed: [number, number] = [-SPEED_MAX, SPEED_MAX];
  if (!inRange(p.vx, speed) || !inRange(p.vy, speed) || !inRange(p.vz, speed)) return null;
  if (p.facing !== 1 && p.facing !== -1) return null;
  if (!ANIMS.includes(p.anim as Anim)) return null;
  if (p.emote !== null && !EMOTES.includes(p.emote as EmoteName)) return null;
  if (typeof p.blink !== 'boolean') return null;
  return { x: p.x, y: p.y, z: p.z, vx: p.vx, vy: p.vy, vz: p.vz, facing: p.facing, anim: p.anim as Anim, emote: p.emote as EmoteName | null, blink: p.blink };
}

const isTurnMs = (ms: unknown): ms is number =>
  typeof ms === 'number' && Number.isInteger(ms) && ms >= TURN_MIN && ms <= TURN_MAX && (ms - TURN_MIN) % TURN_STEP === 0;
const isMaxPlayers = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= MIN_PLAYERS && n <= MAX_MEMBERS;

/** O que se escolhe no pré-lobby ao criar a sala (corpo de `POST /api/rooms`); o que falta ou não passa fica no padrão. */
export interface RoomInit { turnMs?: number; maxPlayers?: number; onlyModerate?: boolean }

/** Lê o corpo de `POST /api/rooms`: cada campo só vale se passar na validação; o resto é ignorado. */
export function parseRoomInit(raw: unknown): RoomInit {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const b = raw as Record<string, unknown>;
  return {
    ...(isTurnMs(b.turnMs) ? { turnMs: b.turnMs } : {}),
    ...(isMaxPlayers(b.maxPlayers) ? { maxPlayers: b.maxPlayers } : {}),
    ...(typeof b.onlyModerate === 'boolean' ? { onlyModerate: b.onlyModerate } : {}),
  };
}

const isId = (v: unknown): v is string => typeof v === 'string' && MEMBER_ID_RE.test(v);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';

/** Lê uma mensagem crua do socket; qualquer coisa fora do formato vira null (o servidor descarta e registra). */
export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (typeof raw !== 'string' || raw.length > MESSAGE_MAX) return null;
  let v: unknown;
  try { v = JSON.parse(raw); } catch { return null; }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const m = v as Record<string, unknown>;
  switch (m.type) {
    case 'ping':
    case 'shuffleAuthors':
    case 'ready':
    case 'unready':
    case 'start':
    case 'claim':
    case 'skip':
    case 'giveUp':
    case 'endGame':
    case 'playAgain':
    case 'addFake':
      return { type: m.type };
    case 'join':
    case 'nickname':
      if (typeof m.nickname !== 'string' || m.nickname.length > NICKNAME_MAX * 4) return null;
      return { type: m.type, nickname: m.nickname };
    case 'character':
      return Number.isInteger(m.character) && (m.character as number) >= 0 && (m.character as number) < CHARACTERS ? { type: 'character', character: m.character as number } : null;
    case 'order':
      return Array.isArray(m.order) && m.order.length <= 16 && m.order.every(isId) && new Set(m.order).size === m.order.length ? { type: 'order', order: [...m.order] } : null;
    case 'maxPlayers':
      return isMaxPlayers(m.n) ? { type: 'maxPlayers', n: m.n } : null;
    case 'funnyBots':
      return typeof m.on === 'boolean' ? { type: 'funnyBots', on: m.on } : null;
    case 'turnMs':
      return isTurnMs(m.ms) ? { type: 'turnMs', ms: m.ms } : null;
    case 'onlyModerate':
    case 'pause':
      return isBool(m.on) ? { type: m.type, on: m.on } : null;
    case 'write':
      if (!isId(m.owner) || typeof m.text !== 'string' || m.text.length > POSTIT_MAX * 4) return null;
      if (m.image !== null && !(typeof m.image === 'string' && IMAGE_ID_RE.test(m.image))) return null;
      return { type: 'write', owner: m.owner, text: m.text, image: m.image };
    case 'assign':
      return isId(m.author) && isId(m.owner) && m.author !== m.owner ? { type: 'assign', author: m.author, owner: m.owner } : null;
    case 'vote':
      return isBool(m.yes) ? { type: 'vote', yes: m.yes } : null;
    case 'mark':
      return isId(m.member) && isBool(m.right) ? { type: 'mark', member: m.member, right: m.right } : null;
    case 'presence': {
      const presence = parsePresence(m.presence);
      return presence ? { type: 'presence', presence } : null;
    }
    case 'shove':
      return (isId(m.target) || (typeof m.target === 'string' && BOT_ID_RE.test(m.target))) && (m.dir === 1 || m.dir === -1) ? { type: 'shove', target: m.target, dir: m.dir } : null;
    case 'chat': {
      if (typeof m.text !== 'string' || m.text.length > CHAT_MAX * 4) return null;
      const text = cleanChat(m.text);
      return text ? { type: 'chat', text } : null;
    }
    case 'kick':
    case 'handOver':
      return isId(m.member) ? { type: m.type, member: m.member } : null;
    default: return null;
  }
}

/** O começo de um WebP: `RIFF`, tamanho, `WEBP`. O servidor só guarda o que começa assim. */
export function isWebp(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  const tag = (o: number) => String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]);
  return tag(0) === 'RIFF' && tag(8) === 'WEBP';
}
