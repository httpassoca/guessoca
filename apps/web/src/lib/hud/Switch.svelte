<script lang="ts">
  /** Interruptor no contrato de markup do dssoca (`ss-switch`). */
  let { on, label, ontoggle, disabled = false }: { on: boolean; label: string; ontoggle: (on: boolean) => void; disabled?: boolean } = $props();
</script>

<label class="ss-switch"><button type="button" role="switch" class="track" aria-label={label} class:on aria-checked={on} {disabled} onclick={() => ontoggle(!on)}><span class="thumb"></span></button></label>
