<script lang="ts">
  /** O rosto do personagem `n` (a cabeça do primeiro quadro do parado), num quadradinho com a cor do cabelo. null = sem personagem. */
  import { HERO, heroColor, heroSheet, sheetSize } from '../sprites/hero';
  let { n, size = 22 }: { n: number | null; size?: number } = $props();
  const scale = $derived(size / HERO.head.size);
</script>

{#if n === null}
  <span class="gs-swatch none" style:width="{size}px" style:height="{size}px" aria-hidden="true">·</span>
{:else}
  <span
    class="gs-swatch"
    aria-hidden="true"
    style:--c={heroColor(n)}
    style:width="{size}px"
    style:height="{size}px"
    style:background-image="url({heroSheet(n)})"
    style:background-size="{sheetSize.w * scale}px {sheetSize.h * scale}px"
    style:background-position="-{HERO.head.x * scale}px -{HERO.head.y * scale}px"
  ></span>
{/if}
