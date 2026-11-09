<script lang="ts">
  import { route } from './lib/route.svelte';
  import Home from './lib/screens/Home.svelte';
  import Sala from './lib/screens/Sala.svelte';
</script>

{#if route.current.name === 'sala'}
  {#key route.current.code}<Sala code={route.current.code} />{/key}
{:else}
  <Home />
{/if}
