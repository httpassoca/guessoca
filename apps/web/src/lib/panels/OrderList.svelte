<script lang="ts">
  import type { MemberView, RoomSnapshot } from '@guess/protocol';
  import type { Snippet } from 'svelte';
  import { t } from '../i18n.svelte';
  import { moveBefore } from '../room/view';
  import Who from './Who.svelte';

  /**
   * A turma na ordem das vezes. O moderador arrasta (drag and drop do HTML) ou usa ↑ ↓ para reordenar, e cada mudança
   * vira um `order`. `actions`: o que mais cada linha mostra à direita (expulsar, passar moderação…).
   */
  let { players, room, editable, onreorder, actions }: {
    players: MemberView[]; room: RoomSnapshot; editable: boolean; onreorder: (order: string[]) => void; actions?: Snippet<[MemberView]>;
  } = $props();

  const ids = $derived(players.map((p) => p.id));
  let dragging = $state<string | null>(null);
  /** onde vai cair: antes deste id, ou no fim (`end`) */
  let over = $state<string | null>(null);

  function drop(before: string | null) {
    if (dragging) {
      const next = moveBefore(ids, dragging, before);
      if (next.join() !== ids.join()) onreorder(next);
    }
    dragging = null; over = null;
  }
  const up = (i: number) => onreorder(moveBefore(ids, ids[i], ids[i - 1]));
  const down = (i: number) => onreorder(moveBefore(ids, ids[i + 1], ids[i]));
</script>

<ol class="gs-order" class:editable>
  {#each players as p, i (p.id)}
    <li
      draggable={editable}
      class:dragging={dragging === p.id}
      class:over={over === p.id && dragging !== p.id}
      ondragstart={(e) => { dragging = p.id; e.dataTransfer?.setData('text/plain', p.id); if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'; }}
      ondragover={(e) => { if (!dragging) return; e.preventDefault(); over = p.id; }}
      ondragleave={() => { if (over === p.id) over = null; }}
      ondrop={(e) => { e.preventDefault(); drop(p.id); }}
      ondragend={() => { dragging = null; over = null; }}
    >
      <span class="pos">{i + 1}</span>
      {#if editable}<span class="grip" aria-hidden="true" title={t('order.drag')}>⠿</span>{/if}
      <Who m={p} {room} />
      <span class="act" data-size-variant="sm">
        {@render actions?.(p)}
        {#if editable}
          <button class="ss-btn ghost gs-icon-btn" type="button" disabled={i === 0} aria-label={t('order.up', { name: p.nickname })} onclick={() => up(i)}>↑</button>
          <button class="ss-btn ghost gs-icon-btn" type="button" disabled={i === players.length - 1} aria-label={t('order.down', { name: p.nickname })} onclick={() => down(i)}>↓</button>
        {/if}
      </span>
    </li>
  {/each}
  {#if editable && dragging}
    <li class="end" class:over={over === 'end'} ondragover={(e) => { e.preventDefault(); over = 'end'; }} ondrop={(e) => { e.preventDefault(); drop(null); }}>{t('order.dropEnd')}</li>
  {/if}
</ol>
