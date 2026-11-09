<script lang="ts">
  import Icon from '../hud/Icon.svelte';
  import Kbd from '../hud/Kbd.svelte';
  import { t } from '../i18n.svelte';

  /**
   * Os botões do canto de cima à esquerda, no lugar da barra: o menu (Esc), recolher ou abrir a coluna da sala e copiar
   * o link. Ficam sobre a borda de cima da coluna (ou sozinhos no canto, com ela recolhida).
   */
  let { sideOpen, link, onmenu, ontoggle }: { sideOpen: boolean; link: string; onmenu: () => void; ontoggle: () => void } = $props();
  let copied = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      copied = true; clearTimeout(timer); timer = setTimeout(() => (copied = false), 1500);
    } catch { /* sem clipboard: o link está na barra do navegador */ }
  }
</script>

<nav class="gs-corner" aria-label={t('corner.label')}>
  <button class="ss-btn gs-corner-btn wide" type="button" aria-haspopup="dialog" aria-label={t('menu.title')} title={t('menu.title')} onclick={onmenu}>
    <Icon name="menu" /><Kbd keys={['Esc']} />
  </button>
  <button class="ss-btn gs-corner-btn" type="button" aria-controls="gs-side" aria-expanded={sideOpen} aria-label={sideOpen ? t('side.hide') : t('side.show')} title={sideOpen ? t('side.hide') : t('side.show')} onclick={ontoggle}>
    <Icon name={sideOpen ? 'sideHide' : 'sideShow'} />
  </button>
  <button class="ss-btn gs-corner-btn" class:copied type="button" aria-label={copied ? t('sala.copied') : t('sala.copy')} title={copied ? t('sala.copied') : t('sala.copy')} onclick={copy}>
    <Icon name={copied ? 'check' : 'link'} />{#if copied}<span class="gs-corner-msg" role="status">{t('sala.copied')}</span>{/if}
  </button>
</nav>
