<script lang="ts">
  import type { RoomSnapshot } from '@guess/protocol';
  import { t } from '../i18n.svelte';
  import type { GameRequest } from '../room/remote';
  import type { RoomView } from '../room/view';
  import ModPanel from './ModPanel.svelte';
  import Postit from './Postit.svelte';
  import Ranking from './Ranking.svelte';

  /**
   * O jogo, na coluna: todos os post-its com o dono (o meu "?" até ser revelado), o ranking até aqui e, para o
   * moderador, os seus poderes. A vez e a votação ficam em cima, no meio do telhado (`TurnBar`).
   */
  let { v, room, send }: { v: RoomView; room: RoomSnapshot; send: (r: GameRequest) => void } = $props();
  const place = $derived(new Map(v.ranking.map((r) => [r.member.id, r.place])));
</script>

<div class="gs-stack">
  {#if v.isGhost}<p class="gs-banner">{t('ghost.banner')}</p>{/if}

  <div class="gs-cols">
    <section class="ss-card gs-block wide">
      <div class="head"><div class="heading"><span class="title">{t('play.postits')}</span></div></div>
      <div class="body">
        <div class="gs-board">
          {#each v.postits as c (c.owner.id)}
            <Postit card={c}>
              {#if c.turn}<span class="ss-badge brand">{t('play.turnBadge')}</span>{/if}
              {#if c.status === 'got'}<span class="ss-badge positive">{t('play.gotBadge', { place: place.get(c.owner.id) ?? '' })}</span>{/if}
              {#if c.status === 'gaveUp'}<span class="ss-badge neutral">{t('rank.gaveUp')}</span>{/if}
            </Postit>
          {/each}
        </div>
      </div>
    </section>
    <section class="ss-card gs-block">
      <div class="head"><div class="heading"><span class="title">{t('rank.title')}</span></div></div>
      <div class="body"><Ranking rows={v.ranking} {room} /></div>
    </section>
  </div>

  {#if v.isModerator}<ModPanel {v} {room} {send} />{/if}
</div>
