<script lang="ts">
  import { t } from '../i18n.svelte';
  import type { RoomView } from '../room/view';
  import { tiltOf } from '../world/heads';
  import Swatch from './Swatch.svelte';

  /**
   * A faixa da turma, embaixo: o post-it de cada jogador na ordem das vezes (pequeno; o meu "?" até ser revelado), a vez
   * de agora em destaque, quem acertou (com o lugar) e quem desistiu marcados, quem caiu apagado, e os fantasmas à parte.
   * É onde todo post-it está sempre à vista, mesmo de quem saiu da tela (ADR 0006).
   */
  let { v }: { v: RoomView } = $props();
  const place = $derived(new Map(v.ranking.map((r) => [r.member.id, r.place])));
</script>

<nav class="ss-card gs-roster" aria-label={t('roster.title')}>
  <ol class="cards">
    {#each v.postits as c (c.owner.id)}
      <li class="gs-mini" class:turn={c.turn} class:got={c.status === 'got'} class:gaveup={c.status === 'gaveUp'} class:off={!c.owner.connected}>
        <div class="paper" class:hidden={c.hidden} style:--tilt="{tiltOf(c.owner.id)}deg" title={c.hidden ? t('postit.hidden') : (c.text ?? '')}>
          {#if c.hidden}
            <span class="q">?</span>
          {:else}
            {#if c.image}<img src={c.image} alt="" />{/if}
            {#if c.text}<span class="text">{c.text}</span>{:else if !c.image}<span class="blank">…</span>{/if}
          {/if}
          {#if c.status === 'got'}<span class="mark got" title={t('play.gotBadge', { place: place.get(c.owner.id) ?? '' })}>✓{place.get(c.owner.id) ?? ''}</span>{/if}
          {#if c.status === 'gaveUp'}<span class="mark gaveup" title={t('rank.gaveUp')}>✕</span>{/if}
        </div>
        <span class="name"><Swatch n={c.owner.character} size={14} />{c.mine ? t('postit.mine') : c.owner.nickname}</span>
      </li>
    {/each}
  </ol>
  {#if v.ghosts.length}
    <div class="ghosts">
      <span class="lbl">{t('lobby.ghosts')}</span>
      {#each v.ghosts as g (g.id)}
        <span class="gs-ghost" class:off={!g.connected}><Swatch n={g.character} size={14} />{g.id === v.me?.id ? t('postit.mine') : g.nickname}</span>
      {/each}
    </div>
  {/if}
</nav>
