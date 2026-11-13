<script lang="ts">
  import type { RoomSnapshot } from '@guess/protocol';
  import { Tooltip } from 'dssoca';
  import Confirm from '../hud/Confirm.svelte';
  import Icon from '../hud/Icon.svelte';
  import { t } from '../i18n.svelte';
  import type { GameRequest } from '../room/remote';
  import { moveBy, type Progress, type RoomView, type TurmaRow } from '../room/view';
  import Swatch from './Swatch.svelte';
  import Who from './Who.svelte';

  /**
   * O painel único da turma, na ordem das vezes. Cada linha: a vez, o rosto, o apelido e as marcas; no lobby, para quem a
   * pessoa escreve (o alvo, o rosto e o nome; o moderador troca o alvo numa lista, com três ou mais na turma) e em que pé está (o lápis escrevendo, o lápis parado, o pronto), e o
   * post-it dela ao vivo (o meu "?"); no jogo, o post-it, o estado (na vez, acertou, desistiu) e
   * quantas vezes já teve a vez (`N×`, pequeno). O moderador tem, por
   * linha, ↑ ↓, passar a moderação e expulsar; no jogo, também marcar acertou ou não. Todo ícone se explica no tooltip
   * do dssoca. Os fantasmas vêm à parte, embaixo.
   */
  let { v, room, send }: { v: RoomView; room: RoomSnapshot; send: (r: GameRequest) => void } = $props();

  const lobby = $derived(room.phase === 'lobby');
  /** a ordem e as marcas só valem no lobby e no jogo; no fim, só passar a moderação e expulsar */
  const ended = $derived(room.phase === 'ended');
  const ids = $derived(v.players.map((p) => p.id));
  /** em que pé está quem escreve: o lápis escrevendo (vivo), o lápis parado (vazio) e o pronto */
  const PROGRESS: Record<Progress, 'progress.empty' | 'progress.writing' | 'progress.ready'> = {
    empty: 'progress.empty', writing: 'progress.writing', ready: 'progress.ready',
  };
  /** o moderador escolhe o alvo de cada um à mão; com duas pessoas só existe um arranjo */
  const canAssign = $derived(v.isModerator && lobby && v.players.length > 2);
  function assign(e: Event & { currentTarget: HTMLSelectElement }, author: string, current: string) {
    const owner = e.currentTarget.value;
    e.currentTarget.value = current; // a lista mostra o que a sala diz: muda quando o snapshot chegar
    if (owner !== current) send({ type: 'assign', author, owner });
  }
  const move = (id: string, d: -1 | 1) => send({ type: 'order', order: moveBy(ids, id, d) });
</script>

{#snippet iconBtn(icon: 'up' | 'down' | 'check' | 'undo', label: string, disabled: boolean, onclick: () => void)}
  <Tooltip text={label}>
    <button class="ss-btn ghost gs-icon-btn" type="button" {disabled} aria-label={label} {onclick}><Icon name={icon} /></button>
  </Tooltip>
{/snippet}

{#snippet modActions(id: string, name: string)}
  {#if v.isModerator && id !== room.you}
    <Confirm icon="crown" label={t('mod.handOverTo', { name })} onconfirm={() => send({ type: 'handOver', member: id })} />
    <Confirm icon="kick" label={t('mod.kickName', { name })} onconfirm={() => send({ type: 'kick', member: id })} />
  {/if}
{/snippet}

{#snippet postitChip(r: TurmaRow)}
  {@const c = r.card}
  {#if c?.hidden}
    <Tooltip text={t(c.mine ? 'postit.hidden' : 'postit.secret')}><span class="gs-chip hidden"><span class="q">?</span></span></Tooltip>
  {:else if c && (c.text || c.image)}
    {#snippet chip()}
      <span class="gs-chip">
        {#if c.image}<img src={c.image} alt="" />{/if}
        {#if c.text}<span class="text">{c.text}</span>{/if}
      </span>
    {/snippet}
    {#if c.text}<Tooltip text={c.text}>{@render chip()}</Tooltip>{:else}{@render chip()}{/if}
  {:else}
    <span class="gs-chip blank" aria-hidden="true">…</span>
  {/if}
{/snippet}

<ol class="gs-turma">
  {#each v.turma as r, i (r.member.id)}
    {@const name = r.member.nickname}
    <li class:turn={r.card?.turn} class:off={!r.member.connected} class:done={r.status !== 'playing'}>
      <span class="pos">{r.pos}</span>
      <div class="main">
        <div class="top">
          <Who m={r.member} {room} />
          {#if !lobby}
            <Tooltip text={r.turns === 1 ? t('turma.turnsOne') : t('turma.turns', { n: r.turns })}><span class="turns">{r.turns}×</span></Tooltip>
          {/if}
          {#if v.isModerator}
            <span class="act">
              {#if !lobby && !ended}
                {@render iconBtn('check', t('mod.markRightName', { name }), r.status === 'got', () => send({ type: 'mark', member: r.member.id, right: true }))}
                {@render iconBtn('undo', t('mod.markWrongName', { name }), r.status === 'playing', () => send({ type: 'mark', member: r.member.id, right: false }))}
              {/if}
              {#if !ended}
                {@render iconBtn('up', t('order.up', { name }), i === 0, () => move(r.member.id, -1))}
                {@render iconBtn('down', t('order.down', { name }), i === v.turma.length - 1, () => move(r.member.id, 1))}
              {/if}
              {@render modActions(r.member.id, name)}
            </span>
          {/if}
        </div>
        <div class="sub">
          {@render postitChip(r)}
          <span class="state">
            {#if lobby}
              {#if r.writesFor}
                {@const target = r.writesFor.id === room.you ? t('turma.you') : r.writesFor.nickname}
                {#if canAssign}
                  {@const current = r.writesFor.id}
                  <Tooltip text={t('turma.pickTarget', { name })}>
                    <span class="gs-target pick">
                      <Icon name="target" /><Swatch n={r.writesFor.character} size={16} />
                      <select aria-label={t('turma.pickTarget', { name })} value={current} onchange={(e) => assign(e, r.member.id, current)}>
                        {#each v.players.filter((p) => p.id !== r.member.id) as p (p.id)}
                          <option value={p.id}>{p.id === room.you ? t('turma.you') : p.nickname}</option>
                        {/each}
                      </select>
                    </span>
                  </Tooltip>
                {:else}
                  <Tooltip text={t('turma.writesFor', { owner: target })}>
                    <span class="gs-target" role="img" aria-label={t('turma.writesFor', { owner: target })}>
                      <Icon name="target" /><Swatch n={r.writesFor.character} size={16} /><span class="name">{target}</span>
                    </span>
                  </Tooltip>
                {/if}
                <Tooltip text={t(PROGRESS[r.writing])}>
                  <span class="gs-progress {r.writing}" role="img" aria-label={t(PROGRESS[r.writing])}><Icon name={r.writing === 'ready' ? 'check' : 'pencil'} /></span>
                </Tooltip>
              {:else}
                <span class="writes">{t('turma.writesNobody')}</span>
              {/if}
            {:else if r.card?.turn}<span class="gs-tag turn">{t('play.turnBadge')}</span>
            {:else if r.status === 'got'}<span class="gs-tag good">{t('play.gotBadge', { place: r.place ?? '' })}</span>
            {:else if r.status === 'gaveUp'}<span class="gs-tag">{t('rank.gaveUp')}</span>{/if}
          </span>
        </div>
      </div>
    </li>
  {/each}
</ol>
{#if !v.turma.length}<p class="gs-hint">{t('lobby.nobody')}</p>{/if}

{#if v.ghosts.length}
  <div class="gs-section gs-ghosts">
    <h4>{t('lobby.ghosts')}<span class="gs-n">{v.ghosts.length}</span></h4>
    <ul class="gs-members">
      {#each v.ghosts as g (g.id)}
        <li><Who m={g} {room} />{#if v.isModerator}<span class="act">{@render modActions(g.id, g.nickname)}</span>{/if}</li>
      {/each}
    </ul>
  </div>
{/if}
