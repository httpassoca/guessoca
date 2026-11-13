<script lang="ts">
  import type { RoomSnapshot } from '@guess/protocol';
  import { fade } from 'svelte/transition';
  import { t } from '../i18n.svelte';
  import { bossOf, hitTracker, segments } from '../room/boss';
  import { characterName } from '../world/names';

  /**
   * A barra de vida do chefão (issue #60), embaixo da tela, para todo mundo da sala enquanto ele está no telhado: o nome
   * do personagem e um gomo por empurrão que ele ainda aguenta. Os pontos vêm do servidor (`BotView.hp`); a cada golpe
   * que conta, o gomo perdido pisca em branco e a barra treme. Aparece quando ele cai do céu e some quando ele vai embora
   * (derrubado, a barra vazia fica até ele sumir no ar). Onde fica (`left`, `width`, `bottom`) é de `bossBarBox`.
   */
  let { room, left, width, bottom }: { room: RoomSnapshot; left: number; width: number; bottom: number } = $props();

  const boss = $derived(bossOf(room));
  const segs = $derived(boss ? segments(boss.hp, boss.max) : []);
  const hit = hitTracker();
  /** conta os golpes (reinicia a animação) e quais gomos acabaram de se perder */
  let hits = $state(0);
  let lost = $state<{ from: number; to: number }>({ from: 0, to: 0 });
  let prevHp = 0;
  $effect(() => {
    const b = boss;
    if (hit(b) && b) { lost = { from: b.hp, to: prevHp }; hits++; }
    prevHp = b?.hp ?? 0;
  });
</script>

{#if boss}
  <div class="gs-boss-wrap" style:left="{left}px" style:width="{width}px" style:bottom="{bottom}px" out:fade={{ duration: 400 }}>
    <div class="gs-float gs-boss" class:down={boss.hp === 0} role="status" aria-label={t('boss.aria', { name: characterName(boss.character), hp: boss.hp, max: boss.max })}>
      <div class="gs-boss-head" aria-hidden="true">
        <span class="gs-boss-tag">{t('boss.label')}</span>
        <span class="gs-boss-name">{characterName(boss.character)}</span>
        <span class="gs-boss-count">{boss.hp}/{boss.max}</span>
      </div>
      {#key hits}
        <div class="gs-boss-bar" class:hit={hits > 0} aria-hidden="true">
          {#each segs as on, i (i)}<span class="seg" class:on class:lost={hits > 0 && i >= lost.from && i < lost.to}></span>{/each}
        </div>
      {/key}
    </div>
  </div>
{/if}
