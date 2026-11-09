<script lang="ts">
  /** Um personagem como amostra de cor numerada, até os sprites chegarem (issue #4). null = sem personagem. */
  let { n }: { n: number | null } = $props();
</script>

<span class="gs-swatch" class:none={n === null} style={n === null ? '' : `--c: var(--gs-char-${n})`} aria-hidden="true">{n === null ? '·' : n + 1}</span>
