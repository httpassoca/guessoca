<script lang="ts">
  import type { RoomSnapshot } from '@guess/protocol';
  import Confirm from '../hud/Confirm.svelte';
  import Switch from '../hud/Switch.svelte';
  import { t } from '../i18n.svelte';
  import type { GameRequest } from '../room/remote';
  import type { RoomView } from '../room/view';
  import Turma from './Turma.svelte';

  /**
   * O jogo e o fim, na coluna: a turma com o post-it e o estado de cada um (o meu "?" até ser revelado) e, para o
   * moderador, os poderes (marcar, reordenar, expulsar e passar o papel por linha; passar a vez, pausar, encerrar e ligar
   * ou desligar os bots engraçados aqui).
   * No fim, tudo revelado; "Jogar de novo" fica no pé da coluna (`Room`). A vez e a votação ficam em cima, no meio
   * (`TurnBar`); o ranking, no canto de cima à direita.
   */
  let { v, room, send }: { v: RoomView; room: RoomSnapshot; send: (r: GameRequest) => void } = $props();
  const ended = $derived(room.phase === 'ended');
</script>

{#if ended}
  <section class="gs-block gs-sec">
    <div class="gs-sec-head"><h3>{t('end.title')}</h3></div>
    <p class="gs-hint">{v.isModerator ? t('end.hint') : t('end.waitModerator')}</p>
  </section>
{:else if v.isGhost}
  <p class="gs-banner">{t('ghost.banner')}</p>
{/if}

<section class="gs-block gs-sec">
  <div class="gs-sec-head"><h3>{ended ? t('end.postits') : t('play.postits')}</h3></div>
  <Turma {v} {room} {send} />
</section>

{#if v.isModerator && !ended}
  <section class="gs-block gs-sec">
    <div class="gs-sec-head"><h3>{t('mod.title')}</h3></div>
    <p class="gs-hint">{t('mod.hint')}</p>
    <div class="gs-row">
      <button class="ss-btn gs-sm" type="button" disabled={!v.moderatorCanSkip} onclick={() => send({ type: 'skip' })}>{t('mod.skip')}</button>
      <button class="ss-btn gs-sm" type="button" onclick={() => send({ type: 'pause', on: !room.paused })}>{room.paused ? t('mod.resume') : t('mod.pause')}</button>
      <Confirm label={t('mod.endGame')} kind="" small onconfirm={() => send({ type: 'endGame' })} />
    </div>
    <div class="gs-line">
      <span class="gs-two">{t('lobby.funnyBots')}<span class="gs-hint">{t('lobby.funnyBotsHint')}</span></span>
      <Switch label={t('lobby.funnyBots')} on={room.funnyBots} ontoggle={(on) => send({ type: 'funnyBots', on })} />
    </div>
  </section>
{/if}
