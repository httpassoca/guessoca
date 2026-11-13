<script lang="ts">
  import { Tooltip } from 'dssoca';
  import type { Snippet } from 'svelte';
  import Icon from '../hud/Icon.svelte';

  /**
   * O ⋯ de uma linha da turma no jogo: as ações do moderador que não são de todo minuto (subir, descer, passar a
   * moderação, expulsar) numa lista que abre embaixo do botão, para a linha ficar com dois ícones e o "Certeza?" de
   * expulsar não empurrar nada. Fecha com Esc (sem abrir o menu da sala), com um clique fora ou depois de uma ação
   * (`close`, passado ao conteúdo).
   */
  let { label, children }: { label: string; children: Snippet<[() => void]> } = $props();
  let open = $state(false);
  let root = $state<HTMLElement>();
  const close = () => (open = false);

  // o Esc chega na janela (o clique solta o foco do botão): ouvido antes de todos, na captura, para não abrir o menu
  $effect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      e.preventDefault();
      close();
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  });
  function onOutside(e: PointerEvent) {
    if (open && root && !root.contains(e.target as Node)) close();
  }
</script>

<svelte:window onpointerdown={onOutside} />

<span class="gs-rowmenu" bind:this={root}>
  <Tooltip text={label}>
    <button class="ss-btn ghost gs-icon-btn" type="button" aria-label={label} aria-haspopup="true" aria-expanded={open} onclick={() => (open = !open)}><Icon name="more" /></button>
  </Tooltip>
  {#if open}
    <div class="gs-rowmenu-list gs-float" role="group" aria-label={label}>{@render children(close)}</div>
  {/if}
</span>
