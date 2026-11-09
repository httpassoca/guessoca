<script lang="ts">
  import { CHARACTERS } from '@guess/rules';
  import { t } from '../i18n.svelte';
  import Hero from './Hero.svelte';

  /**
   * Os oito personagens para escolher um (pré-lobby): o escolhido anda; os que outra pessoa da sala pegou ficam
   * apagados, com o apelido de quem pegou. `taken[n]`: o apelido de quem tem o personagem `n`, ou null.
   */
  let { value, taken = [], onpick }: { value: number | null; taken?: (string | null)[]; onpick: (n: number) => void } = $props();
  const all = Array.from({ length: CHARACTERS }, (_, n) => n);
</script>

<div class="gs-chars" role="radiogroup" aria-label={t('pre.character')}>
  {#each all as n (n)}
    {@const by = taken[n] ?? null}
    {@const mine = value === n}
    <button class="gs-char" type="button" role="radio" class:mine aria-checked={mine} disabled={by !== null} title={by ?? t('pre.characterN', { n: n + 1 })} aria-label={by ? t('pre.characterTaken', { n: n + 1, name: by }) : t('pre.characterN', { n: n + 1 })} onclick={() => onpick(n)}>
      <Hero {n} animate={mine} />
      {#if by}<span class="who">{by}</span>{/if}
    </button>
  {/each}
</div>
