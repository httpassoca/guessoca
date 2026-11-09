<script lang="ts">
  import type { RoomSnapshot } from '@guess/protocol';
  import Confirm from '../hud/Confirm.svelte';
  import { t } from '../i18n.svelte';
  import type { GameRequest } from '../room/remote';
  import type { RoomView } from '../room/view';
  import MemberActions from './MemberActions.svelte';
  import OrderList from './OrderList.svelte';

  /**
   * Os poderes do moderador durante o jogo: marcar cada um como acertou ou não (passa por cima da votação e desfaz uma
   * revelação), passar a vez de quem for, pausar o relógio, reordenar, expulsar, passar o papel e encerrar.
   */
  let { v, room, send }: { v: RoomView; room: RoomSnapshot; send: (r: GameRequest) => void } = $props();
  const status = $derived(new Map(v.postits.map((c) => [c.owner.id, c.status])));
</script>

<section class="ss-card gs-block">
  <div class="head">
    <div class="heading"><span class="title">{t('mod.title')}</span><span class="desc">{t('mod.hint')}</span></div>
  </div>
  <div class="body">
    <div class="gs-row">
      <button class="ss-btn" type="button" disabled={!v.moderatorCanSkip} onclick={() => send({ type: 'skip' })}>{t('mod.skip')}</button>
      <button class="ss-btn" type="button" onclick={() => send({ type: 'pause', on: !room.paused })}>{room.paused ? t('mod.resume') : t('mod.pause')}</button>
      <Confirm label={t('mod.endGame')} onconfirm={() => send({ type: 'endGame' })} />
    </div>
    <OrderList players={v.players} {room} editable onreorder={(order) => send({ type: 'order', order })}>
      {#snippet actions(m)}
        {@const s = status.get(m.id) ?? 'playing'}
        <button class="ss-btn ghost" type="button" class:on={s === 'got'} disabled={s === 'got'} onclick={() => send({ type: 'mark', member: m.id, right: true })}>{t('mod.markRight')}</button>
        <button class="ss-btn ghost" type="button" disabled={s === 'playing'} onclick={() => send({ type: 'mark', member: m.id, right: false })}>{t('mod.markWrong')}</button>
        <MemberActions {m} you={room.you} {send} />
      {/snippet}
    </OrderList>
  </div>
</section>
