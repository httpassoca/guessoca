<script lang="ts">
  /**
   * O personagem `n` parado, ampliado sem borrar, numa janela igual para os dois modelos (`PORTRAIT`) com o pé no mesmo
   * lugar; `animate` toca o parado em loop. A folha anda por dentro da janela, que corta o resto do quadro.
   *
   * Sem Pixi: a folha `char-N.png` como `background-image` com `image-rendering: pixelated`, e a animação é um
   * `steps()` de CSS que anda `background-position-x` um quadro por passo, no fps do atlas (`idle.frames / idle.fps` s
   * por volta). `scale` é inteiro (pixels da tela por unidade do mundo), para não borrar; a arte grande (`artScale` < 1) é
   * encolhida com suavização. Usado por `CharacterPicker`
   * (escala 2) e `Stage` (escala 4). Lê `../sprites/characters.ts`.
   */
  import { artScale, character, frameAt, PORTRAIT, sheetSize } from '../sprites/characters';
  let { n, scale: screen = 2, animate = false }: { n: number; scale?: number; animate?: boolean } = $props();
  const art = $derived(character(n));
  const atlas = $derived(art.atlas);
  /** pixels da tela por pixel do quadro: a escala pedida vezes a do atlas (menor que 1 na arte grande, que então é suavizada) */
  const scale = $derived(screen * artScale(atlas));
  const idle = $derived(atlas.animations.idle);
  const start = $derived(frameAt(atlas, 'idle', 0));
  const size = $derived(sheetSize(atlas));
</script>

<span class="gs-hero" aria-hidden="true" style:width="{PORTRAIT.w * screen}px" style:height="{PORTRAIT.h * screen}px">
  <span
    class="frame"
    class:animate
    class:smooth={artScale(atlas) < 1}
    style:left="{PORTRAIT.anchorX * screen - atlas.anchor.x * scale}px"
    style:top="{PORTRAIT.h * screen - atlas.anchor.y * scale}px"
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
  .frame.smooth { image-rendering: auto; }
  .frame.animate { animation: gs-idle var(--dur) steps(var(--steps)) infinite; }
  @keyframes gs-idle { to { background-position-x: var(--to); } }
  @media (prefers-reduced-motion: reduce) { .frame.animate { animation: none; } }
</style>
