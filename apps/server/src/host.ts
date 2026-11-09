import { CLOSE_REPLACED, CLOSE_ROOM_ENDED, parseClientMessage, SOCKET_IDLE_TIMEOUT } from '@guess/protocol';
import type { ServerWebSocket } from 'bun';
import type { Log } from './log';
import { createRoom, ROOM_TTL, step, timerKey, type RoomInput, type RoomState } from './room';

/**
 * `now`: hora de nascimento; `ttl`: quanto a sala vive sem atividade; `silence`: quanto um socket pode ficar sem
 * mandar nada antes de ser derrubado. Os testes apressam os dois.
 */
export interface HostOptions { now?: number; ttl?: number; silence?: number }

export interface SocketData { code: string; token: string }
export type Socket = ServerWebSocket<SocketData>;

/**
 * Adaptador de uma sala: guarda os sockets por token, entrega as mensagens que a sala manda e agenda
 * os timers que ela pede (`state.timers`), nunca os seus. Quando a sala morre, fecha todo mundo e avisa.
 * O único timer próprio é o de silêncio: um socket que não manda nada (nem `ping`) por `silence` ms é
 * derrubado como se tivesse caído, e a sala fica sabendo desde quando a pessoa está muda. A rede que morre
 * sem fechar o socket não chega de outro jeito; o `idleTimeout` do Bun é a rede de segurança abaixo deste.
 */
export class RoomHost {
  state: RoomState;
  private readonly sockets = new Map<string, Socket>();
  private readonly handles = new Map<string, ReturnType<typeof setTimeout>>();
  /** por socket: o timer de silêncio */
  private readonly silences = new Map<Socket, ReturnType<typeof setTimeout>>();
  private readonly silence: number;

  constructor(code: string, private readonly log: Log, private readonly onDead: (code: string) => void, opts: HostOptions = {}) {
    const now = opts.now ?? Date.now();
    this.silence = opts.silence ?? SOCKET_IDLE_TIMEOUT;
    this.state = createRoom(code, now, opts.ttl ?? ROOM_TTL);
    this.syncTimers(now);
    log('room.created', { room: code });
  }

  get code() { return this.state.code; }
  get connections() { return this.sockets.size; }

  connect(ws: Socket) {
    const prev = this.sockets.get(ws.data.token);
    this.sockets.set(ws.data.token, ws);
    // mesma pessoa, socket novo (aba duplicada, ou voltou antes de o servidor notar a queda): o velho sai sem avisar a sala
    if (prev && prev !== ws) { this.clearSilence(prev); prev.close(CLOSE_REPLACED, 'outra aba assumiu'); }
    this.resetSilence(ws);
    this.apply({ kind: 'connect', token: ws.data.token }); // para quem já está conectado, a sala só reenvia o snapshot
  }

  /** O socket fechou (o Bun avisou). */
  disconnect(ws: Socket) { this.drop(ws); }

  message(ws: Socket, raw: string | Buffer) {
    this.resetSilence(ws);
    const message = parseClientMessage(typeof raw === 'string' ? raw : raw.toString());
    if (!message) { this.log('room.badMessage', { room: this.code, token: ws.data.token.slice(0, 8) }); return; }
    this.apply({ kind: 'message', token: ws.data.token, message });
  }

  private apply(input: RoomInput) {
    const now = Date.now();
    const { state, out, events } = step(this.state, input, now);
    this.state = state;
    for (const o of out) this.sockets.get(o.to)?.send(JSON.stringify(o.message));
    for (const e of events) {
      const { type, ...fields } = e;
      this.log(`room.${type}`, { room: this.code, ...fields });
    }
    if (state.phase === 'dead') {
      for (const ws of this.sockets.values()) { this.clearSilence(ws); ws.close(CLOSE_ROOM_ENDED, 'sala encerrada por inatividade'); }
      this.sockets.clear();
    }
    this.syncTimers(now);
    if (state.phase === 'dead') this.onDead(this.code);
  }

  /** Cancela todo timer e deixa a sala como está: para um teste (ou o processo) terminar sem nada pendente. */
  dispose() {
    for (const h of this.handles.values()) clearTimeout(h);
    this.handles.clear();
    for (const ws of this.sockets.values()) this.clearSilence(ws);
  }

  /** Tira o socket da sala; `since` = desde quando ele estava mudo, quando foi o silêncio que o derrubou. */
  private drop(ws: Socket, since?: number) {
    this.clearSilence(ws);
    if (this.sockets.get(ws.data.token) !== ws) return; // já substituído por outra aba, ou já derrubado pelo silêncio
    this.sockets.delete(ws.data.token);
    this.apply(since === undefined ? { kind: 'disconnect', token: ws.data.token } : { kind: 'disconnect', token: ws.data.token, since });
  }

  /** Este socket deu sinal de vida: o silêncio dele recomeça a contar do zero. */
  private resetSilence(ws: Socket) {
    this.clearSilence(ws);
    const heardAt = Date.now();
    this.silences.set(ws, setTimeout(() => {
      this.silences.delete(ws);
      this.log('room.silent', { room: this.code, token: ws.data.token.slice(0, 8) });
      this.drop(ws, heardAt);
      ws.terminate();
    }, this.silence));
  }

  private clearSilence(ws: Socket) {
    const h = this.silences.get(ws);
    if (h) { clearTimeout(h); this.silences.delete(ws); }
  }

  /** Agenda o que a sala pede e cancela o que ela deixou de pedir; cada timer é identificado pelo seu conteúdo. */
  private syncTimers(now: number) {
    const wanted = new Map(this.state.timers.map((t) => [timerKey(t), t] as const));
    for (const [key, handle] of this.handles) if (!wanted.has(key)) { clearTimeout(handle); this.handles.delete(key); }
    for (const [key, timer] of wanted) {
      if (this.handles.has(key)) continue;
      this.handles.set(key, setTimeout(() => { this.handles.delete(key); this.apply({ kind: 'timer', timer }); }, Math.max(0, timer.at - now)));
    }
  }
}
