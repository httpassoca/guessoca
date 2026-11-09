<script lang="ts">
  import type { RoomSnapshot } from '@guess/protocol';
  import { t } from '../i18n.svelte';
  import type { RankingRow } from '../room/view';
  import Who from './Who.svelte';

  /**
   * O ranking, no canto de cima à direita durante o jogo e no fim: quem acertou, na ordem; depois quem desistiu, na
   * ordem em que desistiu. Meio transparente para não tapar o telhado; inteiro com o mouse em cima.
   */
  let { rows, room }: { rows: RankingRow[]; room: RoomSnapshot } = $props();
</script>

<section class="gs-float gs-ranking-card" aria-label={t('rank.title')}>
  <h3 class="gs-float-title">{room.phase === 'ended' ? t('rank.final') : t('rank.title')}</h3>
  {#if rows.length}
    <ol class="gs-ranking">
      {#each rows as r (r.member.id)}
        <li class:gaveup={r.gaveUp}>
          <span class="place">{r.place}º</span>
          <Who m={r.member} {room} compact />
          {#if r.gaveUp}<span class="gs-tag">{t('rank.gaveUp')}</span>{/if}
        </li>
      {/each}
    </ol>
  {:else}
    <p class="gs-hint">{room.phase === 'ended' ? t('rank.emptyFinal') : t('rank.empty')}</p>
  {/if}
</section>
