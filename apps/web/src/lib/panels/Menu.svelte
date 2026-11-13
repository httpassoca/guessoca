<script lang="ts">
  import Confirm from '../hud/Confirm.svelte';
  import EffectsSwitch from '../hud/EffectsSwitch.svelte';
  import Kbd from '../hud/Kbd.svelte';
  import LangSwitch from '../hud/LangSwitch.svelte';
  import Switch from '../hud/Switch.svelte';
  import { t } from '../i18n.svelte';
  import { navigate } from '../route.svelte';
  import { setSoundSettings, soundSettings } from '../sound/player';
  import { MIXERS, type Mixer } from '../sound/settings';

  /** O menu (Esc, ou ≡ no canto): idioma, som (um volume para os sons do mapa, outro para os do jogo, e o mudo; lembrados pelo navegador), efeitos de tela, atalhos, o crédito e sair para o início (com confirmação: o lugar fica guardado). */
  let { code, onclose }: { code: string; onclose: () => void } = $props();
  let sound = $state(soundSettings());
  const MIXER_LABEL = { map: 'menu.soundMap', game: 'menu.soundGame' } as const;
  function setVolume(mixer: Mixer, volume: number) { sound[mixer] = volume; setSoundSettings({ [mixer]: volume }); }
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
      {#each MIXERS as m (m)}
        <div class="gs-line">
          <span class="gs-two">{t(MIXER_LABEL[m])}<span class="gs-hint">{t(m === 'map' ? 'menu.soundMapHint' : 'menu.soundGameHint')}</span></span>
          <span class="gs-sound">
            <input class="gs-range" type="range" min="0" max="100" step="1" aria-label={t(MIXER_LABEL[m])} value={sound[m]} disabled={sound.muted}
              oninput={(e) => setVolume(m, Number(e.currentTarget.value))} />
            <span class="gs-volume">{sound[m]}</span>
          </span>
        </div>
      {/each}
      <div class="gs-line"><span>{t('menu.mute')}</span><Switch on={sound.muted} label={t('menu.mute')} ontoggle={setMuted} /></div>
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
          <li><span>{t('keys.chat')}</span><Kbd keys={['Enter']} /></li>
        </ul>
      </div>
      <p class="gs-hint">{t('menu.leaveHint')}</p>
      <p class="gs-credit">{t('credit.character')}</p>
    </div>
    <div class="gs-float-foot">
      <Confirm label={t('menu.leave')} onconfirm={() => navigate('/')} />
      <button class="ss-btn" type="button" bind:this={back} onclick={onclose}>{t('menu.back')} <Kbd keys={['Esc']} /></button>
    </div>
  </div>
</div>
