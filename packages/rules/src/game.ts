/**
 * O jogo, puro: lobby, escrita, vezes, acertei e votação, desistir, ranking, poderes do moderador. Não sabe de tokens,
 * sockets nem relógio: quem chama passa a hora e quem está online em `Ctx`. O servidor (`apps/server/src/room.ts`) cuida
 * da turma (entrar, apelido, conexão, expulsar, sucessão do moderador) e chama daqui. Vocabulário do `CONTEXT.md`;
 * a votação decide o acerto, não o jogo (ADR 0008): nada aqui lê o texto de um post-it para decidir alguma coisa.
 *
 * Todo `id` é o id público de um membro da sala (`m1`, `m2`…).
 */

/** A vez: padrão, mínimo, máximo e passo, ms. */
export const TURN_DEFAULT = 60_000;
export const TURN_MIN = 30_000;
export const TURN_MAX = 180_000;
export const TURN_STEP = 15_000;
/** A votação fecha depois disto, ms. */
export const VOTE_MS = 15_000;
/** Texto do post-it: tamanho máximo depois de aparado. */
export const POSTIT_MAX = 40;
/** Personagens: oito, de 0 a 7, únicos na sala. */
export const CHARACTERS = 8;
/** O jogo começa com pelo menos esta turma jogando. */
export const MIN_PLAYERS = 2;

export type Phase = 'lobby' | 'writing' | 'playing' | 'ended';

export interface Postit {
  /** aparado, até `POSTIT_MAX`; '' = ainda não escrito */
  text: string;
  /** id da imagem guardada pela sala; null = sem imagem */
  image: string | null;
  /** o autor apertou "Pronto": não edita mais */
  ready: boolean;
}

/**
 * A vez corrente. O relógio corre quando `since` não é null: sobra `left - (now - since)`. Parado (pausa do moderador
 * ou votação aberta), `since` é null e `left` é o que sobrou.
 */
export interface Turn { owner: string; left: number; since: number | null }

export interface Vote {
  /** quem pediu (a dona da vez) */
  claimer: string;
  /** quem pode votar, fixado na abertura: as outras pessoas conectadas que jogam, sem fantasmas nem jogadores falsos */
  voters: string[];
  /** voto de cada um que votou: true = acertou */
  ballots: Record<string, boolean>;
  closesAt: number;
}

export interface GameState {
  phase: Phase;
  /** quem joga, na ordem das vezes; quem não está aqui é fantasma */
  order: string[];
  /** o moderador escolheu só moderar: não entra em `order` no próximo lobby (nem neste) */
  onlyModerate: string[];
  /** personagem de cada membro (0..7), único */
  characters: Record<string, number>;
  /**
   * dono → autor. Enquanto `customAuthors` é false, é o círculo sobre `order` (cada um escreve para o próximo) e é
   * recalculado a cada mudança da ordem; depois de trocar ou sortear, fica como o moderador deixou. A partir da escrita, os
   * autores ficam congelados: reordenar durante o jogo não muda quem escreveu o quê.
   */
  authors: Record<string, string>;
  customAuthors: boolean;
  turnMs: number;
  /** dono → post-it; existe para cada dono de `order` a partir da escrita */
  postits: Record<string, Postit>;
  turn: Turn | null;
  /** o moderador pausou o relógio */
  paused: boolean;
  vote: Vote | null;
  /** ranking: quem acertou, na ordem em que acertou */
  got: string[];
  /** quem desistiu, na ordem em que desistiu: fica abaixo de `got` */
  gaveUp: string[];
}

/** O que quem chama sabe e o jogo não: a hora, o sorteio, quem está online e quem é jogador falso. */
export interface Ctx {
  now: number;
  rng: () => number;
  online: ReadonlySet<string>;
  fakes: ReadonlySet<string>;
}

export type GameAction =
  // lobby
  /** escolhe o próprio personagem, se estiver livre (qualquer fase) */
  | { type: 'character'; character: number }
  /** moderador: nova ordem das vezes; tem de ser uma permutação de `order` (lobby ou jogo) */
  | { type: 'order'; order: string[] }
  /** moderador: troca os autores de dois donos; recusa se alguém passar a escrever para si (lobby) */
  | { type: 'swapAuthors'; a: string; b: string }
  /** moderador: sorteia os autores sem ninguém escrever para si (lobby) */
  | { type: 'shuffleAuthors' }
  /** moderador: tamanho da vez, de `TURN_MIN` a `TURN_MAX` em passos de `TURN_STEP` (lobby) */
  | { type: 'turnMs'; ms: number }
  /** moderador: só moderar (sai de `order`, vira fantasma) ou voltar a jogar (lobby) */
  | { type: 'onlyModerate'; on: boolean }
  /** moderador: lobby → escrita, com pelo menos `MIN_PLAYERS` em `order` */
  | { type: 'startWriting' }
  // escrita
  /** o autor de `owner` (ou o moderador, para qualquer dono) escreve o post-it; recusa depois de pronto */
  | { type: 'write'; owner: string; text: string; image: string | null }
  /** o autor marca o post-it que escreve como pronto (precisa de texto); todos prontos → jogo */
  | { type: 'ready' }
  /** moderador: começa o jogo já; recusa se algum post-it está sem texto (o moderador escreve antes) */
  | { type: 'forceStart' }
  // jogo
  /** a dona da vez diz que acertou: o relógio para e a votação abre */
  | { type: 'claim' }
  /** quem pode votar vota; o último voto fecha a votação na hora */
  | { type: 'vote'; yes: boolean }
  /** a dona da vez passa a vez; o moderador passa a vez de quem for */
  | { type: 'skip' }
  /** a pessoa revela o próprio post-it e vai para o fim do ranking (a qualquer momento do jogo) */
  | { type: 'giveUp' }
  /** moderador: marca alguém como acertou ou não; passa por cima da votação e desfaz uma revelação (acerto ou desistência) */
  | { type: 'mark'; member: string; right: boolean }
  /** moderador: pausa ou solta o relógio */
  | { type: 'pause'; on: boolean }
  /** moderador: encerra o jogo (escrita ou jogo → fim) */
  | { type: 'endGame' }
  // fim
  /** qualquer pessoa: de volta ao lobby com a mesma turma; fantasmas entram, quem só modera continua de fora */
  | { type: 'playAgain' };

/** Por que uma ação foi recusada. */
export type GameError = 'notModerator' | 'wrongPhase' | 'notYourTurn' | 'invalid';

/** O que aconteceu de notável: para o log do servidor e, mais tarde, para os sons. */
export type GameEvent =
  | { type: 'writing' }
  | { type: 'started' }
  | { type: 'turn'; owner: string }
  | { type: 'claimed'; owner: string }
  | { type: 'voted'; owner: string; yes: boolean; yesVotes: number; noVotes: number }
  | { type: 'gotIt'; owner: string; by: 'vote' | 'moderator' }
  | { type: 'gaveUp'; owner: string }
  | { type: 'unrevealed'; owner: string }
  | { type: 'ended' }
  | { type: 'lobby' };

export type ActionResult = { ok: true; game: GameState; events: GameEvent[] } | { ok: false; error: GameError };

export function createGame(): GameState {
  return {
    phase: 'lobby',
    order: [],
    onlyModerate: [],
    characters: {},
    authors: {},
    customAuthors: false,
    turnMs: TURN_DEFAULT,
    postits: {},
    turn: null,
    paused: false,
    vote: null,
    got: [],
    gaveUp: [],
  };
}

/**
 * Alguém entrou na turma: ganha o primeiro personagem livre; no lobby entra no fim de `order` (o círculo recalcula e
 * `customAuthors` volta a false); fora do lobby fica fantasma até o próximo jogo.
 */
export function addMember(g: GameState, id: string): GameState {
  if (id in g.characters) return g;
  const next = structuredClone(g);
  const taken = new Set(Object.values(next.characters));
  for (let c = 0; c < CHARACTERS; c++) {
    if (!taken.has(c)) {
      next.characters[id] = c;
      break;
    }
  }
  if (next.phase === 'lobby') {
    next.order.push(id);
    next.customAuthors = false;
    fixAuthors(next);
  }
  return next;
}

/**
 * Alguém saiu da turma (expulso): sai de `order`, de `onlyModerate`, dos personagens, do ranking e dos votos. O post-it
 * de que era dono some em qualquer fase. Na escrita, o dono para quem escrevia fica sem autor (o moderador escreve); no
 * lobby, os autores voltam ao círculo. No jogo, se era a vez
 * dele, a próxima começa. Depois, o mesmo que `settle`.
 */
export function removeMember(g: GameState, id: string, ctx: Ctx): { game: GameState; events: GameEvent[] } {
  const next = structuredClone(g);
  const events: GameEvent[] = [];
  const oldOrder = g.order;
  next.order = next.order.filter((m) => m !== id);
  next.onlyModerate = next.onlyModerate.filter((m) => m !== id);
  delete next.characters[id];
  next.got = next.got.filter((m) => m !== id);
  next.gaveUp = next.gaveUp.filter((m) => m !== id);
  if (next.phase === 'lobby') {
    fixAuthors(next);
  } else {
    delete next.authors[id];
    for (const owner of Object.keys(next.authors)) if (next.authors[owner] === id) delete next.authors[owner];
    delete next.postits[id];
  }
  if (next.vote) {
    if (next.vote.claimer === id) {
      next.vote = null;
    } else {
      next.vote.voters = next.vote.voters.filter((m) => m !== id);
      delete next.vote.ballots[id];
    }
  }
  if (next.phase === 'playing' && next.turn?.owner === id) startTurn(next, ctx, events, id, oldOrder);
  const settled = settle(next, ctx);
  return { game: settled.game, events: [...events, ...settled.events] };
}

/**
 * Aplica uma ação de `actor`. `moderator`: se `actor` é o moderador. Nunca muda `g`. Depois de aplicar, faz o mesmo que
 * `settle`.
 */
export function act(g: GameState, actor: string, moderator: boolean, action: GameAction, ctx: Ctx): ActionResult {
  const next = structuredClone(g);
  const events: GameEvent[] = [];
  const error = apply(next, actor, moderator, action, ctx, events);
  if (error) return { ok: false, error };
  const settled = settle(next, ctx);
  return { ok: true, game: settled.game, events: [...events, ...settled.events] };
}

/** Os poderes de cada ação; muda `g` (já uma cópia) e devolve o erro, se recusar. */
function apply(g: GameState, actor: string, moderator: boolean, action: GameAction, ctx: Ctx, events: GameEvent[]): GameError | null {
  switch (action.type) {
    case 'character': {
      const c = action.character;
      if (!(actor in g.characters) || !Number.isInteger(c) || c < 0 || c >= CHARACTERS) return 'invalid';
      if (Object.entries(g.characters).some(([id, other]) => id !== actor && other === c)) return 'invalid';
      g.characters[actor] = c;
      return null;
    }
    case 'order': {
      if (!moderator) return 'notModerator';
      if (g.phase !== 'lobby' && g.phase !== 'playing') return 'wrongPhase';
      if (!isPermutation(action.order, g.order)) return 'invalid';
      g.order = [...action.order];
      if (g.phase === 'lobby') fixAuthors(g);
      return null;
    }
    case 'swapAuthors': {
      if (!moderator) return 'notModerator';
      if (g.phase !== 'lobby') return 'wrongPhase';
      const { a, b } = action;
      if (a === b || !g.order.includes(a) || !g.order.includes(b)) return 'invalid';
      const authorA = g.authors[a];
      const authorB = g.authors[b];
      if (authorB === a || authorA === b) return 'invalid';
      g.authors[a] = authorB;
      g.authors[b] = authorA;
      g.customAuthors = true;
      return null;
    }
    case 'shuffleAuthors': {
      if (!moderator) return 'notModerator';
      if (g.phase !== 'lobby') return 'wrongPhase';
      if (g.order.length < MIN_PLAYERS) return 'invalid';
      g.authors = derangement(g.order, ctx.rng);
      g.customAuthors = true;
      return null;
    }
    case 'turnMs': {
      if (!moderator) return 'notModerator';
      if (g.phase !== 'lobby') return 'wrongPhase';
      const ms = action.ms;
      if (!Number.isInteger(ms) || ms < TURN_MIN || ms > TURN_MAX || (ms - TURN_MIN) % TURN_STEP !== 0) return 'invalid';
      g.turnMs = ms;
      return null;
    }
    case 'onlyModerate': {
      if (!moderator) return 'notModerator';
      if (g.phase !== 'lobby') return 'wrongPhase';
      const already = g.onlyModerate.includes(actor);
      if (action.on === already) return 'invalid';
      if (action.on) {
        g.onlyModerate.push(actor);
        g.order = g.order.filter((id) => id !== actor);
      } else {
        g.onlyModerate = g.onlyModerate.filter((id) => id !== actor);
        if (!g.order.includes(actor)) g.order.push(actor);
      }
      fixAuthors(g);
      return null;
    }
    case 'startWriting': {
      if (!moderator) return 'notModerator';
      if (g.phase !== 'lobby') return 'wrongPhase';
      if (g.order.length < MIN_PLAYERS) return 'invalid';
      g.phase = 'writing';
      g.postits = {};
      for (const owner of g.order) g.postits[owner] = { text: '', image: null, ready: false };
      events.push({ type: 'writing' });
      return null;
    }
    case 'write': {
      if (g.phase !== 'writing') return 'wrongPhase';
      const postit = g.postits[action.owner];
      if (!postit || postit.ready) return 'invalid';
      const mayWrite = g.authors[action.owner] === actor || (moderator && action.owner !== actor);
      if (!mayWrite) return 'invalid';
      postit.text = cleanPostit(action.text);
      postit.image = action.image;
      return null;
    }
    case 'ready': {
      if (g.phase !== 'writing') return 'wrongPhase';
      const owner = Object.keys(g.postits).find((o) => g.authors[o] === actor);
      if (owner === undefined) return 'invalid';
      const postit = g.postits[owner];
      if (postit.ready || postit.text === '') return 'invalid';
      postit.ready = true;
      return null;
    }
    case 'forceStart': {
      if (!moderator) return 'notModerator';
      if (g.phase !== 'writing') return 'wrongPhase';
      if (Object.values(g.postits).some((p) => p.text === '')) return 'invalid';
      startPlaying(g, ctx, events);
      return null;
    }
    case 'claim': {
      if (g.phase !== 'playing') return 'wrongPhase';
      const turn = g.turn;
      if (!turn || turn.owner !== actor) return moderator ? 'invalid' : 'notYourTurn';
      if (g.vote) return 'invalid';
      stopClock(turn, ctx.now);
      const voters = g.order.filter((id) => id !== actor && ctx.online.has(id) && !ctx.fakes.has(id));
      g.vote = { claimer: actor, voters, ballots: {}, closesAt: ctx.now + VOTE_MS };
      events.push({ type: 'claimed', owner: actor });
      return null;
    }
    case 'vote': {
      if (g.phase !== 'playing') return 'wrongPhase';
      const vote = g.vote;
      if (!vote || !vote.voters.includes(actor) || actor in vote.ballots) return 'invalid';
      vote.ballots[actor] = action.yes;
      return null;
    }
    case 'skip': {
      if (g.phase !== 'playing') return 'wrongPhase';
      const turn = g.turn;
      if (!turn) return 'invalid';
      if (turn.owner !== actor && !moderator) return 'notYourTurn';
      if (g.vote) return 'invalid';
      startTurn(g, ctx, events, turn.owner);
      return null;
    }
    case 'giveUp': {
      if (g.phase !== 'playing') return 'wrongPhase';
      if (!g.order.includes(actor) || isDone(g, actor)) return 'invalid';
      g.gaveUp.push(actor);
      events.push({ type: 'gaveUp', owner: actor });
      if (g.vote?.claimer === actor) g.vote = null;
      if (g.turn?.owner === actor) startTurn(g, ctx, events, actor);
      return null;
    }
    case 'mark': {
      if (!moderator) return 'notModerator';
      if (g.phase !== 'playing') return 'wrongPhase';
      const member = action.member;
      if (!g.order.includes(member)) return 'invalid';
      if (g.vote?.claimer === member) {
        closeVote(g, ctx, events, action.right, 'moderator');
        return null;
      }
      if (action.right) {
        if (g.got.includes(member)) return 'invalid';
        g.gaveUp = g.gaveUp.filter((id) => id !== member);
        g.got.push(member);
        events.push({ type: 'gotIt', owner: member, by: 'moderator' });
        if (g.turn?.owner === member) startTurn(g, ctx, events, member);
      } else {
        if (!isDone(g, member)) return 'invalid';
        g.got = g.got.filter((id) => id !== member);
        g.gaveUp = g.gaveUp.filter((id) => id !== member);
        events.push({ type: 'unrevealed', owner: member });
      }
      return null;
    }
    case 'pause': {
      if (!moderator) return 'notModerator';
      if (g.phase !== 'playing') return 'wrongPhase';
      if (action.on === g.paused) return 'invalid';
      g.paused = action.on;
      if (g.turn) {
        if (action.on) stopClock(g.turn, ctx.now);
        else if (!g.vote) g.turn.since = ctx.now;
      }
      return null;
    }
    case 'endGame': {
      if (!moderator) return 'notModerator';
      if (g.phase !== 'writing' && g.phase !== 'playing') return 'wrongPhase';
      endGame(g, events);
      return null;
    }
    case 'playAgain': {
      if (g.phase !== 'ended') return 'wrongPhase';
      const late = Object.keys(g.characters).filter((id) => !g.order.includes(id) && !g.onlyModerate.includes(id));
      g.phase = 'lobby';
      g.order = [...g.order, ...late];
      g.customAuthors = false;
      g.authors = circle(g.order);
      g.postits = {};
      g.turn = null;
      g.vote = null;
      g.paused = false;
      g.got = [];
      g.gaveUp = [];
      events.push({ type: 'lobby' });
      return null;
    }
  }
}

/** Para o relógio da vez, guardando o que sobra. */
function stopClock(turn: Turn, now: number): void {
  if (turn.since === null) return;
  turn.left = Math.max(0, turn.left - (now - turn.since));
  turn.since = null;
}

/**
 * Fecha a votação aberta. Sim: a dona entra em `got` e a próxima vez começa. Não: a vez volta a correr com o que
 * sobrava (a menos que o moderador tenha pausado).
 */
function closeVote(g: GameState, ctx: Ctx, events: GameEvent[], yes: boolean, by: 'vote' | 'moderator'): void {
  const claimer = g.vote!.claimer;
  g.vote = null;
  if (yes) {
    g.gaveUp = g.gaveUp.filter((id) => id !== claimer);
    if (!g.got.includes(claimer)) g.got.push(claimer);
    events.push({ type: 'gotIt', owner: claimer, by });
    startTurn(g, ctx, events, claimer);
  } else if (g.turn && !g.paused) {
    g.turn.since = ctx.now;
  }
}

function endGame(g: GameState, events: GameEvent[]): void {
  g.phase = 'ended';
  g.turn = null;
  g.vote = null;
  events.push({ type: 'ended' });
}

/** Escrita → jogo: a primeira vez é da primeira pessoa da ordem que pode jogar. */
function startPlaying(g: GameState, ctx: Ctx, events: GameEvent[]): void {
  g.phase = 'playing';
  g.turn = null;
  g.vote = null;
  g.paused = false;
  g.got = [];
  g.gaveUp = [];
  events.push({ type: 'started' });
  startTurn(g, ctx, events, null);
}

function isDone(g: GameState, id: string): boolean {
  return g.got.includes(id) || g.gaveUp.includes(id);
}

/** Pode ter a vez: está na ordem, conectada, não é falsa e ainda não acertou nem desistiu. */
function canTakeTurn(g: GameState, ctx: Ctx, id: string): boolean {
  return g.order.includes(id) && ctx.online.has(id) && !ctx.fakes.has(id) && !isDone(g, id);
}

/**
 * A próxima vez: a próxima pessoa de `order` depois de `after` que pode jogar, dando a volta (e voltando a `after`, se
 * só ela pode). `after` null ou fora da ordem: do começo da ordem. Ninguém pode: sem vez.
 */
function startTurn(g: GameState, ctx: Ctx, events: GameEvent[], after: string | null, order: readonly string[] = g.order): void {
  const i = after === null ? -1 : order.indexOf(after);
  const rotation = i < 0 ? order : [...order.slice(i + 1), ...order.slice(0, i + 1)];
  const owner = rotation.find((id) => canTakeTurn(g, ctx, id));
  if (owner === undefined) {
    g.turn = null;
    return;
  }
  g.turn = { owner, left: g.turnMs, since: g.paused ? null : ctx.now };
  events.push({ type: 'turn', owner });
}

/**
 * No lobby, depois de mudar a ordem: o círculo, a menos que os autores trocados ainda valham para a ordem nova (cada
 * pessoa da ordem escreve para uma outra, uma só).
 */
function fixAuthors(g: GameState): void {
  if (g.customAuthors && validAssignment(g.authors, g.order)) return;
  g.customAuthors = false;
  g.authors = circle(g.order);
}

function validAssignment(authors: Record<string, string>, order: readonly string[]): boolean {
  const owners = Object.keys(authors);
  if (!isPermutation(owners, order)) return false;
  if (!isPermutation(Object.values(authors), order)) return false;
  return order.every((o) => authors[o] !== o);
}

function isPermutation(candidate: readonly string[], of: readonly string[]): boolean {
  if (!Array.isArray(candidate) || candidate.length !== of.length) return false;
  const set = new Set(candidate);
  return set.size === of.length && of.every((id) => set.has(id));
}

/**
 * Põe o jogo em dia depois que a hora passou ou alguém conectou ou caiu:
 * - votação vencida (`closesAt <= now`) ou sem ninguém mais que possa votar fecha: maioria dos votos dados, empate (e
 *   zero votos) = sim. Sim: a dona entra em `got` e a próxima vez começa. Não: a vez volta a correr com o que sobrava.
 * - vez vencida (relógio correndo e sobra <= 0): a próxima começa.
 * - a dona da vez está offline (ou é jogador falso): a próxima começa (jogador falso passa a vez sozinho).
 * - jogo acaba quando nenhuma pessoa conectada de `order` (sem contar jogadores falsos, que nunca acertam) está ainda
 *   jogando: todas acertaram ou desistiram. Sem nenhuma pessoa conectada que não seja falsa, não acaba (a sala espera).
 * A próxima vez é da próxima pessoa em `order` depois da dona atual, conectada, sem ter acertado nem desistido, e não
 * jogador falso; dá a volta. Começa com `turnMs` e o relógio correndo (a menos que o moderador tenha pausado).
 */
export function settle(g: GameState, ctx: Ctx): { game: GameState; events: GameEvent[] } {
  const next = structuredClone(g);
  const events: GameEvent[] = [];
  if (next.phase === 'writing') {
    const postits = Object.values(next.postits);
    if (postits.length > 0 && postits.every((p) => p.ready)) startPlaying(next, ctx, events);
  }
  // cada passo muda alguma coisa ou nada; repete até nada mudar (com folga contra um laço sem fim)
  for (let i = 0; i < 100 && next.phase === 'playing' && settleOnce(next, ctx, events); i++);
  return { game: next, events };
}

/** Um passo de `settle`; devolve se mudou alguma coisa. */
function settleOnce(g: GameState, ctx: Ctx, events: GameEvent[]): boolean {
  const vote = g.vote;
  if (vote) {
    const waiting = vote.voters.some((id) => !(id in vote.ballots) && ctx.online.has(id));
    if (ctx.now >= vote.closesAt || !waiting) {
      const ballots = Object.values(vote.ballots);
      const yesVotes = ballots.filter((b) => b).length;
      const noVotes = ballots.length - yesVotes;
      const yes = yesVotes >= noVotes;
      events.push({ type: 'voted', owner: vote.claimer, yes, yesVotes, noVotes });
      closeVote(g, ctx, events, yes, 'vote');
      return true;
    }
  }
  const turn = g.turn;
  if (turn && !g.vote) {
    const timedOut = turn.since !== null && turnLeft(g, ctx.now) <= 0;
    if (timedOut || !canTakeTurn(g, ctx, turn.owner)) {
      startTurn(g, ctx, events, turn.owner);
      return true;
    }
  }
  const present = g.order.filter((id) => ctx.online.has(id) && !ctx.fakes.has(id));
  if (present.length > 0 && present.every((id) => isDone(g, id))) {
    endGame(g, events);
    return true;
  }
  if (!g.turn && !g.vote) {
    startTurn(g, ctx, events, null);
    return g.turn !== null;
  }
  return false;
}

/** Quando o jogo precisa ser posto em dia de novo por causa da hora (fim da vez ou da votação); null = nada a esperar. */
export function nextDeadline(g: GameState): number | null {
  if (g.vote) return g.vote.closesAt;
  if (g.turn && g.turn.since !== null) return g.turn.since + g.turn.left;
  return null;
}

/** O tempo que sobra na vez agora, ms (0 se não há vez). */
export function turnLeft(g: GameState, now: number): number {
  const turn = g.turn;
  if (!turn) return 0;
  if (turn.since === null) return turn.left;
  return Math.max(0, turn.left - (now - turn.since));
}

/** Se o post-it de `owner` já foi revelado a ele: acertou, desistiu, ou o jogo acabou. */
export function revealed(g: GameState, owner: string): boolean {
  return g.phase === 'ended' || isDone(g, owner);
}

/** O texto de um post-it como o autor o manda: espaços juntados, aparado, até `POSTIT_MAX`. */
export function cleanPostit(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, POSTIT_MAX).trimEnd();
}

/** Um sorteio de autores para `order` em que ninguém escreve para si (dono → autor). Com uma pessoa só, ela mesma. */
export function derangement(order: readonly string[], rng: () => number): Record<string, string> {
  const n = order.length;
  if (n < 2) return circle(order);
  const pick = (below: number) => Math.min(below - 1, Math.max(0, Math.floor(rng() * below)));
  // Fisher-Yates até não sobrar ninguém escrevendo para si: uniforme entre os sorteios válidos (umas e ≈ 2,7 tentativas).
  for (let attempt = 0; attempt < 100; attempt++) {
    const authors = [...order];
    for (let i = n - 1; i > 0; i--) {
      const j = pick(i + 1);
      [authors[i], authors[j]] = [authors[j], authors[i]];
    }
    if (authors.every((a, i) => a !== order[i])) return zip(order, authors);
  }
  // um sorteio viciado nunca acerta: Sattolo dá um ciclo só, sempre sem ponto fixo, com qualquer rng
  const authors = [...order];
  for (let i = n - 1; i > 0; i--) {
    const j = pick(i);
    [authors[i], authors[j]] = [authors[j], authors[i]];
  }
  return zip(order, authors);
}

function zip(owners: readonly string[], authors: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  owners.forEach((o, i) => (out[o] = authors[i]));
  return out;
}

/** O círculo: cada pessoa escreve para a próxima em `order` (dono `order[i+1]` → autor `order[i]`, dando a volta). */
export function circle(order: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  order.forEach((author, i) => (out[order[(i + 1) % order.length]] = author));
  return out;
}
