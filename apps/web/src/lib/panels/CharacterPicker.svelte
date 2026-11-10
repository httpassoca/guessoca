<script lang="ts">
  import { CHARACTERS } from '@guess/rules';
  import { t } from '../i18n.svelte';
  import Hero from './Hero.svelte';

  /**
   * Os nove personagens para escolher um (pré-lobby e lobby): o escolhido anda. Não são exclusivos: duas pessoas da
   * sala podem usar o mesmo. Um botão por lugar (0..`CHARACTERS`−1), com o retrato de `Hero` na escala 2; os nomes são
   * "Personagem N" (i18n `pre.characterN`), não os nomes das cores de `characters.json`. Um modelo novo aparece aqui
   * sem mudar nada.
   */
  let { value, onpick }: { value: number | null; onpick: (n: number) => void } = $props();
  const all = Array.from({ length: CHARACTERS }, (_, n) => n);
</script>

<div class="gs-chars" role="radiogroup" aria-label={t('pre.character')}>
  {#each all as n (n)}
    {@const mine = value === n}
    <button class="gs-char" type="button" role="radio" class:mine aria-checked={mine} title={t('pre.characterN', { n: n + 1 })} aria-label={t('pre.characterN', { n: n + 1 })} onclick={() => onpick(n)}>
      <Hero {n} animate={mine} />
    </button>
  {/each}
</div>
