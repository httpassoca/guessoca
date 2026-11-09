<script lang="ts">
  import { imageUrl, type PostitView } from '@guess/protocol';
  import { POSTIT_MAX } from '@guess/rules';
  import { onDestroy, untrack } from 'svelte';
  import { t } from '../i18n.svelte';
  import { imageIdFromUrl, sendImage } from '../image';
  import type { GameRequest } from '../room/remote';
  import { throttle } from '../throttle';

  /**
   * O editor de um post-it: texto (obrigatório, até `POSTIT_MAX`) e imagem opcional. Cada tecla manda o post-it como
   * está (no máximo a cada ~100 ms), para a turma ver ao vivo; "Pronto" manda na hora e marca pronto. O moderador usa o
   * mesmo editor para os post-its que faltam, sem "Pronto" (`canReady` false): ele força o começo.
   */
  let { owner, postit, code, token, send, canReady }: {
    owner: string; postit: PostitView; code: string; token: string; send: (r: GameRequest) => void; canReady: boolean;
  } = $props();

  // o editor começa do que a sala tem (voltar à aba não perde nada) e daí em diante é a pessoa que manda
  let text = $state(untrack(() => postit.text ?? ''));
  let image = $state<string | null>(untrack(() => imageIdFromUrl(postit.image)));
  let uploading = $state(false);
  let imageFailed = $state(false);
  let picker = $state<HTMLInputElement>();

  const writer = throttle((txt: string, img: string | null) => send({ type: 'write', owner, text: txt, image: img }), 100);
  onDestroy(() => writer.flush());

  const locked = $derived(postit.ready);
  const preview = $derived(image ? imageUrl(code, image) : null);

  function typed() { writer.call(text, image); }
  async function picked() {
    const file = picker?.files?.[0];
    if (picker) picker.value = '';
    if (!file) return;
    uploading = true; imageFailed = false;
    try {
      image = await sendImage(code, token, file);
      writer.call(text, image); writer.flush();
    } catch { imageFailed = true; } finally { uploading = false; }
  }
  function removeImage() { image = null; writer.call(text, null); writer.flush(); }
  function ready() {
    writer.call(text, image); writer.flush();
    send({ type: 'ready' });
  }
</script>

<div class="gs-editor">
  <div class="gs-postit editing" style="--tilt: -1deg">
    <div class="paper">
      {#if preview}<img src={preview} alt="" />{/if}
      <textarea class="gs-postit-input" bind:value={text} oninput={typed} maxlength={POSTIT_MAX} rows="2" disabled={locked} placeholder={t('editor.placeholder')} aria-label={t('editor.text')} spellcheck="false"></textarea>
    </div>
  </div>
  <div class="gs-editor-side">
    <span class="gs-hint" class:gs-warn={text.length >= POSTIT_MAX}>{t('editor.count', { n: text.length, max: POSTIT_MAX })}</span>
    {#if !locked}
      <input class="gs-file" type="file" accept="image/*" bind:this={picker} onchange={picked} hidden />
      <div class="gs-row">
        <button class="ss-btn" type="button" disabled={uploading} onclick={() => picker?.click()}>{uploading ? t('editor.uploading') : image ? t('editor.imageChange') : t('editor.imageAdd')}</button>
        {#if image}<button class="ss-btn ghost" type="button" disabled={uploading} onclick={removeImage}>{t('editor.imageRemove')}</button>{/if}
      </div>
      {#if imageFailed}<p class="gs-error">{t('editor.imageFailed')}</p>{/if}
      {#if canReady}<button class="ss-btn primary" type="button" disabled={!text.trim() || uploading} onclick={ready}>{t('editor.ready')}</button>{/if}
    {:else}
      <span class="ss-badge positive">{t('editor.isReady')}</span>
    {/if}
  </div>
</div>
