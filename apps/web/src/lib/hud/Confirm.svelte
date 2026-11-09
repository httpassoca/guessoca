<script lang="ts">
  import { t } from '../i18n.svelte';
  import Icon, { type IconName } from './Icon.svelte';

  /**
   * Botão de dois toques para o que não se desfaz sozinho (desistir, expulsar, encerrar): o primeiro pergunta, o segundo
   * faz. `icon`: mostra só o ícone (com `label` no título e para o leitor de tela) até perguntar.
   */
  let { label, onconfirm, kind = 'ghost', disabled = false, icon, small = false }: { label: string; onconfirm: () => void; kind?: 'ghost' | 'danger' | ''; disabled?: boolean; icon?: IconName; small?: boolean } = $props();
  let asking = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  function click() {
    if (!asking) { asking = true; clearTimeout(timer); timer = setTimeout(() => (asking = false), 3000); return; }
    asking = false; clearTimeout(timer);
    onconfirm();
  }
</script>

<button class="ss-btn {asking ? 'danger' : kind}" class:gs-icon-btn={icon && !asking} class:gs-sm={small || icon} type="button" {disabled} title={icon ? label : undefined} aria-label={icon && !asking ? label : undefined} onclick={click}>{#if asking}{t('confirm.sure')}{:else if icon}<Icon name={icon} />{:else}{label}{/if}</button>
