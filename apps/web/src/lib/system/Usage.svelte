<script lang="ts">
  /**
   * A aba **Uso** do sistema: as estatísticas de uso (`apps/server/src/usage.ts`, emenda do ADR 0009). O agora (salas,
   * gente, bots, memória), os últimos 30 dias (números, dois gráficos de barras de um dia por barra, os personagens mais
   * escolhidos, o que acontece no telhado) e o orçamento do Groq dos bots que falam. Enquanto a aba está aberta e visível,
   * pede tudo de novo a cada `EVERY` ms. Os gráficos são SVG à mão: uma série cada, uma escala só.
   */
  import { onMount } from 'svelte';
  import Swatch from '../panels/Swatch.svelte';
  import { agoText, ApiError, sizeText, type UsageCounts, type UsageDay, type UsageReport } from './api';

  let { load, nameOf, onAuthFail }: {
    /** pede o relatório (`systemApi(pass).usage`) */
    load: () => Promise<UsageReport>;
    /** o nome de um personagem na tela */
    nameOf: (n: number) => string;
    /** a senha deixou de valer */
    onAuthFail: () => void;
  } = $props();

  const EVERY = 5000;
  let report = $state<UsageReport | null>(null);
  let error = $state('');
  let at = $state(0);

  async function refresh() {
    try { report = await load(); error = ''; at = Date.now(); } catch (e) {
      if (e instanceof ApiError && e.status === 401) { onAuthFail(); return; }
      error = e instanceof ApiError && e.status === 404 ? 'Este servidor ainda não conta o uso (deploy antigo).' : 'O servidor não respondeu; tento de novo em instantes.';
    }
  }
  onMount(() => {
    void refresh();
    const t = setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, EVERY);
    return () => clearInterval(t);
  });

  const n = (v: number | undefined) => (v ?? 0).toLocaleString('pt-BR');
  const one = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  const sum = (days: UsageDay[], k: keyof UsageCounts) => days.reduce((s, d) => s + (d.counts[k] ?? 0), 0);
  /** `2026-11-15` → `15/11` */
  const short = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
  const minutes = (ms: number) => (ms < 60_000 ? `${Math.round(ms / 1000)} s` : `${one(ms / 60_000)} min`);

  const days = $derived(report?.usage.days ?? []);
  const today = $derived(days.at(-1));
  const games30 = $derived(sum(days, 'gamesStarted'));
  const finished30 = $derived(sum(days, 'gamesFinished'));
  const players30 = $derived(sum(days, 'players'));
  const visitors30 = $derived(days.reduce((s, d) => s + d.visitors, 0));
  const activeDays = $derived(days.filter((d) => d.visitors > 0).length);
  const peak30 = $derived(Math.max(0, ...days.map((d) => d.peakOnline)));
  const topChars = $derived((report?.usage.topCharacters ?? []).slice(0, 8));
  const topMax = $derived(Math.max(1, ...topChars.map((c) => c.picks)));
  const totalPicks = $derived((report?.usage.topCharacters ?? []).reduce((s, c) => s + c.picks, 0));

  /** as linhas da tabela do telhado e dos limites: hoje, 30 dias, tudo o que está guardado */
  const ROOF: [keyof UsageCounts, string][] = [
    ['roomsCreated', 'Salas criadas'], ['gamesStarted', 'Jogos começados'], ['gamesFinished', 'Jogos até o fim'], ['gamesAbandoned', 'Jogos largados no meio'],
    ['claims', 'Palpites (votações abertas)'], ['guessed', 'Acertos'], ['gaveUp', 'Desistências'], ['ghosts', 'Viraram fantasma'],
    ['shoves', 'Empurrões (jogos até o fim)'], ['falls', 'Quedas (jogos até o fim)'], ['chats', 'Falas no chat (só a conta)'],
    ['bossesSpawned', 'Chefões que apareceram'], ['bossesDown', 'Chefões derrubados'],
    ['floodKicks', 'Fechados por enxurrada (4429)'], ['limited', 'Recusas por limite (salas, sockets)'],
  ];
  const GROQ: [keyof UsageCounts, string][] = [
    ['groqRequests', 'Pedidos'], ['groqTokens', 'Tokens'], ['groq429', 'Respostas 429'], ['groqTimeouts', 'Demoraram demais'], ['groqErrors', 'Outros erros'],
    ['botLines', 'Falas ditas'], ['botLinesDropped', 'Falas descartadas (filtro ou atrasadas)'],
  ];

  /** a parte usada de um limite, 0..1 */
  const part = (used: number, limit: number) => (limit > 0 ? Math.min(1, used / limit) : 0);
  let hover = $state<{ chart: string; i: number } | null>(null);
</script>

{#snippet tile(label: string, value: string, sub = '')}
  <div class="gs-use-tile">
    <span class="gs-use-label">{label}</span>
    <span class="gs-use-value">{value}</span>
    {#if sub}<span class="gs-use-sub">{sub}</span>{/if}
  </div>
{/snippet}

{#snippet bars(id: string, title: string, values: number[])}
  {@const max = Math.max(1, ...values)}
  {@const W = 600}
  {@const H = 120}
  {@const step = W / values.length}
  {@const h = hover?.chart === id ? hover.i : null}
  <figure class="gs-use-chart">
    <figcaption class="gs-use-row">
      <span>{title}</span>
      <span class="gs-use-grow"></span>
      <span class="gs-use-figures">{h !== null ? `${short(days[h].day)}: ${n(values[h])}` : `hoje ${n(values.at(-1))} · máximo ${n(Math.max(0, ...values))}`}</span>
    </figcaption>
    <svg viewBox="0 0 {W} {H + 18}" role="img" aria-label="{title}, um dia por barra, últimos {values.length} dias" onmouseleave={() => (hover = null)}>
      <line class="gs-use-grid" x1="0" x2={W} y1="0.5" y2="0.5" />
      <line class="gs-use-grid" x1="0" x2={W} y1={H / 2} y2={H / 2} />
      <line class="gs-use-base" x1="0" x2={W} y1={H + 0.5} y2={H + 0.5} />
      <text class="gs-use-axis" x="2" y="11">{n(max)}</text>
      {#each values as v, i (i)}
        {@const bh = v > 0 ? Math.max(2, (v / max) * (H - 4)) : 0}
        <rect class="gs-use-bar" class:on={h === i} class:today={i === values.length - 1} x={i * step + 2} y={H - bh} width={step - 4} height={bh} rx="2" />
        <!-- o alvo do mouse é a coluna inteira, não só a barra -->
        <rect class="gs-use-hit" x={i * step} y="0" width={step} height={H} role="presentation" onmouseenter={() => (hover = { chart: id, i })}><title>{short(days[i].day)}: {n(v)}</title></rect>
      {/each}
      {#each [0, Math.floor(values.length / 2), values.length - 1] as i (i)}
        <text class="gs-use-axis" x={i * step + step / 2} y={H + 14} text-anchor={i === 0 ? 'start' : i === values.length - 1 ? 'end' : 'middle'}>{i === values.length - 1 ? 'hoje' : short(days[i].day)}</text>
      {/each}
    </svg>
  </figure>
{/snippet}

{#snippet meter(label: string, used: number, limit: number, unit: string)}
  {@const p = part(used, limit)}
  <div class="gs-use-meter">
    <div class="gs-use-row"><span>{label}</span><span class="gs-use-grow"></span><span class="gs-use-figures">{n(used)} de {n(limit)} {unit} · {Math.round(p * 100)}%</span></div>
    <span class="gs-use-track" role="meter" aria-label={label} aria-valuemin="0" aria-valuemax={limit} aria-valuenow={used}><span class:warn={p >= 0.8} style:width="{p * 100}%"></span></span>
  </div>
{/snippet}

{#if !report}
  <section class="ss-card"><div class="body"><p class="gs-use-muted">{error || 'Carregando o uso…'}</p></div></section>
{:else}
  {@const live = report.live}
  <section class="ss-card">
    <div class="head gs-use-row">
      <h2 class="gs-use-h">Agora</h2>
      <span class="gs-use-grow"></span>
      <span class="gs-use-figures">{error || `atualiza sozinho a cada ${EVERY / 1000} s · ${new Date(at).toLocaleTimeString('pt-BR')}`}</span>
    </div>
    <div class="body"><div class="gs-use-tiles">
      {@render tile('Salas abertas', n(live.rooms), `${n(live.lobby)} no lobby · ${n(live.playing)} em jogo · ${n(live.ended)} no fim`)}
      {@render tile('Gente conectada', n(live.players), live.visitors ? `e ${n(live.visitors)} ${live.visitors === 1 ? 'visitante' : 'visitantes'} sem apelido` : 'com apelido, em alguma sala')}
      {@render tile('Bots no telhado', n(live.bots))}
      {@render tile('No ar há', agoText(live.uptimeMs), `desde ${new Date(live.startedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`)}
      {@render tile('Memória', sizeText(live.memory.rss), `${sizeText(live.memory.heapUsed)} no heap do JavaScript`)}
    </div></div>
  </section>

  <section class="ss-card">
    <div class="head gs-use-row">
      <h2 class="gs-use-h">Últimos 30 dias</h2>
      <span class="gs-use-grow"></span>
      <span class="gs-use-figures">{report.usage.since ? `contando desde ${report.usage.since.split('-').reverse().join('/')}` : 'nada contado ainda'} · dias de São Paulo</span>
    </div>
    <div class="body gs-use-stack">
      <div class="gs-use-tiles">
        {@render tile('Jogos', n(games30), `${n(finished30)} até o fim · hoje ${n(today?.counts.gamesStarted)}`)}
        {@render tile('Pessoas por jogo', games30 ? one(players30 / games30) : '–', `${n(players30)} lugares ocupados`)}
        {@render tile('Duração média', finished30 ? minutes(sum(days, 'gameMs') / finished30) : '–', 'dos jogos até o fim')}
        {@render tile('Visitantes por dia', activeDays ? one(visitors30 / activeDays) : '–', `nos ${activeDays} ${activeDays === 1 ? 'dia' : 'dias'} com gente · hoje ${n(today?.visitors)}`)}
        {@render tile('Pico de gente junta', n(peak30), `hoje ${n(today?.peakOnline)}`)}
      </div>
      <div class="gs-use-two">
        {@render bars('games', 'Jogos começados por dia', days.map((d) => d.counts.gamesStarted ?? 0))}
        {@render bars('players', 'Pessoas jogando por dia', days.map((d) => d.counts.players ?? 0))}
      </div>
    </div>
  </section>

  <div class="gs-use-two">
    <section class="ss-card">
      <div class="head gs-use-row"><h2 class="gs-use-h">Personagens mais escolhidos</h2><span class="gs-use-grow"></span><span class="gs-use-figures">{n(totalPicks)} escolhas</span></div>
      <div class="body gs-use-stack">
        {#if topChars.length === 0}
          <p class="gs-use-muted">Nenhum jogo começou ainda.</p>
        {:else}
          {#each topChars as c (c.character)}
            <div class="gs-use-char">
              <Swatch n={c.character} size={24} />
              <span class="gs-use-char-name">{nameOf(c.character)}</span>
              <span class="gs-use-track"><span style:width="{(c.picks / topMax) * 100}%"></span></span>
              <span class="gs-use-num">{n(c.picks)}</span>
            </div>
          {/each}
        {/if}
      </div>
    </section>

    <section class="ss-card">
      <div class="head gs-use-row">
        <h2 class="gs-use-h">Bots que falam (Groq)</h2>
        <span class="gs-use-grow"></span>
        {#if report.groq}<span class="ss-badge neutral">{report.groq.model}</span>{/if}
      </div>
      <div class="body gs-use-stack">
        {#if !report.groq}
          <p class="gs-use-muted">Desligado: o servidor não tem <code>GROQ_API_KEY</code> (ver <code>docs/groq.md</code>). Os bots só não falam.</p>
        {:else}
          {@const b = report.groq.budget}
          {#if b.blockedUntil > live.now}<p><span class="ss-badge caution">parado por {agoText(b.blockedUntil - live.now)}</span> o Groq pediu para esperar (429 ou cota do dia).</p>{/if}
          {@render meter('Tokens nas últimas 24 h', b.day.tokens, b.limits.tpd, 'tokens')}
          {@render meter('Pedidos nas últimas 24 h', b.day.requests, b.limits.rpd, 'pedidos')}
          {@render meter('Tokens no último minuto', b.minute.tokens, b.limits.tpm, 'tokens')}
          {@render meter('Pedidos no último minuto', b.minute.requests, b.limits.rpm, 'pedidos')}
          <p class="gs-use-muted">A fala para sozinha antes do limite: puxar assunto usa no máximo metade do dia, reagir 80%, responder a alguém 95%.</p>
        {/if}
        <table class="ss-table gs-use-table">
          <thead><tr><th></th><th class="gs-use-right">Hoje</th><th class="gs-use-right">30 dias</th></tr></thead>
          <tbody>
            {#each GROQ as [k, label] (k)}
              <tr><td>{label}</td><td class="gs-use-num gs-use-right">{n(today?.counts[k])}</td><td class="gs-use-num gs-use-right">{n(sum(days, k))}</td></tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  </div>

  <section class="ss-card">
    <div class="head gs-use-row"><h2 class="gs-use-h">No telhado</h2><span class="gs-use-grow"></span><span class="gs-use-figures">só contas: nenhum apelido, texto, post-it ou IP é guardado</span></div>
    <div class="body">
      <table class="ss-table gs-use-table">
        <thead><tr><th></th><th class="gs-use-right">Hoje</th><th class="gs-use-right">30 dias</th><th class="gs-use-right">Tudo guardado</th></tr></thead>
        <tbody>
          {#each ROOF as [k, label] (k)}
            <tr><td>{label}</td><td class="gs-use-num gs-use-right">{n(today?.counts[k])}</td><td class="gs-use-num gs-use-right">{n(sum(days, k))}</td><td class="gs-use-num gs-use-right">{n(report.usage.totals[k])}</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>
{/if}

<style>
  /* os mesmos jeitos da página do sistema (os estilos de lá são só dela) */
  .gs-use-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .gs-use-grow { flex: 1; }
  .gs-use-h { margin: 0; font: 600 var(--ss-ui-md, 15px) var(--ss-font-body); }
  .gs-use-figures { font: var(--ss-ui-xs) var(--ss-font-mono); color: var(--ss-fg-muted); font-variant-numeric: tabular-nums; }
  .gs-use-muted { margin: 0; color: var(--ss-fg-muted); }
  .gs-use-stack { display: flex; flex-direction: column; gap: 12px; }
  .gs-use-stack p { margin: 0; line-height: 1.5; font-size: var(--ss-ui-sm); }
  .gs-use-table > thead > tr > th.gs-use-right { text-align: right; }
  .gs-use-two { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; align-items: start; }
  @media (max-width: 900px) { .gs-use-two { grid-template-columns: 1fr; } }
  .gs-use-num { font-family: var(--ss-font-mono); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .gs-use-right { text-align: right; }
  .gs-use-tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 1px; background: var(--ss-line); border: 1px solid var(--ss-line); }
  .gs-use-tile { display: flex; flex-direction: column; gap: 2px; padding: 12px 14px; background: var(--ss-bg-elev, var(--ss-bg)); min-width: 0; }
  .gs-use-label { color: var(--ss-fg-muted); font-size: var(--ss-ui-xs); }
  .gs-use-value { font: 600 26px/1.2 var(--ss-font-mono); font-variant-numeric: tabular-nums; color: var(--ss-fg); }
  .gs-use-sub { color: var(--ss-fg-muted); font-size: var(--ss-ui-xs); }
  .gs-use-chart { margin: 0; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .gs-use-chart svg { display: block; width: 100%; height: auto; overflow: visible; }
  .gs-use-grid { stroke: var(--ss-line); stroke-dasharray: 2 4; }
  .gs-use-base { stroke: var(--ss-line-strong); }
  .gs-use-axis { fill: var(--ss-fg-muted); font: 10px var(--ss-font-mono); }
  .gs-use-bar { fill: color-mix(in srgb, var(--ss-accent) 70%, transparent); }
  .gs-use-bar.today { fill: var(--ss-accent); }
  .gs-use-bar.on { fill: var(--ss-fg); }
  .gs-use-hit { fill: transparent; }
  .gs-use-meter { display: flex; flex-direction: column; gap: 4px; }
  .gs-use-track { display: block; flex: 1; height: 6px; background: color-mix(in srgb, var(--ss-fg) 10%, transparent); min-width: 40px; }
  .gs-use-track > span { display: block; height: 100%; background: var(--ss-accent); }
  .gs-use-track > span.warn { background: var(--ss-yellow, #e5c07b); }
  .gs-use-char { display: grid; grid-template-columns: 24px minmax(90px, 160px) 1fr 5ch; align-items: center; gap: 10px; }
  .gs-use-char-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .gs-use-char .gs-use-num { text-align: right; }
  .gs-use-table { width: 100%; }
  .gs-use-table :global(td:first-child) { color: var(--ss-fg-muted); }
</style>
