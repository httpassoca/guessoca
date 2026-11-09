<script lang="ts">
  import { effectsOn, setEffects } from '../effects';
  import { t } from '../i18n.svelte';

  /** "Efeitos de tela": liga e desliga os filtros de filme do telhado (para computador lento). Lembrado pelo navegador. */
  let on = $state(effectsOn());
  function toggle() { on = !on; setEffects(on); }
</script>

<div class="gs-line gs-effects">
  <span class="gs-effects-text"><span>{t('world.effects')}</span><span class="gs-hint">{t('world.effectsHint')}</span></span>
  <span class="ss-switch">
    <button type="button" class="track" class:on role="switch" aria-checked={on} aria-label={t('world.effects')} onclick={toggle}><span class="thumb"></span></button>
  </span>
</div>

<style>
  .gs-effects-text { display: flex; flex-direction: column; gap: 2px; }
</style>
