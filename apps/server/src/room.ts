import { CLOSE_KICKED, imageUrl, type BotView, type ClientMessage, type PlayerStats, type PostitView, type RoomError, type RoomInit, type RoomSnapshot, type ServerMessage, type StatName } from '@guess/protocol';
import {
  act, addMember, createGame, MAX_MEMBERS, nextDeadline, removeMember, revealed, settle, turnLeft, uniqueNickname,
  type Ctx, type GameAction, type GameEvent, type GameState,
} from '@guess/rules';

/** A sala morre depois deste tempo sem atividade (ADR 0003). */
export const ROOM_TTL = 10 * 60_000;
/** O moderador offline por este tempo passa o papel para a pessoa conectada mais antiga. */
export const MODERATOR_GRACE = 20_000;
/** Apelido dos jogadores falsos, com o número de cada um. */
export const FAKE_NICKNAME = 'Robô';
/** O que um jogador falso escreve no post-it, ao acaso. */
export const FAKE_IDENTITIES = ['Pelé', 'Mona Lisa', 'Darth Vader', 'Xuxa', 'Einstein', 'Frida Kahlo', 'Batman', 'Anitta'];

export interface RoomMember {
  /** id público (vai no snapshot) */
  id: string;
  /** segredo da aba; identifica a pessoa entre conexões e nunca sai do servidor. null = jogador falso */
  token: string | null;
  nickname: string;
  /** jogador falso está sempre conectado */
  connected: boolean;
  joinedAt: number;
  /** jogador falso (só em desenvolvimento) */
  fake: boolean;
}

/**
 * Timers pendentes como dado: o adaptador agenda, e devolve como entrada quando vencem. `death`: a sala morre;
 * `moderator`: fim da tolerância do moderador offline; `game`: o jogo precisa ser posto em dia (fim da vez ou da votação).
 */
export type RoomTimer = { kind: 'death' | 'moderator' | 'game'; at: number };

export interface RoomState {
  code: string;
  /** `open`: viva; `dead`: encerrada, não aceita mais nada. A fase do jogo fica em `game.phase` */
  phase: 'open' | 'dead';
  createdAt: number;
  lastActivity: number;
  /** a turma, na ordem em que entrou; quem cai continua aqui até a sala morrer */
  members: RoomMember[];
  /** tokens conectados que ainda não entraram com apelido */
  visitors: string[];
  /** tokens de quem foi expulso: não voltam */
  kicked: string[];
  nextId: number;
  timers: RoomTimer[];
  /** id do moderador; null = turma vazia */
  moderator: string | null;
  /** desde quando o moderador está offline; null = conectado (ou turma vazia) */
  moderatorAway: number | null;
  /** quanto a sala vive sem atividade: `ROOM_TTL` (os testes do host apressam) */
  ttl: number;
  /** aceita jogadores falsos (só em desenvolvimento) */
  dev: boolean;
  /** quantas pessoas cabem na turma (fantasmas, falsos e quem caiu inclusive); o moderador muda no lobby */
  maxPlayers: number;
  /** o criador escolheu só moderar no pré-lobby: vale quando ele entra (a primeira pessoa), e então volta a false */
  creatorOnlyModerate: boolean;
  /** o moderador ligou os bots engraçados (`bots.ts`); eles só aparecem com o jogo rodando */
  funnyBots: boolean;
  /** os bots no telhado agora, como o adaptador informou (`bots`); vazio fora do jogo */
  bots: BotView[];
  /** pessoa → o que fez no telhado neste jogo (ou no que acabou), como o adaptador contou (`stats`); zera quando um jogo começa */
  stats: Record<string, PlayerStats>;
  game: GameState;
}

export type RoomInput =
  | { kind: 'connect'; token: string }
  /** `since`: quando a pessoa deu o último sinal de vida, se a queda só foi notada pelo silêncio. Hoje a sala não usa: cair não é atividade */
  | { kind: 'disconnect'; token: string; since?: number }
  | { kind: 'message'; token: string; message: ClientMessage }
  | { kind: 'timer'; timer: RoomTimer }
  /** o adaptador simula os bots (ADR 0005) e avisa quando a lista de quem está no telhado muda; não é atividade */
  | { kind: 'bots'; bots: BotView[] }
  /**
   * o adaptador vê as quedas e os empurrões passarem (ADR 0005) e conta um a um; só vale com o jogo rodando, não é
   * atividade e não manda snapshot: os números só aparecem no fim
   */
  | { kind: 'stats'; add: { member: string; stat: StatName }[] };

/** Uma mensagem para um token, ou a ordem de fechar o socket dele com este código. */
export type Outgoing = { to: string; message: ServerMessage } | { to: string; close: number };

/** O que aconteceu de notável, para o log do servidor: a turma e o jogo. */
export type RoomEvent =
  | { type: 'joined'; id: string; nickname: string }
  | { type: 'renamed'; id: string; from: string; to: string }
  | { type: 'disconnected'; id: string; nickname: string }
  | { type: 'reconnected'; id: string; nickname: string }
  | { type: 'refused'; error: RoomError; action?: string }
  | { type: 'kicked'; id: string; nickname: string }
  | { type: 'handedOver'; from: string; to: string }
  | { type: 'moderatorSucceeded'; from: string; to: string }
  | { type: 'fakeAdded'; id: string; nickname: string }
  | { type: 'died' }
  | GameEvent;

export interface RoomOutput { state: RoomState; out: Outgoing[]; events: RoomEvent[] }

/** `rng`: o sorteio (autores, identidades dos falsos); os testes fixam. */
export interface StepOptions { rng?: () => number }

/**
 * `ttl`: quanto a sala vive sem atividade (os testes do host apressam); `dev`: aceita jogadores falsos; `init`: o que o
 * pré-lobby escolheu (já validado por `parseRoomInit`): o tamanho da vez, o limite de pessoas e se o criador só modera.
 */
export function createRoom(code: string, now: number, opts: { ttl?: number; dev?: boolean; init?: RoomInit } = {}): RoomState {
  const ttl = opts.ttl ?? ROOM_TTL;
  const init = opts.init ?? {};
  return {
    code, phase: 'open', createdAt: now, lastActivity: now, members: [], visitors: [], kicked: [], nextId: 1,
    timers: [{ kind: 'death', at: now + ttl }], moderator: null, moderatorAway: null, ttl, dev: opts.dev ?? false,
    maxPlayers: init.maxPlayers ?? MAX_MEMBERS, creatorOnlyModerate: init.onlyModerate ?? false, funnyBots: false, bots: [], stats: {},
    game: createGame({ turnMs: init.turnMs }),
  };
}

/** As mensagens do cliente que são ações do jogo, passadas como estão às regras. */
const GAME_ACTIONS = new Set<GameAction['type']>([
  'character', 'order', 'shuffleAuthors', 'assign', 'turnMs', 'onlyModerate', 'write', 'ready', 'unready', 'start', 'claim', 'vote', 'skip',
  'giveUp', 'mark', 'pause', 'endGame', 'playAgain',
]);
const isGameAction = (m: ClientMessage): m is ClientMessage & GameAction => GAME_ACTIONS.has(m.type as GameAction['type']);

/**
 * Única porta da sala: estado atual + entrada + hora → estado novo, mensagens por destinatário e eventos.
 * Nunca mexe no estado recebido e nunca agenda nada; os timers ficam em `state.timers`.
 * Depois de cada entrada o jogo é posto em dia (`settle`), os falsos escrevem (no lobby), a sucessão do moderador é conferida e
 * os timers são refeitos; se a sala mudou, todo token conectado recebe o snapshot.
 */
export function step(state: RoomState, input: RoomInput, now: number, opts: StepOptions = {}): RoomOutput {
  const rng = opts.rng ?? Math.random;
  const s = structuredClone(state);
  const out: Outgoing[] = [];
  const events: RoomEvent[] = [];
  if (s.phase === 'dead') return { state: s, out, events };
  if (input.kind === 'timer' && !s.timers.some((t) => timerKey(t) === timerKey(input.timer))) return { state: s, out, events }; // já cancelado ou substituído

  const before = fingerprint(s);
  const wasPlaying = s.game.phase === 'playing';
  const member = (token: string) => s.members.find((m) => m.token === token);
  const byId = (id: string) => s.members.find((m) => m.id === id);
  const ctx = (): Ctx => ({ now, rng, online: onlineIds(s), fakes: new Set(s.members.filter((m) => m.fake).map((m) => m.id)) });
  const send = (to: string, message: ServerMessage) => out.push({ to, message });
  const refuse = (to: string, action: string, error: RoomError = 'refused') => {
    send(to, { type: 'error', error });
    events.push({ type: 'refused', error, action });
  };
  /** uma ação de alguém da turma: a morte volta a ficar a `ttl` dela */
  const touch = () => { s.lastActivity = now; };
  const othersNicknames = (self?: RoomMember) => s.members.filter((m) => m !== self).map((m) => m.nickname);
  const addToTurma = (fields: Omit<RoomMember, 'id' | 'joinedAt' | 'nickname'>, nickname: string) => {
    const created: RoomMember = { id: `m${s.nextId++}`, nickname: uniqueNickname(nickname, othersNicknames()), joinedAt: now, ...fields };
    s.members.push(created);
    s.game = addMember(s.game, created.id);
    return created;
  };
  /** quem conecta recebe o snapshot mesmo que nada tenha mudado para os outros */
  let alsoTo: string | null = null;

  switch (input.kind) {
    case 'connect': {
      // conectar e cair não são atividade (como no trucossoca): uma aba que cai e volta sem parar não segura a sala viva
      if (s.kicked.includes(input.token)) { out.push({ to: input.token, close: CLOSE_KICKED }); break; }
      const m = member(input.token);
      if (m) {
        if (!m.connected) { m.connected = true; events.push({ type: 'reconnected', id: m.id, nickname: m.nickname }); }
      } else if (!s.visitors.includes(input.token)) {
        s.visitors.push(input.token);
      }
      alsoTo = input.token;
      break;
    }
    case 'disconnect': {
      const m = member(input.token);
      if (m) {
        // o lugar fica guardado até a sala morrer: a pessoa só aparece desconectada
        if (!m.connected) break;
        m.connected = false;
        events.push({ type: 'disconnected', id: m.id, nickname: m.nickname });
      } else if (s.visitors.includes(input.token)) {
        s.visitors = s.visitors.filter((t) => t !== input.token);
      }
      break;
    }
    case 'message': {
      const msg = input.message;
      const token = input.token;
      const m = member(token);
      const isVisitor = s.visitors.includes(token);
      if (!m && !isVisitor) break; // desconhecido (ou expulso): nada
      if (msg.type === 'ping') { send(token, { type: 'pong' }); break; } // não é atividade: uma aba esquecida aberta não segura a sala viva
      if (!m) {
        if (msg.type !== 'join') { refuse(token, msg.type); break; } // visitante não age
        if (s.members.length >= s.maxPlayers) { refuse(token, msg.type, 'roomFull'); break; }
        s.visitors = s.visitors.filter((t) => t !== token);
        const created = addToTurma({ token, connected: true, fake: false }, msg.nickname);
        if (s.moderator === null) {
          s.moderator = created.id;
          // o criador escolheu só moderar no pré-lobby: entra já como fantasma
          if (s.creatorOnlyModerate) {
            s.creatorOnlyModerate = false;
            const r = act(s.game, created.id, true, { type: 'onlyModerate', on: true }, ctx());
            if (r.ok) { s.game = r.game; events.push(...r.events); }
          }
        }
        touch();
        events.push({ type: 'joined', id: created.id, nickname: created.nickname });
        break;
      }
      touch();
      const isModerator = s.moderator === m.id;
      if (isGameAction(msg)) {
        const r = act(s.game, m.id, isModerator, msg, ctx());
        if (!r.ok) { refuse(token, msg.type); break; }
        s.game = r.game;
        events.push(...r.events);
        break;
      }
      switch (msg.type) {
        case 'join':
        case 'nickname': {
          // `join` de quem já é membro: troca de apelido
          const to = uniqueNickname(msg.nickname, othersNicknames(m));
          if (to !== m.nickname) { events.push({ type: 'renamed', id: m.id, from: m.nickname, to }); m.nickname = to; }
          break;
        }
        case 'kick': {
          const target = byId(msg.member);
          if (!isModerator || !target || target === m) { refuse(token, msg.type); break; }
          s.members = s.members.filter((x) => x !== target);
          if (target.token !== null) {
            s.kicked.push(target.token);
            out.push({ to: target.token, close: CLOSE_KICKED });
          }
          events.push({ type: 'kicked', id: target.id, nickname: target.nickname });
          delete s.stats[target.id];
          const r = removeMember(s.game, target.id, ctx());
          s.game = r.game;
          events.push(...r.events);
          break;
        }
        case 'maxPlayers': {
          // só no lobby, e nunca abaixo da turma de agora (quem caiu também tem o lugar guardado)
          if (!isModerator || s.game.phase !== 'lobby' || msg.n < s.members.length) { refuse(token, msg.type); break; }
          s.maxPlayers = msg.n;
          break;
        }
        case 'funnyBots': {
          if (!isModerator) { refuse(token, msg.type); break; }
          s.funnyBots = msg.on;
          break;
        }
        case 'handOver': {
          const target = byId(msg.member);
          if (!isModerator || !target || target === m || target.fake) { refuse(token, msg.type); break; }
          releaseOnlyModerate(s, m.id, ctx(), events);
          s.moderator = target.id;
          s.moderatorAway = null; // recomeça a contar, se a pessoa nova estiver offline
          events.push({ type: 'handedOver', from: m.id, to: target.id });
          break;
        }
        case 'addFake': {
          if (!s.dev) { refuse(token, msg.type); break; }
          if (s.members.length >= s.maxPlayers) { refuse(token, msg.type, 'roomFull'); break; }
          const fakes = s.members.filter((x) => x.fake).length;
          const created = addToTurma({ token: null, connected: true, fake: true }, `${FAKE_NICKNAME} ${fakes + 1}`);
          events.push({ type: 'fakeAdded', id: created.id, nickname: created.nickname });
          break;
        }
      }
      break;
    }
    case 'timer': {
      if (input.timer.kind === 'death') {
        s.phase = 'dead';
        s.timers = [];
        events.push({ type: 'died' });
        return { state: s, out, events };
      }
      // `moderator` e `game`: o que vale é o que vem abaixo, posto em dia com a hora de agora
      break;
    }
    case 'bots': {
      s.bots = input.bots.map((b) => ({ id: b.id, character: b.character }));
      break;
    }
    case 'stats': {
      if (s.game.phase !== 'playing') break;
      for (const { member: id, stat } of input.add) {
        if (!byId(id)) continue;
        (s.stats[id] ??= { falls: 0, shoves: 0, shovedByPlayers: 0, shovedByBots: 0 })[stat]++;
      }
      break;
    }
  }

  // o jogo em dia com a hora e com quem está conectado: vezes puladas, votação fechada, fim de jogo
  const settled = settle(s.game, ctx());
  s.game = settled.game;
  events.push(...settled.events);
  writeForFakes(s, ctx(), rng, events);
  succeedModerator(s, now, events, ctx());
  // os bots só existem com o jogo rodando: quando ele acaba (ou volta ao lobby), somem na hora
  if (s.game.phase !== 'playing' && s.bots.length) s.bots = [];
  // um jogo novo conta do zero; os números do que acabou ficam até lá
  if (!wasPlaying && s.game.phase === 'playing') s.stats = {};
  s.timers = timersFor(s, now);

  if (fingerprint(s) !== before) {
    for (const t of connectedTokens(s)) send(t, { type: 'snapshot', snapshot: snapshotFor(s, t, now) });
  } else if (alsoTo !== null) {
    send(alsoTo, { type: 'snapshot', snapshot: snapshotFor(s, alsoTo, now) });
  }
  return { state: s, out, events };
}

/** O que todo mundo vê da sala; se não mudou, ninguém recebe snapshot novo. */
function fingerprint(s: RoomState): string {
  return JSON.stringify([s.members.map((m) => [m.id, m.nickname, m.connected]), s.moderator, s.maxPlayers, s.funnyBots, s.bots, s.game]);
}

/** Quem está online para o jogo: membros conectados, falsos inclusive. */
function onlineIds(s: RoomState): Set<string> {
  return new Set(s.members.filter((m) => m.connected).map((m) => m.id));
}

/**
 * No lobby, cada falso que escreve um post-it ainda não pronto (novo, ou apagado porque o autor mudou) escreve uma
 * identidade ao acaso e aperta "Pronto".
 */
function writeForFakes(s: RoomState, ctx: Ctx, rng: () => number, events: RoomEvent[]) {
  for (const fake of s.members.filter((m) => m.fake)) {
    if (s.game.phase !== 'lobby') return;
    const owner = Object.keys(s.game.postits).find((o) => s.game.authors[o] === fake.id && !s.game.postits[o].ready);
    if (owner === undefined) continue;
    const text = FAKE_IDENTITIES[Math.min(FAKE_IDENTITIES.length - 1, Math.floor(rng() * FAKE_IDENTITIES.length))];
    const wrote = act(s.game, fake.id, false, { type: 'write', owner, text, image: null }, ctx);
    if (!wrote.ok) continue;
    const ready = act(wrote.game, fake.id, false, { type: 'ready' }, ctx);
    s.game = ready.ok ? ready.game : wrote.game;
    events.push(...wrote.events, ...(ready.ok ? ready.events : []));
  }
}

/**
 * O moderador offline há `MODERATOR_GRACE` passa o papel para a pessoa conectada mais antiga que não seja falsa. Sem
 * ninguém conectado, continua moderador, e a próxima pessoa que conectar assume.
 */
function succeedModerator(s: RoomState, now: number, events: RoomEvent[], ctx: Ctx) {
  const mod = s.members.find((m) => m.id === s.moderator);
  if (!mod || mod.connected) { s.moderatorAway = null; return; }
  s.moderatorAway ??= now;
  if (now < s.moderatorAway + MODERATOR_GRACE) return;
  const heir = s.members
    .filter((m) => m !== mod && m.connected && !m.fake)
    .sort((a, b) => a.joinedAt - b.joinedAt)[0];
  if (!heir) return;
  releaseOnlyModerate(s, mod.id, ctx, events);
  s.moderator = heir.id;
  s.moderatorAway = null;
  events.push({ type: 'moderatorSucceeded', from: mod.id, to: heir.id });
}

/**
 * Quem deixa de ser moderador deixa de "só moderar": só o moderador mexe nisso, e sem o papel ficaria de fora para sempre.
 * No lobby volta a jogar já; durante um jogo continua fantasma até o próximo.
 */
function releaseOnlyModerate(s: RoomState, id: string, ctx: Ctx, events: RoomEvent[]) {
  if (!s.game.onlyModerate.includes(id)) return;
  const back = s.game.phase === 'lobby' ? act(s.game, id, true, { type: 'onlyModerate', on: false }, ctx) : null;
  if (back?.ok) events.push(...back.events);
  s.game = back?.ok ? back.game : { ...s.game, onlyModerate: s.game.onlyModerate.filter((x) => x !== id) };
}

/** A morte, a tolerância do moderador (se está correndo) e o próximo prazo do jogo (se há). */
function timersFor(s: RoomState, now: number): RoomTimer[] {
  const timers: RoomTimer[] = [{ kind: 'death', at: s.lastActivity + s.ttl }];
  if (s.moderatorAway !== null && s.moderatorAway + MODERATOR_GRACE > now) timers.push({ kind: 'moderator', at: s.moderatorAway + MODERATOR_GRACE });
  const deadline = nextDeadline(s.game);
  if (deadline !== null) timers.push({ kind: 'game', at: deadline });
  return timers;
}

/** Quem deve receber snapshot: membros conectados (não falsos) e visitantes. */
export function connectedTokens(s: RoomState): string[] {
  return [...s.members.flatMap((m) => (m.connected && m.token !== null ? [m.token] : [])), ...s.visitors];
}

/** Os ids de imagem que algum post-it usa agora. */
export function referencedImages(s: RoomState): Set<string> {
  return new Set(Object.values(s.game.postits).flatMap((p) => (p.image === null ? [] : [p.image])));
}

/**
 * A sala como este token a vê, na hora `now`. Sem tokens; só ids públicos. Visitante (ainda sem apelido) tem `you`
 * null. O próprio post-it, antes de revelado, vai sem texto e sem imagem: nem a tela nem a rede mostram. No lobby, o
 * mesmo vale para todo post-it que a pessoa não escreve: os palpites só aparecem quando o jogo começa.
 */
export function snapshotFor(s: RoomState, token: string, now: number): RoomSnapshot {
  const g = s.game;
  const you = s.members.find((m) => m.token === token)?.id ?? null;
  const postits: Record<string, PostitView> = {};
  for (const [owner, p] of Object.entries(g.postits)) {
    const isRevealed = revealed(g, owner);
    // no lobby só quem escreve vê o que escreveu (nem o moderador vê os dos outros); no jogo, todos menos o dono
    const hidden = (owner === you && !isRevealed) || (g.phase === 'lobby' && g.authors[owner] !== you);
    postits[owner] = {
      text: hidden ? null : p.text,
      image: hidden || p.image === null ? null : imageUrl(s.code, p.image),
      ready: p.ready,
      written: p.text !== '',
      revealed: isRevealed,
      author: g.authors[owner] ?? null,
    };
  }
  const vote = g.vote;
  return {
    code: s.code,
    phase: g.phase,
    you,
    moderator: s.moderator,
    dev: s.dev,
    maxPlayers: s.maxPlayers,
    funnyBots: s.funnyBots,
    bots: s.bots.map((b) => ({ ...b })),
    stats: g.phase === 'ended' ? structuredClone(s.stats) : {},
    members: s.members.map((m) => ({
      id: m.id, nickname: m.nickname, connected: m.connected, character: g.characters[m.id] ?? null, ghost: !g.order.includes(m.id), fake: m.fake,
    })),
    order: [...g.order],
    authors: { ...g.authors },
    turnMs: g.turnMs,
    postits,
    turn: g.turn ? { owner: g.turn.owner, left: turnLeft(g, now), running: g.turn.since !== null } : null,
    paused: g.paused,
    vote: vote
      ? {
          claimer: vote.claimer, voters: [...vote.voters], voted: Object.keys(vote.ballots), left: Math.max(0, vote.closesAt - now),
          yours: you !== null && you in vote.ballots ? vote.ballots[you] : null,
        }
      : null,
    got: [...g.got],
    gaveUp: [...g.gaveUp],
  };
}

/** Identidade de um timer é o seu conteúdo: o adaptador usa a mesma chave para agendar e cancelar. */
export function timerKey(t: RoomTimer) { return `${t.kind}:${t.at}`; }
