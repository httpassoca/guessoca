<script lang="ts">
  import Kbd from '../hud/Kbd.svelte';
  import { t } from '../i18n.svelte';

  /**
   * As teclas do telhado para quem chega pela primeira vez (antes só apareciam no menu): andar, pular, empurrar, falar e
   * o menu, num cartão pequeno embaixo no meio. Some com "Entendi", e o navegador lembra (`../hints.ts`).
   */
  let { onclose }: { onclose: () => void } = $props();
</script>

<aside class="gs-float gs-keyshint" aria-label={t('keysHint.title')}>
  <h2 class="gs-float-title">{t('keysHint.title')}</h2>
  <ul class="gs-keys">
    <li><span>{t('keys.walk')}</span><span><Kbd keys={['A', 'D']} /> <Kbd keys={['W', 'S']} /></span></li>
    <li><span>{t('keys.jump')}</span><Kbd keys={[t('keys.space')]} /></li>
    <li><span>{t('keys.shove')}</span><Kbd keys={['J']} /></li>
    <li><span>{t('chat.label')}</span><Kbd keys={['Enter']} /></li>
    <li><span>{t('keysHint.more')}</span><Kbd keys={['Esc']} /></li>
  </ul>
  <button class="ss-btn gs-sm" type="button" onclick={onclose}>{t('keysHint.close')}</button>
</aside>
