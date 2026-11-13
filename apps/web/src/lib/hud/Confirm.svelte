<script lang="ts">
  import { Tooltip } from 'dssoca';
  import { t } from '../i18n.svelte';
  import Icon, { type IconName } from './Icon.svelte';

  /**
   * Botão de dois toques para o que não se desfaz sozinho (desistir, expulsar, encerrar): o primeiro pergunta, o segundo
   * faz. `icon`: mostra só o ícone (com `label` no tooltip do dssoca e para o leitor de tela) até perguntar. Perguntando,
 * o leitor de tela ouve o que vai ser feito ("Expulsar Bob: certeza?"), não só "Certeza?".
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

{#snippet button()}
  <button class="ss-btn {asking ? 'danger' : kind}" class:gs-icon-btn={icon && !asking} class:gs-sm={small || icon} type="button" {disabled} aria-label={asking ? t('confirm.sureLabel', { what: label }) : icon ? label : undefined} onclick={click}>{#if asking}{t('confirm.sure')}{:else if icon}<Icon name={icon} />{:else}{label}{/if}</button>
{/snippet}

{#if icon}<Tooltip text={label}>{@render button()}</Tooltip>{:else}{@render button()}{/if}
