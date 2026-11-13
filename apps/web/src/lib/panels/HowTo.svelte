<script lang="ts">
  import { t } from '../i18n.svelte';

  /**
   * "Como funciona", em três linhas, para quem chega pelo link sem saber o jogo: a turma escreve o post-it, você pergunta
   * sim ou não na chamada, e aperta Acertei. Fica embaixo do palco, no início e na tela de entrar.
   */
</script>

<section class="gs-howto" aria-label={t('how.title')}>
  <h2 class="gs-lbl">{t('how.title')}</h2>
  <ol>
    <li>{t('how.write')}</li>
    <li>{t('how.ask')}</li>
    <li>{t('how.claim', { claim: t('play.claim') })}</li>
  </ol>
</section>
