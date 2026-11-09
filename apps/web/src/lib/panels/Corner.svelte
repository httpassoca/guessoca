<script lang="ts">
  import { Tooltip } from 'dssoca';
  import Icon from '../hud/Icon.svelte';
  import Kbd from '../hud/Kbd.svelte';
  import { t } from '../i18n.svelte';

  /**
   * Os botões do canto de cima à esquerda, no lugar da barra: o menu (Esc), recolher ou abrir a coluna da sala (P) e
   * copiar o link. Ficam sobre a borda de cima da coluna (ou sozinhos no canto, com ela recolhida). Cada um se explica
   * no tooltip do dssoca.
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
  const sideLabel = $derived(sideOpen ? t('side.hide') : t('side.show'));
</script>

{#snippet menuTip()}{t('menu.title')} <Kbd keys={['Esc']} />{/snippet}
{#snippet sideTip()}{sideLabel} <Kbd keys={['P']} />{/snippet}

<nav class="gs-corner" aria-label={t('corner.label')}>
  <Tooltip text={menuTip} placement="bottom">
    <button class="ss-btn gs-corner-btn wide" type="button" aria-haspopup="dialog" aria-label={t('menu.title')} onclick={onmenu}>
      <Icon name="menu" /><Kbd keys={['Esc']} />
    </button>
  </Tooltip>
  <Tooltip text={sideTip} placement="bottom">
    <button class="ss-btn gs-corner-btn wide" type="button" aria-controls="gs-side" aria-expanded={sideOpen} aria-label={sideLabel} aria-keyshortcuts="P" onclick={ontoggle}>
      <Icon name={sideOpen ? 'sideHide' : 'sideShow'} /><Kbd keys={['P']} />
    </button>
  </Tooltip>
  <Tooltip text={copied ? t('sala.copied') : t('sala.copy')} placement="bottom">
    <button class="ss-btn gs-corner-btn" class:copied type="button" aria-label={copied ? t('sala.copied') : t('sala.copy')} onclick={copy}>
      <Icon name={copied ? 'check' : 'link'} />{#if copied}<span class="gs-corner-msg" role="status">{t('sala.copied')}</span>{/if}
    </button>
  </Tooltip>
</nav>
