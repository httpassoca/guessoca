<script lang="ts">
  /**
   * O sistema (`/sistema`): a página do dono do jogo para ver, baixar e trocar tudo o que o jogo usa. Pede a senha (o
   * servidor confere, `apps/server/src/admin.ts`) e a guarda só nesta aba.
   *
   * Abas: **Visão geral** (o elenco em fila no tamanho do jogo, o que está trocado, baixar tudo, o pedido de personagem),
   * **Personagens** (uma lista à esquerda; à direita um palco com a animação escolhida, a régua de quadros e as sete
   * animações em miniatura), **Cenário** (o telhado montado como no jogo, os objetos, os balões), **Sons** (a música com
   * um tocador, e a forma de onda de cada efeito) e **Arquivos** (a tabela de todos os arquivos servidos, por grupo, com o
   * peso de cada um).
   *
   * O que dá para trocar daqui: os arquivos de `/sprites/` e `/music/`, pelo mesmo formato e, nas imagens, o mesmo tamanho
   * em pixels (os atlas não mudam). A troca vale na hora, sobrevive a um deploy e se desfaz com um botão. O que é código
   * (os efeitos sonoros, os atlas, um personagem novo) só muda por deploy. Texto só em português: é uma página de uma
   * pessoa só.
   */
  import { onMount } from 'svelte';
  import { EMOTES } from '@guess/protocol';
  import { LANGS } from '../i18n';
  import { SFX, SFX_NAMES, renderSfx, type SfxName } from '../sound/sfx';
  import { MUSIC_URL } from '../sound/music';
  import { artScale, CHARACTER_ART, type AnimationName } from '../sprites/characters';
  import emoteAtlas from '../sprites/emotes.json';
  import { ROOFTOP, rooftopSheet, skylineUrl } from '../sprites/rooftop';
  import Ledge from '../panels/Ledge.svelte';
  import Swatch from '../panels/Swatch.svelte';
  import Anim from '../system/Anim.svelte';
  import { frameAtTime, lengthOf, pageName, sheetOfPath } from '../system/anim';
  import Wave from '../system/Wave.svelte';
  import { agoText, ApiError, saveBytes, sizeText, systemApi, type AssetInfo, type AssetList } from '../system/api';
  import promptText from '../system/character-prompt.txt?raw';
  import { wav } from '../system/wav';
  import { zip, type ZipEntry } from '../system/zip';

  const ANIMS: AnimationName[] = ['idle', 'walk', 'run', 'jump', 'fall', 'fall_loop', 'shove'];
  const TABS = [['geral', 'Visão geral'], ['personagens', 'Personagens'], ['cenario', 'Cenário'], ['sons', 'Sons'], ['arquivos', 'Arquivos']] as const;
  type Tab = (typeof TABS)[number][0];
  const SFX_ABOUT: Record<SfxName, string> = {
    jump: 'pulo: um blip curto que sobe', shove: 'empurrão: um baque de ruído grave', vote: 'voto: um sininho de duas notas',
    gotIt: 'acertei: um power-up feliz', turnEnd: 'fim da vez: uma cigarra grave e curta',
    yourTurn: 'sua vez: dois toques agudos que sobem',
  };
  const PASS_KEY = 'guess.system.pass';

  // ── a senha ──
  let typed = $state('');
  let pass = $state('');
  let checking = $state(false);
  let loginError = $state('');
  let data = $state<AssetList | null>(null);
  const api = $derived(systemApi(pass));

  async function load(p: string): Promise<boolean> {
    checking = true; loginError = '';
    try {
      data = await systemApi(p).list();
      pass = p;
      try { sessionStorage.setItem(PASS_KEY, p); } catch { /* sem armazenamento: pede de novo na próxima */ }
      return true;
    } catch (e) {
      loginError = !(e instanceof ApiError) ? 'O servidor não respondeu. Tente de novo.'
        : e.status === 401 ? 'Senha errada.'
        : e.status === 404 ? 'O sistema está desligado neste servidor: falta a senha no ambiente dele (GUESS_ADMIN_HASH).'
        : 'O servidor não respondeu. Tente de novo.';
      return false;
    } finally { checking = false; }
  }
  function login(e: SubmitEvent) { e.preventDefault(); if (typed) void load(typed); }
  function logout() {
    try { sessionStorage.removeItem(PASS_KEY); } catch { /* nada a tirar */ }
    pass = ''; typed = ''; data = null;
  }

  // ── o estado da página ──
  let tab = $state<Tab>('geral');
  /** muda a cada troca: vai nos endereços das imagens para o navegador buscar de novo */
  let ver = $state(0);
  let note = $state<{ kind: 'ok' | 'error'; text: string } | null>(null);
  let busy = $state('');
  /** os arquivos em ordem natural: os sprites antes da música, e `char-2` antes de `char-10` */
  const assets = $derived([...(data?.assets ?? [])].sort((a, b) => Number(a.path.startsWith('music/')) - Number(b.path.startsWith('music/')) || a.path.localeCompare(b.path, 'pt', { numeric: true })));
  const byPath = $derived(new Map(assets.map((a) => [a.path, a])));
  const overridden = $derived(assets.filter((a) => a.overridden));
  const totalBytes = $derived(assets.reduce((n, a) => n + a.bytes, 0));
  const url = (path: string) => `/${path}?v=${ver}`;
  /** como chamar um personagem na tela: o herói e o esqueleto pelo que são; os outros pelo nome, com maiúsculas */
  const displayName = (c: { model: string; name: string }) =>
    c.model === 'hero' ? 'Herói' : c.model === 'skeleton' ? 'Esqueleto' : c.name.replace(/(^|\s)\p{L}/gu, (m) => m.toUpperCase());
  /** a altura de um personagem no jogo, em unidades do mundo (um adulto tem `ADULT`) */
  const tallOf = (atlas: (typeof CHARACTER_ART)[number]['atlas']) => (atlas.anchor.y - atlas.stand.y) * artScale(atlas);
  const ADULT = 50;
  /** o elenco em fila: pixels da tela por unidade do mundo, e a altura do palco (cabe o mais alto, com folga) */
  const LINEUP_PX = 2;
  const LINEUP_H = 152;
  const sizeOf = (atlas: (typeof CHARACTER_ART)[number]['atlas']) => (tallOf(atlas) / ADULT).toFixed(2).replace('.', ',');
  const pathOf = (served: string) => served.replace(/^\//, '');
  const say = (kind: 'ok' | 'error', text: string) => { note = { kind, text }; };
  const fail = (e: unknown) => say('error', e instanceof Error ? e.message : 'Algo deu errado.');

  /** o que é cada arquivo, em palavras */
  function about(path: string): string {
    const char = sheetOfPath(path);
    if (char) return `${displayName(CHARACTER_ART[char.n])}, personagem ${char.n + 1}: ${pageName(CHARACTER_ART[char.n].atlas, char.page)}`;
    if (path === pathOf(rooftopSheet)) return 'Os objetos do telhado';
    const sky = ROOFTOP.skylines.find((s) => pathOf(skylineUrl(s)) === path);
    if (sky) return `A cidade ao fundo, camada ${sky.layer}`;
    const lang = LANGS.find((l) => path === `sprites/emotes-${l}.png`);
    if (lang) return `Os balões dos emotes, ${lang}`;
    if (path === pathOf(MUSIC_URL)) return 'A música da partida, em loop';
    return 'Arquivo sem uso conhecido';
  }

  async function refresh() {
    try { data = await api.list(); } catch (e) { if (e instanceof ApiError && e.status === 401) logout(); else fail(e); }
  }

  async function replace(path: string, files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    busy = path;
    try {
      await api.replace(path, file);
      await refresh(); ver++;
      say('ok', `${path} trocado por ${file.name} (${sizeText(file.size)}). Já vale para quem abrir o jogo.`);
    } catch (e) { fail(e); } finally { busy = ''; }
  }
  async function restore(path: string) {
    busy = path;
    try { await api.restore(path); await refresh(); ver++; say('ok', `${path} voltou ao original do deploy.`); } catch (e) { fail(e); } finally { busy = ''; }
  }
  async function download(path: string, original = false) {
    try { saveBytes(path.split('/').pop()!, await api.download(path, original)); } catch (e) { fail(e); }
  }
  const json = (o: unknown) => JSON.stringify(o, null, 2) + '\n';
  const downloadAtlas = (model: string, atlas: unknown) => saveBytes(`${model}.json`, json(atlas), 'application/json');

  const sfxWav = (name: SfxName) => wav(sfx[name].samples, sfx[name].sampleRate);
  function playSfx(name: SfxName) {
    const src = URL.createObjectURL(new Blob([sfxWav(name)], { type: 'audio/wav' }));
    const audio = new Audio(src);
    const started = performance.now();
    const tick = () => {
      const progress = (performance.now() - started) / sfx[name].ms;
      if (progress >= 1 || sounding?.name !== name) { if (sounding?.name === name) sounding = null; return; }
      sounding = { name, progress };
      requestAnimationFrame(tick);
    };
    audio.onended = () => URL.revokeObjectURL(src);
    sounding = { name, progress: 0 };
    void audio.play();
    requestAnimationFrame(tick);
  }

  /** tudo num zip: os arquivos que estão valendo, os atlas, os efeitos em WAV e os parâmetros deles */
  async function downloadAll() {
    busy = 'zip';
    try {
      const entries: ZipEntry[] = [];
      for (const a of assets) entries.push({ name: a.path, bytes: await api.download(a.path) });
      const enc = new TextEncoder();
      const atlases = new Map<string, unknown>(CHARACTER_ART.map((c) => [c.model, c.atlas]));
      for (const [model, atlas] of atlases) entries.push({ name: `atlas/${model}.json`, bytes: enc.encode(json(atlas)) });
      entries.push({ name: 'atlas/characters.json', bytes: enc.encode(json(CHARACTER_ART.map(({ atlas: _, ...c }) => c))) });
      entries.push({ name: 'atlas/rooftop.json', bytes: enc.encode(json(ROOFTOP)) });
      entries.push({ name: 'atlas/emotes.json', bytes: enc.encode(json(emoteAtlas)) });
      for (const name of SFX_NAMES) entries.push({ name: `sfx/${name}.wav`, bytes: sfxWav(name) });
      entries.push({ name: 'sfx/sfx.json', bytes: enc.encode(json(SFX)) });
      entries.push({ name: 'pedido-de-personagem.txt', bytes: enc.encode(promptText) });
      saveBytes('guessoca-arquivos.zip', zip(entries), 'application/zip');
      say('ok', `${entries.length} arquivos no zip.`);
    } catch (e) { fail(e); } finally { busy = ''; }
  }

  let copied = $state(false);
  async function copyPrompt() {
    try { await navigator.clipboard.writeText(promptText); copied = true; setTimeout(() => (copied = false), 2000); } catch { say('error', 'Não deu para copiar; selecione o texto à mão.'); }
  }

  // ── como ver as animações ──
  /** o personagem escolhido na barra lateral da aba Personagens, e a animação dele que está no palco */
  let picked = $state(0);
  let sel = $state<AnimationName>('idle');
  /** o palco: a altura que o personagem de pé ocupa nele, e a das miniaturas, em pixels da tela */
  const STAGE_TALL = 224;
  const TILE_TALL = 72;
  /** a escala para o personagem de pé ter `tall` pixels: inteira no pixel art ampliado, para não borrar */
  const scaleFor = (atlas: (typeof CHARACTER_ART)[number]['atlas'], tall: number) => {
    const k = tall / atlas.stand.h;
    return k >= 1 ? Math.floor(k) : k;
  };
  /** leva o relógio para o começo do quadro `f` da animação do palco, e para */
  const seek = (atlas: (typeof CHARACTER_ART)[number]['atlas'], f: number) => { paused = true; now = (f * 1000) / atlas.animations[sel].fps + 0.01; };
  let guides = $state(false);
  let flip = $state(false);
  let backdrop = $state<'noite' | 'xadrez' | 'claro'>('noite');
  let paused = $state(false);
  let speed = $state(1);
  /** o relógio das animações, ms: anda com `speed`, para com `paused` */
  let now = $state(0);
  /** as folhas dos personagens já carregadas, pelo endereço com versão */
  let sheets = $state<Record<string, HTMLImageElement>>({});
  /** as folhas de um personagem, uma por página do atlas (`undefined` a que ainda não carregou) */
  const sheetsOf = (c: (typeof CHARACTER_ART)[number]) => c.sheets.map((s) => sheets[url(pathOf(s))]);

  // o parado de todos (a fila do elenco, pequeno) e todas as folhas do escolhido; as outras só quando alguém o escolhe
  $effect(() => {
    if (!data) return;
    const want = [...CHARACTER_ART.map((c) => c.sheets[0]), ...(CHARACTER_ART[picked] ?? CHARACTER_ART[0]).sheets];
    for (const s of want) {
      const src = url(pathOf(s));
      if (sheets[src]) continue;
      const img = new Image();
      img.onload = () => { sheets = { ...sheets, [src]: img }; };
      img.src = src;
    }
  });

  onMount(() => {
    let saved = '';
    try { saved = sessionStorage.getItem(PASS_KEY) ?? ''; } catch { /* sem armazenamento */ }
    if (saved) void load(saved);
    let raf = 0, last = performance.now();
    const tick = (t: number) => {
      if (!paused) now += (t - last) * speed;
      last = t;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });

  /** um passo: um quadro da animação do palco, com as animações paradas */
  const step = (d: number) => { const fps = (CHARACTER_ART[picked] ?? CHARACTER_ART[0]).atlas.animations[sel].fps; paused = true; now = Math.max(0, now + (d * 1000) / fps); };

  // ── os sons ──
  /** os efeitos, gerados uma vez: as amostras (para a onda e para tocar) e a duração */
  const sfx = Object.fromEntries(SFX_NAMES.map((name) => { const r = renderSfx(name); return [name, { ...r, ms: (r.samples.length / r.sampleRate) * 1000 }]; })) as Record<SfxName, { samples: Float32Array; sampleRate: number; ms: number }>;
  /** o efeito que está tocando, e quanto dele já tocou (0..1), para a onda */
  let sounding = $state<{ name: SfxName; progress: number } | null>(null);
  /** a música: o elemento de áudio, se toca, e os tempos, em segundos */
  let music = $state<HTMLAudioElement>();
  let musicOn = $state(false);
  let musicAt = $state(0);
  let musicLen = $state(0);
  const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
  const toggleMusic = () => { if (!music) return; if (music.paused) void music.play(); else music.pause(); };

  /** os arquivos em três grupos, para a tabela: os personagens, o cenário e a música */
  const groups = $derived([
    { title: 'Personagens', files: assets.filter((a) => /^sprites\/char-/.test(a.path)) },
    { title: 'Cenário', files: assets.filter((a) => a.path.startsWith('sprites/') && !/^sprites\/char-/.test(a.path)) },
    { title: 'Música', files: assets.filter((a) => a.path.startsWith('music/')) },
  ].filter((g) => g.files.length));
  const roofFrames = Object.entries(ROOFTOP.frames);
</script>

<svelte:head><title>guessoca · sistema</title></svelte:head>

{#snippet actions(a: AssetInfo)}
  <span class="gs-sys-actions">
    <button class="ss-btn ghost" type="button" onclick={() => download(a.path)}>Baixar</button>
    <label class="ss-btn ghost" class:loading={busy === a.path}>
      Trocar
      <input type="file" accept={a.format === 'ogg' ? '.ogg,audio/ogg' : `.${a.format},image/${a.format}`} hidden disabled={busy !== ''} onchange={(e) => { void replace(a.path, e.currentTarget.files); e.currentTarget.value = ''; }} />
    </label>
    {#if a.overridden}
      <button class="ss-btn ghost" type="button" onclick={() => download(a.path, true)}>Baixar original</button>
      <button class="ss-btn danger" type="button" disabled={busy !== ''} onclick={() => restore(a.path)}>Desfazer troca</button>
    {/if}
  </span>
{/snippet}

{#snippet facts(a: AssetInfo | undefined)}
  {#if a}
    <span class="ss-badge neutral">{a.format}</span>
    {#if a.width}<span class="ss-badge neutral">{a.width}×{a.height} px</span>{/if}
    <span class="ss-badge neutral">{sizeText(a.bytes)}</span>
    {#if a.overridden}<span class="ss-badge caution">trocado {a.overriddenAt ? `há ${agoText((data?.server.now ?? 0) - a.overriddenAt)}` : ''}</span>{/if}
  {/if}
{/snippet}

<div class="gs-sys">
  {#if !data}
    <form class="ss-card gs-sys-login" onsubmit={login}>
      <div class="head"><h1 class="gs-sys-brand">guessoca <span>sistema</span></h1></div>
      <div class="body">
        <label class="ss-field">
          <span class="lbl">Senha</span>
          <!-- svelte-ignore a11y_autofocus -->
          <span class="control"><input class="ss-input" type="password" bind:value={typed} autocomplete="current-password" autofocus aria-invalid={loginError !== ''} /></span>
        </label>
        {#if loginError}<p class="gs-sys-error" role="alert">{loginError}</p>{/if}
        <button class="ss-btn primary full-width" type="submit" disabled={checking || !typed}>{checking ? 'Conferindo…' : 'Entrar'}</button>
      </div>
      <div class="foot"><a class="ss-link" href="/">Voltar ao jogo</a></div>
    </form>
  {:else}
    <header class="gs-sys-top">
      <h1 class="gs-sys-brand">guessoca <span>sistema</span></h1>
      <div class="ss-segmented" role="tablist" aria-label="Seções">
        {#each TABS as [id, label] (id)}
          <button class="segment" class:selected={tab === id} type="button" role="tab" aria-selected={tab === id} onclick={() => (tab = id)}><span class="label">{label}</span></button>
        {/each}
      </div>
      <span class="gs-sys-grow"></span>
      <button class="ss-btn" type="button" onclick={refresh}>Atualizar</button>
      <a class="ss-btn" href="/">Abrir o jogo</a>
      <button class="ss-btn ghost" type="button" onclick={logout}>Sair</button>
    </header>

    {#if note}
      <div class="gs-sys-note {note.kind}" role="status">
        <span>{note.text}</span>
        <button class="ss-btn ghost" type="button" onclick={() => (note = null)}>Fechar</button>
      </div>
    {/if}

    <main class="gs-sys-main">
      {#if tab === 'geral'}
        <section class="ss-card">
          <div class="head gs-sys-row">
            <h2 class="gs-sys-h">O elenco, no tamanho do jogo</h2>
            <span class="gs-sys-grow"></span>
            <span class="gs-sys-figures">{CHARACTER_ART.length} personagens · {assets.length} arquivos · {sizeText(totalBytes)} · {overridden.length} {overridden.length === 1 ? 'troca' : 'trocas'} · {data.server.rooms} {data.server.rooms === 1 ? 'sala aberta' : 'salas abertas'} · no ar há {agoText(data.server.now - data.server.startedAt)}</span>
          </div>
          <div class="body">
            <div class="gs-sys-lineup" style:--stage="{LINEUP_H}px" style:--adult="{ADULT * LINEUP_PX}px">
              <span class="gs-sys-adult">um adulto: {ADULT}</span>
              {#each CHARACTER_ART as o, i (i)}
                {@const z = artScale(o.atlas) * LINEUP_PX}
                <button class="gs-sys-cast" type="button" title="Ver as animações de {displayName(o)}" onclick={() => { picked = i; tab = 'personagens'; }}>
                  <span class="gs-sys-cast-stage"><Anim sheets={sheetsOf(o)} atlas={o.atlas} name="idle" {now} k={z} /></span>
                  <span class="gs-sys-cast-name">{displayName(o)}</span>
                  <span class="gs-sys-cast-size">{sizeOf(o.atlas)}×</span>
                </button>
              {/each}
            </div>
          </div>
        </section>

        <div class="gs-sys-two">
        <section class="ss-card">
          <div class="head"><h2 class="gs-sys-h">Baixar tudo</h2></div>
          <div class="body gs-sys-stack">
            <p>Um zip com todos os arquivos que estão valendo, os atlas (onde fica cada quadro), os efeitos sonoros em WAV com os parâmetros, e o pedido de personagem.</p>
            <div><button class="ss-btn primary" type="button" disabled={busy !== ''} onclick={downloadAll}>{busy === 'zip' ? 'Juntando…' : `Baixar tudo (${sizeText(totalBytes)})`}</button></div>
          </div>
        </section>

        <section class="ss-card">
          <div class="head"><h2 class="gs-sys-h">Trocas valendo</h2></div>
          <div class="body gs-sys-stack">
            {#if overridden.length === 0}
              <p class="gs-sys-muted">Nenhuma. O jogo está servindo os arquivos do último deploy.</p>
            {:else}
              <p>Estes arquivos foram trocados por aqui. Um deploy não desfaz a troca, nem quando traz arte nova para o mesmo arquivo.</p>
              {#each overridden as a (a.path)}
                <div class="gs-sys-row"><code>{a.path}</code><span class="gs-sys-muted">{about(a.path)}</span>{@render facts(a)}<span class="gs-sys-grow"></span>{@render actions(a)}</div>
              {/each}
            {/if}
          </div>
        </section>

        <section class="ss-card">
          <div class="head"><h2 class="gs-sys-h">O que dá para mudar daqui</h2></div>
          <div class="body gs-sys-stack">
            <p><strong>Na hora, por esta página:</strong> a folha de um personagem, os objetos do telhado, a cidade ao fundo, os balões e a música. O arquivo novo tem que ser do mesmo formato e, se for imagem, do mesmo tamanho em pixels, porque o lugar de cada quadro na folha não muda.</p>
            <p><strong>Só com deploy:</strong> um personagem novo, mais ou menos quadros numa animação, outro fps, os efeitos sonoros e o mapa. Para um personagem novo, mande a pasta dele numa sessão do Claude Code.</p>
          </div>
        </section>

        <section class="ss-card">
          <div class="head"><h2 class="gs-sys-h">Pedido de personagem para um modelo de imagem</h2></div>
          <div class="body gs-sys-stack">
            <p>Mande este texto com as imagens de referência. O que volta é uma pasta com sete folhas, pronta para entrar no jogo sem mudar nenhum pixel.</p>
            <div><button class="ss-btn" type="button" onclick={copyPrompt}>{copied ? 'Copiado' : 'Copiar o pedido'}</button></div>
            <details><summary>Ver o texto</summary><pre class="gs-sys-pre">{promptText}</pre></details>
          </div>
        </section>
        </div>
      {:else if tab === 'personagens'}
        {@const c = CHARACTER_ART[picked] ?? CHARACTER_ART[0]}
        {@const n = CHARACTER_ART.indexOf(c)}
        {@const files = c.sheets.map((s) => byPath.get(pathOf(s)))}
        {@const k = artScale(c.atlas)}
        {@const pages = sheetsOf(c)}
        {@const an = c.atlas.animations[sel]}
        {@const frame = frameAtTime(c.atlas, sel, now)}
        <div class="gs-sys-split">
          <nav class="gs-sys-side" aria-label="Personagens">
            {#each CHARACTER_ART as o, i (i)}
              <button class="gs-sys-pick" class:selected={i === n} type="button" aria-current={i === n} onclick={() => (picked = i)}>
                <Swatch n={i} size={28} />
                <span class="gs-sys-pick-name">{displayName(o)}</span>
                {#if o.sheets.some((s) => byPath.get(pathOf(s))?.overridden)}<span class="ss-badge caution">trocado</span>{/if}
                <span class="gs-sys-pick-n">{String(i + 1).padStart(2, '0')}</span>
              </button>
            {/each}
          </nav>

          <section class="ss-card gs-sys-detail">
            <div class="head gs-sys-row">
              <h2 class="gs-sys-h">{displayName(c)} <span class="gs-sys-muted">personagem {n + 1} · {sizeOf(c.atlas)}× um adulto</span></h2>
              <span class="gs-sys-grow"></span>
              {#if files.some((f) => f?.overridden)}<span class="ss-badge caution">trocado</span>{/if}
            </div>

            <!-- o palco: a animação escolhida, grande, em cima da beirada do telhado -->
            <div class="gs-sys-stage {backdrop}">
              <div class="gs-sys-stage-top">
                <span class="gs-sys-stage-name">{sel === 'shove' ? 'shove, o ataque' : sel}</span>
                <span class="gs-sys-figures">{an.frames} quadros · {String(Math.round(an.fps * 10) / 10).replace('.', ',')} fps · {(lengthOf(c.atlas, sel) / 1000).toFixed(2).replace('.', ',')} s · {an.loop ? 'em loop' : 'uma vez'}</span>
              </div>
              <div class="gs-sys-stage-floor">
                <Anim sheets={pages} atlas={c.atlas} name={sel} {now} k={scaleFor(c.atlas, STAGE_TALL)} {guides} {flip} />
              </div>
              <div class="gs-sys-stage-ledge"><Ledge w={320} scale={4} /></div>
            </div>

            <!-- a régua de quadros: um traço por quadro; clicar leva a ele e para -->
            <div class="gs-sys-scrub">
              <button class="ss-btn ghost" type="button" aria-label="Um quadro para trás" onclick={() => step(-1)}>◀</button>
              <button class="ss-btn" type="button" onclick={() => (paused = !paused)}>{paused ? 'Tocar' : 'Pausar'}</button>
              <button class="ss-btn ghost" type="button" aria-label="Um quadro para a frente" onclick={() => step(1)}>▶</button>
              <span class="gs-sys-ticks" role="group" aria-label="Quadros de {sel}">
                {#each { length: an.frames } as _, f (f)}
                  <button class="gs-sys-tick" class:on={f === frame} class:past={f < frame} type="button" aria-label="Quadro {f + 1}" aria-pressed={f === frame} onclick={() => seek(c.atlas, f)}></button>
                {/each}
              </span>
              <span class="gs-sys-count">{String(frame + 1).padStart(2, '0')} / {String(an.frames).padStart(2, '0')}</span>
            </div>

            <!-- as sete animações, pequenas e tocando: clicar põe uma no palco -->
            <div class="gs-sys-tiles {backdrop}" role="tablist" aria-label="Animações">
              {#each ANIMS as name (name)}
                {@const t = c.atlas.animations[name]}
                <button class="gs-sys-tile" class:selected={name === sel} type="button" role="tab" aria-selected={name === sel} onclick={() => { sel = name; if (paused) now = 0.01; }}>
                  <span class="gs-sys-tile-art"><Anim sheets={pages} atlas={c.atlas} {name} {now} k={scaleFor(c.atlas, TILE_TALL)} {flip} /></span>
                  <span class="gs-sys-tile-name">{name === 'shove' ? 'shove' : name}</span>
                  <span class="gs-sys-tile-meta">{t.frames} · {String(Math.round(t.fps * 10) / 10).replace('.', ',')} fps</span>
                </button>
              {/each}
            </div>

            <div class="body gs-sys-stack">
              <div class="gs-sys-row gs-sys-view">
                <span class="gs-sys-ctl">Velocidade
                  <span class="ss-segmented" role="group" aria-label="Velocidade">
                    {#each [1, 0.5, 0.25, 0.1] as v (v)}<button class="segment" class:selected={speed === v} type="button" aria-pressed={speed === v} onclick={() => (speed = v)}><span class="label">{String(v).replace('.', ',')}×</span></button>{/each}
                  </span>
                </span>
                <span class="gs-sys-ctl">Fundo
                  <span class="ss-segmented" role="group" aria-label="Fundo">
                    {#each ['noite', 'xadrez', 'claro'] as const as v (v)}<button class="segment" class:selected={backdrop === v} type="button" aria-pressed={backdrop === v} onclick={() => (backdrop = v)}><span class="label">{v}</span></button>{/each}
                  </span>
                </span>
                <label class="gs-sys-check"><input type="checkbox" bind:checked={guides} /> Chão e âncora</label>
                <label class="gs-sys-check"><input type="checkbox" bind:checked={flip} /> Espelhado</label>
              </div>
              <div class="gs-sys-row">
                <span class="ss-badge neutral">quadro {c.atlas.frame.w}×{c.atlas.frame.h} px</span>
                <span class="ss-badge neutral">no jogo {Math.round((c.atlas.anchor.y - c.atlas.stand.y) * k)} de altura</span>
                <span class="ss-badge neutral">escala {k === 1 ? '1, pixel art' : String(Math.round(k * 1000) / 1000).replace('.', ',')}</span>
                <span class="ss-badge neutral"><span class="gs-sys-chip" style:background={c.color}></span>{c.color}</span>
                <span class="ss-badge neutral">âncora {c.atlas.anchor.x}, {c.atlas.anchor.y}</span>
                {#if c.atlas.credit}<span class="ss-badge info">crédito: {c.atlas.credit}</span>{/if}
                <span class="gs-sys-grow"></span>
                <button class="ss-btn ghost" type="button" onclick={() => downloadAtlas(c.model, c.atlas)}>Baixar atlas</button>
              </div>
              <!-- uma folha por página do atlas: o parado numa linha, e as outras animações em grade (o atlas diz onde) -->
              {#each files as f, p (p)}
                {#if f}
                  <div class="gs-sys-row">
                    <span class="gs-sys-muted">Folha: {pageName(c.atlas, p)}</span>
                    {@render facts(f)}
                    <span class="gs-sys-grow"></span>
                    {@render actions(f)}
                  </div>
                {/if}
              {/each}
            </div>
          </section>
        </div>
      {:else if tab === 'cenario'}
        {@const roof = byPath.get(pathOf(rooftopSheet))}
        {@const far = ROOFTOP.skylines.find((x) => x.layer === 'far')}
        {@const near = ROOFTOP.skylines.find((x) => x.layer === 'near')}
        {@const moon = ROOFTOP.frames.moon}
        <section class="ss-card">
          <div class="head"><h2 class="gs-sys-h">O telhado, como o jogo o monta</h2></div>
          <!-- as camadas na ordem do jogo: a cidade de longe, a de perto, a lua e a beirada do telhado -->
          <div class="gs-sys-diorama" aria-hidden="true">
            {#if far}<span class="gs-sys-layer" style:background-image="url({url(pathOf(skylineUrl(far)))})" style:background-size="{far.w * 2}px {far.h * 2}px" style:opacity="0.75"></span>{/if}
            {#if near}<span class="gs-sys-layer" style:background-image="url({url(pathOf(skylineUrl(near)))})" style:background-size="{near.w * 2}px {near.h * 2}px" style:bottom="24px"></span>{/if}
            {#if moon}<span class="gs-sys-crop gs-sys-moon" style:width="{moon.w * 3}px" style:height="{moon.h * 3}px" style:background-image="url({url(pathOf(rooftopSheet))})"
              style:background-size="{(roof?.width ?? 0) * 3}px {(roof?.height ?? 0) * 3}px" style:background-position="-{moon.x * 3}px -{moon.y * 3}px"></span>{/if}
            <span class="gs-sys-diorama-ledge"><Ledge w={320} scale={4} /></span>
          </div>
          <div class="body gs-sys-stack">
            {#each ROOFTOP.skylines as s (s.name)}
              {@const f = byPath.get(pathOf(skylineUrl(s)))}
              <div class="gs-sys-row">
                <span class="gs-sys-rowname">A cidade ao fundo, {s.layer === 'far' ? 'de longe' : 'de perto'}</span>
                {@render facts(f)}
                <span class="gs-sys-grow"></span>
                {#if f}{@render actions(f)}{/if}
              </div>
            {/each}
          </div>
        </section>

        <section class="ss-card">
          <div class="head gs-sys-row"><h2 class="gs-sys-h">Os objetos do telhado</h2><span class="gs-sys-grow"></span>{@render facts(roof)}</div>
          <div class="body gs-sys-stack">
            <div class="gs-sys-objects">
              {#each roofFrames as [name, f] (name)}
                {@const z = Math.max(1, Math.min(4, Math.floor(88 / Math.max(f.w, f.h))))}
                <figure>
                  <span class="gs-sys-object">
                    <span class="gs-sys-crop" style:width="{f.w * z}px" style:height="{f.h * z}px" style:background-image="url({url(pathOf(rooftopSheet))})"
                      style:background-size="{(roof?.width ?? 0) * z}px {(roof?.height ?? 0) * z}px" style:background-position="-{f.x * z}px -{f.y * z}px"></span>
                  </span>
                  <figcaption><strong>{name}</strong>{f.w}×{f.h}{f.tile ? ' · ladrilho' : ''}</figcaption>
                </figure>
              {/each}
            </div>
            <div class="gs-sys-row"><span class="gs-sys-grow"></span><button class="ss-btn ghost" type="button" onclick={() => saveBytes('rooftop.json', json(ROOFTOP), 'application/json')}>Baixar atlas</button>{#if roof}{@render actions(roof)}{/if}</div>
          </div>
        </section>

        <section class="ss-card">
          <div class="head"><h2 class="gs-sys-h">Os balões dos emotes</h2></div>
          <div class="body gs-sys-stack">
            {#each LANGS as lang (lang)}
              {@const path = `sprites/emotes-${lang}.png`}
              {@const f = byPath.get(path)}
              <div class="gs-sys-row">
                <span class="gs-sys-rowname">{lang}</span>
                <span class="gs-sys-emotes">
                  {#each EMOTES as name, i (name)}
                    {@const e = emoteAtlas.frames[name]}
                    <span class="gs-sys-emote" title="{name}, tecla {i + 1}">
                      <span class="gs-sys-crop" style:width="{e.w * 3}px" style:height="{e.h * 3}px" style:background-image="url({url(path)})"
                        style:background-size="{(f?.width ?? 0) * 3}px {(f?.height ?? 0) * 3}px" style:background-position="-{e.x * 3}px -{e.y * 3}px"></span>
                      <span class="gs-sys-key">{i + 1}</span>
                    </span>
                  {/each}
                </span>
                {@render facts(f)}
                <span class="gs-sys-grow"></span>
                {#if f}{@render actions(f)}{/if}
              </div>
            {/each}
          </div>
        </section>
      {:else if tab === 'sons'}
        {@const track = byPath.get(pathOf(MUSIC_URL))}
        <section class="ss-card">
          <div class="head gs-sys-row"><h2 class="gs-sys-h">A música da partida</h2><span class="gs-sys-grow"></span>{@render facts(track)}</div>
          <div class="body gs-sys-stack">
            {#key ver}
              <audio bind:this={music} preload="metadata" src={url(pathOf(MUSIC_URL))} onplay={() => (musicOn = true)} onpause={() => (musicOn = false)} onended={() => (musicOn = false)}
                ontimeupdate={(e) => (musicAt = e.currentTarget.currentTime)} onloadedmetadata={(e) => { musicLen = e.currentTarget.duration; musicAt = 0; }}></audio>
            {/key}
            <div class="gs-sys-player">
              <button class="ss-btn primary" type="button" onclick={toggleMusic}>{musicOn ? 'Pausar' : 'Tocar'}</button>
              <input type="range" min="0" max={musicLen || 1} step="1" value={musicAt} aria-label="Posição na música" oninput={(e) => { if (music) music.currentTime = Number(e.currentTarget.value); }} />
              <span class="gs-sys-count">{clock(musicAt)} / {clock(musicLen)}</span>
            </div>
            <div class="gs-sys-row">
              <span class="gs-sys-muted">Toca em loop do começo da partida até o fim, no volume do mapa. A troca tem que ser um arquivo Ogg</span>
              <span class="gs-sys-grow"></span>
              {#if track}{@render actions(track)}{/if}
            </div>
          </div>
        </section>

        <section class="ss-card">
          <div class="head gs-sys-row"><h2 class="gs-sys-h">Os efeitos sonoros</h2><span class="gs-sys-grow"></span><span class="gs-sys-figures">gerados pelo código · mudar é por deploy</span></div>
          <div class="body">
            {#each SFX_NAMES as name (name)}
              <div class="gs-sys-sfx">
                <button class="gs-sys-wave" type="button" aria-label="Ouvir {name}" onclick={() => playSfx(name)}>
                  <Wave samples={sfx[name].samples} progress={sounding?.name === name ? sounding.progress : 0} />
                </button>
                <span class="gs-sys-sfx-name"><code>{name}</code><span class="gs-sys-muted">{SFX_ABOUT[name]}</span></span>
                <span class="gs-sys-count">{(sfx[name].ms / 1000).toFixed(2).replace('.', ',')} s</span>
                <details class="gs-sys-sfx-params"><summary>Parâmetros</summary><span class="gs-sys-params">{Object.entries(SFX[name]).map(([key, v]) => `${key.replace(/^p_/, '')} ${v}`).join(' · ')}</span></details>
                <span class="gs-sys-actions"><button class="ss-btn ghost" type="button" onclick={() => playSfx(name)}>Ouvir</button><button class="ss-btn ghost" type="button" onclick={() => saveBytes(`${name}.wav`, sfxWav(name), 'audio/wav')}>Baixar WAV</button></span>
              </div>
            {/each}
          </div>
        </section>
      {:else}
        <section class="ss-card">
          <div class="head gs-sys-row"><h2 class="gs-sys-h">Todos os arquivos servidos</h2><span class="gs-sys-grow"></span><span class="gs-sys-figures">{assets.length} arquivos · {sizeText(totalBytes)}{overridden.length ? ` · ${overridden.length} ${overridden.length === 1 ? 'trocado' : 'trocados'}` : ''}</span></div>
          <div class="body">
            <table class="ss-table gs-sys-files">
              <thead><tr><th></th><th>Arquivo</th><th>O que é</th><th class="gs-sys-right">Tamanho</th><th class="gs-sys-right">Peso</th><th></th><th></th></tr></thead>
              {#each groups as g (g.title)}
                {@const heaviest = Math.max(1, ...g.files.map((x) => x.bytes))}
                <tbody>
                  <tr class="gs-sys-group"><td colspan="7"><strong>{g.title}</strong><span class="gs-sys-figures">{g.files.length} · {sizeText(g.files.reduce((sum, f) => sum + f.bytes, 0))}</span></td></tr>
                  {#each g.files as f (f.path)}
                    <tr>
                      <td>{#if f.format !== 'ogg'}<img class="gs-sys-thumb" src={url(f.path)} alt="" loading="lazy" />{/if}</td>
                      <td><a class="gs-sys-path" href={url(f.path)} target="_blank" rel="noopener">/{f.path}</a>{#if f.overridden}<span class="ss-badge caution">trocado</span>{/if}</td>
                      <td>{about(f.path)}</td>
                      <td class="gs-sys-num gs-sys-right">{f.width ? `${f.width}×${f.height}` : ''}</td>
                      <td class="gs-sys-num gs-sys-right">{sizeText(f.bytes)}</td>
                      <td><span class="gs-sys-bar"><span style:width="{Math.max(2, (f.bytes / heaviest) * 100)}%"></span></span></td>
                      <td class="gs-sys-right">{@render actions(f)}</td>
                    </tr>
                  {/each}
                </tbody>
              {/each}
            </table>
          </div>
        </section>
      {/if}
    </main>
  {/if}
</div>

<style>
  .gs-sys { color-scheme: dark; min-height: 100vh; overflow-y: auto; height: 100vh; background: var(--ss-bg); color: var(--ss-fg); font-family: var(--ss-font-body); font-size: var(--ss-ui-sm); }
  .gs-sys-login { width: min(360px, calc(100vw - 32px)); margin: 18vh auto 0; }
  .gs-sys-login .body { display: flex; flex-direction: column; gap: 12px; }
  .gs-sys-brand { margin: 0; font: 600 var(--ss-size-h3) var(--ss-font-mono); letter-spacing: 0.02em; }
  .gs-sys-brand span { color: var(--ss-fg-muted); font-weight: 400; }
  .gs-sys-error { margin: 0; color: var(--ss-critical, #ff6b6b); }
  .gs-sys-top { position: sticky; top: 0; z-index: 5; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 10px 20px; background: var(--ss-bg); border-bottom: 1px solid var(--ss-line); }
  .gs-sys-grow { flex: 1; }
  .gs-sys-main { display: flex; flex-direction: column; gap: 16px; max-width: 1280px; margin: 0 auto; padding: 20px; }
  .gs-sys-note { display: flex; align-items: center; justify-content: space-between; gap: 12px; max-width: 1240px; margin: 12px auto 0; padding: 6px 12px; border: 1px solid var(--ss-line); }
  .gs-sys-note.ok { border-color: var(--ss-positive, #5fe36e); }
  .gs-sys-note.error { border-color: var(--ss-critical, #ff6b6b); }
  /* os títulos e as etiquetas do dssoca vêm em maiúsculas e minúsculas forçadas: aqui ficam como foram escritos */
  .gs-sys :global(.ss-card > .head), .gs-sys :global(.ss-badge) { text-transform: none; letter-spacing: 0; }
  .gs-sys :global(.ss-table) { background: transparent; }
  .gs-sys :global(.ss-table td), .gs-sys :global(.ss-table th) { padding: 4px 12px; vertical-align: middle; }
  .gs-sys :global(.ss-table tbody tr + tr td) { border-top: 1px solid var(--ss-line); }
  .gs-sys :global(input[type='range']), .gs-sys :global(input[type='checkbox']) { accent-color: var(--ss-accent); }
  .gs-sys-figures { font: var(--ss-ui-xs) var(--ss-font-mono); color: var(--ss-fg-muted); font-variant-numeric: tabular-nums; }
  .gs-sys-two { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; align-items: start; }
  @media (max-width: 900px) { .gs-sys-two { grid-template-columns: 1fr; } }
  /* o elenco em fila, cada um no tamanho que tem no jogo, sobre uma linha de chão; a linha tracejada é a altura de um adulto */
  .gs-sys-lineup { position: relative; display: flex; align-items: flex-start; gap: 2px; overflow-x: auto; padding: 16px 16px 12px; background: #1a1028; border: 1px solid var(--ss-line); }
  .gs-sys-lineup::after { content: ''; position: absolute; left: 0; right: 0; top: calc(16px + var(--stage) - var(--adult)); border-top: 1px dashed rgb(255 255 255 / 0.22); }
  .gs-sys-adult { position: absolute; right: 8px; top: calc(16px + var(--stage) - var(--adult) - 16px); font: var(--ss-ui-xs) var(--ss-font-mono); color: rgb(255 255 255 / 0.5); }
  .gs-sys-cast { all: unset; box-sizing: border-box; flex: 1 0 44px; display: flex; flex-direction: column; align-items: center; gap: 2px; cursor: pointer; padding-bottom: 4px; }
  .gs-sys-cast:focus-visible { outline: 2px solid var(--gs-focus); outline-offset: 2px; }
  .gs-sys-cast-name { font-size: var(--ss-ui-xs); line-height: 1.3; color: #e8e4f0; text-align: center; min-height: 2.6em; }
  .gs-sys-cast-size { font: var(--ss-ui-xs) var(--ss-font-mono); color: rgb(255 255 255 / 0.5); font-variant-numeric: tabular-nums; }
  .gs-sys-cast:hover .gs-sys-cast-name { color: var(--ss-accent); }
  .gs-sys-h { margin: 0; font: 600 var(--ss-ui-md, 15px) var(--ss-font-body); }
  .gs-sys-muted { color: var(--ss-fg-muted); font-weight: 400; }
  .gs-sys-stack { display: flex; flex-direction: column; gap: 12px; }
  .gs-sys-stack p { margin: 0; max-width: 78ch; line-height: 1.5; }
  .gs-sys-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .gs-sys-actions { display: inline-flex; gap: 6px; flex-wrap: nowrap; justify-content: flex-end; white-space: nowrap; }
  .gs-sys :global(.ss-table th) { text-align: left; }
  .gs-sys-actions label { cursor: pointer; }
  .gs-sys-right { text-align: right; }
  .gs-sys-num { font-family: var(--ss-font-mono); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .gs-sys-pre { max-height: 420px; overflow: auto; margin: 8px 0 0; padding: 12px; border: 1px solid var(--ss-line); background: var(--ss-bg-inset); font: var(--ss-ui-xs)/1.5 var(--ss-font-mono); white-space: pre-wrap; }
  .gs-sys-split { display: grid; grid-template-columns: 240px minmax(0, 1fr); gap: 16px; align-items: start; }
  .gs-sys-side { position: sticky; top: 71px; display: flex; flex-direction: column; gap: 2px; max-height: calc(100vh - 91px); overflow-y: auto; }
  .gs-sys-pick { all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 8px; height: 36px; padding: 0 8px; border: 1px solid transparent; cursor: pointer; }
  .gs-sys-pick:hover { background: var(--ss-hover); }
  .gs-sys-pick:focus-visible { outline: 2px solid var(--gs-focus); outline-offset: 2px; }
  .gs-sys-pick.selected { background: color-mix(in srgb, var(--ss-fg) 9%, transparent); border-color: var(--ss-line-strong); }
  .gs-sys-pick-name { min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .gs-sys-pick-n { font: var(--ss-ui-xs) var(--ss-font-mono); color: var(--ss-fg-muted); font-variant-numeric: tabular-nums; }
  @media (max-width: 760px) { .gs-sys-split { grid-template-columns: 1fr; } .gs-sys-side { position: static; flex-direction: row; flex-wrap: wrap; max-height: none; } }
  .gs-sys-chip { display: inline-block; width: 8px; height: 8px; margin-right: 6px; }

  /* ── Personagens: o palco, a régua de quadros e as miniaturas ── */
  .gs-sys-detail { min-width: 0; }
  .gs-sys-stage { position: relative; display: flex; flex-direction: column; height: 344px; overflow: hidden; border-bottom: 1px solid var(--ss-line); background: #1a1028; color: #e8e4f0; }
  .gs-sys-stage.claro { background: #d8d8e0; color: #16161c; }
  .gs-sys-stage.xadrez { background: repeating-conic-gradient(#2a2a34 0% 25%, #3a3a46 0% 50%) 0 0 / 16px 16px; }
  .gs-sys-stage-top { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 12px 16px 0; }
  .gs-sys-stage-name { font: 500 var(--ss-ui-md, 15px) var(--ss-font-mono); }
  .gs-sys-stage .gs-sys-figures { color: inherit; opacity: 0.6; }
  .gs-sys-stage-floor { position: relative; z-index: 1; flex: 1; display: flex; align-items: flex-end; justify-content: center; padding-bottom: 32px; min-height: 0; }
  .gs-sys-stage-ledge { position: absolute; left: 50%; bottom: 0; translate: -50% 0; line-height: 0; }
  .gs-sys-stage.claro .gs-sys-stage-ledge, .gs-sys-stage.xadrez .gs-sys-stage-ledge { visibility: hidden; }
  .gs-sys-scrub { display: flex; align-items: center; gap: 8px; padding: 8px 16px; border-bottom: 1px solid var(--ss-line); }
  .gs-sys-ticks { flex: 1; display: flex; gap: 2px; height: 24px; }
  .gs-sys-tick { all: unset; box-sizing: border-box; flex: 1; min-width: 4px; background: color-mix(in srgb, var(--ss-fg) 14%, transparent); cursor: pointer; }
  .gs-sys-tick.past { background: color-mix(in srgb, var(--ss-fg) 34%, transparent); }
  .gs-sys-tick.on { background: var(--ss-accent); }
  .gs-sys-tick:hover:not(.on) { background: color-mix(in srgb, var(--ss-fg) 50%, transparent); }
  .gs-sys-tick:focus-visible { outline: 2px solid var(--gs-focus); outline-offset: 2px; }
  .gs-sys-count { font: var(--ss-ui-sm) var(--ss-font-mono); font-variant-numeric: tabular-nums; color: var(--ss-fg-muted); white-space: nowrap; min-width: 7ch; text-align: right; }
  .gs-sys-tiles { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); border-bottom: 1px solid var(--ss-line); }
  .gs-sys-tile { all: unset; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 12px 4px 8px; cursor: pointer; border-right: 1px solid var(--ss-line); border-bottom: 2px solid transparent; min-width: 0; }
  .gs-sys-tile:last-child { border-right: 0; }
  .gs-sys-tile:hover { background: var(--ss-hover); }
  .gs-sys-tile:focus-visible { outline: 2px solid var(--gs-focus); outline-offset: -2px; }
  .gs-sys-tile.selected { border-bottom-color: var(--ss-accent); background: color-mix(in srgb, var(--ss-fg) 6%, transparent); }
  .gs-sys-tile-art { height: 88px; width: 100%; display: flex; align-items: flex-end; justify-content: center; overflow: hidden; margin-bottom: 4px; }
  .gs-sys-tile-name { font: 500 var(--ss-ui-sm) var(--ss-font-mono); }
  .gs-sys-tile-meta { font: var(--ss-ui-xs) var(--ss-font-mono); color: var(--ss-fg-muted); font-variant-numeric: tabular-nums; }
  .gs-sys-view { gap: 8px 20px; }
  .gs-sys-ctl, .gs-sys-check { display: inline-flex; align-items: center; gap: 8px; color: var(--ss-fg-muted); white-space: nowrap; }
  .gs-sys-check { cursor: pointer; }
  /* ── o elenco em fila (Visão geral) ── */
  .gs-sys-lineup::before { content: ''; position: absolute; left: 0; right: 0; top: calc(16px + var(--stage)); height: 4px; background: #3d3358; min-width: 100%; }
  .gs-sys-cast-stage { height: var(--stage); display: flex; align-items: flex-end; margin-bottom: 12px; }
  /* ── Cenário ── */
  .gs-sys-diorama { position: relative; height: 280px; overflow: hidden; background: linear-gradient(#120b20, #1a1028 60%); border-bottom: 1px solid var(--ss-line); }
  .gs-sys-layer { position: absolute; inset: 0; background-repeat: repeat-x; background-position: left bottom; image-rendering: pixelated; }
  .gs-sys-moon { position: absolute; right: 12%; top: 28px; }
  .gs-sys-diorama-ledge { position: absolute; left: 0; bottom: 0; line-height: 0; }
  .gs-sys-crop { display: block; background-repeat: no-repeat; image-rendering: pixelated; flex: none; }
  .gs-sys-rowname { min-width: 220px; }
  .gs-sys-objects { display: grid; grid-template-columns: repeat(auto-fill, minmax(128px, 1fr)); gap: 8px; }
  .gs-sys-objects figure { margin: 0; display: flex; flex-direction: column; gap: 6px; }
  .gs-sys-object { height: 112px; display: flex; align-items: center; justify-content: center; overflow: hidden; background: #1a1028; border: 1px solid var(--ss-line); }
  .gs-sys-objects figcaption { font: var(--ss-ui-xs) var(--ss-font-mono); color: var(--ss-fg-muted); }
  .gs-sys-objects figcaption strong { display: block; font-weight: 500; color: var(--ss-fg); }
  .gs-sys-emotes { display: inline-flex; align-items: flex-end; gap: 12px; padding: 8px 12px; background: #1a1028; border: 1px solid var(--ss-line); }
  .gs-sys-emote { display: inline-flex; flex-direction: column; align-items: center; gap: 4px; }
  .gs-sys-key { font: var(--ss-ui-xs) var(--ss-font-mono); color: rgb(255 255 255 / 0.55); border: 1px solid rgb(255 255 255 / 0.2); padding: 0 5px; line-height: 16px; }
  /* ── Sons ── */
  .gs-sys-player { display: flex; align-items: center; gap: 12px; }
  .gs-sys-player input[type='range'] { flex: 1; min-width: 0; }
  .gs-sys-sfx { display: grid; grid-template-columns: 220px minmax(200px, 1fr) auto minmax(0, 1.4fr) auto; align-items: center; gap: 16px; padding: 12px 0; border-top: 1px solid var(--ss-line); }
  .gs-sys-sfx:first-child { border-top: 0; padding-top: 0; }
  .gs-sys-wave { all: unset; cursor: pointer; line-height: 0; padding: 6px 0; }
  .gs-sys-wave:focus-visible { outline: 2px solid var(--gs-focus); outline-offset: 2px; }
  .gs-sys-sfx-name { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .gs-sys-sfx-params { min-width: 0; font-size: var(--ss-ui-xs); color: var(--ss-fg-muted); }
  .gs-sys-sfx-params summary { cursor: pointer; }
  .gs-sys-params { display: block; margin-top: 4px; font: var(--ss-ui-xs)/1.6 var(--ss-font-mono); color: var(--ss-fg-muted); }
  /* ── Arquivos ── */
  .gs-sys-files :global(td) { height: 40px; }
  .gs-sys-group :global(td) { height: 36px; padding-top: 16px; border-top: 0 !important; }
  .gs-sys-group strong { font-weight: 500; margin-right: 12px; }
  .gs-sys-thumb { display: block; width: 28px; height: 28px; object-fit: contain; background: #1a1028; }
  .gs-sys-path { font-family: var(--ss-font-mono); color: var(--ss-fg); text-decoration: none; margin-right: 8px; }
  .gs-sys-path:hover { text-decoration: underline; }
  .gs-sys-bar { display: block; width: 120px; height: 4px; background: color-mix(in srgb, var(--ss-fg) 10%, transparent); }
  .gs-sys-bar > span { display: block; height: 100%; background: color-mix(in srgb, var(--ss-fg) 55%, transparent); }
</style>
