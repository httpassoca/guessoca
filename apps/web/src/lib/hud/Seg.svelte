<script lang="ts" generics="T extends string | number">
  /** Controle segmentado do dssoca (markup do vanilla.css): uma opção marcada de várias. */
  let { value, options, onselect, disabled = false }: { value: T; options: [T, string][]; onselect: (v: T) => void; disabled?: boolean } = $props();
</script>

<div class="ss-segmented" role="radiogroup">
  {#each options as [v, label] (v)}
    <button type="button" role="radio" class="segment" class:selected={value === v} aria-checked={value === v} {disabled} onclick={() => onselect(v)}>{label}</button>
  {/each}
</div>
