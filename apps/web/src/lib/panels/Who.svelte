<script lang="ts">
  import type { MemberView, RoomSnapshot } from '@guess/protocol';
  import Icon from '../hud/Icon.svelte';
  import { t } from '../i18n.svelte';
  import Swatch from './Swatch.svelte';

  /**
   * Uma pessoa da turma numa linha: personagem, apelido e as marcas (você, moderador, caiu, fantasma, falso), em texto
   * mono baixo, sem pílula. `compact`: só "você". Quem virou fantasma (`ghosted`) ganha o fantasminha antes do nome, até
 * no compacto (o ranking), e o nome fica apagado.
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

<span class="gs-who" class:off={!m.connected} class:ghosted={m.ghosted}>
  <Swatch n={m.character} />
  {#if m.ghosted}<span class="gs-ghost-mark" role="img" aria-label={t('badge.ghost')} title={t('badge.ghost')}><Icon name="ghost" size={14} /></span>{/if}
  <span class="name">{m.nickname}</span>
  {#if tags.length}<span class="gs-tags">{#each tags as tag (tag)}<span class="gs-tag">{tag}</span>{/each}</span>{/if}
</span>
