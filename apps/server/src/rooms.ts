import { CODE_ALPHABET, CODE_LENGTH, type RoomInit } from '@guess/protocol';
import { RoomHost, type HostOptions } from './host';
import type { Log } from './log';

/** As salas vivas do processo (ADR 0003: só memória). */
export class Rooms {
  private readonly rooms = new Map<string, RoomHost>();
  /** `random`: sorteia os códigos (os testes fixam); `hostOptions`: para cada sala nova (`dev` aceita jogadores falsos). */
  constructor(private readonly log: Log, private readonly random: () => number = Math.random, private readonly hostOptions: HostOptions = {}) {}

  get size() { return this.rooms.size; }
  get(code: string) { return this.rooms.get(code.toUpperCase()); }

  /** Abre uma sala com o que o pré-lobby escolheu (`init`, já validado). */
  create(init: RoomInit = {}): RoomHost {
    let code: string;
    do { code = Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[Math.floor(this.random() * CODE_ALPHABET.length)]).join(''); } while (this.rooms.has(code));
    const host = new RoomHost(code, this.log, (c) => { this.rooms.delete(c); this.log('room.removed', { room: c, rooms: this.rooms.size }); }, { ...this.hostOptions, init });
    this.rooms.set(code, host);
    return host;
  }
}
