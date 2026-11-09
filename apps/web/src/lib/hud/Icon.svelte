<script lang="ts" module>
  /** Os ícones que a sala usa, no traço do dssoca (24×24, linha quadrada); o dssoca não tem estes. Um tamanho só, 16. */
  const PATHS = {
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    sideHide: '<rect x="3" y="4" width="18" height="16"/><path d="M9 4v16M16 9l-3 3 3 3"/>',
    sideShow: '<rect x="3" y="4" width="18" height="16"/><path d="M9 4v16M13 9l3 3-3 3"/>',
    link: '<path d="M10 14l4-4M8.5 11.5L6 14a3 3 0 0 0 4 4l2.5-2.5M15.5 12.5L18 10a3 3 0 0 0-4-4l-2.5 2.5"/>',
    check: '<path d="M5 12l5 5 9-10"/>',
    up: '<path d="M6 15l6-6 6 6"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    crown: '<path d="M4 18h16M4 18l-1-10 5 4 4-6 4 6 5-4-1 10"/>',
    kick: '<path d="M6 6l12 12M18 6L6 18"/>',
    undo: '<path d="M9 7L5 11l4 4"/><path d="M5 11h9a5 5 0 0 1 0 10h-3"/>',
    minus: '<path d="M6 12h12"/>',
    plus: '<path d="M6 12h12M12 6v12"/>',
  } as const;
  export type IconName = keyof typeof PATHS;
</script>

<script lang="ts">
  let { name }: { name: IconName } = $props();
  const size = 16;
</script>

<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" class="ss-icon" style:width="{size}px" style:height="{size}px" aria-hidden="true" focusable="false">
  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
  {@html PATHS[name]}
</svg>
