<script lang="ts">
  /** O personagem `n` inteiro, ampliado sem borrar; `animate` toca o parado em loop. */
  import { frameAt, HERO, heroSheet, sheetSize } from '../sprites/hero';
  let { n, scale = 2, animate = false }: { n: number; scale?: number; animate?: boolean } = $props();
  const idle = HERO.animations.idle;
  const start = frameAt('idle', 0);
</script>

<span
  class="gs-hero"
  class:animate
  aria-hidden="true"
  style:width="{HERO.frame.w * scale}px"
  style:height="{HERO.frame.h * scale}px"
  style:background-image="url({heroSheet(n)})"
  style:background-size="{sheetSize.w * scale}px {sheetSize.h * scale}px"
  style:background-position="-{start.x * scale}px -{start.y * scale}px"
  style:--to="-{idle.frames * HERO.frame.w * scale}px"
  style:--steps={idle.frames}
  style:--dur="{idle.frames / idle.fps}s"
></span>

<style>
  .gs-hero { display: inline-block; flex: none; background-repeat: no-repeat; image-rendering: pixelated; }
  .gs-hero.animate { animation: gs-idle var(--dur) steps(var(--steps)) infinite; }
  @keyframes gs-idle { to { background-position-x: var(--to); } }
  @media (prefers-reduced-motion: reduce) { .gs-hero.animate { animation: none; } }
</style>
