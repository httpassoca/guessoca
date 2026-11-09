<script lang="ts">
  import { CODE_RE } from '@guess/protocol';
  import LangSwitch from '../hud/LangSwitch.svelte';
  import { t } from '../i18n.svelte';
  import { openRoom } from '../rooms';
  import { navigate, roomPath } from '../route.svelte';

  /** O início: abrir uma sala, ou entrar numa com o código que a turma mandou. */
  let code = $state('');
  let opening = $state(false);
  let failed = $state(false);
  let invalid = $state(false);

  async function open() {
    opening = true; failed = false;
    try { navigate(roomPath(await openRoom())); } catch { failed = true; } finally { opening = false; }
  }
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
  <div class="ss-card elevated gs-panel">
    <div class="body">
      <div class="gs-title">
        <h1 class="gs-brand">{t('home.brand')}</h1>
        <p class="gs-tagline">{t('home.tagline')}</p>
      </div>
      <button class="ss-btn primary" type="button" onclick={open} disabled={opening}>{opening ? t('home.opening') : t('home.open')}</button>
      {#if failed}<p class="gs-error">{t('home.openFailed')}</p>{/if}
      <form class="gs-form" onsubmit={enter}>
        <label class="ss-field">
          <span class="lbl">{t('home.code')}</span>
          <span class="control"><input class="ss-input gs-code-input" value={code} oninput={typed} placeholder="ABCD" maxlength="4" autocapitalize="characters" autocomplete="off" spellcheck="false" aria-invalid={invalid} /></span>
        </label>
        <button class="ss-btn" type="submit" disabled={!code.trim()}>{t('home.enter')}</button>
      </form>
      {#if invalid}<p class="gs-error">{t('home.codeInvalid')}</p>{/if}
    </div>
    <div class="foot"><LangSwitch /></div>
  </div>
  <p class="gs-credit">{t('credit.character')}</p>
</div>
