<script lang="ts">
  import type { RoomSnapshot } from '@guess/protocol';
  import { onMount, untrack } from 'svelte';
  import Kbd from '../hud/Kbd.svelte';
  import type { MsgKey } from '../i18n';
  import { t } from '../i18n.svelte';
  import { rememberedCharacter } from '../identity';
  import { isTextField, keyAction } from '../keys';
  import type { GameRequest, RemoteRoom, RemoteState } from '../room/remote';
  import { characterToClaim, countdown, devTools, roomView } from '../room/view';
  import { playSfx } from '../sound/player';
  import { roomSoundsTracker } from '../sound/room';
  import Ended from './Ended.svelte';
  import Lobby from './Lobby.svelte';
  import Menu from './Menu.svelte';
  import Notepad from './Notepad.svelte';
  import Playing from './Playing.svelte';
  import Roster from './Roster.svelte';
  import TurnBar from './TurnBar.svelte';
  import Writing from './Writing.svelte';
  import World from '../world/World.svelte';

  /**
   * A sala depois de entrar na turma: o telhado sempre ligado atrás de tudo (`World`), e por cima a barra, a vez e a
   * votação no meio, o painel da fase (lobby, escrita, jogo, fim) numa coluna à direita que se recolhe, a faixa da turma
   * embaixo, o bloco (N), o menu (Esc) e o teclado. Tudo o que é decidido vem de `roomView`; aqui só se desenha e se pede.
   */
  let { remote, st, room, token, status }: { remote: RemoteRoom; st: RemoteState; room: RoomSnapshot; token: string; status: string } = $props();

  const v = $derived(roomView(room));
  const send = (r: GameRequest) => remote.send(r);

  // o relógio da tela: os snapshots dizem quanto sobrava quando chegaram; daqui se conta para baixo
  let now = $state(performance.now());
  const turnLeft = $derived(v.turn ? countdown(v.turn.left, st.receivedAt, now, v.turn.running) : 0);
  const voteLeft = $derived(v.vote ? countdown(v.vote.left, st.receivedAt, now) : 0);

  let menuOpen = $state(false);
  let notepadOpen = $state(false);
  /** a coluna da direita (o painel da fase); recolhida, o telhado fica inteiro */
  let sideOpen = $state(true);
  let sideWidth = $state(0);
  const showRoster = $derived(room.phase !== 'lobby');
  const dev = $derived(devTools(location, room.dev));
  const PHASE: Record<RoomSnapshot['phase'], MsgKey> = { lobby: 'phase.lobby', writing: 'phase.writing', playing: 'phase.playing', ended: 'phase.ended' };

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
    const action = keyAction(e, { inTextField: isTextField(el), canClaim: v.canClaim && !menuOpen, canSkip: v.canSkip && !menuOpen });
    if (!action) return;
    e.preventDefault();
    switch (action) {
      case 'claim': send({ type: 'claim' }); break;
      case 'skip': send({ type: 'skip' }); break;
      case 'notepad': notepadOpen = !notepadOpen; break;
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
    // o personagem que este navegador escolheu da última vez, se estiver livre
    const c = characterToClaim(v, rememberedCharacter());
    if (c !== null) send({ type: 'character', character: c });
    const tick = setInterval(() => (now = performance.now()), 200);
    // os sons da sala (votação, acertou, fim de vez), snapshot a snapshot, direto do `RemoteRoom` (sem esperar o Svelte)
    const sounds = roomSoundsTracker();
    const offSounds = remote.watch((s) => { for (const name of sounds(s.status, s.room, s.room?.you ?? null)) playSfx(name); });
    return () => { clearInterval(tick); clearTimeout(refusedTimer); offSounds(); };
  });
</script>

<svelte:window onkeydown={onKey} onclick={onClick} />

<div class="gs-room">
  <World {remote} {room} {v} blocked={menuOpen || notepadOpen} insetRight={sideOpen ? sideWidth + 24 : 0} />

  <div class="gs-hud">
    <header class="ss-card gs-bar">
      <span class="gs-code small">{room.code}</span>
      <span class="ss-badge brand">{t(PHASE[room.phase])}</span>
      {#if v.isGhost}<span class="ss-badge info">{t('badge.ghost')}</span>{/if}
      <span class="meta" class:gs-warn={st.status === 'reconnecting'}>{status}</span>
      <span class="gs-spacer"></span>
      {#if v.offline.length}<span class="gs-hint">{t('bar.offline', { names: v.offline.map((m) => m.nickname).join(', ') })}</span>{/if}
      {#if dev}<button class="ss-btn ghost" type="button" onclick={() => send({ type: 'addFake' })}>{t('dev.addFake')}</button>{/if}
      <button class="ss-btn ghost" type="button" aria-pressed={notepadOpen} onclick={() => (notepadOpen = !notepadOpen)}>{t('notepad.title')} <Kbd keys={['N']} /></button>
      <button class="ss-btn ghost" type="button" aria-pressed={sideOpen} aria-controls="gs-side" onclick={() => (sideOpen = !sideOpen)}>{sideOpen ? t('side.hide') : t('side.show')}</button>
      <button class="ss-btn ghost" type="button" onclick={() => (menuOpen = true)}>{t('menu.title')} <Kbd keys={['Esc']} /></button>
    </header>

    <div class="gs-mid">
      <div class="gs-center">
        {#if room.phase === 'playing'}<TurnBar {v} {room} {send} {turnLeft} {voteLeft} />{/if}
      </div>
      <aside id="gs-side" class="gs-side" hidden={!sideOpen} bind:offsetWidth={sideWidth} aria-label={t(PHASE[room.phase])}>
        {#if room.phase === 'lobby'}
          <Lobby {v} {room} {send} />
        {:else if room.phase === 'writing'}
          <Writing {v} {room} {token} {send} />
        {:else if room.phase === 'playing'}
          <Playing {v} {room} {send} />
        {:else}
          <Ended {v} {room} {send} />
        {/if}
      </aside>
    </div>

    {#if showRoster}<Roster {v} />{/if}
  </div>

  {#if notepadOpen}<Notepad code={room.code} onclose={() => (notepadOpen = false)} />{/if}
  {#if menuOpen}<Menu {v} {room} {send} onrename={(n) => remote.rename(n)} onclose={() => (menuOpen = false)} />{/if}
  {#if refused}<div class="gs-toast" role="status">{t('error.refused')}</div>{/if}
</div>
