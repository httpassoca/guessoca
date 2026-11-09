<script lang="ts">
  import type { MemberView, RoomSnapshot } from '@guess/protocol';
  import { t } from '../i18n.svelte';
  import Swatch from './Swatch.svelte';

  /** Uma pessoa da turma numa linha: personagem, apelido e as marcas (você, moderador, caiu, fantasma, falso). */
  let { m, room }: { m: MemberView; room: RoomSnapshot } = $props();
</script>

<span class="gs-who" class:off={!m.connected}>
  <Swatch n={m.character} />
  <span class="name">{m.nickname}</span>
  {#if m.id === room.you}<span class="ss-badge brand">{t('badge.you')}</span>{/if}
  {#if m.id === room.moderator}<span class="ss-badge caution">{t('badge.moderator')}</span>{/if}
  {#if m.ghost}<span class="ss-badge info">{t('badge.ghost')}</span>{/if}
  {#if m.fake}<span class="ss-badge neutral">{t('badge.fake')}</span>{/if}
  {#if !m.connected}<span class="ss-badge neutral">{t('badge.offline')}</span>{/if}
</span>
