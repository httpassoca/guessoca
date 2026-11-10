<script lang="ts">
  /**
   * Uma animação de um personagem tocando num canvas, para o sistema conferir a arte: o quadro certo de `sheet` pelo
   * atlas, no fps da animação. Em loop dá a volta; sem loop toca uma vez, segura o último quadro por `HOLD` ms e
   * recomeça. O canvas tem o tamanho do quadro (pixels da folha) e o CSS o leva a `height` pixels de altura: ampliado
   * fica em pixels duros, encolhido (a arte grande) fica suave.
   *
   * `now` é o relógio da página (ms), que a página pausa e desacelera. `guides` desenha a linha do chão e a âncora (o
   * ponto entre os pés) em vermelho; `flip` espelha, como o jogo faz para a esquerda; `counter` mostra o quadro da vez
   * em cima, `03 / 10`, o que mais se olha quando se confere uma animação quadro a quadro.
   */
  import type { AnimationName, Atlas } from '../sprites/characters';

  let { sheet, atlas, name, now, height = 96, guides = false, flip = false, counter = false }: {
    sheet: HTMLImageElement | undefined; atlas: Atlas; name: AnimationName; now: number; height?: number; guides?: boolean; flip?: boolean; counter?: boolean;
  } = $props();

  /** quanto uma animação sem loop fica no último quadro antes de recomeçar, ms */
  const HOLD = 700;
  let canvas = $state<HTMLCanvasElement>();
  const a = $derived(atlas.animations[name]);
  const frame = $derived.by(() => {
    const length = (a.frames / a.fps) * 1000;
    const t = a.loop ? now % length : now % (length + HOLD);
    return Math.min(a.frames - 1, Math.floor((t * a.fps) / 1000));
  });
  const k = $derived(height / atlas.frame.h);

  $effect(() => {
    const g = canvas?.getContext('2d');
    if (!g || !canvas) return;
    const { w, h } = atlas.frame;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, w, h);
    if (flip) g.setTransform(-1, 0, 0, 1, w, 0);
    if (sheet) g.drawImage(sheet, frame * w, a.row * h, w, h, 0, 0, w, h);
    if (guides) {
      const px = Math.max(1, Math.round(1 / k));
      g.fillStyle = '#ff3344';
      g.fillRect(0, atlas.anchor.y - px, w, px);
      g.fillRect(atlas.anchor.x - Math.floor(px / 2), atlas.anchor.y - 6 * px, px, 6 * px);
    }
  });
</script>

{#if counter}<span class="count">{String(frame + 1).padStart(2, '0')} / {String(a.frames).padStart(2, '0')}</span>{/if}
<canvas bind:this={canvas} width={atlas.frame.w} height={atlas.frame.h} class:smooth={k < 1}
  style:width="{Math.round(atlas.frame.w * k)}px" style:height="{height}px" aria-label="{name}, quadro {frame + 1} de {a.frames}"></canvas>

<style>
  canvas { display: block; image-rendering: pixelated; }
  canvas.smooth { image-rendering: auto; }
  .count { display: block; margin-bottom: 8px; font: var(--ss-ui-xs) var(--ss-font-mono); font-variant-numeric: tabular-nums; color: rgb(255 255 255 / 0.6); text-align: center; }
</style>
