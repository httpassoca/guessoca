<script lang="ts">
  import type { RoomSnapshot } from '@guess/protocol';
  import Kbd from '../hud/Kbd.svelte';
  import { t } from '../i18n.svelte';
  import type { RoomView } from '../room/view';
  import Who from './Who.svelte';

  /**
   * O cartão do fim, no meio da tela, assim que o jogo acaba: quem acertou primeiro (ou que ninguém acertou) e o
   * post-it de cada um, revelado, com o que deu (acertou em tal lugar, desistiu, não chegou lá). Fecha para a coluna
   * (Esc, ou o botão), onde ficam "Quem era quem", as estatísticas e o "Jogar de novo"; o moderador também joga de
   * novo daqui. Só desenha o que `roomView` já diz.
   */
  let { v, room, onclose, onplayagain }: { v: RoomView; room: RoomSnapshot; onclose: () => void; onplayagain: () => void } = $props();
  const winner = $derived(v.ranking.find((r) => r.place === 1)?.member ?? null);
</script>

<div class="gs-end-wrap">
  <section class="gs-float gs-end" aria-labelledby="gs-end-title">
    <h2 id="gs-end-title" class="gs-end-title">{t('end.title')}</h2>
    {#if winner}
      <p class="gs-end-winner"><span class="gs-hint">{t('end.winner')}</span><Who m={winner} {room} compact /></p>
    {:else}
      <p class="gs-end-winner"><span class="gs-hint">{t('rank.emptyFinal')}</span></p>
    {/if}
    <ul class="gs-end-list" aria-label={t('end.postits')}>
      {#each v.turma as r (r.member.id)}
        {@const c = r.card}
        <li class:got={r.status === 'got'}>
          <Who m={r.member} {room} compact />
          <span class="gs-chip">{#if c?.image}<img src={c.image} alt="" />{/if}<span class="text">{c?.text || '…'}</span></span>
          <span class="res">
            {#if r.status === 'got'}<span class="gs-tag good">{t('play.gotBadge', { place: r.place ?? '' })}</span>
            {:else if r.status === 'gaveUp'}<span class="gs-tag">{t('rank.gaveUp')}</span>
            {:else}<span class="gs-tag">{t('end.missed')}</span>{/if}
          </span>
        </li>
      {/each}
    </ul>
    <div class="gs-end-foot">
      {#if v.isModerator}<button class="ss-btn primary" type="button" onclick={onplayagain}>{t('end.playAgain')}</button>{/if}
      <button class="ss-btn" class:ghost={v.isModerator} type="button" onclick={onclose}>{t('end.close')} <Kbd keys={['Esc']} /></button>
    </div>
  </section>
</div>
