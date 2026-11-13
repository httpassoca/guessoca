<script lang="ts">
  import { CHAT_MAX, cleanChat } from '@guess/protocol';
  import Kbd from '../hud/Kbd.svelte';
  import { t } from '../i18n.svelte';
  import { canSend } from '../world/bubbles';

  /**
   * A fala: um campo pequeno no canto de baixo à direita. Não guarda mensagem nenhuma: o que se manda vira um balão
   * perto do personagem de quem falou (`World.svelte`) e some. Enter (fora de um campo) foca aqui, pelo `Room`; aqui,
   * Enter manda e sai do campo (vazio, só sai) e Esc sai (o rascunho fica). Com o campo focado o telhado não ouve o
   * teclado, como em qualquer campo de texto. Cedo demais depois da última fala (`canSend`), o Enter espera: o texto
   * fica no campo.
   */
  let { onsend }: { onsend: (text: string) => void } = $props();
  let field = $state<HTMLInputElement>();
  let text = $state('');
  let focused = $state(false);
  let lastSent: number | null = null;

  /** Põe o foco no campo (o Enter do `Room`). */
  export function focus() { field?.focus(); }

  function onKey(e: KeyboardEvent) {
    if (e.key !== 'Enter' || e.isComposing) return;
    e.preventDefault();
    const clean = cleanChat(text);
    if (!clean) { text = ''; field?.blur(); return; }
    const now = performance.now();
    if (!canSend(lastSent, now)) return;
    lastSent = now;
    onsend(clean);
    text = '';
    field?.blur();
  }
</script>

<div class="gs-chat" class:focused>
  <input class="ss-input" type="text" bind:this={field} bind:value={text} maxlength={CHAT_MAX} placeholder={t('chat.placeholder')} aria-label={t('chat.label')}
    aria-keyshortcuts="Enter" spellcheck="false" autocomplete="off" enterkeyhint="send" onkeydown={onKey} onfocus={() => (focused = true)} onblur={() => (focused = false)} />
  {#if !focused && !text}<Kbd keys={['Enter']} />{/if}
</div>
