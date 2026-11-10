<script lang="ts">
  import EffectsSwitch from '../hud/EffectsSwitch.svelte';
  import Kbd from '../hud/Kbd.svelte';
  import LangSwitch from '../hud/LangSwitch.svelte';
  import Switch from '../hud/Switch.svelte';
  import { t } from '../i18n.svelte';
  import { navigate } from '../route.svelte';
  import { setSoundSettings, soundSettings } from '../sound/player';

  /** O menu (Esc, ou ≡ no canto): idioma, som (volume e mudo, lembrados pelo navegador), efeitos de tela, atalhos, o crédito e sair para o início. */
  let { code, onclose }: { code: string; onclose: () => void } = $props();
  let sound = $state(soundSettings());
  function setVolume(volume: number) { sound.volume = volume; setSoundSettings({ volume }); }
  function setMuted(muted: boolean) { sound.muted = muted; setSoundSettings({ muted }); }
  let back = $state<HTMLButtonElement>();
  $effect(() => { back?.focus(); });
</script>

<div class="gs-backdrop" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) onclose(); }}>
  <div class="gs-float gs-menu" role="dialog" aria-modal="true" aria-label={t('menu.title')}>
    <div class="gs-float-head">
      <div class="heading"><h2 class="gs-float-title">{t('menu.title')}</h2><span class="gs-hint">{t('sala.label')} <span class="gs-code tiny">{code}</span></span></div>
    </div>
    <div class="gs-menu-body">
      <div class="gs-rows">
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
      </div>

      <div class="gs-section">
        <h3 class="gs-sub">{t('menu.keys')}</h3>
        <ul class="gs-keys">
          <li><span>{t('keys.skip')}</span><Kbd keys={['Tab']} /></li>
          <li><span>{t('keys.notepad')}</span><Kbd keys={['N']} /></li>
          <li><span>{t('keys.panel')}</span><Kbd keys={['P']} /></li>
          <li><span>{t('menu.title')}</span><Kbd keys={['Esc']} /></li>
          <li><span>{t('keys.walk')}</span><span><Kbd keys={['A', 'D']} /> <Kbd keys={['←', '→']} /></span></li>
          <li><span>{t('keys.depth')}</span><span><Kbd keys={['W', 'S']} /> <Kbd keys={['↑', '↓']} /></span></li>
          <li><span>{t('keys.run')}</span><Kbd keys={['Shift']} /></li>
          <li><span>{t('keys.zoom')}</span><Kbd keys={[t('keys.wheel')]} /></li>
          <li><span>{t('keys.jump')}</span><Kbd keys={[t('keys.space')]} /></li>
          <li><span>{t('keys.shove')}</span><Kbd keys={['J']} /></li>
          <li><span>{t('keys.emotes')}</span><Kbd keys={['1', '2', '3', '4']} /></li>
        </ul>
      </div>
      <p class="gs-credit">{t('credit.character')}</p>
    </div>
    <div class="gs-float-foot">
      <button class="ss-btn ghost" type="button" onclick={() => navigate('/')}>{t('menu.leave')}</button>
      <button class="ss-btn" type="button" bind:this={back} onclick={onclose}>{t('menu.back')} <Kbd keys={['Esc']} /></button>
    </div>
  </div>
</div>
