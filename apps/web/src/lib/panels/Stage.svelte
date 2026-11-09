<script lang="ts">
  import { PORTRAIT } from '../sprites/characters';
  import Hero from './Hero.svelte';
  import Ledge from './Ledge.svelte';

  /**
   * O personagem escolhido no pré-lobby, grande e parado em loop, numa faixa de telhado, com o apelido em cima como no
   * jogo. Fica ao lado do formulário; os quadradinhos pequenos continuam sendo a escolha. `n` null: só o telhado.
   */
  let { n, nickname }: { n: number | null; nickname: string } = $props();
  const SCALE = 4;
  /** o pé do personagem (a âncora) fica no meio da faixa, não o meio da janela */
  const shift = (PORTRAIT.w / 2 - PORTRAIT.anchorX) * SCALE;
</script>

<div class="gs-stage" aria-hidden="true">
  {#if n !== null}
    <div class="gs-stage-hero" style:transform="translateX({shift}px)">
      <span class="gs-stage-tag" class:empty={!nickname.trim()}>{nickname.trim() || '·'}</span>
      <Hero {n} scale={SCALE} animate />
    </div>
  {/if}
  <Ledge />
</div>
