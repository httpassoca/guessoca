<script lang="ts">
  import { MAX_MEMBERS, NICKNAME_MAX } from '@guess/rules';
  import { onMount, untrack } from 'svelte';
  import LangSwitch from '../hud/LangSwitch.svelte';
  import type { MsgKey } from '../i18n';
  import { t } from '../i18n.svelte';
  import { rememberNickname, rememberedNickname, token } from '../identity';
  import Room from '../panels/Room.svelte';
  import { RemoteRoom, type ClosedReason, type RemoteState } from '../room/remote';
  import { openRoom, wsUrl } from '../rooms';
  import { navigate, roomPath } from '../route.svelte';

  let { code }: { code: string } = $props();

  // a rota recria esta tela a cada código novo (App faz {#key}); o código inicial basta
  const myToken = token();
  const remote = new RemoteRoom({ url: wsUrl(), room: untrack(() => code), token: myToken });
  let st = $state.raw<RemoteState>(remote.state);
  let nickname = $state(rememberedNickname());
  let copied = $state(false);
  let openFailed = $state(false);
  let field = $state<HTMLInputElement>();

  onMount(() => {
    const off = remote.watch((s) => (st = s));
    // a rede caiu e voltou: sem esperar o ping descobrir
    const online = () => remote.retryNow();
    const offline = () => remote.reconnect();
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    remote.connect();
    field?.focus();
    return () => { window.removeEventListener('online', online); window.removeEventListener('offline', offline); off(); remote.dispose(); };
  });

  const room = $derived(st.room);
  const me = $derived(room?.members.find((m) => m.id === room.you) ?? null);
  const live = $derived(st.status === 'open');
  const link = $derived(location.origin + roomPath(code));
  const STATUS: Record<RemoteState['status'], MsgKey | null> = { idle: null, connecting: 'status.connecting', open: 'status.open', reconnecting: 'status.reconnecting', closed: null };
  const status = $derived.by(() => { const k = STATUS[st.status]; return k ? t(k) : ''; });
  const GONE = { notFound: ['gone.notFound.title', 'gone.notFound.msg'], ended: ['gone.ended.title', 'gone.ended.msg'], replaced: ['gone.replaced.title', 'gone.replaced.msg'], kicked: ['gone.kicked.title', 'gone.kicked.msg'] } as const satisfies Record<NonNullable<ClosedReason>, [MsgKey, MsgKey]>;

  function submit(e: SubmitEvent) {
    e.preventDefault();
    const n = nickname.trim(); if (!n) return;
    rememberNickname(n);
    if (me) remote.rename(n); else remote.join(n);
  }
  async function copy() {
    try { await navigator.clipboard.writeText(link); copied = true; setTimeout(() => (copied = false), 1500); } catch { /* sem clipboard: o link está na barra do navegador */ }
  }
  async function openNew() {
    openFailed = false;
    try { navigate(roomPath(await openRoom())); } catch { openFailed = true; }
  }
</script>

{#if st.status === 'closed' && st.reason}
  {@const [title, msg] = GONE[st.reason]}
  <div class="gs-screen">
    <div class="ss-card elevated gs-panel">
      <div class="body">
        <div class="ss-empty error">
          <div class="title">{t(title)}</div>
          <p class="msg">{t(msg)}</p>
          <div class="act">
            <button class="ss-btn primary" type="button" onclick={openNew}>{t('gone.openNew')}</button>
            <button class="ss-btn ghost" type="button" onclick={() => navigate('/')}>{t('nav.home')}</button>
          </div>
        </div>
        {#if openFailed}<p class="gs-error">{t('home.openFailed')}</p>{/if}
      </div>
    </div>
  </div>
{:else if room && me}
  <Room {remote} {st} {room} token={myToken} {status} />
{:else}
  <div class="gs-screen">
    <div class="ss-card elevated gs-panel">
      <div class="head">
        <div class="heading"><span class="title">{t('sala.title', { code })}</span><span class="desc">{t('sala.share')}</span></div>
        <span class="meta" class:gs-warn={st.status === 'reconnecting'}>{status}</span>
      </div>
      <div class="body">
        <div class="gs-share">
          <span class="gs-code">{code}</span>
          <button class="ss-btn" type="button" onclick={copy}>{copied ? t('sala.copied') : t('sala.copy')}</button>
        </div>

        <form class="gs-form" onsubmit={submit}>
          <label class="ss-field">
            <span class="lbl">{t('sala.nickname')}</span>
            <span class="control"><input class="ss-input" bind:this={field} bind:value={nickname} maxlength={NICKNAME_MAX} placeholder={t('sala.nicknamePlaceholder')} spellcheck="false" /></span>
          </label>
          {#if me}
            <button class="ss-btn" type="submit" disabled={!live || !nickname.trim() || nickname.trim() === me.nickname}>{t('sala.rename')}</button>
          {:else}
            <button class="ss-btn primary" type="submit" disabled={!live || !nickname.trim()}>{t('sala.join')}</button>
          {/if}
        </form>
        {#if st.error === 'roomFull'}<p class="gs-error">{t('sala.full', { max: MAX_MEMBERS })}</p>{/if}
        {#if st.error === 'refused'}<p class="gs-error">{t('error.refused')}</p>{/if}

        <div class="gs-section">
          <h4>{t('sala.turma', { count: room?.members.length ?? 0, max: MAX_MEMBERS })}</h4>
          {#if !room || room.members.length === 0}
            <p class="gs-hint">{t('sala.empty')}</p>
          {:else}
            <ul class="gs-members">
              {#each room.members as m (m.id)}
                <li class:off={!m.connected}>
                  <span>{m.nickname}</span>
                  {#if m.id === room.you}<span class="ss-badge brand">{t('badge.you')}</span>{/if}
                  {#if m.id === room.moderator}<span class="ss-badge caution">{t('badge.moderator')}</span>{/if}
                  {#if !m.connected}<span class="ss-badge neutral">{t('badge.offline')}</span>{/if}
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      </div>
      <div class="foot">
        <button class="ss-btn ghost" type="button" onclick={() => navigate('/')}>{t('nav.home')}</button>
        <LangSwitch />
      </div>
    </div>
  </div>
{/if}
