<script lang="ts">
  /**
   * O personagem `n` parado, **enquadrado**: só o retângulo dele de pé (o parado, do alto da cabeça ao chão), ampliado ou
   * encolhido para caber em `box` (pixels da tela), centrado e com o pé na linha de baixo. `animate` toca o parado em loop.
   *
   * O quadro inteiro de um personagem tem a folga do ataque e do pulo, e os personagens têm tamanhos muito diferentes (um
   * cachorro no joelho, um homem montado num dinossauro): mostrar o quadro inteiro, ou todos na mesma escala, deixava uns
   * cortados e outros pequenos lá embaixo. Aqui cada um enche a sua caixa; o tamanho de verdade se vê no jogo e na fila
   * do `/sistema`.
   *
   * Sem Pixi: a folha `char-N` como `background-image`, e a animação é um `steps()` de CSS que anda
   * `background-position-x` um quadro por passo, no fps do atlas. A escala é escolhida para o quadro ter um número
   * inteiro de pixels de largura (os passos caem certo); ampliando, é inteira e sem suavizar (pixel art); encolhendo, é
   * suavizada. Usado por `CharacterPicker` (uma caixa pequena por casa) e `Stage` (uma grande). Lê
   * `../sprites/characters.ts`.
   */
  import { character, fitScale, frameAt, sheetSize } from '../sprites/characters';
  let { n, box, animate = false }: { n: number; box: { w: number; h: number }; animate?: boolean } = $props();
  const art = $derived(character(n));
  const atlas = $derived(art.atlas);
  const idle = $derived(atlas.animations.idle);
  const start = $derived(frameAt(atlas, 'idle', 0));
  const size = $derived(sheetSize(atlas));
  const fit = $derived(fitScale(atlas, box));
</script>

<span class="gs-hero" aria-hidden="true" style:width="{box.w}px" style:height="{box.h}px">
  <span class="crop" style:width="{Math.round(fit.w * fit.k)}px" style:height="{Math.round(fit.h * fit.k)}px">
    <span
      class="frame"
      class:animate
      class:smooth={fit.k < 1}
      style:left="{-fit.x * fit.k}px"
      style:top="{-fit.y * fit.k}px"
      style:width="{atlas.frame.w * fit.k}px"
      style:height="{atlas.frame.h * fit.k}px"
      style:background-image="url({art.sheet})"
      style:background-size="{size.w * fit.k}px {size.h * fit.k}px"
      style:background-position="-{start.x * fit.k}px -{start.y * fit.k}px"
      style:--to="-{idle.frames * atlas.frame.w * fit.k}px"
      style:--steps={idle.frames}
      style:--dur="{idle.frames / idle.fps}s"
    ></span>
  </span>
</span>

<style>
  .gs-hero { display: inline-flex; align-items: flex-end; justify-content: center; flex: none; }
  .crop { position: relative; display: block; overflow: hidden; flex: none; }
  .frame { position: absolute; background-repeat: no-repeat; image-rendering: pixelated; }
  .frame.smooth { image-rendering: auto; }
  .frame.animate { animation: gs-idle var(--dur) steps(var(--steps)) infinite; }
  @keyframes gs-idle { to { background-position-x: var(--to); } }
  @media (prefers-reduced-motion: reduce) { .frame.animate { animation: none; } }
</style>
