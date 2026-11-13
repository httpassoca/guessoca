<script lang="ts">
  import { NICKNAME_MAX } from '@guess/rules';
  import { onMount, untrack } from 'svelte';
  import LangSwitch from '../hud/LangSwitch.svelte';
  import { checkJoin, type FormProblem } from '../create';
  import type { MsgKey } from '../i18n';
  import { t } from '../i18n.svelte';
  import { autoJoinIn, rememberCharacter, rememberedCharacter, rememberedNickname, rememberNickname, session, takeAutoJoin, token } from '../identity';
  import CharacterPicker, { characterName } from '../panels/CharacterPicker.svelte';
  import Room from '../panels/Room.svelte';
  import Stage from '../panels/Stage.svelte';
  import Who from '../panels/Who.svelte';
  import { RemoteRoom, type ClosedReason, type RemoteState } from '../room/remote';
  import { joinState, roomView } from '../room/view';
  import { navigate } from '../route.svelte';
  import { wsUrl } from '../rooms';

  /**
   * `/sala/CODE`: conecta como visitante e, antes de entrar na turma, pede apelido e um personagem livre. Quem acabou de
   * criar a sala no pré-lobby entra sozinho, com o que escolheu lá. Já na turma (ou voltando com o mesmo token), a sala.
   */
  let { code }: { code: string } = $props();

  // a rota recria esta tela a cada código novo (App faz {#key}); o código inicial basta
  const myToken = token();
  const remote = new RemoteRoom({ url: wsUrl(), room: untrack(() => code), token: myToken });
  let st = $state.raw<RemoteState>(remote.state);
  let nickname = $state(rememberedNickname());
  let character = $state<number | null>(rememberedCharacter());
  let problems = $state<FormProblem[]>([]);
  let field = $state<HTMLInputElement>();
  /** quem criou a sala entra sozinho (uma vez); se a sala recusar (cheia), cai no formulário */
  let auto = $state(autoJoinIn(session(), untrack(() => code)));
  let asked = false;

  onMount(() => {
    const off = remote.watch((s) => (st = s));
    // a rede caiu e voltou: sem esperar o ping descobrir
    const online = () => remote.retryNow();
    const offline = () => remote.reconnect();
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    remote.connect();
    if (!auto) field?.focus();
    return () => { window.removeEventListener('online', online); window.removeEventListener('offline', offline); off(); remote.dispose(); };
  });

  const room = $derived(st.room);
  const v = $derived(room ? roomView(room) : null);
  const me = $derived(v?.me ?? null);
  const live = $derived(st.status === 'open');
  /** antes de entrar: a sala cheia desliga o Entrar; o jogo começado avisa que entro de fantasma */
  const gate = $derived(room ? joinState(room) : { full: false, late: false });
  const STATUS: Record<RemoteState['status'], MsgKey | null> = { idle: null, connecting: 'status.connecting', open: 'status.open', reconnecting: 'status.reconnecting', closed: null };
  const status = $derived.by(() => { const k = STATUS[st.status]; return k ? t(k) : ''; });
  const GONE = { notFound: ['gone.notFound.title', 'gone.notFound.msg'], ended: ['gone.ended.title', 'gone.ended.msg'], replaced: ['gone.replaced.title', 'gone.replaced.msg'], kicked: ['gone.kicked.title', 'gone.kicked.msg'] } as const satisfies Record<NonNullable<ClosedReason>, [MsgKey, MsgKey]>;

  // sem personagem lembrado: o primeiro
  $effect(() => { if (room && !me && character === null) character = 0; });

  // entrada automática de quem criou a sala
  $effect(() => {
    if (!auto || !live || !room || me || asked) return;
    asked = true;
    remote.join(untrack(() => nickname).trim() || rememberedNickname());
  });
  $effect(() => { if (me && auto) { takeAutoJoin(code); auto = false; } });
  $effect(() => { if (auto && st.error) { auto = false; takeAutoJoin(code); } });

  function submit(e: SubmitEvent) {
    e.preventDefault();
    const c = checkJoin(nickname, character);
    if (!c.ok) { problems = c.problems; return; }
    problems = [];
    rememberNickname(c.nickname);
    rememberCharacter(c.character); // a sala pede este personagem ao abrir (`characterToClaim`)
    remote.join(c.nickname);
  }
</script>

{#if st.status === 'closed' && st.reason}
  {@const [title, msg] = GONE[st.reason]}
  <div class="gs-screen">
    <div class="ss-card gs-panel">
      <div class="body">
        <div class="ss-empty gs-gone">
          <div class="title">{t(title)}</div>
          <p class="msg">{t(msg)}</p>
          <div class="act">
            <button class="ss-btn primary" type="button" onclick={() => navigate('/')}>{t('gone.openNew')}</button>
          </div>
        </div>
      </div>
    </div>
  </div>
{:else if room && me}
  <Room {remote} {st} {room} token={myToken} {status} />
{:else}
  <div class="gs-screen">
    <div class="gs-pre-wrap">
    <div class="ss-card gs-panel gs-pre">
      <div class="head">
        <div class="heading"><h1 class="gs-h">{t('sala.label')} <span class="gs-code">{code}</span></h1><span class="gs-hint">{t('pre.joinHint')}</span></div>
        <span class="gs-tag" class:gs-warn={st.status === 'reconnecting'}>{status}</span>
      </div>
      <div class="body">
        {#if auto}
          <p class="gs-hint">{t('pre.entering')}</p>
        {:else}
          <form class="gs-create" onsubmit={submit} novalidate>
            <label class="ss-field">
              <span class="lbl">{t('sala.nickname')}</span>
              <span class="control"><input class="ss-input" bind:this={field} bind:value={nickname} maxlength={NICKNAME_MAX} placeholder={t('sala.nicknamePlaceholder')} spellcheck="false" autocomplete="nickname" aria-invalid={problems.includes('nickname')} /></span>
            </label>
            {#if problems.includes('nickname')}<p class="gs-error">{t('pre.needNickname')}</p>{/if}
            {#if problems.includes('character')}<p class="gs-error">{t('pre.needCharacter')}</p>{/if}
            {#if gate.late && !gate.full}<p class="gs-banner">{t('sala.late')}</p>{/if}
            <button class="ss-btn primary full-width" type="submit" disabled={!live || !room || gate.full} aria-describedby={gate.full ? 'gs-full' : undefined}>{t('sala.join')}</button>
          </form>
        {/if}
        {#if gate.full && room}<p class="gs-error" id="gs-full">{t('sala.fullAsk', { n: room.members.length, max: room.maxPlayers })}</p>
        {:else if st.error === 'roomFull'}<p class="gs-error">{t('sala.full', { max: room?.maxPlayers ?? 8 })}</p>{/if}
        {#if st.error === 'refused'}<p class="gs-error">{t('error.refused')}</p>{/if}

        <div class="gs-section">
          <h4>{t('sala.turma')}<span class="gs-n">{room?.members.length ?? 0}/{room?.maxPlayers ?? 8}</span></h4>
          {#if !room || room.members.length === 0}
            <p class="gs-hint">{t('sala.empty')}</p>
          {:else}
            <ul class="gs-members">
              {#each room.members as m (m.id)}<li><Who {m} {room} /></li>{/each}
            </ul>
          {/if}
        </div>
      </div>
      <div class="foot">
        <button class="ss-btn ghost" type="button" onclick={() => navigate('/')}>{t('nav.home')}</button>
        <LangSwitch />
      </div>
    </div>
    <Stage n={character} {nickname} />
    </div>
    {#if !auto}
      <div class="gs-charbar">
        <span class="gs-charbar-lbl"><span class="gs-lbl">{t('pre.character')}</span>{#if character !== null}<span class="gs-charbar-name">{characterName(character)}</span>{/if}</span>
        <CharacterPicker layout="bar" value={character} onpick={(n) => (character = n)} />
      </div>
    {/if}
  </div>
{/if}
