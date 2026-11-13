import { CODE_ALPHABET, CODE_LENGTH, type RoomInit } from '@guess/protocol';
import { RoomHost, type HostOptions } from './host';
import type { Log } from './log';

/** Quantas salas vivas cabem no processo (uma sala parada pesa uns 4 KB; uma com jogo e bots, bem mais). */
export const ROOMS_MAX = 2000;
/** Quantos códigos sorteia antes de desistir: com o teto de salas, quase sempre o primeiro serve. */
const CODE_TRIES = 100;

/** As salas vivas do processo (ADR 0003: só memória). */
export class Rooms {
  private readonly rooms = new Map<string, RoomHost>();
  private readonly max: number;
  /** `random`: sorteia os códigos (os testes fixam); `hostOptions`: para cada sala nova (`dev` aceita jogadores falsos); `max`: o teto de salas vivas. */
  constructor(private readonly log: Log, private readonly random: () => number = Math.random, private readonly hostOptions: HostOptions = {}, opts: { max?: number } = {}) {
    this.max = opts.max ?? ROOMS_MAX;
  }

  get size() { return this.rooms.size; }
  get(code: string) { return this.rooms.get(code.toUpperCase()); }

  /**
   * Abre uma sala com o que o pré-lobby escolheu (`init`, já validado). null = não cabe mais nenhuma (o teto), ou o
   * sorteio não achou código livre em `CODE_TRIES` tentativas: quem pede ouve 503, e o processo nunca trava procurando.
   */
  create(init: RoomInit = {}): RoomHost | null {
    if (this.rooms.size >= this.max) return null;
    let code: string | null = null;
    for (let i = 0; i < CODE_TRIES && code === null; i++) {
      const c = Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[Math.floor(this.random() * CODE_ALPHABET.length)]).join('');
      if (!this.rooms.has(c)) code = c;
    }
    if (code === null) { this.log('rooms.noCode', { rooms: this.rooms.size }); return null; }
    const host = new RoomHost(code, this.log, (c) => { this.rooms.delete(c); this.log('room.removed', { room: c, rooms: this.rooms.size }); }, { ...this.hostOptions, init });
    this.rooms.set(code, host);
    return host;
  }
}
