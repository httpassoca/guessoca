<script lang="ts">
  import type { MemberView } from '@guess/protocol';
  import Confirm from '../hud/Confirm.svelte';
  import { t } from '../i18n.svelte';
  import type { GameRequest } from '../room/remote';

  /** Moderador, sobre outra pessoa: passar o papel de moderador e expulsar. Sobre si mesmo, nada. */
  let { m, you, send }: { m: MemberView; you: string | null; send: (r: GameRequest) => void } = $props();
</script>

{#if m.id !== you}
  <Confirm label={t('mod.handOver')} onconfirm={() => send({ type: 'handOver', member: m.id })} />
  <Confirm label={t('mod.kick')} onconfirm={() => send({ type: 'kick', member: m.id })} />
{/if}
