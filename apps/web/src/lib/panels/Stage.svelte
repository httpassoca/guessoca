<script lang="ts">
  import { artScale, character, PORTRAIT } from '../sprites/characters';
  import Hero from './Hero.svelte';
  import Ledge from './Ledge.svelte';

  /**
   * O personagem escolhido no pré-lobby, grande e parado em loop, numa faixa de telhado, com o apelido em cima como no
   * jogo. Fica ao lado do formulário; os quadradinhos pequenos continuam sendo a escolha. `n` null: só o telhado.
   */
  let { n, nickname }: { n: number | null; nickname: string } = $props();
  /** grande para ver o pixel art de perto ao lado do formulário (o mundo, a 1080p, é 3); a faixa `Ledge` também é 4 */
  const SCALE = 4;
  /** o pé do personagem (a âncora) fica no meio da faixa, não o meio da janela */
  const shift = (PORTRAIT.w / 2 - PORTRAIT.anchorX) * SCALE;
  /** o espaço entre o apelido e o alto da cabeça, em pixels da tela (no jogo são 3 unidades do mundo) */
  const GAP = 12;
  /**
   * quanto o retrato sobe para o apelido ficar `GAP` acima da cabeça deste personagem: a janela (`PORTRAIT.h`) tem a
   * altura do mais alto, e os mais baixos deixam vazio em cima
   */
  const lift = $derived.by(() => {
    if (n === null) return 0;
    const { atlas } = character(n);
    return GAP - Math.round((PORTRAIT.h - (atlas.anchor.y - atlas.stand.y) * artScale(atlas)) * SCALE);
  });
</script>

<div class="gs-stage" aria-hidden="true">
  {#if n !== null}
    <div class="gs-stage-hero" style:transform="translateX({shift}px)" style:--lift="{lift}px">
      <span class="gs-stage-tag" class:empty={!nickname.trim()}>{nickname.trim() || '·'}</span>
      <Hero {n} scale={SCALE} animate />
    </div>
  {/if}
  <Ledge />
</div>
