<script lang="ts">
  /** Uma tecla (ou combinação) no contrato de markup do dssoca (`ss-kbd`). */
  let { keys }: { keys: string[] } = $props();
</script>

<span class="ss-kbd">{#each keys as k, i (i)}<span class="key">{k}</span>{/each}</span>
