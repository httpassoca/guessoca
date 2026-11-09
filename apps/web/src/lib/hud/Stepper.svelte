<script lang="ts">
  import Icon from './Icon.svelte';

  /** Um valor com − e + dos lados (tamanho da vez, limite de pessoas). Sem `onstep`, só mostra o valor. */
  let { value, lessLabel, moreLabel, canLess = true, canMore = true, onstep }: {
    value: string; lessLabel: string; moreLabel: string; canLess?: boolean; canMore?: boolean; onstep?: (dir: -1 | 1) => void;
  } = $props();
</script>

{#if onstep}
  <span class="gs-stepper">
    <button class="ss-btn gs-icon-btn" type="button" disabled={!canLess} aria-label={lessLabel} title={lessLabel} onclick={() => onstep(-1)}><Icon name="minus" /></button>
    <span class="gs-step-value" aria-live="polite">{value}</span>
    <button class="ss-btn gs-icon-btn" type="button" disabled={!canMore} aria-label={moreLabel} title={moreLabel} onclick={() => onstep(1)}><Icon name="plus" /></button>
  </span>
{:else}
  <span class="gs-step-value">{value}</span>
{/if}
