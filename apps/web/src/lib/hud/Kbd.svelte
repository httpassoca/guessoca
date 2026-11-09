<script lang="ts">
  /** Uma tecla (ou combinação) no contrato de markup do dssoca (`ss-kbd`); o desenho de tecla é o da guessoca (`app.css`). */
  let { keys }: { keys: string[] } = $props();
</script>

<span class="ss-kbd gs-kbd">{#each keys as k, i (i)}<span class="key">{k}</span>{/each}</span>
