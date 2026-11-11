<script lang="ts">
  import Hero from './Hero.svelte';
  import Ledge from './Ledge.svelte';

  /**
   * O personagem escolhido no pré-lobby, parado em loop numa faixa de telhado, com o apelido em cima como no jogo. Fica ao
   * lado do formulário. `n` null: só o telhado.
   *
   * O chão não sai do lugar e a escala é a mesma para todos (`UNIT` pixels por unidade do mundo): trocando de personagem,
   * vê-se o tamanho de cada um contra o mesmo telhado, do cavaleiro pequenino ao homem no dinossauro. A altura do palco é
   * a do mais alto; o apelido acompanha a cabeça.
   */
  let { n, nickname }: { n: number | null; nickname: string } = $props();
  /** pixels da tela por unidade do mundo (o jogo, a 1080p, usa 3) */
  const UNIT = 4;
</script>

<div class="gs-stage" aria-hidden="true">
  <div class="gs-stage-hero">
    {#if n !== null}
      <span class="gs-stage-tag" class:empty={!nickname.trim()}>{nickname.trim() || '·'}</span>
      <Hero {n} unit={UNIT} animate />
    {/if}
  </div>
  <Ledge w={84} />
</div>
