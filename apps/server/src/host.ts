import { CLOSE_KICKED, CLOSE_REPLACED, CLOSE_ROOM_ENDED, IMAGE_BYTES_MAX, isWebp, parseClientMessage, SOCKET_IDLE_TIMEOUT } from '@guess/protocol';
import type { ServerWebSocket } from 'bun';
import type { Log } from './log';
import { createRoom, referencedImages, ROOM_TTL, step, timerKey, type RoomInput, type RoomState } from './room';

/** Uma imagem que nenhum post-it usa ainda espera este tempo pelo `write` que a usa; depois, morre. */
export const IMAGE_GRACE = 2 * 60_000;
/** Imagens soltas (que nenhum post-it usa) por pessoa: além disto, a mais velha morre. */
export const IMAGES_PER_UPLOADER = 2;

/**
 * `now`: hora de nascimento; `ttl`: quanto a sala vive sem atividade; `silence`: quanto um socket pode ficar sem
 * mandar nada antes de ser derrubado (os testes apressam os dois). `clock`: a hora (os testes fixam); `dev`: a sala
 * aceita jogadores falsos; `rng`: o sorteio da sala.
 */
export interface HostOptions { now?: number; ttl?: number; silence?: number; clock?: () => number; dev?: boolean; rng?: () => number }

interface StoredImage {
  bytes: Uint8Array<ArrayBuffer>;
  /** id do membro que subiu */
  uploader: string;
  at: number;
  /** algum post-it já usou: quando deixa de usar (trocada, expulso, jogar de novo), morre na hora */
  used: boolean;
}

export type AddImageResult = { ok: true; id: string } | { ok: false; error: 'notMember' | 'tooBig' | 'notWebp' };

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
  private readonly clock: () => number;
  private readonly rng: () => number;
  /** as imagens dos post-its, em bytes; nunca entram no estado puro da sala (ADR 0003) */
  private readonly images = new Map<string, StoredImage>();

  constructor(code: string, private readonly log: Log, private readonly onDead: (code: string) => void, opts: HostOptions = {}) {
    this.clock = opts.clock ?? Date.now;
    this.rng = opts.rng ?? Math.random;
    const now = opts.now ?? this.clock();
    this.silence = opts.silence ?? SOCKET_IDLE_TIMEOUT;
    this.state = createRoom(code, now, { ttl: opts.ttl ?? ROOM_TTL, dev: opts.dev ?? false });
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
    // a imagem de um post-it tem de ter subido antes: a sala só guarda o id, e um id sem bytes seria um buraco na tela
    if (message.type === 'write' && message.image !== null && !this.images.has(message.image)) {
      ws.send(JSON.stringify({ type: 'error', error: 'refused' }));
      this.log('room.refused', { room: this.code, error: 'refused', action: 'write', reason: 'unknownImage' });
      return;
    }
    this.apply({ kind: 'message', token: ws.data.token, message });
  }

  /**
   * Guarda a imagem de um post-it, se quem manda é da turma, os bytes são WebP e cabem no limite. Devolve o id que o
   * `write` vai usar.
   */
  addImage(token: string, bytes: Uint8Array<ArrayBuffer>): AddImageResult {
    const member = this.state.phase === 'dead' ? undefined : this.state.members.find((m) => m.token === token);
    if (!member) return { ok: false, error: 'notMember' };
    if (bytes.length > IMAGE_BYTES_MAX) return { ok: false, error: 'tooBig' };
    if (!isWebp(bytes)) return { ok: false, error: 'notWebp' };
    let id: string;
    do { id = Buffer.from(crypto.getRandomValues(new Uint8Array(12))).toString('hex'); } while (this.images.has(id));
    this.images.set(id, { bytes, uploader: member.id, at: this.clock(), used: false });
    this.log('room.image', { room: this.code, id: member.id, bytes: bytes.length });
    this.collectImages();
    return { ok: true, id };
  }

  /** Os bytes de uma imagem da sala, se existe. */
  image(id: string): Uint8Array<ArrayBuffer> | undefined { return this.images.get(id)?.bytes; }

  private apply(input: RoomInput) {
    const now = this.clock();
    const { state, out, events } = step(this.state, input, now, { rng: this.rng });
    this.state = state;
    for (const o of out) {
      const ws = this.sockets.get(o.to);
      if (!ws) continue;
      if ('message' in o) { ws.send(JSON.stringify(o.message)); continue; }
      // expulso: o socket sai daqui antes de fechar, e o aviso de fechamento do Bun não chega à sala
      this.sockets.delete(o.to);
      this.clearSilence(ws);
      ws.close(o.close, o.close === CLOSE_KICKED ? 'expulso da sala' : undefined);
    }
    for (const e of events) {
      const { type, ...fields } = e;
      this.log(`room.${type}`, { room: this.code, ...fields });
    }
    if (state.phase === 'dead') {
      for (const ws of this.sockets.values()) { this.clearSilence(ws); ws.close(CLOSE_ROOM_ENDED, 'sala encerrada por inatividade'); }
      this.sockets.clear();
      this.images.clear();
    } else {
      this.collectImages();
    }
    this.syncTimers(now);
    if (state.phase === 'dead') this.onDead(this.code);
  }

  /**
   * Solta as imagens que nenhum post-it usa: a que já foi usada morre na hora (trocada, dono expulso, jogar de novo); a
   * recém-subida espera `IMAGE_GRACE` pelo seu `write`, e cada pessoa guarda no máximo `IMAGES_PER_UPLOADER` soltas.
   */
  private collectImages() {
    const now = this.clock();
    const referenced = referencedImages(this.state);
    const loose = new Map<string, [string, StoredImage][]>();
    for (const [id, img] of this.images) {
      if (referenced.has(id)) { img.used = true; continue; }
      if (img.used || now - img.at > IMAGE_GRACE) { this.images.delete(id); continue; }
      const mine = loose.get(img.uploader) ?? [];
      mine.push([id, img]);
      loose.set(img.uploader, mine);
    }
    for (const mine of loose.values()) {
      mine.sort((a, b) => a[1].at - b[1].at);
      for (const [id] of mine.slice(0, Math.max(0, mine.length - IMAGES_PER_UPLOADER))) this.images.delete(id);
    }
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
    const heardAt = this.clock();
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
