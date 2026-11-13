<script lang="ts" module>
  import { t } from '../i18n.svelte';
  import { character, properName } from '../sprites/characters';
  /** o nome de um personagem: o herói e o esqueleto pelo que são (traduzido); os outros pelo nome próprio */
  export const characterName = (n: number) => {
    const c = character(n);
    return c.model === 'hero' ? t('char.hero') : c.model === 'skeleton' ? t('char.skeleton') : properName(c.name);
  };
</script>

<script lang="ts">
  import { Tooltip } from 'dssoca';
  import { CHARACTERS } from '@guess/rules';
  import { onMount } from 'svelte';
  import Icon from '../hud/Icon.svelte';
  import Hero from './Hero.svelte';

  /**
   * Os personagens para escolher um: o escolhido anda. Não são exclusivos: duas pessoas da sala podem usar o mesmo. Um
   * botão por lugar (0..`CHARACTERS`−1), com o personagem enquadrado (`Hero`) e o nome dele num tooltip. Um modelo novo
   * aparece aqui sem mudar nada.
   *
   * `layout`: `grid` (o padrão, no painel do lobby: fileiras de sete, com rolagem) ou `bar` (uma fileira só, com casas
   * maiores: a barra de baixo do pré-lobby). Na barra, quando não cabem todos, as pontas esmaecem e aparecem setas
   * (a roda do mouse também rola de lado), e o escolhido entra na vista ao abrir.
   */
  let { value, onpick, layout = 'grid' }: { value: number | null; onpick: (n: number) => void; layout?: 'grid' | 'bar' } = $props();
  const all = Array.from({ length: CHARACTERS }, (_, n) => n);
  /** a caixa de cada personagem na casa, em pixels da tela: `Hero` o enquadra pelo retângulo dele de pé */
  /** tela baixa (a mesma regra do `app.css`): a barra tem casas menores */
  const SHORT = '(max-height: 900px)';
  let short = $state(typeof matchMedia !== 'undefined' && matchMedia(SHORT).matches);
  const BOX = $derived(layout === 'bar' ? (short ? { w: 48, h: 72 } : { w: 64, h: 104 }) : { w: 56, h: 84 });
  $effect(() => {
    if (layout !== 'bar' || typeof matchMedia === 'undefined') return;
    const mq = matchMedia(SHORT);
    const on = () => (short = mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  });

  let row = $state<HTMLDivElement>();
  let canLeft = $state(false);
  let canRight = $state(false);
  /** o que ainda há para os lados (com 2 px de folga de arredondamento) */
  function measure() {
    if (!row || layout !== 'bar') return;
    canLeft = row.scrollLeft > 2;
    canRight = row.scrollLeft + row.clientWidth < row.scrollWidth - 2;
  }
  function page(d: -1 | 1) { row?.scrollBy({ left: d * row.clientWidth * 0.8, behavior: 'smooth' }); }
  /** a roda de cima para baixo rola a fileira de lado */
  function wheel(e: WheelEvent) {
    if (!row || layout !== 'bar' || Math.abs(e.deltaY) <= Math.abs(e.deltaX) || (!canLeft && !canRight)) return;
    e.preventDefault();
    row.scrollLeft += e.deltaY;
  }
  onMount(() => {
    if (layout !== 'bar' || !row) return;
    const mine = value === null ? null : row.querySelectorAll<HTMLElement>('.gs-char')[value];
    mine?.scrollIntoView({ block: 'nearest', inline: 'center' });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(row);
    return () => ro.disconnect();
  });
</script>

{#snippet tiles()}
  {#each all as n (n)}
    {@const mine = value === n}
    <Tooltip text={characterName(n)}>
      <button class="gs-char" type="button" role="radio" class:mine aria-checked={mine} aria-label={characterName(n)} onclick={() => onpick(n)}>
        <Hero {n} box={BOX} animate={mine} />
      </button>
    </Tooltip>
  {/each}
{/snippet}

{#if layout === 'bar'}
  <div class="gs-chars-wrap" class:left={canLeft} class:right={canRight}>
    <div class="gs-chars bar" role="radiogroup" aria-label={t('pre.character')} bind:this={row} onscroll={measure} onwheel={wheel}>
      {@render tiles()}
    </div>
    {#if canLeft}<button class="ss-btn gs-chars-arrow l" type="button" tabindex="-1" aria-label={t('pre.scrollLeft')} onclick={() => page(-1)}><Icon name="left" /></button>{/if}
    {#if canRight}<button class="ss-btn gs-chars-arrow r" type="button" tabindex="-1" aria-label={t('pre.scrollRight')} onclick={() => page(1)}><Icon name="right" /></button>{/if}
  </div>
{:else}
  <div class="gs-chars" role="radiogroup" aria-label={t('pre.character')}>
    {@render tiles()}
  </div>
{/if}
