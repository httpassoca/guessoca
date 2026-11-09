/**
 * O que os painéis precisam saber, derivado de um `RoomSnapshot`, puro e testado: quem sou eu, para quem escrevo, de
 * quem é a vez e o que posso fazer nela, a votação como eu a vejo, os post-its como eu posso vê-los (o meu escondido
 * até ser revelado) e o ranking. Os painéis só desenham isto e mandam pedidos; quem decide é o servidor.
 */
import type { MemberView, PostitView, RoomSnapshot } from '@guess/protocol';
import { CHARACTERS, MIN_PLAYERS, TURN_MAX, TURN_MIN, TURN_STEP } from '@guess/rules';

/** Em que pé está um post-it: sem nada, sendo escrito, pronto. */
export type Progress = 'empty' | 'writing' | 'ready';

/** Um post-it como eu posso vê-lo, com o dono e o autor. */
export interface PostitCard {
  owner: MemberView;
  /** quem escreve; null = ficou sem autor (o moderador escreve) */
  author: MemberView | null;
  /** o texto como eu posso vê-lo; null quando `hidden` */
  text: string | null;
  image: string | null;
  /** é o meu e ainda não foi revelado: aparece como "?" */
  hidden: boolean;
  mine: boolean;
  ready: boolean;
  revealed: boolean;
  progress: Progress;
  /** é a vez do dono */
  turn: boolean;
  /** o dono ainda joga, acertou ou desistiu */
  status: 'playing' | 'got' | 'gaveUp';
}

export interface Assignment { owner: MemberView; author: MemberView | null }

export interface TurnInfo {
  owner: MemberView;
  mine: boolean;
  /** ms que sobravam quando o snapshot chegou (ver `countdown`) */
  left: number;
  running: boolean;
}

export interface VoteInfo {
  claimer: MemberView;
  /** fui eu que pedi */
  mine: boolean;
  /** posso votar agora (sou eleitor e ainda não votei) */
  canVote: boolean;
  /** já votei, e como */
  voted: boolean;
  yours: boolean | null;
  /** não voto nesta: pedi, sou fantasma ou não estava conectado quando abriu */
  waiting: boolean;
  voters: { member: MemberView; voted: boolean }[];
  left: number;
}

export interface RankingRow { place: number; member: MemberView; gaveUp: boolean }

export interface RoomView {
  me: MemberView | null;
  isModerator: boolean;
  /** estou na ordem das vezes */
  isPlayer: boolean;
  isGhost: boolean;
  /** já acertei ou desisti */
  done: boolean;
  /** quem joga, na ordem das vezes */
  players: MemberView[];
  ghosts: MemberView[];
  offline: MemberView[];
  /** lobby: quem escreve para quem, na ordem das vezes */
  assignments: Assignment[];
  /** quem pegou cada um dos oito personagens */
  characters: (MemberView | null)[];
  canStartWriting: boolean;
  /** escrita: o post-it que eu escrevo (sou o autor dele) */
  writeFor: { owner: MemberView; postit: PostitView; progress: Progress } | null;
  /** escrita, moderador: post-its sem autor ou sem texto que posso escrever (nem o meu nem o que já escrevo) */
  moderatorEditors: PostitCard[];
  /** escrita, moderador: o meu post-it está vazio e eu não posso escrevê-lo; "Começar já" fica recusado até alguém escrever */
  ownPostitEmpty: boolean;
  readyCount: number;
  /** todos os post-its, na ordem das vezes */
  postits: PostitCard[];
  turn: TurnInfo | null;
  canClaim: boolean;
  canSkip: boolean;
  canGiveUp: boolean;
  moderatorCanSkip: boolean;
  vote: VoteInfo | null;
  ranking: RankingRow[];
}

function progressOf(p: PostitView): Progress {
  if (p.ready) return 'ready';
  if (p.text === null) return p.written ? 'writing' : 'empty'; // o meu, escondido: só sei se já tem texto
  return p.text.trim() || p.image ? 'writing' : 'empty';
}

export function roomView(s: RoomSnapshot): RoomView {
  const byId = new Map(s.members.map((m) => [m.id, m]));
  const pick = (ids: readonly string[]) => ids.map((id) => byId.get(id)).filter((m): m is MemberView => !!m);
  const me = (s.you && byId.get(s.you)) || null;
  const isPlayer = !!me && s.order.includes(me.id);
  const players = pick(s.order);
  const got = new Set(s.got), gaveUp = new Set(s.gaveUp);
  const done = !!me && (got.has(me.id) || gaveUp.has(me.id));
  const isModerator = !!me && s.moderator === me.id;
  const playing = s.phase === 'playing';

  const postits: PostitCard[] = [];
  for (const owner of players) {
    const p = s.postits[owner.id];
    if (!p) continue;
    const mine = owner.id === me?.id;
    postits.push({
      owner, author: (p.author && byId.get(p.author)) || null, text: p.text, image: p.image,
      hidden: p.text === null, mine, ready: p.ready, revealed: p.revealed, progress: progressOf(p),
      turn: s.turn?.owner === owner.id, status: got.has(owner.id) ? 'got' : gaveUp.has(owner.id) ? 'gaveUp' : 'playing',
    });
  }

  let writeFor: RoomView['writeFor'] = null;
  if (me && s.phase === 'writing') {
    // o autor de cada post-it vem nele; `authors` é o plano do lobby
    const ownerId = s.order.find((o) => s.postits[o]?.author === me.id);
    const owner = ownerId ? byId.get(ownerId) : undefined;
    if (ownerId && owner) writeFor = { owner, postit: s.postits[ownerId], progress: progressOf(s.postits[ownerId]) };
  }

  const turnOwner = s.turn ? byId.get(s.turn.owner) : undefined;
  const turn: TurnInfo | null = s.turn && turnOwner ? { owner: turnOwner, mine: turnOwner.id === me?.id, left: s.turn.left, running: s.turn.running } : null;

  let vote: VoteInfo | null = null;
  const claimer = s.vote ? byId.get(s.vote.claimer) : undefined;
  if (s.vote && claimer) {
    const voted = new Set(s.vote.voted);
    const amVoter = !!me && s.vote.voters.includes(me.id);
    const iVoted = !!me && (voted.has(me.id) || s.vote.yours !== null);
    vote = {
      claimer, mine: claimer.id === me?.id, canVote: amVoter && !iVoted, voted: iVoted, yours: s.vote.yours, waiting: !amVoter,
      voters: pick(s.vote.voters).map((member) => ({ member, voted: voted.has(member.id) })), left: s.vote.left,
    };
  }

  const characters: (MemberView | null)[] = Array.from({ length: CHARACTERS }, () => null);
  for (const m of s.members) if (m.character !== null && m.character >= 0 && m.character < CHARACTERS) characters[m.character] = m;

  const ranking: RankingRow[] = [...pick(s.got).map((member) => ({ member, gaveUp: false })), ...pick(s.gaveUp).map((member) => ({ member, gaveUp: true }))]
    .map((r, i) => ({ place: i + 1, ...r }));

  const writtenByMe = writeFor?.owner.id;
  return {
    me, isModerator, isPlayer, isGhost: !!me && !isPlayer, done, players,
    ghosts: s.members.filter((m) => !s.order.includes(m.id)),
    offline: s.members.filter((m) => !m.connected),
    assignments: players.map((owner) => ({ owner, author: (s.authors[owner.id] && byId.get(s.authors[owner.id])) || null })),
    characters,
    canStartWriting: isModerator && s.phase === 'lobby' && s.order.length >= MIN_PLAYERS,
    writeFor,
    moderatorEditors: isModerator && s.phase === 'writing'
      ? postits.filter((p) => !p.mine && p.owner.id !== writtenByMe && !p.ready && (p.author === null || p.progress === 'empty'))
      : [],
    ownPostitEmpty: isModerator && s.phase === 'writing' && !!me && !!s.postits[me.id] && !s.postits[me.id].written,
    readyCount: postits.filter((p) => p.ready).length,
    postits,
    turn,
    canClaim: playing && !!turn?.mine && turn.running && !s.vote && !s.paused,
    canSkip: playing && !!turn?.mine && !s.vote,
    canGiveUp: playing && isPlayer && !done,
    moderatorCanSkip: playing && isModerator && !!turn && !s.vote,
    vote,
    ranking,
  };
}

/** O tempo que sobra agora, contando desde quando o snapshot chegou; parado, fica no que sobrou. Nunca negativo. */
export function countdown(left: number, receivedAt: number, now: number, running = true): number {
  return Math.max(0, running ? left - (now - receivedAt) : left);
}

/** "m:ss", arredondando para cima (o relógio só mostra 0:00 quando acabou de fato). */
export function clockText(ms: number): string {
  const s = Math.ceil(Math.max(0, ms) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Os tamanhos de vez que o moderador escolhe: de `TURN_MIN` a `TURN_MAX`, de `TURN_STEP` em `TURN_STEP`. */
export function turnOptions(): number[] {
  const out: number[] = [];
  for (let ms = TURN_MIN; ms <= TURN_MAX; ms += TURN_STEP) out.push(ms);
  return out;
}

/** A ordem com `id` movido para antes de `before` (null = para o fim). Arrastar e soltar a turma. */
export function moveBefore(order: readonly string[], id: string, before: string | null): string[] {
  if (!order.includes(id) || id === before) return [...order];
  const rest = order.filter((x) => x !== id);
  const at = before === null ? rest.length : rest.indexOf(before);
  if (at < 0) return [...order];
  rest.splice(at, 0, id);
  return rest;
}

/** Ao entrar: o personagem lembrado pelo navegador, se está livre e não é o que já tenho; senão null. */
export function characterToClaim(v: RoomView, remembered: number | null): number | null {
  if (!v.me || remembered === null || remembered < 0 || remembered >= CHARACTERS) return null;
  if (v.me.character === remembered) return null;
  return v.characters[remembered] ? null : remembered;
}

/** As ferramentas de desenvolvimento (jogador falso): só em localhost ou com `?dev`, e só se o servidor aceita. */
export function devTools(loc: { hostname: string; search: string }, serverDev: boolean): boolean {
  const local = loc.hostname === 'localhost' || loc.hostname === '127.0.0.1';
  return serverDev && (local || new URLSearchParams(loc.search).has('dev'));
}
