<script lang="ts">
  import { route } from './lib/route.svelte';
  import Home from './lib/screens/Home.svelte';
  import Sala from './lib/screens/Sala.svelte';
</script>

{#if route.current.name === 'sala'}
  {#key route.current.code}<Sala code={route.current.code} />{/key}
{:else if route.current.name === 'sistema'}
  <!-- a página do dono vem num pedaço à parte: quem só joga não baixa -->
  {#await import('./lib/screens/Sistema.svelte') then m}<m.default />{/await}
{:else}
  <Home />
{/if}
