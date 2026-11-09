<script lang="ts">
  import type { RoomSnapshot } from '@guess/protocol';
  import { NICKNAME_MAX } from '@guess/rules';
  import { untrack } from 'svelte';
  import Confirm from '../hud/Confirm.svelte';
  import EffectsSwitch from '../hud/EffectsSwitch.svelte';
  import Kbd from '../hud/Kbd.svelte';
  import LangSwitch from '../hud/LangSwitch.svelte';
  import Switch from '../hud/Switch.svelte';
  import { t } from '../i18n.svelte';
  import { rememberNickname } from '../identity';
  import type { GameRequest } from '../room/remote';
  import type { RoomView } from '../room/view';
  import { navigate } from '../route.svelte';
  import { setSoundSettings, soundSettings } from '../sound/player';
  import MemberActions from './MemberActions.svelte';
  import Who from './Who.svelte';

  /** O menu (Esc): idioma, som (volume e mudo, lembrados pelo navegador), apelido, atalhos, as ferramentas do moderador, o crédito e sair para o início. */
  let { v, room, send, onrename, onclose }: { v: RoomView; room: RoomSnapshot; send: (r: GameRequest) => void; onrename: (nickname: string) => void; onclose: () => void } = $props();
  let nickname = $state(untrack(() => v.me?.nickname ?? ''));
  let sound = $state(soundSettings());
  function setVolume(volume: number) { sound.volume = volume; setSoundSettings({ volume }); }
  function setMuted(muted: boolean) { sound.muted = muted; setSoundSettings({ muted }); }

  function rename(e: SubmitEvent) {
    e.preventDefault();
    const n = nickname.trim(); if (!n || n === v.me?.nickname) return;
    rememberNickname(n);
    onrename(n);
  }
  const playing = $derived(room.phase === 'playing');
  const gameOn = $derived(room.phase === 'playing' || room.phase === 'writing');
</script>

<div class="gs-backdrop" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) onclose(); }}>
  <div class="ss-card elevated gs-menu" role="dialog" aria-modal="true" aria-label={t('menu.title')}>
    <div class="head">
      <div class="heading"><span class="title">{t('menu.title')}</span><span class="desc">{t('sala.title', { code: room.code })}</span></div>
      <span class="meta">esc</span>
    </div>
    <div class="body">
      <div class="gs-line"><span>{t('lang.label')}</span><LangSwitch /></div>
      <div class="gs-line">
        <span>{t('menu.sound')}</span>
        <span class="gs-sound">
          <input class="gs-range" type="range" min="0" max="100" step="1" aria-label={t('menu.volume')} value={sound.volume} disabled={sound.muted}
            oninput={(e) => setVolume(Number(e.currentTarget.value))} />
          <span class="gs-volume">{sound.volume}</span>
          <span class="gs-mute">{t('menu.mute')} <Switch on={sound.muted} label={t('menu.mute')} ontoggle={setMuted} /></span>
        </span>
      </div>
      <EffectsSwitch />
      <form class="gs-form" onsubmit={rename}>
        <label class="ss-field">
          <span class="lbl">{t('sala.nickname')}</span>
          <span class="control"><input class="ss-input" bind:value={nickname} maxlength={NICKNAME_MAX} spellcheck="false" /></span>
        </label>
        <button class="ss-btn" type="submit" disabled={!nickname.trim() || nickname.trim() === v.me?.nickname}>{t('sala.rename')}</button>
      </form>

      <div class="gs-section">
        <h4>{t('menu.keys')}</h4>
        <ul class="gs-keys">
          <li><span>{t('play.claim')}</span><Kbd keys={['↵']} /></li>
          <li><span>{t('keys.skip')}</span><Kbd keys={['Tab']} /></li>
          <li><span>{t('notepad.title')}</span><Kbd keys={['N']} /></li>
          <li><span>{t('menu.title')}</span><Kbd keys={['Esc']} /></li>
          <li><span>{t('keys.walk')}</span><span><Kbd keys={['A', 'D']} /> <Kbd keys={['←', '→']} /></span></li>
          <li><span>{t('keys.depth')}</span><span><Kbd keys={['W', 'S']} /> <Kbd keys={['↑', '↓']} /></span></li>
          <li><span>{t('keys.run')}</span><Kbd keys={['Shift']} /></li>
          <li><span>{t('keys.jump')}</span><Kbd keys={[t('keys.space')]} /></li>
          <li><span>{t('keys.shove')}</span><Kbd keys={['J']} /></li>
          <li><span>{t('keys.emotes')}</span><Kbd keys={['1', '2', '3', '4']} /></li>
        </ul>
      </div>

      {#if v.isModerator}
        <div class="gs-section">
          <h4>{t('menu.moderator')}</h4>
          {#if playing}
            <div class="gs-row">
              <button class="ss-btn" type="button" disabled={!v.moderatorCanSkip} onclick={() => send({ type: 'skip' })}>{t('mod.skip')}</button>
              <button class="ss-btn" type="button" onclick={() => send({ type: 'pause', on: !room.paused })}>{room.paused ? t('mod.resume') : t('mod.pause')}</button>
            </div>
          {/if}
          {#if gameOn}<div class="gs-row"><Confirm label={t('mod.endGame')} onconfirm={() => send({ type: 'endGame' })} /></div>{/if}
          <ul class="gs-members">
            {#each room.members as m (m.id)}
              <li><Who {m} {room} /><span class="act" data-size-variant="sm"><MemberActions {m} you={room.you} {send} /></span></li>
            {/each}
          </ul>
        </div>
      {/if}
      <p class="gs-credit">{t('credit.character')}</p>
    </div>
    <div class="foot">
      <button class="ss-btn ghost" type="button" onclick={() => navigate('/')}>{t('menu.leave')}</button>
      <button class="ss-btn primary" type="button" onclick={onclose}>{t('menu.back')} <Kbd keys={['Esc']} /></button>
    </div>
  </div>
</div>
