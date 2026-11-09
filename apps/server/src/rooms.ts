import { CODE_ALPHABET, CODE_LENGTH } from '@guess/protocol';
import { RoomHost } from './host';
import type { Log } from './log';

/** As salas vivas do processo (ADR 0003: só memória). */
export class Rooms {
  private readonly rooms = new Map<string, RoomHost>();
  /** `random`: sorteia os códigos (os testes fixam). */
  constructor(private readonly log: Log, private readonly random: () => number = Math.random) {}

  get size() { return this.rooms.size; }
  get(code: string) { return this.rooms.get(code.toUpperCase()); }

  create(): RoomHost {
    let code: string;
    do { code = Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[Math.floor(this.random() * CODE_ALPHABET.length)]).join(''); } while (this.rooms.has(code));
    const host = new RoomHost(code, this.log, (c) => { this.rooms.delete(c); this.log('room.removed', { room: c, rooms: this.rooms.size }); });
    this.rooms.set(code, host);
    return host;
  }
}
