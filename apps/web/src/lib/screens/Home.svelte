<script lang="ts">
  import { CODE_RE } from '@guess/protocol';
  import { NICKNAME_MAX } from '@guess/rules';
  import LangSwitch from '../hud/LangSwitch.svelte';
  import Stepper from '../hud/Stepper.svelte';
  import Switch from '../hud/Switch.svelte';
  import { checkCreate, createSettingsIn, maxPlayersOptions, rememberCreateSettingsIn, type FormProblem } from '../create';
  import { t } from '../i18n.svelte';
  import { local, rememberAutoJoin, rememberCharacter, rememberedCharacter, rememberedNickname, rememberNickname } from '../identity';
  import CharacterPicker from '../panels/CharacterPicker.svelte';
  import Stage from '../panels/Stage.svelte';
  import { clockText, turnOptions } from '../room/view';
  import { openRoom } from '../rooms';
  import { navigate, roomPath } from '../route.svelte';

  /**
   * O pré-lobby: criar uma sala (apelido, personagem, tamanho da vez, limite de pessoas, só moderar) e cair nela já na
   * turma; ou entrar numa com o código que a turma mandou. As configurações de criar ficam lembradas pelo navegador.
   */
  const saved = createSettingsIn(local());
  let nickname = $state(rememberedNickname());
  let character = $state<number | null>(rememberedCharacter() ?? 0);
  let turnMs = $state(saved.turnMs);
  let maxPlayers = $state(saved.maxPlayers);
  let onlyModerate = $state(saved.onlyModerate);
  let problems = $state<FormProblem[]>([]);
  let opening = $state(false);
  let failed = $state(false);

  const turns = turnOptions();
  const turnIdx = $derived(turns.indexOf(turnMs));
  const caps = maxPlayersOptions();
  const capIdx = $derived(caps.indexOf(maxPlayers));

  async function create(e: SubmitEvent) {
    e.preventDefault();
    const c = checkCreate({ nickname, character, turnMs, maxPlayers, onlyModerate });
    if (!c.ok) { problems = c.problems; return; }
    problems = []; opening = true; failed = false;
    rememberCreateSettingsIn(local(), c.init);
    rememberNickname(c.nickname);
    rememberCharacter(c.character);
    try {
      const code = await openRoom(c.init);
      rememberAutoJoin(code); // a sala nova nos põe na turma ao chegar, com o apelido e o personagem lembrados
      navigate(roomPath(code));
    } catch { failed = true; } finally { opening = false; }
  }

  let code = $state('');
  let invalid = $state(false);
  function typed(e: Event) {
    code = (e.currentTarget as HTMLInputElement).value.toUpperCase();
    invalid = false;
  }
  function enter(e: SubmitEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (CODE_RE.test(c)) navigate(roomPath(c)); else invalid = true;
  }
</script>

<div class="gs-screen">
  <div class="gs-pre-wrap">
  <div class="ss-card gs-panel gs-pre">
    <div class="head">
      <div class="gs-title">
        <h1 class="gs-brand">{t('home.brand')}</h1>
        <p class="gs-tagline">{t('home.tagline')}</p>
      </div>
    </div>
    <div class="body">
      <form class="gs-create" onsubmit={create} novalidate>
        <h2 class="gs-h">{t('pre.create')}</h2>
        <label class="ss-field">
          <span class="lbl">{t('sala.nickname')}</span>
          <span class="control"><input class="ss-input" bind:value={nickname} maxlength={NICKNAME_MAX} placeholder={t('sala.nicknamePlaceholder')} spellcheck="false" autocomplete="nickname" aria-invalid={problems.includes('nickname')} oninput={() => (problems = problems.filter((p) => p !== 'nickname'))} /></span>
        </label>
        {#if problems.includes('nickname')}<p class="gs-error">{t('pre.needNickname')}</p>{/if}

        <div class="gs-field">
          <span class="gs-lbl">{t('pre.character')}</span>
          <CharacterPicker value={character} onpick={(n) => { character = n; problems = problems.filter((p) => p !== 'character'); }} />
          {#if problems.includes('character')}<p class="gs-error">{t('pre.needCharacter')}</p>{/if}
        </div>

        <div class="gs-rows">
          <div class="gs-line">
            <span>{t('lobby.turnMs')}</span>
            <Stepper value={clockText(turnMs)} lessLabel={t('lobby.turnLess')} moreLabel={t('lobby.turnMore')} canLess={turnIdx > 0} canMore={turnIdx >= 0 && turnIdx < turns.length - 1}
              onstep={(d) => (turnMs = turns[Math.max(0, Math.min(turns.length - 1, turnIdx + d))])} />
          </div>
          <div class="gs-line">
            <span>{t('lobby.maxPlayers')}</span>
            <Stepper value={String(maxPlayers)} lessLabel={t('lobby.maxLess')} moreLabel={t('lobby.maxMore')} canLess={capIdx > 0} canMore={capIdx >= 0 && capIdx < caps.length - 1}
              onstep={(d) => (maxPlayers = caps[Math.max(0, Math.min(caps.length - 1, capIdx + d))])} />
          </div>
          <div class="gs-line">
            <span class="gs-two">{t('lobby.onlyModerate')}<span class="gs-hint">{t('lobby.onlyModerateHint')}</span></span>
            <Switch label={t('lobby.onlyModerate')} on={onlyModerate} ontoggle={(on) => (onlyModerate = on)} />
          </div>
        </div>

        <button class="ss-btn primary full-width" type="submit" disabled={opening}>{opening ? t('home.opening') : t('pre.createRoom')}</button>
        {#if failed}<p class="gs-error">{t('home.openFailed')}</p>{/if}
      </form>

      <div class="gs-or"><span>{t('pre.or')}</span></div>

      <form class="gs-form" onsubmit={enter}>
        <label class="ss-field">
          <span class="lbl">{t('home.code')}</span>
          <span class="control"><input class="ss-input gs-code-input" value={code} oninput={typed} placeholder="ABCD" maxlength="4" autocapitalize="characters" autocomplete="off" spellcheck="false" aria-invalid={invalid} /></span>
        </label>
        <button class="ss-btn" type="submit" disabled={!code.trim()}>{t('home.enter')}</button>
      </form>
      {#if invalid}<p class="gs-error">{t('home.codeInvalid')}</p>{/if}
    </div>
    <div class="foot"><LangSwitch /><span class="gs-credit">{t('credit.character')}</span></div>
  </div>
  <Stage n={character} {nickname} />
  </div>
</div>
