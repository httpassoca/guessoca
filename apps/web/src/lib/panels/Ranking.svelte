<script lang="ts">
  import type { RoomSnapshot } from '@guess/protocol';
  import { t } from '../i18n.svelte';
  import type { RankingRow } from '../room/view';
  import Who from './Who.svelte';

  /** O ranking: quem acertou, na ordem; depois quem desistiu, na ordem em que desistiu. */
  let { rows, room }: { rows: RankingRow[]; room: RoomSnapshot } = $props();
</script>

{#if rows.length}
  <ol class="gs-ranking">
    {#each rows as r (r.member.id)}
      <li class:gaveup={r.gaveUp}>
        <span class="place">{r.place}º</span>
        <Who m={r.member} {room} />
        {#if r.gaveUp}<span class="ss-badge neutral">{t('rank.gaveUp')}</span>{/if}
      </li>
    {/each}
  </ol>
{:else}
  <p class="gs-hint">{t('rank.empty')}</p>
{/if}
