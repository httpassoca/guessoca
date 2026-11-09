<script lang="ts">
  import { imageUrl, type PostitView } from '@guess/protocol';
  import { POSTIT_MAX } from '@guess/rules';
  import { Tooltip } from 'dssoca';
  import { onDestroy, untrack } from 'svelte';
  import Icon from '../hud/Icon.svelte';
  import { t } from '../i18n.svelte';
  import { imageIdFromUrl, sendImage } from '../image';
  import type { GameRequest } from '../room/remote';
  import { throttle } from '../throttle';

  /**
   * O editor de um post-it: numa linha, o lugar da imagem (opcional) e o texto (obrigatório, até `POSTIT_MAX`), da
   * mesma altura. O lugar vazio abre o seletor de arquivo; com imagem, clicar troca e a lixeira no canto tira. Cada
   * tecla manda o post-it como está (no máximo a cada ~100 ms), para a turma ver ao vivo; "Pronto" (a ação principal)
   * manda na hora e marca pronto. O moderador usa o mesmo editor para os post-its que faltam, sem "Pronto"
   * (`canReady` false): ele pode começar sem esperar o pronto. Pronto, tudo fica parado.
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
  function pick() { if (!uploading) picker?.click(); }
  /** Espaço é do telhado na página toda; aqui, com o lugar da imagem focado, ele abre o seletor (e ninguém pula). */
  function slotKey(e: KeyboardEvent) {
    if (e.code !== 'Space' || e.repeat) return;
    e.preventDefault(); e.stopPropagation();
    pick();
  }
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

<div class="gs-editor" class:locked>
  <div class="gs-editor-box">
    <div class="gs-slot" class:filled={!!preview} class:busy={uploading}>
      {#if preview}<img class="gs-slot-img" src={preview} alt="" />{/if}
      {#if locked}
        {#if !preview}<span class="gs-slot-empty" aria-hidden="true"><Icon name="image" size={20} /></span>{/if}
      {:else}
        <input class="gs-file" type="file" accept="image/*" bind:this={picker} onchange={picked} hidden />
        <button class="gs-slot-pick" type="button" disabled={uploading} aria-label={preview ? t('editor.imageChange') : t('editor.imageAdd')} onclick={pick} onkeydown={slotKey}>
          {#if uploading}
            <span class="gs-slot-label">{t('editor.uploading')}</span>
          {:else if preview}
            <span class="gs-slot-over" aria-hidden="true"><Icon name="replace" /><span class="gs-slot-label">{t('editor.imageSwap')}</span></span>
          {:else}
            <span class="gs-slot-empty" aria-hidden="true"><Icon name="image" size={20} /><span class="gs-slot-label">{t('editor.imageSlot')}</span></span>
          {/if}
        </button>
        {#if preview && !uploading}
          <span class="gs-slot-trash">
            <Tooltip text={t('editor.imageRemove')}>
              <button class="gs-trash" type="button" aria-label={t('editor.imageRemove')} onclick={removeImage}><Icon name="trash" size={14} /></button>
            </Tooltip>
          </span>
        {/if}
      {/if}
    </div>
    <label class="ss-textarea gs-editor-text">
      <span class="control"><textarea class="field gs-postit-input" bind:value={text} oninput={typed} maxlength={POSTIT_MAX} disabled={locked} placeholder={t('editor.placeholder')} aria-label={t('editor.text')} spellcheck="false"></textarea></span>
      <span class="gs-n gs-editor-count" class:gs-warn={text.length >= POSTIT_MAX}>{t('editor.count', { n: text.length, max: POSTIT_MAX })}</span>
    </label>
  </div>
  {#if imageFailed || canReady || locked}
    <div class="gs-row gs-editor-foot">
      {#if imageFailed}<p class="gs-error">{t('editor.imageFailed')}</p>{/if}
      <span class="gs-spacer"></span>
      {#if locked}<span class="gs-tag on"><Icon name="check" />{t('editor.isReady')}</span>
      {:else if canReady}<button class="ss-btn primary gs-sm" type="button" disabled={!text.trim() || uploading} onclick={ready}>{t('editor.ready')}</button>{/if}
    </div>
  {/if}
</div>
