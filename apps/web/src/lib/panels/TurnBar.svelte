<script lang="ts">
  import type { RoomSnapshot } from '@guess/protocol';
  import Confirm from '../hud/Confirm.svelte';
  import Icon from '../hud/Icon.svelte';
  import Kbd from '../hud/Kbd.svelte';
  import { t } from '../i18n.svelte';
  import type { GameRequest } from '../room/remote';
  import { clockText, turnFraction, turnTone, type RoomView } from '../room/view';

  /**
   * A vez e a votação, em cima e no meio do telhado: de quem é a vez e quem vem depois, o relógio, Acertei / Passar
   * (só na minha vez) / Desistir e a votação "X acertou?", com o post-it que está sendo julgado (menos para quem pediu).
   * `turnLeft` e `voteLeft` já vêm contados para agora. O fio na borda de baixo da barra é o tempo da vez: começa na
   * largura toda e encolhe até zero (`turnLeft / room.turnMs`), verde-limão, laranja nos últimos 35% e vermelha nos
   * últimos 10% (`turnTone`). Quando a vez vira minha, a barra pisca (CSS, `.gs-turn.mine`).
   *
   * Com o jogo pausado, uma faixa embaixo da barra diz isso (o moderador continua dali). Com a coluna recolhida, o
   * moderador tem um atalho para ela ao lado da barra ("Moderação", P): as ferramentas dele moram lá.
   * O voto muda até a votação fechar (ADR 0008, emenda): o botão do voto dado fica marcado.
   */
  let { v, room, send, turnLeft, voteLeft, sideOpen, onmod }: {
    v: RoomView; room: RoomSnapshot; send: (r: GameRequest) => void; turnLeft: number; voteLeft: number; sideOpen: boolean; onmod: () => void;
  } = $props();
</script>

<div class="gs-turnbar">
  <div class="gs-turn-row">
    <section class="gs-float gs-turn" class:live={!!v.turn} class:mine={v.turn?.mine}>
      {#if v.turn}
        <span class="gs-clock big" class:gs-warn={v.turn.running && turnLeft < 10_000} class:paused={room.paused}>{clockText(turnLeft)}</span>
        <span class="who">
          {v.turn.mine ? t('play.yourTurn') : t('play.turnOf', { name: v.turn.owner.nickname })}
          {#if v.turn.next}<span class="next">{v.turn.next.id === room.you ? t('play.nextYou') : t('play.next', { name: v.turn.next.nickname })}</span>{/if}
        </span>
      {:else}
        <span class="gs-hint">{t('play.noTurn')}</span>
      {/if}
      {#if v.isPlayer && !v.done}
        <span class="acts">
          {#if v.turn?.mine}
            <button class="ss-btn primary" type="button" disabled={!v.canClaim} onclick={() => send({ type: 'claim' })}>{t('play.claim')}</button>
            <button class="ss-btn" type="button" disabled={!v.canSkip} onclick={() => send({ type: 'skip' })}>{t('play.skip')} <Kbd keys={['Tab']} /></button>
          {/if}
          <Confirm label={t('play.giveUp')} disabled={!v.canGiveUp} onconfirm={() => send({ type: 'giveUp' })} />
        </span>
      {:else if v.done}
        <span class="gs-hint">{t('play.youAreDone')}</span>
      {/if}
      {#if v.turn}{@const frac = turnFraction(turnLeft, room.turnMs)}<span class="gs-turn-left {turnTone(frac)}" class:paused={room.paused} style:width="{frac * 100}%" aria-hidden="true"></span>{/if}
    </section>
    {#if v.isModerator && !sideOpen}
      <button class="ss-btn gs-float gs-mod-chip" type="button" aria-controls="gs-side" aria-expanded="false" aria-keyshortcuts="P" onclick={onmod}>
        {t('mod.title')} <Kbd keys={['P']} />
      </button>
    {/if}
  </div>

  {#if room.paused}
    <div class="gs-float gs-paused" role="status">
      <Icon name="pause" />
      <span class="what"><strong>{t('play.pausedTitle')}</strong><span class="gs-hint">{v.isModerator ? t('play.pausedHintMod') : t('play.pausedHint')}</span></span>
      {#if v.isModerator}<button class="ss-btn primary gs-sm" type="button" onclick={() => send({ type: 'pause', on: false })}>{t('mod.resume')}</button>{/if}
    </div>
  {/if}

  {#if v.vote}
    <section class="gs-float gs-vote">
      <div class="gs-vote-head">
        <span class="title">{v.vote.mine ? t('vote.youClaimed') : t('vote.question', { name: v.vote.claimer.nickname })}</span>
        <span class="gs-clock">{clockText(voteLeft)}</span>
      </div>
      {#if v.vote.card}
        {@const c = v.vote.card}
        <div class="gs-vote-postit">
          <span class="gs-hint">{t('vote.postitOf', { name: v.vote.claimer.nickname })}</span>
          <span class="gs-chip big">{#if c.image}<img src={c.image} alt="" />{/if}{#if c.text}<span class="text">{c.text}</span>{/if}</span>
        </div>
      {/if}
      <p class="gs-hint">{t('vote.hint')}</p>
      <div class="gs-vote-foot">
        {#if v.vote.canVote}
          <span class="acts">
            <button class="ss-btn" class:primary={v.vote.yours !== false} class:chosen={v.vote.yours === true} type="button" aria-pressed={v.vote.yours === true} onclick={() => send({ type: 'vote', yes: true })}>{#if v.vote.yours === true}<Icon name="check" />{/if}{t('vote.yes')}</button>
            <button class="ss-btn" class:primary={v.vote.yours === false} class:chosen={v.vote.yours === false} type="button" aria-pressed={v.vote.yours === false} onclick={() => send({ type: 'vote', yes: false })}>{#if v.vote.yours === false}<Icon name="check" />{/if}{t('vote.no')}</button>
          </span>
          {#if v.vote.voted}<span class="gs-hint">{t('vote.canChange')}</span>{/if}
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
