<script lang="ts">
  import { onMount } from 'svelte';
  import { ROOFTOP, rooftopSheet } from '../sprites/rooftop';

  /**
   * Uma faixa fina de telhado, da folha do telhado (o tampo e a beirada), ampliada sem borrar: o chão onde o personagem
   * escolhido fica no pré-lobby. `w` em pixels da folha; `scale`, quantas vezes ampliar.
   */
  let { w = 72, scale = 4 }: { w?: number; scale?: number } = $props();
  const TOP = 10; // quantas linhas do tampo aparecem atrás da beirada
  const roof = ROOFTOP.frames['roof-top'];
  const lip = ROOFTOP.frames.ledge;
  let canvas = $state<HTMLCanvasElement>();

  onMount(() => {
    const img = new Image();
    img.onload = () => {
      const g = canvas?.getContext('2d');
      if (!g) return;
      g.imageSmoothingEnabled = false;
      for (let x = 0; x < w; x += roof.w) g.drawImage(img, roof.x, roof.y, roof.w, TOP, x, 0, roof.w, TOP);
      for (let x = 0; x < w; x += lip.w) g.drawImage(img, lip.x, lip.y, lip.w, lip.h, x, TOP, lip.w, lip.h);
    };
    img.src = rooftopSheet;
  });
</script>

<canvas class="gs-ledge" bind:this={canvas} width={w} height={TOP + lip.h} style:width="{w * scale}px" style:height="{(TOP + lip.h) * scale}px" aria-hidden="true"></canvas>
