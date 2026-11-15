<script lang="ts">
  import Icon from '../hud/Icon.svelte';
  import Switch from '../hud/Switch.svelte';
  import { t } from '../i18n.svelte';
  import type { GameRequest } from '../room/remote';
  import type { RoomView } from '../room/view';

  /**
   * Virar fantasma (e desvirar), para a própria pessoa, em qualquer fase: fica na sala sem jogar. Quem o moderador pôs
   * como fantasma desliga aqui mesmo quando volta (sem trava). O moderador põe e tira os outros na linha de cada um
   * (`Turma`).
   */
  let { v, send }: { v: RoomView; send: (r: GameRequest) => void } = $props();
</script>

{#if v.me}
  {@const me = v.me}
  <section class="gs-block gs-sec">
    <div class="gs-line">
      <span class="gs-two"><span class="gs-ghost-title"><Icon name="ghost" />{t('ghost.toggle')}</span><span class="gs-hint">{t('ghost.toggleHint')}</span></span>
      <Switch label={t('ghost.toggle')} on={v.isGhosted} ontoggle={(on) => send({ type: 'ghost', member: me.id, on })} />
    </div>
  </section>
{/if}
