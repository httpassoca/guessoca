<script lang="ts">
  /**
   * A forma de onda de um som, desenhada num canvas: uma barra por coluna, do menor ao maior valor das amostras daquela
   * fatia. `progress` (0..1) pinta de verde a parte que já tocou. Para o `/sistema` mostrar os efeitos sonoros, que no
   * jogo só existem como parâmetros (`sound/sfx.ts`).
   */
  let { samples, progress = 0, w = 220, h = 36 }: { samples: Float32Array; progress?: number; w?: number; h?: number } = $props();
  let canvas = $state<HTMLCanvasElement>();
  const BAR = 2, GAP = 1;

  $effect(() => {
    const g = canvas?.getContext('2d');
    if (!g || !canvas) return;
    // as cores vêm do tema: a do texto (a onda parada, mais apagada) e o verde (a parte que já tocou)
    const style = getComputedStyle(canvas);
    const idle = style.color, done = style.getPropertyValue('--ss-accent').trim() || '#66ef73';
    const n = Math.floor(w / (BAR + GAP)), per = samples.length / n;
    let peak = 0.0001;
    for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < n; i++) {
      let top = 0;
      for (let j = Math.floor(i * per); j < Math.floor((i + 1) * per); j++) top = Math.max(top, Math.abs(samples[j] ?? 0));
      const bar = Math.max(1, Math.round((top / peak) * (h - 2)));
      const played = i / n < progress;
      g.globalAlpha = played ? 1 : 0.45;
      g.fillStyle = played ? done : idle;
      g.fillRect(i * (BAR + GAP), Math.round((h - bar) / 2), BAR, bar);
    }
  });
</script>

<canvas bind:this={canvas} width={w} height={h} style:width="{w}px" style:height="{h}px" aria-hidden="true"></canvas>

<style>
  canvas { display: block; color: var(--ss-fg); }
</style>
