<script lang="ts">
  import Hero from './Hero.svelte';
  import Ledge from './Ledge.svelte';

  /**
   * O personagem escolhido no pré-lobby, grande e parado em loop, numa faixa de telhado, com o apelido em cima como no
   * jogo. Fica ao lado do formulário; os quadradinhos pequenos continuam sendo a escolha. `n` null: só o telhado.
   *
   * O personagem enche a caixa `BOX` (`Hero` o enquadra pelo retângulo dele de pé), então o apelido fica sempre logo
   * acima da cabeça e o pé sempre no tampo do telhado, seja o cachorro ou o do dinossauro.
   */
  let { n, nickname }: { n: number | null; nickname: string } = $props();
  /** a caixa do personagem, em pixels da tela: a largura da faixa de telhado, e uma altura que cabe ao lado do formulário */
  const BOX = { w: 272, h: 232 };
</script>

<div class="gs-stage" aria-hidden="true">
  {#if n !== null}
    <div class="gs-stage-hero">
      <span class="gs-stage-tag" class:empty={!nickname.trim()}>{nickname.trim() || '·'}</span>
      <Hero {n} box={BOX} animate />
    </div>
  {/if}
  <Ledge />
</div>
