<script lang="ts">
  import type { MemberView, RoomSnapshot } from '@guess/protocol';
  import { t } from '../i18n.svelte';
  import Swatch from './Swatch.svelte';

  /**
   * Uma pessoa da turma numa linha: personagem, apelido e as marcas (você, moderador, caiu, fantasma, falso), em texto
   * mono baixo, sem pílula. `compact`: só "você".
   */
  let { m, room, compact = false }: { m: MemberView; room: RoomSnapshot; compact?: boolean } = $props();
  const tags = $derived([
    m.id === room.you && t('badge.you'),
    !compact && m.id === room.moderator && t('badge.moderator'),
    !compact && m.ghost && t('badge.ghost'),
    !compact && m.fake && t('badge.fake'),
    !compact && !m.connected && t('badge.offline'),
  ].filter((x): x is string => !!x));
</script>

<span class="gs-who" class:off={!m.connected}>
  <Swatch n={m.character} />
  <span class="name">{m.nickname}</span>
  {#if tags.length}<span class="gs-tags">{#each tags as tag (tag)}<span class="gs-tag">{tag}</span>{/each}</span>{/if}
</span>
