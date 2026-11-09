<script lang="ts">
  import type { RoomSnapshot } from '@guess/protocol';
  import { MIN_PLAYERS } from '@guess/rules';
  import Stepper from '../hud/Stepper.svelte';
  import Switch from '../hud/Switch.svelte';
  import { maxPlayersOptions } from '../create';
  import { t } from '../i18n.svelte';
  import type { GameRequest } from '../room/remote';
  import { clockText, turnOptions, type RoomView } from '../room/view';
  import PostitEditor from './PostitEditor.svelte';
  import Turma from './Turma.svelte';

  /**
   * O lobby, na coluna: a turma (ordem, quem escreve para quem, Sortear), o post-it que eu escrevo, para o moderador os
   * que faltam (que ele pode escrever, menos o próprio) e as configurações da sala (o moderador muda; os outros veem).
   * Começar fica no pé da coluna (`Room`).
   */
  let { v, room, token, send }: { v: RoomView; room: RoomSnapshot; token: string; send: (r: GameRequest) => void } = $props();

  const turns = turnOptions();
  const turnIdx = $derived(turns.indexOf(room.turnMs));
  const caps = $derived(maxPlayersOptions(v.maxPlayersMin));
  const capIdx = $derived(caps.indexOf(room.maxPlayers));
  const onlyModerating = $derived(v.isModerator && v.isGhost);

  /** os post-its que o moderador abriu para escrever; ficam abertos até ele fechar ou alguém marcar pronto */
  let opened = $state<string[]>([]);
  const editing = $derived(opened.filter((id) => v.hostCanWrite.includes(id)));
  const nameOf = (id: string) => v.players.find((p) => p.id === id)?.nickname ?? '';
  const open = (id: string) => { if (!opened.includes(id)) opened = [...opened, id]; };
  const close = (id: string) => (opened = opened.filter((x) => x !== id));
</script>

<section class="gs-block gs-sec">
  <div class="gs-sec-head">
    <h3>{t('sala.turma', { count: room.members.length, max: room.maxPlayers })}</h3>
    {#if v.isModerator}<button class="ss-btn" type="button" data-size-variant="sm" disabled={v.players.length < 2} title={t('lobby.shuffleHint')} onclick={() => send({ type: 'shuffleAuthors' })}>{t('lobby.shuffle')}</button>{/if}
  </div>
  <Turma {v} {room} {send} />
</section>

{#if v.writeFor}
  <section class="gs-block gs-sec">
    <div class="gs-sec-head"><h3>{t('writing.youWriteFor', { owner: v.writeFor.owner.nickname })}</h3></div>
    <p class="gs-hint">{t('writing.hint', { owner: v.writeFor.owner.nickname })}</p>
    {#key v.writeFor.owner.id}<PostitEditor owner={v.writeFor.owner.id} postit={v.writeFor.postit} code={room.code} {token} {send} canReady />{/key}
  </section>
{:else if v.isGhost}
  <p class="gs-banner">{onlyModerating ? t('lobby.onlyModerateBanner') : t('ghost.banner')}</p>
{/if}

{#if v.isModerator && (v.missing.length || editing.length || v.ownPostitEmpty)}
  <section class="gs-block gs-sec">
    <div class="gs-sec-head"><h3>{t('lobby.missing', { n: v.missing.length })}</h3></div>
    <p class="gs-hint">{t('lobby.missingHint')}</p>
    {#if v.ownPostitEmpty}<p class="gs-banner">{t('writing.ownEmpty')}</p>{/if}
    {#each v.missing.filter((c) => !editing.includes(c.owner.id)) as c (c.owner.id)}
      <div class="gs-line">
        <span>{c.author ? t('writing.missingFor', { owner: c.owner.nickname, author: c.author.nickname }) : t('writing.orphanFor', { owner: c.owner.nickname })}</span>
        <button class="ss-btn" type="button" data-size-variant="sm" onclick={() => open(c.owner.id)}>{t('lobby.writeIt')}</button>
      </div>
    {/each}
    {#each editing as id (id)}
      <div class="gs-section">
        <div class="gs-line"><h4>{t('lobby.writingFor', { owner: nameOf(id) })}</h4><button class="ss-btn ghost" type="button" data-size-variant="sm" onclick={() => close(id)}>{t('lobby.closeEditor')}</button></div>
        <PostitEditor owner={id} postit={room.postits[id]} code={room.code} {token} {send} canReady={false} />
      </div>
    {/each}
  </section>
{/if}

<section class="gs-block gs-sec">
  <div class="gs-sec-head"><h3>{t('lobby.settings')}</h3>{#if !v.isModerator}<span class="gs-hint">{t('lobby.settingsReadOnly')}</span>{/if}</div>
  <div class="gs-line">
    <span>{t('lobby.turnMs')}</span>
    <Stepper value={clockText(room.turnMs)} lessLabel={t('lobby.turnLess')} moreLabel={t('lobby.turnMore')} canLess={turnIdx > 0} canMore={turnIdx >= 0 && turnIdx < turns.length - 1}
      onstep={v.isModerator ? (d) => send({ type: 'turnMs', ms: turns[turnIdx + d] }) : undefined} />
  </div>
  <div class="gs-line">
    <span class="gs-two">{t('lobby.maxPlayers')}{#if v.isModerator}<span class="gs-hint">{t('lobby.maxPlayersHint', { n: v.maxPlayersMin })}</span>{/if}</span>
    <Stepper value={String(room.maxPlayers)} lessLabel={t('lobby.maxLess')} moreLabel={t('lobby.maxMore')} canLess={capIdx > 0} canMore={capIdx >= 0 && capIdx < caps.length - 1}
      onstep={v.isModerator ? (d) => send({ type: 'maxPlayers', n: caps[capIdx + d] }) : undefined} />
  </div>
  {#if v.isModerator}
    <div class="gs-line">
      <span class="gs-two">{t('lobby.onlyModerate')}<span class="gs-hint">{t('lobby.onlyModerateHint')}</span></span>
      <Switch label={t('lobby.onlyModerate')} on={onlyModerating} ontoggle={(on) => send({ type: 'onlyModerate', on })} />
    </div>
  {/if}
  {#if v.players.length < MIN_PLAYERS}<p class="gs-hint">{t('lobby.needPlayers', { min: MIN_PLAYERS })}</p>{/if}
</section>
