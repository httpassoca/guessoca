<script lang="ts">
  import { LANGS } from '../i18n';
  import { i18n, setLang, t } from '../i18n.svelte';
  import Seg from './Seg.svelte';

  /** Troca de língua (ADR 0004): por navegador, lembrada entre visitas. Aparece no início e na sala. */
</script>

<div class="gs-lang" role="group" aria-label={t('lang.label')}>
  <Seg value={i18n.lang} options={LANGS.map((l) => [l, t(`lang.${l}`)])} onselect={setLang} />
</div>
