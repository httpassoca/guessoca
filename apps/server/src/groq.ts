/**
 * O modelo de linguagem dos bots que falam (`talk.ts`): o Groq, pela API compatível com a da OpenAI. Só o servidor fala
 * com ele, com a chave do ambiente (`GROQ_API_KEY`, em `~/.guessoca.env` no VPS; ver `docs/groq.md`); sem a chave, não
 * existe `Talker` e nenhum bot fala. A chave nunca vai para o cliente.
 *
 * O plano grátis é pequeno e é **um só para o processo inteiro** (todas as salas): `Budget` conta pedidos e tokens por
 * minuto e por 24 h (janelas deslizantes, com o gasto de verdade que cada resposta diz), deixa folga abaixo de cada
 * limite e reserva o fim de cada janela para a prioridade mais alta (`SHARE`: responder a uma pessoa > reagir > puxar
 * assunto). Também obedece ao que o Groq diz: os cabeçalhos `x-ratelimit-remaining-*` travam até o `reset-*`, e o 429
 * trava pelo `retry-after` (dobrando se insiste). Cada pedido tem prazo (`timeoutMs`); erro, demora ou resposta torta
 * viram null, nunca exceção, e quem pediu só não fala.
 */
import type { Log } from './log';
import type { ChatMessage, Priority } from './talk';

/** Limites de um modelo: pedidos e tokens por minuto e por dia. */
export interface Limits { rpm: number; rpd: number; tpm: number; tpd: number }

/**
 * O modelo padrão e os limites dele no plano grátis (console.groq.com/docs/rate-limits, novembro de 2026): o
 * `openai/gpt-oss-20b` é o mais rápido da lista de produção (~1000 tokens/s) e o de limite grátis publicado:
 * 30 pedidos/min, 1000/dia, 8 mil tokens/min, 200 mil/dia. `GROQ_MODEL` e `GROQ_RPM`/`GROQ_RPD`/`GROQ_TPM`/`GROQ_TPD`
 * trocam (os números da conta estão em console.groq.com/settings/limits).
 */
export const DEFAULT_MODEL = 'openai/gpt-oss-20b';
export const FREE_LIMITS: Limits = { rpm: 30, rpd: 1000, tpm: 8000, tpd: 200_000 };
const BASE_URL = 'https://api.groq.com/openai/v1';

/** Que fração de cada limite cada prioridade pode usar: por minuto e por dia. */
const SHARE: Record<Priority, { minute: number; day: number }> = {
  reply: { minute: 0.9, day: 0.95 },
  event: { minute: 0.7, day: 0.8 },
  idle: { minute: 0.45, day: 0.5 },
};
/** Pedidos no ar ao mesmo tempo, no processo todo. */
const IN_FLIGHT_MAX = 3;
/** Abaixo de tantos pedidos restantes no dia (o cabeçalho), para até zerar. */
const REQUESTS_FLOOR = 5;
const MINUTE = 60_000;
const DAY = 24 * 3600_000;

/** "7.66s", "2m59.56s", "120ms", "1h2m3s" em ms; null se não entende. */
export function duration(s: string | null | undefined): number | null {
  if (!s) return null;
  const re = /(\d+(?:\.\d+)?)(ms|h|m|s)/g;
  let total = 0, seen = '', m: RegExpExecArray | null;
  while ((m = re.exec(s))) { seen += m[0]; total += Number(m[1]) * { ms: 1, s: 1000, m: 60_000, h: 3600_000 }[m[2] as 'ms']; }
  return seen === s.trim() && seen ? Math.round(total) : null;
}

/** Uma reserva: o pedido já conta nas janelas; `commit` troca a estimativa de tokens pelo gasto de verdade. */
export interface Ticket { at: number; tokens: number }

export class Budget {
  private spent: Ticket[] = [];
  private inFlight = 0;
  /** tudo parado até esta hora (429, erro) */
  private blockedUntil = 0;
  private strikes = 0;
  /** o que o último cabeçalho disse que resta de tokens no minuto, e até quando isso vale */
  private tokensLeft = Infinity;
  private tokensResetAt = 0;

  constructor(readonly limits: Limits, private readonly clock: () => number) {}

  /** Reserva um pedido de uns `tokens` tokens com esta prioridade; null = não cabe agora. */
  reserve(priority: Priority, tokens: number): Ticket | null {
    const now = this.clock();
    if (now < this.blockedUntil || this.inFlight >= IN_FLIGHT_MAX) return null;
    if (now < this.tokensResetAt && tokens > this.tokensLeft) return null;
    this.spent = this.spent.filter((t) => now - t.at < DAY);
    const minute = this.spent.filter((t) => now - t.at < MINUTE);
    const sum = (list: Ticket[]) => list.reduce((s, t) => s + t.tokens, 0);
    const { minute: fm, day: fd } = SHARE[priority];
    const l = this.limits;
    if (minute.length + 1 > l.rpm * fm || sum(minute) + tokens > l.tpm * fm) return null;
    if (this.spent.length + 1 > l.rpd * fd || sum(this.spent) + tokens > l.tpd * fd) return null;
    const ticket = { at: now, tokens };
    this.spent.push(ticket);
    this.inFlight++;
    if (now < this.tokensResetAt) this.tokensLeft -= tokens;
    return ticket;
  }

  /** O gasto de verdade de um pedido (`usage.total_tokens`); null = não se sabe, fica a estimativa. */
  commit(ticket: Ticket, used: number | null) { if (used !== null && Number.isFinite(used) && used >= 0) ticket.tokens = used; }

  /** O pedido acabou (bem ou mal): libera o lugar no ar. */
  release() { this.inFlight = Math.max(0, this.inFlight - 1); }

  /** O que a resposta disse: o status e os cabeçalhos de limite. */
  observe(status: number, headers: Headers) {
    const now = this.clock();
    if (status === 429) {
      this.strikes++;
      const retry = Number(headers.get('retry-after'));
      const wait = Math.max(Number.isFinite(retry) && retry > 0 ? retry * 1000 : 30_000, Math.min(600_000, 5000 * 2 ** (this.strikes - 1)));
      this.blockedUntil = Math.max(this.blockedUntil, now + wait);
      return;
    }
    if (status >= 500) { this.blockedUntil = Math.max(this.blockedUntil, now + 15_000); return; }
    if (status < 300) this.strikes = 0;
    const tokens = Number(headers.get('x-ratelimit-remaining-tokens') ?? NaN);
    if (Number.isFinite(tokens)) { this.tokensLeft = tokens; this.tokensResetAt = now + (duration(headers.get('x-ratelimit-reset-tokens')) ?? MINUTE); }
    const requests = Number(headers.get('x-ratelimit-remaining-requests') ?? NaN);
    if (Number.isFinite(requests) && requests < REQUESTS_FLOOR) this.blockedUntil = Math.max(this.blockedUntil, now + (duration(headers.get('x-ratelimit-reset-requests')) ?? 3600_000));
  }
}

/** Quem fala com o modelo: devolve a fala, null (falhou) ou, na hora, null sem promessa (sem orçamento agora). */
export interface Talker { ask(priority: Priority, messages: ChatMessage[]): Promise<string | null> | null }

export interface GroqOptions {
  key: string;
  model: string;
  budget: Budget;
  log: Log;
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
  /** prazo de cada pedido, ms */
  timeoutMs?: number;
}

export class GroqTalker implements Talker {
  readonly model: string;
  readonly budget: Budget;
  private readonly maxTokens: number;
  private readonly reasoning: boolean;

  constructor(private readonly opts: GroqOptions) {
    this.model = opts.model;
    this.budget = opts.budget;
    // o gpt-oss raciocina antes de responder, e o raciocínio conta no máximo: pouco esforço e espaço para ele
    this.reasoning = /gpt-oss/.test(opts.model);
    this.maxTokens = this.reasoning ? 220 : 60;
  }

  ask(priority: Priority, messages: ChatMessage[]): Promise<string | null> | null {
    const chars = messages.reduce((s, m) => s + m.content.length, 0);
    const ticket = this.budget.reserve(priority, Math.ceil(chars / 3.5) + 20 + this.maxTokens);
    if (!ticket) return null;
    return this.call(messages, ticket).finally(() => this.budget.release());
  }

  private async call(messages: ChatMessage[], ticket: Ticket): Promise<string | null> {
    const { key, baseUrl = BASE_URL, fetch = globalThis.fetch, timeoutMs = 6000, log } = this.opts;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<null>((resolve) => { timer = setTimeout(() => { abort.abort(); resolve(null); }, timeoutMs); });
    const body = {
      model: this.model, messages, max_completion_tokens: this.maxTokens, temperature: 0.9,
      ...(this.reasoning ? { reasoning_effort: 'low', include_reasoning: false } : {}),
    };
    const work = (async (): Promise<string | null> => {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST', signal: abort.signal, body: JSON.stringify(body),
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      });
      this.budget.observe(res.status, res.headers);
      if (!res.ok) { log('talk.error', { status: res.status }); return null; }
      const data = (await res.json()) as { choices?: { message?: { content?: unknown } }[]; usage?: { total_tokens?: unknown } };
      this.budget.commit(ticket, typeof data.usage?.total_tokens === 'number' ? data.usage.total_tokens : null);
      const content = data.choices?.[0]?.message?.content;
      return typeof content === 'string' && content.trim() ? content.trim() : null;
    })().catch((e: unknown) => {
      if (!abort.signal.aborted) log('talk.error', { error: e instanceof Error ? e.message : String(e) });
      return null;
    });
    try { return await Promise.race([work, late]); } finally { clearTimeout(timer); }
  }
}

/** O `Talker` do processo, se o ambiente tem `GROQ_API_KEY`; senão null (os bots não falam). */
export function talkerFromEnv(env: Record<string, string | undefined>, log: Log): GroqTalker | null {
  const key = env.GROQ_API_KEY?.trim();
  if (!key) return null;
  const num = (v: string | undefined, d: number) => { const n = Number(v); return v && Number.isFinite(n) && n > 0 ? n : d; };
  const limits: Limits = {
    rpm: num(env.GROQ_RPM, FREE_LIMITS.rpm), rpd: num(env.GROQ_RPD, FREE_LIMITS.rpd),
    tpm: num(env.GROQ_TPM, FREE_LIMITS.tpm), tpd: num(env.GROQ_TPD, FREE_LIMITS.tpd),
  };
  return new GroqTalker({ key, model: env.GROQ_MODEL?.trim() || DEFAULT_MODEL, budget: new Budget(limits, Date.now), log, baseUrl: env.GROQ_BASE_URL?.trim() || undefined });
}
