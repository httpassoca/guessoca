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
   * recalculado a cada mudança da ordem; depois de trocar ou sortear, fica como o moderador deixou.
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
  throw new Error('todo');
}

/**
 * Alguém entrou na turma: ganha o primeiro personagem livre; no lobby entra no fim de `order` (o círculo recalcula e
 * `customAuthors` volta a false); fora do lobby fica fantasma até o próximo jogo.
 */
export function addMember(g: GameState, id: string): GameState {
  throw new Error('todo');
}

/**
 * Alguém saiu da turma (expulso): sai de `order`, de `onlyModerate`, dos personagens, do ranking e dos votos. Na escrita,
 * o post-it de que era dono some, e o dono para quem escrevia fica sem autor (o moderador escreve). No jogo, se era a vez
 * dele, a próxima começa. Depois, o mesmo que `settle`.
 */
export function removeMember(g: GameState, id: string, ctx: Ctx): { game: GameState; events: GameEvent[] } {
  throw new Error('todo');
}

/**
 * Aplica uma ação de `actor`. `moderator`: se `actor` é o moderador. Nunca muda `g`. Depois de aplicar, faz o mesmo que
 * `settle`.
 */
export function act(g: GameState, actor: string, moderator: boolean, action: GameAction, ctx: Ctx): ActionResult {
  throw new Error('todo');
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
  throw new Error('todo');
}

/** Quando o jogo precisa ser posto em dia de novo por causa da hora (fim da vez ou da votação); null = nada a esperar. */
export function nextDeadline(g: GameState): number | null {
  throw new Error('todo');
}

/** O tempo que sobra na vez agora, ms (0 se não há vez). */
export function turnLeft(g: GameState, now: number): number {
  throw new Error('todo');
}

/** Se o post-it de `owner` já foi revelado a ele: acertou, desistiu, ou o jogo acabou. */
export function revealed(g: GameState, owner: string): boolean {
  throw new Error('todo');
}

/** O texto de um post-it como o autor o manda: espaços juntados, aparado, até `POSTIT_MAX`. */
export function cleanPostit(raw: string): string {
  throw new Error('todo');
}

/** Um sorteio de autores para `order` em que ninguém escreve para si (dono → autor). Com uma pessoa só, ela mesma. */
export function derangement(order: readonly string[], rng: () => number): Record<string, string> {
  throw new Error('todo');
}

/** O círculo: cada pessoa escreve para a próxima em `order` (dono `order[i+1]` → autor `order[i]`, dando a volta). */
export function circle(order: readonly string[]): Record<string, string> {
  throw new Error('todo');
}
