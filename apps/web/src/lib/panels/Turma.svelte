<script lang="ts">
  import type { RoomSnapshot } from '@guess/protocol';
  import Confirm from '../hud/Confirm.svelte';
  import Icon from '../hud/Icon.svelte';
  import { t } from '../i18n.svelte';
  import type { GameRequest } from '../room/remote';
  import { moveBy, type Progress, type RoomView, type TurmaRow } from '../room/view';
  import Who from './Who.svelte';

  /**
   * O painel único da turma, na ordem das vezes. Cada linha: a vez, o rosto, o apelido e as marcas; no lobby, para quem a
   * pessoa escreve e em que pé está, e o post-it dela ao vivo (o meu "?"); no jogo, o post-it e o estado (na vez, acertou,
   * desistiu). O moderador tem, por linha, ↑ ↓, passar a moderação e expulsar; no jogo, também marcar acertou ou não.
   * Os fantasmas vêm à parte, embaixo.
   */
  let { v, room, send }: { v: RoomView; room: RoomSnapshot; send: (r: GameRequest) => void } = $props();

  const lobby = $derived(room.phase === 'lobby');
  /** a ordem e as marcas só valem no lobby e no jogo; no fim, só passar a moderação e expulsar */
  const ended = $derived(room.phase === 'ended');
  const ids = $derived(v.players.map((p) => p.id));
  const PROGRESS: Record<Progress, ['neutral' | 'info' | 'positive', 'progress.empty' | 'progress.writing' | 'progress.ready']> = {
    empty: ['neutral', 'progress.empty'], writing: ['info', 'progress.writing'], ready: ['positive', 'progress.ready'],
  };
  const move = (id: string, d: -1 | 1) => send({ type: 'order', order: moveBy(ids, id, d) });
</script>

{#snippet modActions(id: string, name: string)}
  {#if v.isModerator && id !== room.you}
    <Confirm icon="crown" label={t('mod.handOverTo', { name })} onconfirm={() => send({ type: 'handOver', member: id })} />
    <Confirm icon="kick" label={t('mod.kickName', { name })} onconfirm={() => send({ type: 'kick', member: id })} />
  {/if}
{/snippet}

{#snippet postitChip(r: TurmaRow)}
  {#if r.card && (r.card.hidden || r.card.text || r.card.image)}
    <span class="gs-chip" class:hidden={r.card.hidden} class:turn={r.card.turn}>
      {#if r.card.hidden}
        <span class="q" title={t('postit.hidden')}>?</span>
      {:else}
        {#if r.card.image}<img src={r.card.image} alt="" />{/if}
        {#if r.card.text}<span class="text">{r.card.text}</span>{/if}
      {/if}
    </span>
  {/if}
{/snippet}

<ol class="gs-turma">
  {#each v.turma as r, i (r.member.id)}
    <li class:turn={r.card?.turn} class:off={!r.member.connected} class:done={r.status !== 'playing'}>
      <span class="pos">{r.pos}</span>
      <div class="main">
        <div class="top">
          <Who m={r.member} {room} />
          {#if v.isModerator}
            <span class="act" data-size-variant="sm">
              {#if !ended}
              <button class="ss-btn ghost gs-icon-btn" type="button" disabled={i === 0} aria-label={t('order.up', { name: r.member.nickname })} title={t('order.up', { name: r.member.nickname })} onclick={() => move(r.member.id, -1)}><Icon name="up" /></button>
              <button class="ss-btn ghost gs-icon-btn" type="button" disabled={i === v.turma.length - 1} aria-label={t('order.down', { name: r.member.nickname })} title={t('order.down', { name: r.member.nickname })} onclick={() => move(r.member.id, 1)}><Icon name="down" /></button>
              {/if}
              {@render modActions(r.member.id, r.member.nickname)}
            </span>
          {/if}
        </div>
        {#if lobby}
          {@const [tone, key] = PROGRESS[r.writing]}
          <div class="sub">
            <span class="writes">{r.writesFor ? t('turma.writesFor', { owner: r.writesFor.id === room.you ? t('turma.you') : r.writesFor.nickname }) : t('turma.writesNobody')}</span>
            {#if r.writesFor}<span class="ss-badge {tone}">{t(key)}</span>{/if}
          </div>
          {@render postitChip(r)}
        {:else}
          <div class="sub">
            {@render postitChip(r)}
            {#if r.card?.turn}<span class="ss-badge brand">{t('play.turnBadge')}</span>{/if}
            {#if r.status === 'got'}<span class="ss-badge positive">{t('play.gotBadge', { place: r.place ?? '' })}</span>{/if}
            {#if r.status === 'gaveUp'}<span class="ss-badge neutral">{t('rank.gaveUp')}</span>{/if}
          </div>
          {#if v.isModerator && !ended}
            <div class="act mark" data-size-variant="sm">
              <button class="ss-btn ghost" type="button" disabled={r.status === 'got'} onclick={() => send({ type: 'mark', member: r.member.id, right: true })}><Icon name="check" size={14} />{t('mod.markRight')}</button>
              <button class="ss-btn ghost" type="button" disabled={r.status === 'playing'} onclick={() => send({ type: 'mark', member: r.member.id, right: false })}><Icon name="undo" size={14} />{t('mod.markWrong')}</button>
            </div>
          {/if}
        {/if}
      </div>
    </li>
  {/each}
</ol>
{#if !v.turma.length}<p class="gs-hint">{t('lobby.nobody')}</p>{/if}

{#if v.ghosts.length}
  <div class="gs-section gs-ghosts">
    <h4>{t('lobby.ghosts')}</h4>
    <ul class="gs-members">
      {#each v.ghosts as g (g.id)}
        <li><Who m={g} {room} />{#if v.isModerator}<span class="act" data-size-variant="sm">{@render modActions(g.id, g.nickname)}</span>{/if}</li>
      {/each}
    </ul>
  </div>
{/if}
