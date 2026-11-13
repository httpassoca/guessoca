<script lang="ts">
  import type { RoomSnapshot } from '@guess/protocol';
  import { Tooltip } from 'dssoca';
  import type { MsgKey } from '../i18n';
  import { t } from '../i18n.svelte';
  import { STAT_COLUMNS, type Award, type EndStats, type StatColumn } from '../room/stats';
  import Who from './Who.svelte';

  /**
   * As estatísticas do jogo que acabou, na coluna do fim (issue #59): os destaques em cima (quem mais caiu, quem mais
   * empurrou, a vítima preferida dos bots) e uma tabela com uma linha por pessoa: vezes, quedas, empurrões dados e
   * levados (da turma e dos bots). O maior de cada coluna do telhado em destaque (as vezes, não: não é façanha); cada cabeçalho se explica no tooltip.
   */
  let { stats, room }: { stats: EndStats; room: RoomSnapshot } = $props();

  const HEAD: Record<StatColumn, MsgKey> = { turns: 'stats.turns', falls: 'stats.falls', shoves: 'stats.shoves', shovedByPlayers: 'stats.shovedByPlayers', shovedByBots: 'stats.shovedByBots' };
  const TIP: Record<StatColumn, MsgKey> = { turns: 'stats.turnsTip', falls: 'stats.fallsTip', shoves: 'stats.shovesTip', shovedByPlayers: 'stats.shovedByPlayersTip', shovedByBots: 'stats.shovedByBotsTip' };
  const AWARD: Record<Award['kind'], MsgKey> = { falls: 'stats.awardFalls', shoves: 'stats.awardShoves', botVictim: 'stats.awardBotVictim' };
  const columns = $derived(STAT_COLUMNS.filter((c) => c !== 'turns' || stats.hasTurns));
</script>

{#if stats.awards.length}
  <ul class="gs-awards">
    {#each stats.awards as a (a.kind)}
      <li>
        <span class="what">{t(AWARD[a.kind])}</span>
        <span class="who">{#each a.winners as m (m.id)}<Who {m} {room} compact />{/each}</span>
        <span class="n">{a.value}</span>
      </li>
    {/each}
  </ul>
{/if}

<table class="gs-stats">
  <thead>
    <tr>
      <th scope="col" aria-label={t('stats.player')}></th>
      {#each columns as c (c)}
        <th scope="col" class="num"><Tooltip text={t(TIP[c])}><span>{t(HEAD[c])}</span></Tooltip></th>
      {/each}
    </tr>
  </thead>
  <tbody>
    {#each stats.rows as r (r.member.id)}
      <tr>
        <th scope="row"><Who m={r.member} {room} compact /></th>
        {#each columns as c (c)}
          <td class="num" class:top={c !== 'turns' && r[c] > 0 && r[c] === stats.top[c]} class:zero={r[c] === 0}>{r[c]}</td>
        {/each}
      </tr>
    {/each}
  </tbody>
</table>
