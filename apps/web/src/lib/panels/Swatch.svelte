<script lang="ts">
  /**
   * O rosto do personagem `n` (a cabeça do primeiro quadro do parado), num quadradinho com a cor dele. null = sem
   * personagem. O quadrado `atlas.head` (pixels do quadro, achado pela receita do modelo em `tools/sprites`) é ampliado
   * até `size` pixels da tela; a escala aqui não é inteira, e o `image-rendering: pixelated` do `.gs-swatch` (`app.css`)
   * evita o borrão. A cor (`--c`) é a de `characters.json`, igual a `--gs-char-N`.
   */
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
