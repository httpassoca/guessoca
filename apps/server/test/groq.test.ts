import { describe, expect, test } from 'bun:test';
import { Budget, duration, GroqTalker, talkerFromEnv, type Limits } from '../src/groq';
import { silentLog } from '../src/log';

const LIMITS: Limits = { rpm: 30, rpd: 1000, tpm: 8000, tpd: 200_000 };

describe('orçamento do modelo', () => {
  test('as durações do Groq: "7.66s", "2m59.56s", "120ms", "1h2m3s"', () => {
    expect(duration('7.66s')).toBe(7660);
    expect(duration('2m59.56s')).toBe(179_560);
    expect(duration('120ms')).toBe(120);
    expect(duration('1h2m3s')).toBe(3_723_000);
    expect(duration('')).toBeNull();
    expect(duration('abc')).toBeNull();
  });

  test('pedidos por minuto: com folga abaixo do limite, e a resposta a uma pessoa tem mais espaço que puxar assunto', () => {
    let now = 0;
    const b = new Budget(LIMITS, () => now);
    let idle = 0;
    while (b.reserve('idle', 10)) { idle++; b.release(); }
    let reply = idle;
    while (b.reserve('reply', 10)) { reply++; b.release(); }
    expect(idle).toBeGreaterThan(5);
    expect(idle).toBeLessThan(reply);
    expect(reply).toBeLessThan(30);
    // um minuto depois, a janela abriu
    now += 61_000;
    expect(b.reserve('idle', 10)).not.toBeNull();
  });

  test('tokens por minuto e por dia contam o que foi gasto de verdade, quando a resposta diz', () => {
    let now = 0;
    const b = new Budget(LIMITS, () => now);
    const t = b.reserve('reply', 7000)!;
    expect(t).not.toBeNull();
    expect(b.reserve('reply', 1000)).toBeNull(); // 8000 do minuto, com folga, não cabem
    b.commit(t, 500);
    b.release();
    expect(b.reserve('reply', 1000)).not.toBeNull();
  });

  test('o dia: perto do limite diário só a resposta a uma pessoa passa, e por fim nem ela', () => {
    let now = 0;
    const b = new Budget({ ...LIMITS, rpm: 10_000, tpm: 10_000_000 }, () => now);
    const spend = (n: number) => { for (let i = 0; i < n; i++) { const t = b.reserve('reply', 1000); if (t) { b.commit(t, 1000); b.release(); } now += 10; } };
    spend(110); // 110k de 200k
    expect(b.reserve('idle', 1000)).toBeNull();
    expect(b.reserve('event', 1000)).not.toBeNull(); b.release();
    spend(60); // 170k
    expect(b.reserve('event', 1000)).toBeNull();
    expect(b.reserve('reply', 1000)).not.toBeNull(); b.release();
    spend(30);
    expect(b.reserve('reply', 1000)).toBeNull();
    // 24 h depois, zera
    now += 24 * 3600_000;
    expect(b.reserve('idle', 1000)).not.toBeNull();
  });

  test('o 429 trava tudo pelo `retry-after`; os cabeçalhos de restante também travam até zerar', () => {
    let now = 0;
    const b = new Budget(LIMITS, () => now);
    b.observe(429, new Headers({ 'retry-after': '20' }));
    expect(b.reserve('reply', 10)).toBeNull();
    now += 20_001;
    expect(b.reserve('reply', 10)).not.toBeNull(); b.release();
    b.observe(200, new Headers({ 'x-ratelimit-remaining-tokens': '100', 'x-ratelimit-reset-tokens': '7.5s', 'x-ratelimit-remaining-requests': '900', 'x-ratelimit-reset-requests': '2m' }));
    expect(b.reserve('reply', 500)).toBeNull();
    now += 7600;
    expect(b.reserve('reply', 500)).not.toBeNull(); b.release();
    b.observe(200, new Headers({ 'x-ratelimit-remaining-requests': '3', 'x-ratelimit-reset-requests': '1h' }));
    expect(b.reserve('reply', 10)).toBeNull();
  });

  test('no máximo alguns pedidos no ar ao mesmo tempo', () => {
    const b = new Budget(LIMITS, () => 0);
    expect(b.reserve('reply', 10)).not.toBeNull();
    expect(b.reserve('reply', 10)).not.toBeNull();
    expect(b.reserve('reply', 10)).not.toBeNull();
    expect(b.reserve('reply', 10)).toBeNull();
    b.release();
    expect(b.reserve('reply', 10)).not.toBeNull();
  });
});

describe('o cliente do Groq', () => {
  const messages = [{ role: 'system' as const, content: 'sys' }, { role: 'user' as const, content: 'oi' }];
  function fake(respond: (body: Record<string, unknown>) => Response | Promise<Response>) {
    const calls: { url: string; init: RequestInit; body: Record<string, unknown> }[] = [];
    const fetch = (async (url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      calls.push({ url, init, body });
      return respond(body);
    }) as unknown as typeof globalThis.fetch;
    return { fetch, calls };
  }
  const ok = (content: string, total = 300) => new Response(JSON.stringify({ choices: [{ message: { content } }], usage: { total_tokens: total } }), { headers: { 'x-ratelimit-remaining-tokens': '7000' } });

  test('manda o pedido compatível com OpenAI, com a chave no cabeçalho, e devolve o texto', async () => {
    const { fetch, calls } = fake(() => ok('Tá com fome?'));
    const t = new GroqTalker({ key: 'k-123', model: 'openai/gpt-oss-20b', fetch, budget: new Budget(LIMITS, () => 0), log: silentLog });
    expect(await t.ask('reply', messages)).toBe('Tá com fome?');
    expect(calls[0].url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe('Bearer k-123');
    expect(calls[0].body).toMatchObject({ model: 'openai/gpt-oss-20b', messages, reasoning_effort: 'low', include_reasoning: false });
    expect(calls[0].body.max_completion_tokens).toBeLessThanOrEqual(300);
  });

  test('um modelo que não raciocina não leva os campos de raciocínio', async () => {
    const { fetch, calls } = fake(() => ok('oi'));
    const t = new GroqTalker({ key: 'k', model: 'llama-3.1-8b-instant', fetch, budget: new Budget(LIMITS, () => 0), log: silentLog });
    await t.ask('reply', messages);
    expect(calls[0].body.reasoning_effort).toBeUndefined();
    expect(calls[0].body.include_reasoning).toBeUndefined();
  });

  test('sem orçamento, recusa na hora (null, sem promessa) e não chama a rede', () => {
    const { fetch, calls } = fake(() => ok('oi'));
    const budget = new Budget(LIMITS, () => 0);
    budget.observe(429, new Headers({ 'retry-after': '60' }));
    const t = new GroqTalker({ key: 'k', model: 'm', fetch, budget, log: silentLog });
    expect(t.ask('reply', messages)).toBeNull();
    expect(calls).toHaveLength(0);
  });

  test('erro, 429, resposta torta ou demora viram null, nunca exceção', async () => {
    for (const respond of [
      () => new Response('nope', { status: 500 }),
      () => new Response('{}', { status: 429, headers: { 'retry-after': '1' } }),
      () => new Response('não é json'),
      () => new Response(JSON.stringify({ choices: [] })),
      () => new Promise<Response>(() => {}),
      () => { throw new Error('rede caiu'); },
    ]) {
      const { fetch } = fake(respond);
      const t = new GroqTalker({ key: 'k', model: 'm', fetch, budget: new Budget(LIMITS, () => 0), log: silentLog, timeoutMs: 30 });
      expect(await t.ask('reply', messages)).toBeNull();
    }
  });

  test('sem GROQ_API_KEY no ambiente, não há fala; com ela, o modelo e os limites vêm do ambiente', () => {
    expect(talkerFromEnv({}, silentLog)).toBeNull();
    expect(talkerFromEnv({ GROQ_API_KEY: '' }, silentLog)).toBeNull();
    const t = talkerFromEnv({ GROQ_API_KEY: 'k', GROQ_MODEL: 'llama-3.1-8b-instant', GROQ_TPD: '500000' }, silentLog)!;
    expect(t).toBeInstanceOf(GroqTalker);
    expect(t.model).toBe('llama-3.1-8b-instant');
    expect(t.budget.limits.tpd).toBe(500_000);
    expect(t.budget.limits.rpm).toBe(30);
  });
});
