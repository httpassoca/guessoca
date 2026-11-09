import { CLOSE_KICKED, CLOSE_REPLACED, CLOSE_ROOM_ENDED, CLOSE_ROOM_NOT_FOUND, PING_INTERVAL, type ClientMessage, type RoomError, type RoomSnapshot, type ServerMessage } from '@guess/protocol';

export type RemoteStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed';
/** Por que a conexão fechou de vez (códigos 4xxx do servidor); null = ainda não fechou, ou fechou por `dispose`. */
export type ClosedReason = 'notFound' | 'ended' | 'replaced' | 'kicked' | null;

export interface RemoteState {
  status: RemoteStatus;
  /** o último snapshot; continua valendo enquanto reconecta */
  room: RoomSnapshot | null;
  reason: ClosedReason;
  /**
   * o último pedido recusado: sala cheia, ou um pedido que não vale agora (`refused`). Cai ao pedir de novo ou com o
   * próximo snapshot de quem está na turma; é passageiro, a tela mostra e esquece.
   */
  error: RoomError | null;
  /** conta cada recusa que chegou, para a tela avisar de novo mesmo quando a recusa se repete */
  errorSeq: number;
  /** quando o último snapshot chegou (relógio de `now`): `turn.left` e `vote.left` contam a partir daqui */
  receivedAt: number;
  /** tentativas de reconexão seguidas; zera quando abre */
  attempt: number;
}

/**
 * O que usamos do WebSocket do navegador, para injetar um falso nos testes. Os handlers recebem `any`
 * porque o nativo tipa cada evento de um jeito e só lemos `data` e `code`.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface SocketLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev: any) => void) | null;
  onmessage: ((ev: any) => void) | null;
  onclose: ((ev: any) => void) | null;
  onerror: ((ev: any) => void) | null;
}
/* eslint-enable @typescript-eslint/no-explicit-any */
export type SocketFactory = (url: string) => SocketLike;

/** Timers injetáveis (testes rodam sem esperar). */
export interface Clock { setTimeout(fn: () => void, ms: number): unknown; clearTimeout(handle: unknown): void }
export const realClock: Clock = { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) };

/** Os pedidos que a tela faz por `send`: tudo menos entrar/apelido (que têm método próprio) e o ping (da conexão). */
export type GameRequest = Exclude<ClientMessage, { type: 'join' | 'nickname' | 'ping' }>;

export const BACKOFF_START = 500;
export const BACKOFF_MAX = 10_000;

const CLOSE_REASONS: Record<number, NonNullable<ClosedReason>> = { [CLOSE_ROOM_NOT_FOUND]: 'notFound', [CLOSE_ROOM_ENDED]: 'ended', [CLOSE_REPLACED]: 'replaced', [CLOSE_KICKED]: 'kicked' };
/** 4xxx é da aplicação: o servidor fechou de propósito e reconectar não muda nada. Um código que não conhecemos vira "acabou". */
const finalReason = (code: number): ClosedReason => CLOSE_REASONS[code] ?? (code >= 4000 && code < 5000 ? 'ended' : null);

/**
 * A ponta do cliente no socket da sala (ADR 0002): conecta com o token da aba, aplica os snapshots inteiros que o
 * servidor manda e reconecta sozinha com espera crescente. Os pedidos viram mensagens; o servidor aplica ou recusa
 * (a recusa fica em `state.error`, o snapshot que temos continua valendo).
 */
export class RemoteRoom {
  private st: RemoteState = { status: 'idle', room: null, reason: null, error: null, errorSeq: 0, receivedAt: 0, attempt: 0 };
  private socket: SocketLike | null = null;
  private timer: unknown;
  private disposed = false;
  /** o último apelido pedido, e se a sala já nos mostrou na turma: se ela nos esquecer, entramos de novo */
  private joinedAs: string | null = null;
  private wasIn = false;
  /** o servidor mandou algo desde o último ping? um intervalo inteiro sem nada = a conexão morreu sem avisar */
  private heardSincePing = false;
  private readonly watchers = new Set<(state: RemoteState) => void>();
  private readonly makeSocket: SocketFactory;
  private readonly clock: Clock;
  private readonly now: () => number;

  constructor(private readonly target: { url: string; room: string; token: string }, opts: { socket?: SocketFactory; clock?: Clock; now?: () => number } = {}) {
    this.makeSocket = opts.socket ?? ((url) => new WebSocket(url));
    this.clock = opts.clock ?? realClock;
    this.now = opts.now ?? (() => performance.now());
  }

  get state() { return this.st; }

  /** Recebe o estado na hora e a cada mudança. Devolve como parar de ouvir. */
  watch(listener: (state: RemoteState) => void) {
    this.watchers.add(listener);
    listener(this.st);
    return () => { this.watchers.delete(listener); };
  }

  connect() {
    if (this.disposed || this.socket || this.st.status === 'closed') return;
    this.clearTimer();
    const url = `${this.target.url}?room=${encodeURIComponent(this.target.room.toUpperCase())}&token=${encodeURIComponent(this.target.token)}`;
    const ws = this.makeSocket(url);
    this.socket = ws;
    this.set({ status: this.st.attempt ? 'reconnecting' : 'connecting' });
    ws.onopen = () => { if (this.socket !== ws) return; this.heardSincePing = true; this.set({ status: 'open', attempt: 0 }); this.schedulePing(); };
    ws.onmessage = (ev: { data: unknown }) => { if (this.socket === ws) this.receive(String(ev.data)); };
    ws.onerror = () => {};
    ws.onclose = (ev: { code: number }) => { if (this.socket === ws) this.lost(ev.code); };
  }

  /** Reconecta agora, se estava esperando (ex.: o navegador voltou a ter rede). */
  retryNow() { if (this.st.status === 'reconnecting' && !this.socket) this.connect(); }
  /** Dá o socket atual por morto (ex.: o navegador perdeu a rede) e volta a tentar com a espera de sempre. */
  reconnect() {
    if (this.disposed) return;
    const ws = this.socket; if (!ws) return;
    this.socket = null;
    ws.close(1000, 'sem rede');
    this.lost(1006); // "fechou sem motivo": não é um código 4xxx do servidor, então reconecta
  }

  /** Entra na turma com um apelido (repetido ganha sufixo no servidor). */
  join(nickname: string) { this.joinedAs = nickname; this.ask({ type: 'join', nickname }); }
  /** Troca o próprio apelido. */
  rename(nickname: string) { this.joinedAs = nickname; this.ask({ type: 'nickname', nickname }); }
  /**
   * Qualquer outro pedido do jogo (personagem, lobby, escrita, vez, votação, moderação, fim), como o protocolo o define.
   * O servidor aplica (vem um snapshot) ou recusa (`state.error`).
   */
  send(message: GameRequest) { this.ask(message); }

  dispose() {
    this.disposed = true;
    this.clearTimer();
    const ws = this.socket; this.socket = null;
    ws?.close(1000, 'saiu');
    this.set({ status: 'closed' });
    this.watchers.clear();
  }

  private receive(raw: string) {
    let msg: ServerMessage;
    try { msg = JSON.parse(raw); } catch { return; }
    this.heardSincePing = true;
    if (msg.type === 'error') { this.set({ error: msg.error, errorSeq: this.st.errorSeq + 1 }); return; }
    if (msg.type !== 'snapshot') return; // pong: só conta como resposta
    const { snapshot } = msg;
    const inside = snapshot.you !== null;
    const receivedAt = this.now();
    this.set(inside ? { room: snapshot, receivedAt, error: null } : { room: snapshot, receivedAt });
    if (!inside && this.wasIn && this.joinedAs) this.raw({ type: 'join', nickname: this.joinedAs }); // a sala nos esqueceu enquanto estávamos fora
    this.wasIn = inside;
  }

  private lost(code: number) {
    this.socket = null;
    this.clearTimer();
    const reason = finalReason(code);
    if (reason) { this.set({ status: 'closed', reason }); return; }
    const wait = Math.min(BACKOFF_MAX, BACKOFF_START * 2 ** this.st.attempt);
    this.set({ status: 'reconnecting', attempt: this.st.attempt + 1 });
    this.timer = this.clock.setTimeout(() => { this.timer = undefined; this.connect(); }, wait);
  }

  /** A cada intervalo: se o servidor não disse nada desde o ping anterior, a conexão morreu sem avisar; senão, ping de novo. */
  private schedulePing() {
    this.clearTimer();
    this.timer = this.clock.setTimeout(() => {
      this.timer = undefined;
      if (!this.heardSincePing) { this.reconnect(); return; }
      this.heardSincePing = false;
      this.raw({ type: 'ping' });
      this.schedulePing();
    }, PING_INTERVAL);
  }

  /** Um pedido da pessoa: a recusa anterior deixa de valer. */
  private ask(message: ClientMessage) {
    if (this.st.error) this.set({ error: null });
    this.raw(message);
  }

  private raw(message: ClientMessage) { if (this.st.status === 'open') this.socket?.send(JSON.stringify(message)); }

  private set(patch: Partial<RemoteState>) {
    this.st = { ...this.st, ...patch };
    for (const l of this.watchers) l(this.st);
  }

  private clearTimer() { if (this.timer !== undefined) { this.clock.clearTimeout(this.timer); this.timer = undefined; } }
}
