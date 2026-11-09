<script lang="ts">
  import type { RoomSnapshot } from '@guess/protocol';
  import { t } from '../i18n.svelte';
  import type { GameRequest } from '../room/remote';
  import type { Progress, RoomView } from '../room/view';
  import Postit from './Postit.svelte';
  import PostitEditor from './PostitEditor.svelte';

  /**
   * A escrita: quem é autor escreve o post-it do seu dono; todo mundo vê os post-its dos outros ao vivo (o próprio é "?")
   * e quem está pronto. O moderador pode começar já e escrever os que faltam.
   */
  let { v, room, token, send }: { v: RoomView; room: RoomSnapshot; token: string; send: (r: GameRequest) => void } = $props();
  const PROGRESS: Record<Progress, ['neutral' | 'info' | 'positive', 'progress.empty' | 'progress.writing' | 'progress.ready']> = {
    empty: ['neutral', 'progress.empty'], writing: ['info', 'progress.writing'], ready: ['positive', 'progress.ready'],
  };
</script>

<div class="gs-stack">
  {#if v.writeFor}
    <section class="ss-card gs-block">
      <div class="head"><div class="heading"><span class="title">{t('writing.youWriteFor', { owner: v.writeFor.owner.nickname })}</span><span class="desc">{t('writing.hint', { owner: v.writeFor.owner.nickname })}</span></div></div>
      <div class="body">
        {#key v.writeFor.owner.id}<PostitEditor owner={v.writeFor.owner.id} postit={v.writeFor.postit} code={room.code} {token} {send} canReady />{/key}
      </div>
    </section>
  {:else if v.isGhost}
    <p class="gs-banner">{t('ghost.banner')}</p>
  {/if}

  {#if v.isModerator}
    <section class="ss-card gs-block">
      <div class="head">
        <div class="heading"><span class="title">{t('writing.mod')}</span><span class="desc">{t('writing.modHint')}</span></div>
        <button class="ss-btn primary" type="button" onclick={() => send({ type: 'forceStart' })}>{t('writing.forceStart')}</button>
      </div>
      {#if v.ownPostitEmpty}<p class="gs-banner">{t('writing.ownEmpty')}</p>{/if}
      {#if v.moderatorEditors.length}
        <div class="body">
          {#each v.moderatorEditors as c (c.owner.id)}
            <div class="gs-section">
              <h4>{c.author ? t('writing.missingFor', { owner: c.owner.nickname, author: c.author.nickname }) : t('writing.orphanFor', { owner: c.owner.nickname })}</h4>
              {#key c.owner.id}<PostitEditor owner={c.owner.id} postit={room.postits[c.owner.id]} code={room.code} {token} {send} canReady={false} />{/key}
            </div>
          {/each}
        </div>
      {/if}
    </section>
  {/if}

  <section class="ss-card gs-block">
    <div class="head"><div class="heading"><span class="title">{t('writing.all')}</span><span class="desc">{t('writing.readyCount', { n: v.readyCount, total: v.postits.length })}</span></div></div>
    <div class="body">
      <div class="gs-board">
        {#each v.postits as c (c.owner.id)}
          {@const [tone, key] = PROGRESS[c.progress]}
          <Postit card={c}>
            <span class="ss-badge {tone}">{t(key)}</span>
            {#if c.author}<span class="gs-hint">{t('writing.by', { author: c.author.nickname })}</span>{/if}
          </Postit>
        {/each}
      </div>
    </div>
  </section>
</div>
