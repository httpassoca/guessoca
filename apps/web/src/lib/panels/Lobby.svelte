<script lang="ts">
  import type { RoomSnapshot } from '@guess/protocol';
  import { MIN_PLAYERS } from '@guess/rules';
  import Switch from '../hud/Switch.svelte';
  import { t } from '../i18n.svelte';
  import { rememberCharacter } from '../identity';
  import type { GameRequest } from '../room/remote';
  import { clockText, turnOptions, type RoomView } from '../room/view';
  import MemberActions from './MemberActions.svelte';
  import OrderList from './OrderList.svelte';
  import Swatch from './Swatch.svelte';
  import Who from './Who.svelte';

  /**
   * O lobby: a turma na ordem das vezes, quem escreve para quem, os personagens e, para o moderador, a ordem
   * (arrastar), trocar e sortear autores, o tamanho da vez, "só moderar" e começar a escrita.
   */
  let { v, room, send }: { v: RoomView; room: RoomSnapshot; send: (r: GameRequest) => void } = $props();

  const turns = turnOptions();
  const turnIdx = $derived(turns.indexOf(room.turnMs));
  /** troca de autores: o primeiro dono escolhido, esperando o segundo */
  let swapping = $state<string | null>(null);

  function pickOwner(id: string) {
    if (!v.isModerator) return;
    if (swapping === null) { swapping = id; return; }
    if (swapping !== id) send({ type: 'swapAuthors', a: swapping, b: id });
    swapping = null;
  }
  function pickCharacter(n: number) {
    rememberCharacter(n);
    if (v.me?.character !== n) send({ type: 'character', character: n });
  }
  const onlyModerating = $derived(v.isModerator && v.isGhost);
</script>

<div class="gs-cols">
  <section class="ss-card gs-block">
    <div class="head"><div class="heading"><span class="title">{t('lobby.turma')}</span><span class="desc">{v.isModerator ? t('lobby.turmaModHint') : t('lobby.turmaHint')}</span></div></div>
    <div class="body">
      {#if v.players.length}
        <OrderList players={v.players} {room} editable={v.isModerator} onreorder={(order) => send({ type: 'order', order })}>
          {#snippet actions(m)}{#if v.isModerator}<MemberActions {m} you={room.you} {send} />{/if}{/snippet}
        </OrderList>
      {:else}
        <p class="gs-hint">{t('lobby.nobody')}</p>
      {/if}
      {#if v.ghosts.length}
        <div class="gs-section">
          <h4>{t('lobby.ghosts')}</h4>
          <ul class="gs-members">
            {#each v.ghosts as g (g.id)}
              <li><Who m={g} {room} />{#if v.isModerator}<span class="act" data-size-variant="sm"><MemberActions m={g} you={room.you} {send} /></span>{/if}</li>
            {/each}
          </ul>
        </div>
      {/if}
    </div>
  </section>

  <section class="ss-card gs-block">
    <div class="head">
      <div class="heading"><span class="title">{t('lobby.authors')}</span><span class="desc">{v.isModerator ? (swapping ? t('lobby.swapSecond') : t('lobby.swapHint')) : t('lobby.authorsHint')}</span></div>
      {#if v.isModerator}<button class="ss-btn" type="button" disabled={v.players.length < 2} onclick={() => { swapping = null; send({ type: 'shuffleAuthors' }); }}>{t('lobby.shuffle')}</button>{/if}
    </div>
    <div class="body">
      <ul class="gs-assign">
        {#each v.assignments as a (a.owner.id)}
          <li>
            {#if v.isModerator}
              <button class="gs-pick" type="button" class:picked={swapping === a.owner.id} onclick={() => pickOwner(a.owner.id)}>
                {t('lobby.writesFor', { author: a.author?.nickname ?? '—', owner: a.owner.nickname })}
              </button>
            {:else}
              <span>{t('lobby.writesFor', { author: a.author?.nickname ?? '—', owner: a.owner.nickname })}</span>
            {/if}
          </li>
        {/each}
      </ul>
    </div>
  </section>

  <section class="ss-card gs-block">
    <div class="head"><div class="heading"><span class="title">{t('lobby.character')}</span><span class="desc">{t('lobby.characterHint')}</span></div></div>
    <div class="body">
      <div class="gs-chars">
        {#each v.characters as taker, n (n)}
          {@const mine = taker?.id === room.you}
          <button class="gs-char" type="button" class:mine disabled={!!taker && !mine} title={taker ? taker.nickname : t('lobby.characterFree')} aria-pressed={mine} onclick={() => pickCharacter(n)}>
            <Swatch {n} />
            <span class="who">{taker ? (mine ? t('badge.you') : taker.nickname) : t('lobby.characterFree')}</span>
          </button>
        {/each}
      </div>
    </div>
  </section>

  <section class="ss-card gs-block">
    <div class="head"><div class="heading"><span class="title">{t('lobby.game')}</span><span class="desc">{v.isModerator ? t('lobby.gameModHint') : t('lobby.waitModerator')}</span></div></div>
    <div class="body">
      <div class="gs-line">
        <span>{t('lobby.turnMs')}</span>
        {#if v.isModerator}
          <span class="gs-stepper">
            <button class="ss-btn ghost gs-icon-btn" type="button" disabled={turnIdx <= 0} aria-label={t('lobby.turnLess')} onclick={() => send({ type: 'turnMs', ms: turns[turnIdx - 1] })}>−</button>
            <span class="gs-clock">{clockText(room.turnMs)}</span>
            <button class="ss-btn ghost gs-icon-btn" type="button" disabled={turnIdx < 0 || turnIdx >= turns.length - 1} aria-label={t('lobby.turnMore')} onclick={() => send({ type: 'turnMs', ms: turns[turnIdx + 1] })}>+</button>
          </span>
        {:else}
          <span class="gs-clock">{clockText(room.turnMs)}</span>
        {/if}
      </div>
      {#if v.isModerator}
        <div class="gs-line">
          <span>{t('lobby.onlyModerate')}<br /><span class="gs-hint">{t('lobby.onlyModerateHint')}</span></span>
          <Switch label={t('lobby.onlyModerate')} on={onlyModerating} ontoggle={(on) => send({ type: 'onlyModerate', on })} />
        </div>
        <button class="ss-btn primary" type="button" disabled={!v.canStartWriting} onclick={() => send({ type: 'startWriting' })}>{t('lobby.startWriting')}</button>
        {#if !v.canStartWriting}<p class="gs-hint">{t('lobby.needPlayers', { min: MIN_PLAYERS })}</p>{/if}
      {/if}
    </div>
  </section>
</div>
