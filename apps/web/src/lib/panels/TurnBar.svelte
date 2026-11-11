<script lang="ts">
  import type { RoomSnapshot } from '@guess/protocol';
  import Confirm from '../hud/Confirm.svelte';
  import Icon from '../hud/Icon.svelte';
  import Kbd from '../hud/Kbd.svelte';
  import { t } from '../i18n.svelte';
  import type { GameRequest } from '../room/remote';
  import { clockText, turnFraction, turnTone, type RoomView } from '../room/view';

  /**
   * A vez e a votação, em cima e no meio do telhado: de quem é a vez, o relógio, Acertei / Passar / Desistir e a
   * votação "X acertou?". `turnLeft` e `voteLeft` já vêm contados para agora. O fio na borda de baixo da barra é o
   * tempo da vez: começa na largura toda e encolhe até zero (`turnLeft / room.turnMs`), verde-limão, laranja nos últimos 35% e vermelha nos últimos 10% (`turnTone`).
   */
  let { v, room, send, turnLeft, voteLeft }: { v: RoomView; room: RoomSnapshot; send: (r: GameRequest) => void; turnLeft: number; voteLeft: number } = $props();
</script>

<div class="gs-turnbar">
  <section class="gs-float gs-turn" class:live={!!v.turn} class:mine={v.turn?.mine}>
    {#if v.turn}
      <span class="gs-clock big" class:gs-warn={v.turn.running && turnLeft < 10_000} class:paused={room.paused}>{clockText(turnLeft)}</span>
      <span class="who">{v.turn.mine ? t('play.yourTurn') : t('play.turnOf', { name: v.turn.owner.nickname })}</span>
      {#if room.paused}<span class="gs-tag">{t('play.paused')}</span>{/if}
    {:else}
      <span class="gs-hint">{t('play.noTurn')}</span>
    {/if}
    {#if v.isPlayer && !v.done}
      <span class="acts">
        <button class="ss-btn primary" type="button" disabled={!v.canClaim} onclick={() => send({ type: 'claim' })}>{t('play.claim')}</button>
        <button class="ss-btn" type="button" disabled={!v.canSkip} onclick={() => send({ type: 'skip' })}>{t('play.skip')} <Kbd keys={['Tab']} /></button>
        <Confirm label={t('play.giveUp')} disabled={!v.canGiveUp} onconfirm={() => send({ type: 'giveUp' })} />
      </span>
    {:else if v.done}
      <span class="gs-hint">{t('play.youAreDone')}</span>
    {/if}
    {#if v.turn}{@const frac = turnFraction(turnLeft, room.turnMs)}<span class="gs-turn-left {turnTone(frac)}" class:paused={room.paused} style:width="{frac * 100}%" aria-hidden="true"></span>{/if}
  </section>

  {#if v.vote}
    <section class="gs-float gs-vote">
      <div class="gs-vote-head">
        <span class="title">{v.vote.mine ? t('vote.youClaimed') : t('vote.question', { name: v.vote.claimer.nickname })}</span>
        <span class="gs-clock">{clockText(voteLeft)}</span>
      </div>
      <p class="gs-hint">{t('vote.hint')}</p>
      <div class="gs-vote-foot">
        {#if v.vote.canVote}
          <span class="acts">
            <button class="ss-btn primary" type="button" onclick={() => send({ type: 'vote', yes: true })}>{t('vote.yes')}</button>
            <button class="ss-btn" type="button" onclick={() => send({ type: 'vote', yes: false })}>{t('vote.no')}</button>
          </span>
        {:else if v.vote.voted}
          <span class="gs-hint">{v.vote.yours === false ? t('vote.youVotedNo') : t('vote.youVotedYes')}</span>
        {:else}
          <span class="gs-hint">{v.vote.mine ? t('vote.waitingClaimer') : t('vote.waiting')}</span>
        {/if}
        <ul class="gs-voters">
          {#each v.vote.voters as x (x.member.id)}
            <li class:done={x.voted}>{#if x.voted}<Icon name="check" />{:else}<span class="dot" aria-hidden="true"></span>{/if}{x.member.nickname}</li>
          {/each}
        </ul>
      </div>
    </section>
  {/if}
</div>
