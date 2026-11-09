<script lang="ts">
  import { t } from '../i18n.svelte';

  /** Botão de dois toques para o que não se desfaz sozinho (desistir, expulsar, encerrar): o primeiro pergunta, o segundo faz. */
  let { label, onconfirm, kind = 'ghost', disabled = false }: { label: string; onconfirm: () => void; kind?: 'ghost' | 'danger' | ''; disabled?: boolean } = $props();
  let asking = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  function click() {
    if (!asking) { asking = true; clearTimeout(timer); timer = setTimeout(() => (asking = false), 3000); return; }
    asking = false; clearTimeout(timer);
    onconfirm();
  }
</script>

<button class="ss-btn {asking ? 'danger' : kind}" type="button" {disabled} onclick={click}>{asking ? t('confirm.sure') : label}</button>
