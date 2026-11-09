<script lang="ts">
  /**
   * O personagem `n` parado, ampliado sem borrar, numa janela igual para os dois modelos (`PORTRAIT`) com o pé no mesmo
   * lugar; `animate` toca o parado em loop. A folha anda por dentro da janela, que corta o resto do quadro.
   */
  import { character, frameAt, PORTRAIT, sheetSize } from '../sprites/characters';
  let { n, scale = 2, animate = false }: { n: number; scale?: number; animate?: boolean } = $props();
  const art = $derived(character(n));
  const atlas = $derived(art.atlas);
  const idle = $derived(atlas.animations.idle);
  const start = $derived(frameAt(atlas, 'idle', 0));
  const size = $derived(sheetSize(atlas));
</script>

<span class="gs-hero" aria-hidden="true" style:width="{PORTRAIT.w * scale}px" style:height="{PORTRAIT.h * scale}px">
  <span
    class="frame"
    class:animate
    style:left="{(PORTRAIT.anchorX - atlas.anchor.x) * scale}px"
    style:top="{(PORTRAIT.h - atlas.anchor.y) * scale}px"
    style:width="{atlas.frame.w * scale}px"
    style:height="{atlas.frame.h * scale}px"
    style:background-image="url({art.sheet})"
    style:background-size="{size.w * scale}px {size.h * scale}px"
    style:background-position="-{start.x * scale}px -{start.y * scale}px"
    style:--to="-{idle.frames * atlas.frame.w * scale}px"
    style:--steps={idle.frames}
    style:--dur="{idle.frames / idle.fps}s"
  ></span>
</span>

<style>
  .gs-hero { position: relative; display: inline-block; flex: none; overflow: hidden; }
  .frame { position: absolute; background-repeat: no-repeat; image-rendering: pixelated; }
  .frame.animate { animation: gs-idle var(--dur) steps(var(--steps)) infinite; }
  @keyframes gs-idle { to { background-position-x: var(--to); } }
  @media (prefers-reduced-motion: reduce) { .frame.animate { animation: none; } }
</style>
