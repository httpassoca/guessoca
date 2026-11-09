<script lang="ts">
  import type { Snippet } from 'svelte';
  import { t } from '../i18n.svelte';
  import type { PostitCard } from '../room/view';
  import { tiltOf } from '../world/heads';
  import Swatch from './Swatch.svelte';

  /**
   * Um post-it de papel amarelo, meio torto, com o dono embaixo. O meu, antes de revelado, é só "?": nem o texto nem a
   * imagem chegam pela rede. `children`: as marcas que o painel quiser (pronto, acertou, desistiu…).
   */
  let { card, children }: { card: PostitCard; children?: Snippet } = $props();

  /** um ângulo por dono, sempre o mesmo */
  const tilt = $derived(tiltOf(card.owner.id));
</script>

<figure class="gs-postit" class:turn={card.turn} class:got={card.status === 'got'} class:gaveup={card.status === 'gaveUp'} class:off={!card.owner.connected} style="--tilt: {tilt}deg">
  <div class="paper" class:hidden={card.hidden} aria-label={card.hidden ? t('postit.hidden') : undefined}>
    {#if card.hidden}
      <span class="q">?</span>
    {:else}
      {#if card.image}<img src={card.image} alt="" />{/if}
      {#if card.text}<span class="text">{card.text}</span>{:else if !card.image}<span class="blank">…</span>{/if}
    {/if}
  </div>
  <figcaption>
    <Swatch n={card.owner.character} />
    <span class="name">{card.mine ? t('postit.mine') : card.owner.nickname}</span>
    {#if !card.owner.connected}<span class="ss-badge neutral">{t('badge.offline')}</span>{/if}
    {@render children?.()}
  </figcaption>
</figure>
