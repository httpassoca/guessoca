<script lang="ts">
  import type { RoomSnapshot } from '@guess/protocol';
  import { t } from '../i18n.svelte';
  import type { RankingRow } from '../room/view';
  import Who from './Who.svelte';

  /**
   * O ranking, no canto de cima à direita durante o jogo e no fim: quem acertou, na ordem, com o lugar; embaixo de uma
   * linha, quem desistiu, na ordem em que desistiu e sem lugar (desistir não é ficar em primeiro). Meio transparente
   * para não tapar o telhado; inteiro com o mouse em cima.
   */
  let { rows, room }: { rows: RankingRow[]; room: RoomSnapshot } = $props();
  const got = $derived(rows.filter((r) => !r.gaveUp));
  const gaveUp = $derived(rows.filter((r) => r.gaveUp));
</script>

<section class="gs-float gs-ranking-card" aria-label={t('rank.title')}>
  <h3 class="gs-float-title">{room.phase === 'ended' ? t('rank.final') : t('rank.title')}</h3>
  {#if got.length}
    <ol class="gs-ranking">
      {#each got as r (r.member.id)}
        <li><span class="place">{r.place}º</span><Who m={r.member} {room} compact /></li>
      {/each}
    </ol>
  {:else}
    <p class="gs-hint">{room.phase === 'ended' ? t('rank.emptyFinal') : t('rank.empty')}</p>
  {/if}
  {#if gaveUp.length}
    <ul class="gs-ranking gaveup" aria-label={t('rank.gaveUpList')}>
      {#each gaveUp as r (r.member.id)}
        <li><Who m={r.member} {room} compact /><span class="gs-tag">{t('rank.gaveUp')}</span></li>
      {/each}
    </ul>
  {/if}
</section>
