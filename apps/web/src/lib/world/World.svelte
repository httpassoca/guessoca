<script lang="ts">
  import type { RoomSnapshot } from '@guess/protocol';
  import { onMount, untrack } from 'svelte';
  import { i18n, t } from '../i18n.svelte';
  import type { RemoteRoom } from '../room/remote';
  import type { RoomView } from '../room/view';
  import { playSfx } from '../sound/player';
  import { heads, tiltOf } from './heads';
  import { WorldRuntime, type SceneStatus } from './runtime';

  /**
   * O telhado sempre ligado, atrás de tudo: o canvas do Pixi e, por cima, a camada dos post-its sobre as cabeças. O
   * Svelte só desenha o conteúdo de cada post-it (muda com o snapshot); onde cada um fica, quadro a quadro, é com o
   * `WorldRuntime`. `blocked`: um modal está aberto (o telhado não ouve o teclado); `insetRight`: a coluna da direita.
   */
  let { remote, room, v, blocked, insetRight }: { remote: RemoteRoom; room: RoomSnapshot; v: RoomView; blocked: boolean; insetRight: number } = $props();

  let host = $state<HTMLDivElement>();
  let layer = $state<HTMLDivElement>();
  let status = $state<SceneStatus>('loading');
  let runtime: WorldRuntime | null = null;
  const list = $derived(heads(room, v));

  onMount(() => {
    runtime = new WorldRuntime({
      remote, host: host!, heads: layer!, lang: untrack(() => i18n.lang),
      onStatus: (s, detail) => { status = s; if (detail) document.documentElement.dataset.renderer = detail; },
      onEvent: (ev) => { if (ev.type === 'jump' || ev.type === 'shove') playSfx(ev.type); },
    });
    const offShoved = remote.onShoved(() => playSfx('shove')); // levei um empurrão
    runtime.setRoom(untrack(() => room));
    runtime.start();
    return () => { offShoved(); runtime?.dispose(); runtime = null; };
  });
  $effect(() => { runtime?.setRoom(room); });
  $effect(() => { runtime?.setBlocked(blocked); });
  $effect(() => { runtime?.setInsetRight(insetRight); });
  $effect(() => { runtime?.setLang(i18n.lang); });
</script>

<div class="gs-world" bind:this={host} aria-hidden="true"></div>
<div class="gs-heads" bind:this={layer} aria-hidden="true">
  {#each list as h (h.id)}
    <div class="gs-head" data-member={h.id}>
      <div class="inner" class:mine={h.mine}>
        {#if h.card}
          <div class="paper" class:hidden={h.card.hidden} style:--tilt="{tiltOf(h.id)}deg">
            {#if h.card.hidden}
              <span class="q">?</span>
            {:else}
              {#if h.card.image}<img src={h.card.image} alt="" />{/if}
              {#if h.card.text}<span class="text">{h.card.text}</span>{:else if !h.card.image}<span class="blank">…</span>{/if}
            {/if}
          </div>
        {/if}
        <span class="tag">{h.mine ? t('postit.mine') : h.nickname}</span>
      </div>
    </div>
  {/each}
</div>
{#if status === 'failed'}<p class="gs-world-failed" role="status">{t('world.failed')}</p>{/if}
