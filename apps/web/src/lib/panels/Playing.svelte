<script lang="ts">
  import type { RoomSnapshot } from '@guess/protocol';
  import Confirm from '../hud/Confirm.svelte';
  import Kbd from '../hud/Kbd.svelte';
  import { t } from '../i18n.svelte';
  import type { GameRequest } from '../room/remote';
  import { clockText, type RoomView } from '../room/view';
  import ModPanel from './ModPanel.svelte';
  import Postit from './Postit.svelte';
  import Ranking from './Ranking.svelte';

  /**
   * O jogo: a vez com o relógio e os botões Acertei / Passar / Desistir, a votação "X acertou?", todos os post-its com o
   * dono (o meu "?" até ser revelado), o ranking até aqui e, para o moderador, os seus poderes.
   * `turnLeft` e `voteLeft` já vêm contados para agora.
   */
  let { v, room, send, turnLeft, voteLeft }: { v: RoomView; room: RoomSnapshot; send: (r: GameRequest) => void; turnLeft: number; voteLeft: number } = $props();
  const place = $derived(new Map(v.ranking.map((r) => [r.member.id, r.place])));
</script>

<div class="gs-stack">
  {#if v.isGhost}<p class="gs-banner">{t('ghost.banner')}</p>{/if}

  <section class="ss-card gs-block gs-turn" class:mine={v.turn?.mine}>
    <div class="body">
      {#if v.turn}
        <div class="gs-turn-line">
          <span class="who">{v.turn.mine ? t('play.yourTurn') : t('play.turnOf', { name: v.turn.owner.nickname })}</span>
          <span class="gs-clock big" class:gs-warn={v.turn.running && turnLeft < 10_000}>{clockText(turnLeft)}</span>
          {#if room.paused}<span class="ss-badge caution">{t('play.paused')}</span>{/if}
        </div>
      {:else}
        <p class="gs-hint">{t('play.noTurn')}</p>
      {/if}
      {#if v.isPlayer && !v.done}
        <div class="gs-row">
          <button class="ss-btn primary" type="button" disabled={!v.canClaim} onclick={() => send({ type: 'claim' })}>{t('play.claim')} <Kbd keys={['↵']} /></button>
          <button class="ss-btn" type="button" disabled={!v.canSkip} onclick={() => send({ type: 'skip' })}>{t('play.skip')} <Kbd keys={['Tab']} /></button>
          <Confirm label={t('play.giveUp')} disabled={!v.canGiveUp} onconfirm={() => send({ type: 'giveUp' })} />
        </div>
      {:else if v.done}
        <p class="gs-hint">{t('play.youAreDone')}</p>
      {/if}
    </div>
  </section>

  {#if v.vote}
    <section class="ss-card elevated gs-block gs-vote">
      <div class="head">
        <div class="heading"><span class="title">{v.vote.mine ? t('vote.youClaimed') : t('vote.question', { name: v.vote.claimer.nickname })}</span><span class="desc">{t('vote.hint')}</span></div>
        <span class="gs-clock">{clockText(voteLeft)}</span>
      </div>
      <div class="body">
        {#if v.vote.canVote}
          <div class="gs-row">
            <button class="ss-btn primary" type="button" onclick={() => send({ type: 'vote', yes: true })}>{t('vote.yes')}</button>
            <button class="ss-btn" type="button" onclick={() => send({ type: 'vote', yes: false })}>{t('vote.no')}</button>
          </div>
        {:else if v.vote.voted}
          <p class="gs-hint">{v.vote.yours === false ? t('vote.youVotedNo') : t('vote.youVotedYes')}</p>
        {:else}
          <p class="gs-hint">{v.vote.mine ? t('vote.waitingClaimer') : t('vote.waiting')}</p>
        {/if}
        <ul class="gs-voters">
          {#each v.vote.voters as x (x.member.id)}
            <li class:done={x.voted}>{x.voted ? '✓' : '…'} {x.member.nickname}</li>
          {/each}
        </ul>
      </div>
    </section>
  {/if}

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
