<script lang="ts">
  import type { RoomSnapshot } from '@guess/protocol';
  import { t } from '../i18n.svelte';
  import type { GameRequest } from '../room/remote';
  import type { RoomView } from '../room/view';
  import Postit from './Postit.svelte';
  import Ranking from './Ranking.svelte';

  /** O fim: o ranking, todos os post-its à mostra e "Jogar de novo com a mesma turma". */
  let { v, room, send }: { v: RoomView; room: RoomSnapshot; send: (r: GameRequest) => void } = $props();
</script>

<div class="gs-stack">
  <section class="ss-card elevated gs-block">
    <div class="head">
      <div class="heading"><span class="title">{t('end.title')}</span><span class="desc">{t('end.hint')}</span></div>
      <button class="ss-btn primary" type="button" onclick={() => send({ type: 'playAgain' })}>{t('end.playAgain')}</button>
    </div>
    <div class="body"><Ranking rows={v.ranking} {room} /></div>
  </section>
  <section class="ss-card gs-block">
    <div class="head"><div class="heading"><span class="title">{t('end.postits')}</span></div></div>
    <div class="body">
      <div class="gs-board">
        {#each v.postits as c (c.owner.id)}
          <Postit card={c}>{#if c.author}<span class="gs-hint">{t('writing.by', { author: c.author.nickname })}</span>{/if}</Postit>
        {/each}
      </div>
    </div>
  </section>
</div>
