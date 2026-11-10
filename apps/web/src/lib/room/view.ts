/**
 * O que os painéis precisam saber, derivado de um `RoomSnapshot`, puro e testado: quem sou eu, a turma linha a linha
 * (a vez, para quem cada um escreve, o post-it e o estado), para quem eu escrevo no lobby e se o moderador já pode
 * começar, de quem é a vez e o que posso fazer nela, a votação como eu a vejo, os post-its como eu posso vê-los (o meu
 * escondido até ser revelado) e o ranking. Os painéis só desenham isto e mandam pedidos; quem decide é o servidor.
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

/** Uma linha do painel da turma, na ordem das vezes. */
export interface TurmaRow {
  member: MemberView;
  /** a vez, de 1 em diante */
  pos: number;
  /** de quem esta pessoa escreve o post-it; null = ninguém (ainda) */
  writesFor: MemberView | null;
  /** em que pé está o post-it que esta pessoa escreve */
  writing: Progress;
  /** o post-it desta pessoa, como eu posso vê-lo; null = ainda não tem */
  card: PostitCard | null;
  status: PostitCard['status'];
  /** o lugar no ranking, se já acertou ou desistiu */
  place: number | null;
}

/** Por que o moderador ainda não pode começar: falta gente jogando, ou algum post-it está sem texto. */
export type StartBlock = 'players' | 'empty';

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
  /** a turma que joga, linha a linha, na ordem das vezes */
  turma: TurmaRow[];
  /** o limite de pessoas não desce abaixo disto: a turma de agora (fantasmas também), e nunca menos de `MIN_PLAYERS` */
  maxPlayersMin: number;
  /** lobby: o post-it que eu escrevo (sou o autor dele) */
  writeFor: { owner: MemberView; postit: PostitView; progress: Progress } | null;
  /** lobby, moderador: os post-its ainda sem texto que posso escrever (nem o meu nem o que já escrevo) */
  missing: PostitCard[];
  /** lobby, moderador: os donos cujo post-it posso escrever agora (não prontos; nem o meu nem o que já escrevo) */
  hostCanWrite: string[];
  /** lobby, moderador: o meu post-it está vazio e eu não posso escrevê-lo; Começar espera o autor */
  ownPostitEmpty: boolean;
  readyCount: number;
  /** post-its com texto (o meu também: o servidor diz se está escrito, sem dizer o quê) */
  writtenCount: number;
  allReady: boolean;
  /** moderador, lobby: Começar vale (gente bastante e todo post-it com texto; não precisa estarem prontos) */
  canStart: boolean;
  /**
   * Começar é a ação principal (verde): vale e o meu Pronto não está esperando. Enquanto o post-it que eu escrevo não
   * está pronto, a principal é o Pronto, e Começar fica neutro (mas vale): uma principal por vez na coluna.
   */
  startPrimary: boolean;
  /** por que ainda não dá para começar; null = dá (ou não é comigo) */
  startBlock: StartBlock | null;
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

  const lobby = s.phase === 'lobby';
  /** quem escreve o post-it de `owner`: o que vem no post-it, ou o plano de `authors` */
  const authorOf = (owner: string): string | null => s.postits[owner]?.author ?? s.authors[owner] ?? null;
  let writeFor: RoomView['writeFor'] = null;
  if (me && lobby) {
    // sozinho na turma, o círculo faz a pessoa autora de si mesma: ninguém escreve o próprio post-it
    const ownerId = s.order.find((o) => o !== me.id && authorOf(o) === me.id && s.postits[o]);
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


  const ranking: RankingRow[] = [...pick(s.got).map((member) => ({ member, gaveUp: false })), ...pick(s.gaveUp).map((member) => ({ member, gaveUp: true }))]
    .map((r, i) => ({ place: i + 1, ...r }));

  const place = new Map(ranking.map((r) => [r.member.id, r.place]));
  const cardOf = new Map(postits.map((c) => [c.owner.id, c]));
  const turma: TurmaRow[] = players.map((member, i) => {
    const target = s.order.find((o) => o !== member.id && authorOf(o) === member.id);
    const tp = target ? s.postits[target] : undefined;
    const card = cardOf.get(member.id) ?? null;
    return {
      member, pos: i + 1, writesFor: (target && byId.get(target)) || null, writing: tp ? progressOf(tp) : 'empty',
      card, status: got.has(member.id) ? 'got' : gaveUp.has(member.id) ? 'gaveUp' : 'playing', place: place.get(member.id) ?? null,
    };
  });

  const writtenByMe = writeFor?.owner.id;
  const hostLobby = isModerator && lobby;
  const hostCards = hostLobby ? postits.filter((p) => !p.mine && p.owner.id !== writtenByMe && !p.ready) : [];
  const writtenCount = players.filter((p) => s.postits[p.id]?.written || !!s.postits[p.id]?.text?.trim()).length;
  const allWritten = players.length > 0 && writtenCount === players.length;
  const startBlock: StartBlock | null = !hostLobby ? null : players.length < MIN_PLAYERS ? 'players' : !allWritten ? 'empty' : null;
  return {
    me, isModerator, isPlayer, isGhost: !!me && !isPlayer, done, players,
    ghosts: s.members.filter((m) => !s.order.includes(m.id)),
    offline: s.members.filter((m) => !m.connected),
    turma,
    maxPlayersMin: Math.max(MIN_PLAYERS, s.members.length),
    writeFor,
    missing: hostCards.filter((p) => p.progress === 'empty'),
    hostCanWrite: hostCards.map((p) => p.owner.id),
    ownPostitEmpty: hostLobby && !!me && !!s.postits[me.id] && !s.postits[me.id].written,
    readyCount: postits.filter((p) => p.ready).length,
    writtenCount,
    allReady: postits.length > 0 && postits.length === players.length && postits.every((p) => p.ready),
    canStart: hostLobby && startBlock === null,
    startPrimary: hostLobby && startBlock === null && (!writeFor || writeFor.progress === 'ready'),
    startBlock,
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

/** A ordem com `id` trocado com a vizinha de cima (`-1`) ou de baixo (`1`); nas pontas, como está. Os ↑ ↓ do moderador. */
export function moveBy(order: readonly string[], id: string, delta: -1 | 1): string[] {
  const out = [...order];
  const i = out.indexOf(id), j = i + delta;
  if (i < 0 || j < 0 || j >= out.length) return out;
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

/** Ao entrar: o personagem lembrado pelo navegador, se não é o que já tenho; senão null (não são exclusivos). */
export function characterToClaim(v: RoomView, remembered: number | null): number | null {
  if (!v.me || remembered === null || remembered < 0 || remembered >= CHARACTERS) return null;
  return v.me.character === remembered ? null : remembered;
}

/** As ferramentas de desenvolvimento (jogador falso): só em localhost ou com `?dev`, e só se o servidor aceita. */
export function devTools(loc: { hostname: string; search: string }, serverDev: boolean): boolean {
  const local = loc.hostname === 'localhost' || loc.hostname === '127.0.0.1';
  return serverDev && (local || new URLSearchParams(loc.search).has('dev'));
}

/** Quanto da vez ainda sobra, de 1 (acabou de começar) a 0 (acabou): o fio da barra da vez. */
export function turnFraction(left: number, turnMs: number): number {
  return turnMs > 0 ? Math.max(0, Math.min(1, left / turnMs)) : 0;
}
