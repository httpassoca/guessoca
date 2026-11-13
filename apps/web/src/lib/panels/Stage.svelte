<script lang="ts">
  import { onMount } from 'svelte';
  import { ROOFTOP, rooftopSheet } from '../sprites/rooftop';
  import { windowFrame, windowId, type Pane } from '../world/ambient';
  import HowTo from './HowTo.svelte';
  import Hero from './Hero.svelte';
  import Ledge from './Ledge.svelte';

  /**
   * O personagem escolhido no pré-lobby, parado em loop numa faixa de telhado, com o apelido em cima como no jogo. Fica ao
   * lado do formulário, com "como funciona" embaixo. `n` null: só o telhado.
   *
   * O chão não sai do lugar e a escala é a mesma para todos (`UNIT` pixels por unidade do mundo): trocando de personagem,
   * vê-se o tamanho de cada um contra o mesmo telhado, do cavaleiro pequenino ao homem no dinossauro. A altura do palco é
   * a do mais alto; o apelido acompanha a cabeça. Sem apelido, a etiqueta guarda o lugar mas não aparece.
   *
   * Atrás, discreto (issue #70): um pedaço da fachada do hotel, sumindo no escuro, com as janelas vivas do jogo (as
   * mesmas contas de `world/ambient.ts`: acendem, apagam, a televisão tremeluz, às vezes alguém passa), e chuva fina.
   * Com "reduzir movimento" no sistema, fica parado e sem chuva.
   */
  let { n, nickname }: { n: number | null; nickname: string } = $props();
  /** pixels da tela por unidade do mundo (o jogo, a 1080p, usa 3) */
  const UNIT = 4;
  /** o pedaço da fachada do hotel: três baias do primeiro andar, a partir do canto de cima do ladrilho */
  const FACADE = ROOFTOP.frames['facade-b'];
  const WIN = FACADE.windows!;
  const BAYS = 3;
  const W = WIN.x + BAYS * WIN.bay - 3;
  /** da laje de cima até o peitoril da janela (o resto do andar, embaixo, sobraria como um pedaço solto) */
  const H = WIN.y + WIN.h + 1;
  /** quantos traços de chuva, e o desenho de cada um (atraso, duração, posição), fixos */
  const DROPS = Array.from({ length: 14 }, (_, i) => ({ left: (i * 37) % 100, delay: -((i * 0.29) % 1.1), dur: 0.75 + ((i * 7) % 5) * 0.08 }));
  let canvas = $state<HTMLCanvasElement>();

  onMount(() => {
    const img = new Image();
    let timer: ReturnType<typeof setInterval> | undefined;
    const draw = (now: number) => {
      const g = canvas?.getContext('2d');
      if (!g) return;
      g.imageSmoothingEnabled = false;
      g.drawImage(img, FACADE.x, FACADE.y, W, H, 0, 0, W, H);
      for (let i = 0; i < BAYS; i++) {
        const base = WIN.plan[0][i];
        // um número fora dos telhados do mapa (99): estas janelas não são as de nenhum prédio do jogo
        const name = base === '.' ? null : windowFrame(base as Pane, windowId(99, i, 0), now);
        if (!name) continue;
        const f = ROOFTOP.frames[name];
        g.drawImage(img, f.x, f.y, f.w, f.h, WIN.x + i * WIN.bay, WIN.y, f.w, f.h);
      }
    };
    img.onload = () => {
      draw(performance.now());
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) timer = setInterval(() => draw(performance.now()), 150);
    };
    img.src = rooftopSheet;
    return () => clearInterval(timer);
  });
</script>

<div class="gs-stage">
  <canvas class="gs-stage-facade" bind:this={canvas} width={W} height={H} style:width="{W * UNIT}px" style:height="{H * UNIT}px" aria-hidden="true"></canvas>
  <div class="gs-stage-rain" aria-hidden="true">
    {#each DROPS as d, i (i)}<span style:left="{d.left}%" style:animation-delay="{d.delay}s" style:animation-duration="{d.dur}s"></span>{/each}
  </div>
  <div class="gs-stage-hero" aria-hidden="true">
    {#if n !== null}
      <span class="gs-stage-tag" class:empty={!nickname.trim()}>{nickname.trim() || '·'}</span>
      <Hero {n} unit={UNIT} animate />
    {/if}
  </div>
  <Ledge w={84} />
  <HowTo />
</div>
