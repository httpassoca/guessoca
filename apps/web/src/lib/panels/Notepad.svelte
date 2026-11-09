<script lang="ts">
  import { untrack } from 'svelte';
  import Kbd from '../hud/Kbd.svelte';
  import { t } from '../i18n.svelte';
  import { notepad, rememberNotepad } from '../identity';

  /**
   * O bloco: anotações desta aba nesta sala (sessionStorage), que ninguém mais vê. Só existe com o jogo correndo e no
   * fim. Preso embaixo, logo à direita da coluna (`left`, `width`: de `notepadBox`). "Minimizar" o deixa como uma
   * aba presa embaixo, que sobe um pouco com o mouse em cima e abre com um clique. N alterna entre os dois.
   */
  let { code, minimized, left, width, onminimize }: { code: string; minimized: boolean; left: number; width: number; onminimize: (on: boolean) => void } = $props();
  let text = $state(untrack(() => notepad(code)));
  let field = $state<HTMLTextAreaElement>();
</script>

{#if minimized}
  <button class="gs-notepad-tab" type="button" style:left="{left}px" aria-expanded="false" aria-label={t('notepad.open')} onclick={() => onminimize(false)}>
    <span>{t('notepad.title')}</span>{#if text.trim()}<span class="dot" aria-hidden="true"></span>{/if}<Kbd keys={['N']} />
  </button>
{:else}
  <aside class="gs-float gs-notepad" style:left="{left}px" style:width="{width}px" aria-label={t('notepad.title')}>
    <div class="gs-float-head">
      <div class="heading"><h3 class="gs-float-title">{t('notepad.title')}</h3><span class="gs-hint">{t('notepad.hint')}</span></div>
      <button class="ss-btn ghost gs-sm" type="button" aria-expanded="true" onclick={() => onminimize(true)}>{t('notepad.minimize')} <Kbd keys={['N']} /></button>
    </div>
    <label class="ss-textarea">
      <span class="control"><textarea class="field" rows="6" bind:this={field} bind:value={text} oninput={() => rememberNotepad(code, text)} placeholder={t('notepad.placeholder')} aria-label={t('notepad.title')}></textarea></span>
    </label>
  </aside>
{/if}
