<script lang="ts">
  import type { RoomSnapshot } from '@guess/protocol';
  import { onMount, untrack } from 'svelte';
  import { i18n, t } from '../i18n.svelte';
  import type { RemoteRoom } from '../room/remote';
  import type { RoomView } from '../room/view';
  import { playSfx } from '../sound/player';
  import { character, properName } from '../sprites/characters';
  import { alive, nextExpiry, say, type Bubble } from './bubbles';
  import { heads } from './heads';
  import { WorldRuntime, type SceneStatus } from './runtime';

  /**
   * O telhado sempre ligado, atrás de tudo: o canvas do Pixi e, por cima, a camada dos post-its sobre as cabeças. O
   * Svelte só desenha o conteúdo de cada post-it (muda com o snapshot); onde cada um fica, quadro a quadro, é com o
   * `WorldRuntime`. `blocked`: um modal está aberto (o telhado não ouve o teclado); `insetLeft`: a coluna da esquerda.
   *
   * O post-it sobre a cabeça é um tooltip do dssoca (superfície, borda, fonte mono), sem papel amarelo: o meu é "?" até
   * ser revelado, o da vez fica com a cor de destaque, e cresce com o mouse em cima (só ele recebe o mouse; a camada não).
   * No lobby, só o apelido. Um bot engraçado leva só o nome do personagem dele.
   *
   * A fala de alguém vira um balão na mesma etiqueta, logo acima da cabeça (debaixo do apelido, que sobe enquanto ele
   * está lá): papel branco, contorno escuro e rabicho como os balões dos emotes, na fonte de pixel Tiny5 (`app.css`,
   * `.gs-bubble`). Sempre como texto, nunca HTML. Quanto dura e a troca pela fala seguinte é com `bubbles.ts`.
   */
  let { remote, room, v, blocked, insetLeft }: { remote: RemoteRoom; room: RoomSnapshot; v: RoomView; blocked: boolean; insetLeft: number } = $props();

  let host = $state<HTMLDivElement>();
  let layer = $state<HTMLDivElement>();
  let status = $state<SceneStatus>('loading');
  let runtime: WorldRuntime | null = null;
  const list = $derived(heads(room, v));
  /** os balões de fala que estão na tela, e o timer do próximo a vencer */
  let bubbles = $state.raw<readonly Bubble[]>([]);
  let bubbleTimer: ReturnType<typeof setTimeout> | undefined;
  const bubbleOf = $derived(new Map(bubbles.map((b) => [b.id, b])));
  function scheduleBubbles() {
    clearTimeout(bubbleTimer);
    const at = nextExpiry(bubbles);
    if (at === null) return;
    bubbleTimer = setTimeout(() => { bubbles = alive(bubbles, performance.now()); scheduleBubbles(); }, Math.max(0, at - performance.now()) + 1);
  }
  /** o nome de um personagem, para a etiqueta de um bot: o herói e o esqueleto pelo que são (traduzido); os outros pelo nome próprio */
  const nameOf = (n: number) => {
    const c = character(n);
    return c.model === 'hero' ? t('char.hero') : c.model === 'skeleton' ? t('char.skeleton') : properName(c.name);
  };

  onMount(() => {
    runtime = new WorldRuntime({
      remote, host: host!, heads: layer!, lang: untrack(() => i18n.lang),
      onStatus: (s, detail) => { status = s; if (detail) document.documentElement.dataset.renderer = detail; },
      onEvent: (ev) => { if (ev.type === 'jump' || ev.type === 'shove') playSfx(ev.type); },
      onShoved: () => playSfx('shove'), // levei um empurrão que pegou
    });
    const offChat = remote.onChat((e) => { bubbles = say(bubbles, e.member, e.text, performance.now()); scheduleBubbles(); });
    // a fonte dos balões já carregada quando a primeira fala chegar
    document.fonts?.load("8px 'Tiny5'").catch(() => {});
    runtime.setRoom(untrack(() => room));
    runtime.start();
    return () => { offChat(); clearTimeout(bubbleTimer); runtime?.dispose(); runtime = null; };
  });
  $effect(() => { runtime?.setRoom(room); });
  $effect(() => { runtime?.setBlocked(blocked); });
  $effect(() => { runtime?.setInsetLeft(insetLeft); });
  $effect(() => { runtime?.setLang(i18n.lang); });
</script>

<div class="gs-world" bind:this={host} aria-hidden="true"></div>
<div class="gs-heads" bind:this={layer} aria-hidden="true">
  {#each list as h (h.id)}
    {@const said = bubbleOf.get(h.id)}
    <div class="gs-head" data-member={h.id}>
      <div class="inner" class:mine={h.mine} class:turn={h.card?.turn} class:done={h.card && h.card.status !== 'playing'}>
        {#if h.card}
          <div class="tip" class:hidden={h.card.hidden}>
            {#if h.card.hidden}
              <span class="q">?</span>
            {:else}
              {#if h.card.image}<img src={h.card.image} alt="" />{/if}
              {#if h.card.text}<span class="text">{h.card.text}</span>{:else if !h.card.image}<span class="blank">…</span>{/if}
            {/if}
          </div>
        {/if}
        <span class="tag">{h.bot !== null ? nameOf(h.bot) : h.mine ? t('postit.mine') : h.nickname}</span>
        {#if said}{#key said.seq}<div class="gs-bubble"><span class="say">{said.text}</span></div>{/key}{/if}
      </div>
    </div>
  {/each}
</div>
{#if status === 'failed'}<p class="gs-world-failed" role="status">{t('world.failed')}</p>{/if}
