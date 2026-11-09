import { expect } from 'bun:test';
import { act, addMember, createGame, removeMember, settle, type Ctx, type GameAction, type GameEvent, type GameState } from '../src';

/** Um sorteio previsível: LCG com semente. */
export function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

export const T0 = 1_000_000;

/**
 * Uma mesa de jogo de mentira: guarda o estado, a hora, quem está online e quem é falso, e tudo o que aconteceu. O
 * primeiro a entrar é o moderador.
 */
export class Sim {
  game: GameState = createGame();
  now = T0;
  online = new Set<string>();
  fakes = new Set<string>();
  events: GameEvent[] = [];
  moderator: string | null = null;
  rng = lcg(42);

  constructor(...ids: string[]) {
    for (const id of ids) this.join(id);
  }

  get ctx(): Ctx {
    return { now: this.now, rng: this.rng, online: this.online, fakes: this.fakes };
  }

  join(id: string, opts: { fake?: boolean } = {}) {
    this.moderator ??= id;
    this.game = addMember(this.game, id);
    this.online.add(id);
    if (opts.fake) this.fakes.add(id);
    return this.settle();
  }

  /** tenta a ação; devolve o resultado e, se deu certo, avança o estado */
  try(actor: string, action: GameAction) {
    const r = act(this.game, actor, actor === this.moderator, action, this.ctx);
    if (r.ok) {
      this.game = r.game;
      this.events.push(...r.events);
    }
    return r;
  }

  /** faz a ação e exige que dê certo; devolve só os eventos dela */
  do(actor: string, action: GameAction): GameEvent[] {
    const r = this.try(actor, action);
    if (!r.ok) throw new Error(`${actor} ${action.type}: ${r.error}`);
    return r.events;
  }

  /** exige que a ação seja recusada com este erro e que nada mude */
  refuse(actor: string, action: GameAction, error: string) {
    const before = structuredClone(this.game);
    const r = this.try(actor, action);
    expect(r.ok ? 'ok' : r.error).toBe(error);
    expect(this.game).toEqual(before);
  }

  settle(): GameEvent[] {
    const r = settle(this.game, this.ctx);
    this.game = r.game;
    this.events.push(...r.events);
    return r.events;
  }

  /** a hora anda e o jogo é posto em dia */
  advance(ms: number): GameEvent[] {
    this.now += ms;
    return this.settle();
  }

  drop(id: string): GameEvent[] {
    this.online.delete(id);
    return this.settle();
  }

  back(id: string): GameEvent[] {
    this.online.add(id);
    return this.settle();
  }

  kick(id: string): GameEvent[] {
    const r = removeMember(this.game, id, this.ctx);
    this.game = r.game;
    this.online.delete(id);
    this.events.push(...r.events);
    return r.events;
  }

  /** cada autor escreve o post-it do seu dono e aperta "Pronto" (no lobby: o jogo não começa sozinho) */
  writeAll() {
    for (const owner of this.game.order) {
      const author = this.game.authors[owner];
      this.do(author, { type: 'write', owner, text: `quem é ${owner}`, image: null });
      this.do(author, { type: 'ready' });
    }
  }

  /** do lobby até a primeira vez: todos escrevem e ficam prontos, e o moderador começa */
  start() {
    this.writeAll();
    this.do(this.moderator!, { type: 'start' });
    expect(this.game.phase).toBe('playing');
  }

  get owner(): string | undefined {
    return this.game.turn?.owner;
  }
}
