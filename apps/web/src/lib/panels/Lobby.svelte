<script lang="ts">
  import type { RoomSnapshot } from '@guess/protocol';
  import { MIN_PLAYERS } from '@guess/rules';
  import { Tooltip } from 'dssoca';
  import Stepper from '../hud/Stepper.svelte';
  import Switch from '../hud/Switch.svelte';
  import { maxPlayersOptions } from '../create';
  import { t } from '../i18n.svelte';
  import type { GameRequest } from '../room/remote';
  import { clockText, turnOptions, type RoomView } from '../room/view';
  import { rememberCharacter } from '../identity';
  import Icon from '../hud/Icon.svelte';
  import { roomPath } from '../route.svelte';
  import CharacterPicker, { characterName } from './CharacterPicker.svelte';
  import Swatch from './Swatch.svelte';
  import PostitEditor from './PostitEditor.svelte';
  import Turma from './Turma.svelte';

  /**
   * O lobby, na coluna, nesta ordem: o convite (o link e Copiar, em destaque enquanto a sala tem menos de duas pessoas),
   * a turma (ordem, quem escreve para quem, Sortear), o post-it que eu escrevo, para o moderador os que faltam (que ele
   * pode escrever, menos o próprio), o meu personagem (uma linha recolhida com o atual; Trocar abre a grade; fica
   * lembrado no navegador) e as configurações da sala (o moderador muda; os outros veem). Só moderar, com post-it já
   * escrito, pergunta antes: muda quem escreve para quem. Começar fica no pé da coluna (`Room`).
   */
  let { v, room, token, send }: { v: RoomView; room: RoomSnapshot; token: string; send: (r: GameRequest) => void } = $props();

  const turns = turnOptions();
  const turnIdx = $derived(turns.indexOf(room.turnMs));
  const caps = $derived(maxPlayersOptions(v.maxPlayersMin));
  const capIdx = $derived(caps.indexOf(room.maxPlayers));
  const onlyModerating = $derived(v.isModerator && v.isGhost);
  const myCharacter = $derived(v.me?.character ?? null);
  function pickCharacter(n: number) {
    if (n === myCharacter) return;
    rememberCharacter(n);
    send({ type: 'character', character: n });
  }

  let picking = $state(false);
  const link = $derived(location.origin + roomPath(room.code));
  let copied = $state(false);
  let copyTimer: ReturnType<typeof setTimeout> | undefined;
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      copied = true; clearTimeout(copyTimer); copyTimer = setTimeout(() => (copied = false), 1500);
    } catch { /* sem clipboard: o link está à mostra para copiar à mão */ }
  }

  /** Só moderar muda a ordem e, com ela, os autores: com algum post-it escrito, pergunta antes (`askOnly` é o pedido) */
  let askOnly = $state<boolean | null>(null);
  function toggleOnly(on: boolean) {
    if (v.writtenCount > 0) askOnly = on; else send({ type: 'onlyModerate', on });
  }
  function confirmOnly() { if (askOnly !== null) send({ type: 'onlyModerate', on: askOnly }); askOnly = null; }

  /** os post-its que o moderador abriu para escrever; ficam abertos até ele fechar ou alguém marcar pronto */
  let opened = $state<string[]>([]);
  const editing = $derived(opened.filter((id) => v.hostCanWrite.includes(id)));
  const nameOf = (id: string) => v.players.find((p) => p.id === id)?.nickname ?? '';
  const open = (id: string) => { if (!opened.includes(id)) opened = [...opened, id]; };
  const close = (id: string) => (opened = opened.filter((x) => x !== id));
  /** quem escreve o meu post-it, se caiu: o moderador não pode escrevê-lo, então precisa saber como seguir */
  const myAuthorAway = $derived(v.ownPostitAuthor && !v.ownPostitAuthor.connected ? v.ownPostitAuthor : null);
</script>

{#if room.members.length < 2}
  <section class="gs-block gs-sec gs-invite" aria-label={t('invite.title')}>
    <div class="gs-sec-head"><h3>{t('invite.title')}</h3><span class="gs-hint">{t('invite.code')} <span class="gs-code tiny">{room.code}</span></span></div>
    <p class="gs-hint">{t('invite.hint')}</p>
    <div class="gs-invite-row">
      <input class="ss-input gs-invite-link" readonly value={link} aria-label={t('sala.copy')} onfocus={(e) => e.currentTarget.select()} />
      <button class="ss-btn primary gs-invite-copy" type="button" onclick={copy}><Icon name={copied ? 'check' : 'link'} />{copied ? t('sala.copied') : t('invite.copy')}</button>
    </div>
  </section>
{/if}

<section class="gs-block gs-sec">
  <div class="gs-sec-head">
    <h3>{t('sala.turma')}<span class="gs-n">{room.members.length}/{room.maxPlayers}</span></h3>
    {#if v.isModerator}<Tooltip text={t('lobby.shuffleHint')} placement="bottom"><button class="ss-btn gs-sm" type="button" disabled={v.players.length < 2} onclick={() => send({ type: 'shuffleAuthors' })}>{t('lobby.shuffle')}</button></Tooltip>{/if}
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

{#if v.isModerator && (v.missing.length || editing.length || v.ownPostitAuthor)}
  <section class="gs-block gs-sec">
    <div class="gs-sec-head"><h3>{t('lobby.missing')}{#if v.missing.length}<span class="gs-n">{v.missing.length}</span>{/if}</h3></div>
    {#if v.missing.length || editing.length}<p class="gs-hint">{t('lobby.missingHint')}</p>{/if}
    {#if v.ownPostitAuthor}<p class="gs-banner">{myAuthorAway ? t('writing.ownEmptyOffline', { author: myAuthorAway.nickname }) : t('writing.ownEmpty', { author: v.ownPostitAuthor.nickname })}</p>{/if}
    {#each v.missing.filter((c) => !editing.includes(c.owner.id)) as c (c.owner.id)}
      <div class="gs-line">
        <span>{c.author ? t(c.author.connected ? 'writing.missingFor' : 'writing.missingForOffline', { owner: c.owner.nickname, author: c.author.nickname }) : t('writing.orphanFor', { owner: c.owner.nickname })}</span>
        <button class="ss-btn gs-sm" type="button" onclick={() => open(c.owner.id)}>{t('lobby.writeIt')}</button>
      </div>
    {/each}
    {#each editing as id (id)}
      <div class="gs-section">
        <div class="gs-line"><h4>{t('lobby.writingFor', { owner: nameOf(id) })}</h4><button class="ss-btn ghost gs-sm" type="button" onclick={() => close(id)}>{t('lobby.closeEditor')}</button></div>
        <PostitEditor owner={id} postit={room.postits[id]} code={room.code} {token} {send} canReady={false} />
      </div>
    {/each}
  </section>
{/if}

{#if myCharacter !== null}
  <section class="gs-block gs-sec">
    <div class="gs-sec-head gs-char-row">
      <span class="gs-char-now"><Swatch n={myCharacter} size={24} /><h3>{t('pre.character')}</h3><span class="gs-hint">{characterName(myCharacter)}</span></span>
      <button class="ss-btn gs-sm" class:ghost={picking} type="button" aria-expanded={picking} onclick={() => (picking = !picking)}>{picking ? t('lobby.closeEditor') : t('lobby.characterChange')}</button>
    </div>
    {#if picking}<CharacterPicker value={myCharacter} onpick={pickCharacter} />{/if}
  </section>
{/if}

<section class="gs-block gs-sec">
  <div class="gs-sec-head"><h3>{t('lobby.settings')}</h3>{#if !v.isModerator}<span class="gs-hint">{t('lobby.settingsReadOnly')}</span>{/if}</div>
  <div class="gs-rows">
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
      <Switch label={t('lobby.onlyModerate')} on={askOnly ?? onlyModerating} ontoggle={toggleOnly} />
    </div>
    {#if askOnly !== null}
      <div class="gs-ask" role="alertdialog" aria-label={t('lobby.onlyModerate')} {@attach (el) => el.scrollIntoView({ block: 'nearest' })}>
        <p class="gs-hint">{t('lobby.onlyModerateAsk')}</p>
        <div class="gs-row"><span class="gs-spacer"></span><button class="ss-btn ghost gs-sm" type="button" onclick={() => (askOnly = null)}>{t('confirm.cancel')}</button><button class="ss-btn danger gs-sm" type="button" onclick={confirmOnly}>{t('lobby.onlyModerateYes')}</button></div>
      </div>
    {/if}
  {/if}
  {#if v.isModerator}
    <div class="gs-line">
      <span class="gs-two">{t('lobby.funnyBots')}<span class="gs-hint">{t('lobby.funnyBotsHint')}</span></span>
      <Switch label={t('lobby.funnyBots')} on={room.funnyBots} ontoggle={(on) => send({ type: 'funnyBots', on })} />
    </div>
  {/if}
  </div>
  {#if v.players.length < MIN_PLAYERS}<p class="gs-hint">{t('lobby.needPlayers', { min: MIN_PLAYERS })}</p>{/if}
</section>
