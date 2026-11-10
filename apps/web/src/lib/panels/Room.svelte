<script lang="ts">
  import type { RoomSnapshot } from '@guess/protocol';
  import { Tooltip } from 'dssoca';
  import { MIN_PLAYERS } from '@guess/rules';
  import { onMount, untrack } from 'svelte';
  import type { MsgKey } from '../i18n';
  import { t } from '../i18n.svelte';
  import { notepadMinimized, rememberedCharacter, rememberNotepadMinimized, rememberSideCollapsed, sideCollapsed } from '../identity';
  import { isTextField, keyAction } from '../keys';
  import { besideSide, EDGE, GAP, notepadBox, sideCollapsedAfter, sideInset, type Phase } from '../layout';
  import type { GameRequest, RemoteRoom, RemoteState } from '../room/remote';
  import { characterToClaim, countdown, devTools, roomView } from '../room/view';
  import { roomPath } from '../route.svelte';
  import { musicWanted } from '../sound/music';
  import { playSfx, setMusic } from '../sound/player';
  import { roomSoundsTracker } from '../sound/room';
  import Icon from '../hud/Icon.svelte';
  import World from '../world/World.svelte';
  import Corner from './Corner.svelte';
  import Game from './Game.svelte';
  import Lobby from './Lobby.svelte';
  import Menu from './Menu.svelte';
  import Notepad from './Notepad.svelte';
  import Ranking from './Ranking.svelte';
  import TurnBar from './TurnBar.svelte';

  /**
   * A sala depois de entrar na turma: o telhado sempre ligado atrás de tudo (`World`) e, por cima, sem barra: os botões
   * do canto de cima à esquerda (menu, coluna, link), a coluna da sala à esquerda (o lobby, ou a turma e a moderação no
   * jogo; recolhível), a vez e a votação em cima no meio, o ranking no canto de cima à direita e o bloco preso embaixo
   * ao lado da coluna (só no jogo e no fim). Tudo o que é decidido vem de `roomView`; aqui só se desenha e se pede.
   */
  let { remote, st, room, token, status }: { remote: RemoteRoom; st: RemoteState; room: RoomSnapshot; token: string; status: string } = $props();

  const v = $derived(roomView(room));
  const send = (r: GameRequest) => remote.send(r);

  // o relógio da tela: os snapshots dizem quanto sobrava quando chegaram; daqui se conta para baixo
  let now = $state(performance.now());
  const turnLeft = $derived(v.turn ? countdown(v.turn.left, st.receivedAt, now, v.turn.running) : 0);
  const voteLeft = $derived(v.vote ? countdown(v.vote.left, st.receivedAt, now) : 0);

  let menuOpen = $state(false);
  let notepadMin = $state(notepadMinimized());
  let sideOpen = $state(!sideCollapsed());
  let sideWidth = $state(0);
  let cornerWidth = $state(0);
  let viewportW = $state(typeof window === 'undefined' ? 1280 : window.innerWidth);
  const side = $derived({ open: sideOpen, width: sideWidth });
  const game = $derived(room.phase !== 'lobby');
  const dev = $derived(devTools(location, room.dev));
  const link = $derived(location.origin + roomPath(room.code));
  const pad = $derived(notepadBox(side, viewportW));
  /** a vez e a votação centram no que sobra entre a coluna (ou os botões do canto) e o ranking */
  const topLeft = $derived(sideOpen ? besideSide(side) : EDGE + cornerWidth + GAP);
  const PHASE: Record<RoomSnapshot['phase'], MsgKey> = { lobby: 'phase.lobby', playing: 'phase.playing', ended: 'phase.ended' };

  function setSide(open: boolean) { sideOpen = open; rememberSideCollapsed(!open); }

  // a troca de fase recolhe a coluna (o jogo começou) ou a abre (o fim, a volta ao lobby); dentro da fase, é da pessoa
  let seenPhase: Phase | null = null;
  $effect(() => {
    const phase = room.phase;
    const collapsed = sideCollapsedAfter(seenPhase, phase, untrack(() => !sideOpen));
    seenPhase = phase;
    if (collapsed === untrack(() => sideOpen)) setSide(!collapsed);
  });
  // a trilha: toca em loop com o jogo correndo, sai em 1 s quando ele acaba (ou ao sair da sala)
  $effect(() => { setMusic(musicWanted(room.phase)); });
  function setNotepadMin(on: boolean) { notepadMin = on; rememberNotepadMinimized(on); }

  // recusa do servidor: um aviso que some sozinho
  let refused = $state(false);
  let seenSeq = untrack(() => st.errorSeq);
  let refusedTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    if (st.errorSeq === seenSeq) return;
    seenSeq = st.errorSeq;
    if (st.error !== 'refused') return;
    refused = true;
    clearTimeout(refusedTimer);
    refusedTimer = setTimeout(() => (refused = false), 2500);
  });

  function onKey(e: KeyboardEvent) {
    const el = document.activeElement as HTMLElement | null;
    const action = keyAction(e, { inTextField: isTextField(el), canSkip: v.canSkip && !menuOpen, canNotepad: game && !menuOpen, canPanel: !menuOpen });
    if (!action) return;
    e.preventDefault();
    switch (action) {
      case 'skip': send({ type: 'skip' }); break;
      case 'notepad': setNotepadMin(!notepadMin); break;
      case 'panel': setSide(!sideOpen); break;
      case 'menu': menuOpen = !menuOpen; break;
      case 'blur': el?.blur(); break;
    }
  }

  /** Botão clicado com o mouse perde o foco: o Espaço é do telhado e não pode apertá-lo de novo. */
  function onClick(e: MouseEvent) {
    const el = document.activeElement;
    if (e.detail > 0 && el instanceof HTMLButtonElement) el.blur();
  }

  onMount(() => {
    // o personagem que este navegador escolheu (no pré-lobby, ou da última vez), se estiver livre
    const c = characterToClaim(v, rememberedCharacter());
    if (c !== null) send({ type: 'character', character: c });
    const tick = setInterval(() => (now = performance.now()), 200);
    // os sons da sala (votação, acertou, fim de vez), snapshot a snapshot, direto do `RemoteRoom` (sem esperar o Svelte)
    const sounds = roomSoundsTracker();
    const offSounds = remote.watch((s) => { for (const name of sounds(s.status, s.room, s.room?.you ?? null)) playSfx(name); });
    return () => { clearInterval(tick); clearTimeout(refusedTimer); offSounds(); setMusic(false); };
  });
</script>

<svelte:window onkeydown={onKey} onclick={onClick} bind:innerWidth={viewportW} />

<div class="gs-room">
  <World {remote} {room} {v} blocked={menuOpen} insetLeft={sideInset(side)} />

  <div class="gs-corner-wrap" bind:offsetWidth={cornerWidth}>
    <Corner {sideOpen} {link} onmenu={() => (menuOpen = true)} ontoggle={() => setSide(!sideOpen)} />
  </div>

  <aside id="gs-side" class="gs-side" hidden={!sideOpen} bind:offsetWidth={sideWidth} aria-label={t('side.label')}>
    <header class="gs-side-head">
      <Tooltip text={t('sala.title', { code: room.code })} placement="bottom"><span class="gs-code small">{room.code}</span></Tooltip>
      <span class="gs-tags"><span class="gs-tag">{t(PHASE[room.phase])}</span>{#if v.isGhost}<span class="gs-tag">{t('badge.ghost')}</span>{/if}</span>
      <span class="gs-spacer"></span>
      <span class="meta" class:gs-warn={st.status === 'reconnecting'}>{status}</span>
    </header>
    <div class="gs-side-body">
      {#if room.phase === 'lobby'}
        <Lobby {v} {room} {token} {send} />
      {:else}
        <Game {v} {room} {send} />
      {/if}
    </div>
    <footer class="gs-side-foot">
      {#if room.phase === 'lobby'}
        {#if v.isModerator}
          <button class="ss-btn full-width" class:primary={v.startPrimary} type="button" disabled={!v.canStart} onclick={() => send({ type: 'start' })}>{t('lobby.start')}</button>
          <p class="gs-hint">
            {#if v.startBlock === 'players'}{t('lobby.needPlayers', { min: MIN_PLAYERS })}
            {:else if v.startBlock === 'empty'}{@const n = v.players.length - v.writtenCount}{n === 1 ? t('lobby.startEmptyOne') : t('lobby.startEmpty', { n })}
            {:else if v.allReady}{t('lobby.allReady')}
            {:else}{t('lobby.startAnyway', { n: v.readyCount, total: v.players.length })}{/if}
          </p>
        {:else}
          <p class="gs-hint">{t('lobby.waitModerator')} · {t('writing.readyCount', { n: v.readyCount, total: v.players.length })}</p>
        {/if}
      {:else if room.phase === 'ended' && v.isModerator}
        <button class="ss-btn primary full-width" type="button" onclick={() => send({ type: 'playAgain' })}>{t('end.playAgain')}</button>
      {/if}
      {#if dev}<button class="ss-btn ghost gs-sm gs-dev" type="button" onclick={() => send({ type: 'addFake' })}><Icon name="plus" />{t('dev.addFake')}</button>{/if}
    </footer>
  </aside>

  {#if room.phase === 'playing'}
    <div class="gs-top" style:left="{topLeft}px">
      <TurnBar {v} {room} {send} {turnLeft} {voteLeft} />
    </div>
  {/if}
  {#if game}
    <div class="gs-rank"><Ranking rows={v.ranking} {room} /></div>
    <Notepad code={room.code} minimized={notepadMin} left={pad.left} width={pad.width} onminimize={setNotepadMin} />
  {/if}

  {#if menuOpen}<Menu code={room.code} onclose={() => (menuOpen = false)} />{/if}
  {#if refused}<div class="gs-toast" role="status">{t('error.refused')}</div>{/if}
</div>
