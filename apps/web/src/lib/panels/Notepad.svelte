<script lang="ts">
  import { untrack } from 'svelte';
  import Kbd from '../hud/Kbd.svelte';
  import { t } from '../i18n.svelte';
  import { notepad, rememberNotepad } from '../identity';
  import type { Size } from '../layout';

  type Edges = { w: boolean; h: boolean };

  /**
   * O bloco: anotações desta aba nesta sala (sessionStorage), que ninguém mais vê. Só existe com o jogo correndo e no
   * fim. Preso embaixo, logo à direita da coluna (`left`, `width`: de `notepadBox`; a altura, de `size`). "Minimizar" o
   * deixa como uma aba presa embaixo, que sobe um pouco com o mouse em cima e abre com um clique. N alterna entre os dois.
   * A alça no canto de cima à direita (e as bordas de cima e da direita) muda o tamanho: `resize` diz o tamanho novo de
   * um arrasto a partir de `size`, `onsize` avisa (`done` ao soltar); o duplo clique na alça avisa null: o padrão.
   */
  let { code, minimized, left, width, size, resize, onsize, onminimize }: {
    code: string; minimized: boolean; left: number; width: number; size: Size;
    resize: (start: Size, dx: number, dy: number, edges: Edges) => Size;
    onsize: (size: Size | null, done: boolean) => void;
    onminimize: (on: boolean) => void;
  } = $props();
  let text = $state(untrack(() => notepad(code)));
  let field = $state<HTMLTextAreaElement>();

  let drag = $state<{ id: number; x: number; y: number; start: Size; edges: Edges; last: Size } | null>(null);
  function grab(e: PointerEvent, edges: Edges) {
    if (e.button !== 0) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, start: size, edges, last: size };
  }
  function move(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.id) return;
    const next = resize(drag.start, e.clientX - drag.x, e.clientY - drag.y, drag.edges);
    if (next.w === drag.last.w && next.h === drag.last.h) return;
    drag.last = next;
    onsize(next, false);
  }
  function drop(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.id) return;
    if (drag.last.w !== drag.start.w || drag.last.h !== drag.start.h) onsize(drag.last, true);
    drag = null;
  }
  const handle = (edges: Edges) => ({
    onpointerdown: (e: PointerEvent) => grab(e, edges), onpointermove: move, onpointerup: drop, onpointercancel: drop,
    ondblclick: () => onsize(null, true),
  });
</script>

{#if minimized}
  <button class="gs-notepad-tab" type="button" style:left="{left}px" aria-expanded="false" aria-label={t('notepad.open')} onclick={() => onminimize(false)}>
    <span>{t('notepad.title')}</span>{#if text.trim()}<span class="dot" aria-hidden="true"></span>{/if}<Kbd keys={['N']} />
  </button>
{:else}
  <aside class="gs-float gs-notepad" class:resizing={drag !== null} style:left="{left}px" style:width="{width}px" style:height="{size.h}px" aria-label={t('notepad.title')}>
    <div class="gs-float-head">
      <div class="heading"><h3 class="gs-float-title">{t('notepad.title')}</h3></div>
      <button class="ss-btn ghost gs-sm" type="button" aria-expanded="true" onclick={() => onminimize(true)}>{t('notepad.minimize')} <Kbd keys={['N']} /></button>
    </div>
    <label class="ss-textarea">
      <span class="control"><textarea class="field" rows="6" bind:this={field} bind:value={text} oninput={() => rememberNotepad(code, text)} placeholder={t('notepad.placeholder')} aria-label={t('notepad.title')}></textarea></span>
    </label>
    <span class="gs-notepad-edge top" aria-hidden="true" {...handle({ w: false, h: true })}></span>
    <span class="gs-notepad-edge right" aria-hidden="true" {...handle({ w: true, h: false })}></span>
    <span class="gs-notepad-grip" title={t('notepad.resize')} aria-hidden="true" {...handle({ w: true, h: true })}></span>
  </aside>
{/if}
