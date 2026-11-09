<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import Kbd from '../hud/Kbd.svelte';
  import { t } from '../i18n.svelte';
  import { notepad, rememberNotepad } from '../identity';

  /** O bloco: anotações desta aba nesta sala (sessionStorage), que ninguém mais vê. N abre e fecha. */
  let { code, onclose }: { code: string; onclose: () => void } = $props();
  let text = $state(untrack(() => notepad(code)));
  let field = $state<HTMLTextAreaElement>();
  onMount(() => field?.focus());
</script>

<aside class="ss-card elevated gs-notepad" aria-label={t('notepad.title')}>
  <div class="head">
    <div class="heading"><span class="title">{t('notepad.title')}</span><span class="desc">{t('notepad.hint')}</span></div>
    <button class="ss-btn ghost" type="button" onclick={onclose}>{t('notepad.close')} <Kbd keys={['N']} /></button>
  </div>
  <div class="body">
    <label class="ss-textarea">
      <span class="control"><textarea class="field" rows="8" bind:this={field} bind:value={text} oninput={() => rememberNotepad(code, text)} placeholder={t('notepad.placeholder')} aria-label={t('notepad.title')}></textarea></span>
    </label>
  </div>
</aside>
