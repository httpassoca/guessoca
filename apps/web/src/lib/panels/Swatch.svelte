<script lang="ts">
  /** O rosto do personagem `n` (a cabeça do primeiro quadro do parado), num quadradinho com a cor dele. null = sem personagem. */
  import { character, sheetSize } from '../sprites/characters';
  let { n, size = 22 }: { n: number | null; size?: number } = $props();
  const art = $derived(n === null ? null : character(n));
  const scale = $derived(art ? size / art.atlas.head.size : 1);
  const sheet = $derived(art ? sheetSize(art.atlas) : { w: 0, h: 0 });
</script>

{#if art === null}
  <span class="gs-swatch none" style:width="{size}px" style:height="{size}px" aria-hidden="true">·</span>
{:else}
  <span
    class="gs-swatch"
    aria-hidden="true"
    style:--c={art.color}
    style:width="{size}px"
    style:height="{size}px"
    style:background-image="url({art.sheet})"
    style:background-size="{sheet.w * scale}px {sheet.h * scale}px"
    style:background-position="-{art.atlas.head.x * scale}px -{art.atlas.head.y * scale}px"
  ></span>
{/if}
