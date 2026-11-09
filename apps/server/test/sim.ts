import type { ClientMessage, RoomInit, RoomSnapshot, ServerMessage } from '@guess/protocol';
import { createRoom, step, type Outgoing, type RoomEvent, type RoomInput, type RoomState, type RoomTimer } from '../src/room';

export const T0 = 1_000_000;

/** Um sorteio previsível: LCG com semente. */
export function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** Enfileira entradas numa sala e guarda tudo o que saiu, para asserções no que a sala manda e no que ela vira. */
export class Sim {
  state: RoomState;
  out: Outgoing[] = [];
  events: RoomEvent[] = [];
  rng = lcg(42);
  /** `init`: o que o pré-lobby escolheu ao criar a sala */
  constructor(public now = T0, opts: { dev?: boolean; init?: RoomInit } = {}) { this.state = createRoom('ABCD', now, opts); }
  feed(input: RoomInput, at = this.now) {
    this.now = at;
    const r = step(this.state, input, at, { rng: this.rng });
    this.state = r.state; this.out.push(...r.out); this.events.push(...r.events);
    return r;
  }
  connect(token: string, at?: number) { return this.feed({ kind: 'connect', token }, at); }
  disconnect(token: string, at?: number) { return this.feed({ kind: 'disconnect', token }, at); }
  say(token: string, message: ClientMessage, at?: number) { return this.feed({ kind: 'message', token, message }, at); }
  join(token: string, nickname: string, at?: number) { return this.say(token, { type: 'join', nickname }, at); }
  rename(token: string, nickname: string, at?: number) { return this.say(token, { type: 'nickname', nickname }, at); }
  ping(token: string, at?: number) { return this.say(token, { type: 'ping' }, at); }
  /** conecta e entra com apelido, como uma aba nova faz */
  enter(token: string, nickname: string, at?: number) { this.connect(token, at); return this.join(token, nickname, at); }
  timer(kind: RoomTimer['kind']) { return this.state.timers.find((t) => t.kind === kind); }
  /** dispara o timer pendente deste tipo, como o adaptador faria quando ele vence */
  fire(kind: RoomTimer['kind']) {
    const t = this.timer(kind);
    if (!t) throw new Error(`sem timer ${kind}`);
    return this.feed({ kind: 'timer', timer: t }, t.at);
  }
  fireDeath() { return this.fire('death'); }
  deathAt() { return this.state.timers.filter((t) => t.kind === 'death').map((t) => t.at); }
  /** as mensagens entregues a este token, na ordem */
  messagesTo(token: string): ServerMessage[] {
    return this.out.flatMap((o) => (o.to === token && 'message' in o ? [o.message] : []));
  }
  /** último snapshot entregue a este token */
  snapshotFor(token: string): RoomSnapshot | undefined {
    const snaps = this.messagesTo(token).filter((m) => m.type === 'snapshot');
    return snaps.at(-1)?.snapshot;
  }
  names(token: string) { return this.snapshotFor(token)?.members.map((m) => m.nickname); }
  /** tudo o que este token já recebeu, como passou pelo fio */
  wire(token: string) { return this.messagesTo(token).map((m) => JSON.stringify(m)).join('\n'); }
  /** id público do membro com este token */
  id(token: string) { return this.state.members.find((m) => m.token === token)!.id; }
  get game() { return this.state.game; }
}

/** bytes que começam como um WebP */
export function webp(size = 64): Uint8Array<ArrayBuffer> {
  const b = new Uint8Array(size);
  b.set([...'RIFF'].map((c) => c.charCodeAt(0)), 0);
  b.set([...'WEBP'].map((c) => c.charCodeAt(0)), 8);
  return b;
}
