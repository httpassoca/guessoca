<script lang="ts">
  import { Tooltip } from 'dssoca';
  import { CHARACTERS } from '@guess/rules';
  import { t } from '../i18n.svelte';
  import { character, properName } from '../sprites/characters';
  import Hero from './Hero.svelte';

  /**
   * Os personagens para escolher um: o escolhido anda. Não são exclusivos: duas pessoas da sala podem usar o mesmo. Um
   * botão por lugar (0..`CHARACTERS`−1), com o personagem enquadrado (`Hero`) e o nome dele num tooltip. Um modelo novo
   * aparece aqui sem mudar nada.
   *
   * `layout`: `grid` (o padrão, no painel do lobby: fileiras de sete, com rolagem) ou `bar` (uma fileira só, com casas
   * maiores: a barra de baixo do pré-lobby).
   */
  let { value, onpick, layout = 'grid' }: { value: number | null; onpick: (n: number) => void; layout?: 'grid' | 'bar' } = $props();
  const all = Array.from({ length: CHARACTERS }, (_, n) => n);
  /** a caixa de cada personagem na casa, em pixels da tela: `Hero` o enquadra pelo retângulo dele de pé */
  const BOX = $derived(layout === 'bar' ? { w: 64, h: 104 } : { w: 56, h: 84 });
  /** o nome de um personagem: o herói e o esqueleto pelo que são (traduzido); os outros pelo nome próprio */
  const nameOf = (n: number) => {
    const c = character(n);
    return c.model === 'hero' ? t('char.hero') : c.model === 'skeleton' ? t('char.skeleton') : properName(c.name);
  };
</script>

<div class="gs-chars" class:bar={layout === 'bar'} role="radiogroup" aria-label={t('pre.character')}>
  {#each all as n (n)}
    {@const mine = value === n}
    <Tooltip text={nameOf(n)}>
      <button class="gs-char" type="button" role="radio" class:mine aria-checked={mine} aria-label={nameOf(n)} onclick={() => onpick(n)}>
        <Hero {n} box={BOX} animate={mine} />
      </button>
    </Tooltip>
  {/each}
</div>
