<script lang="ts">
  /**
   * Uma animação de um personagem tocando num canvas, para o sistema conferir a arte: o quadro certo das `sheets` (as
   * folhas do personagem, uma por página do atlas; `undefined` a que ainda não carregou) pelo atlas, no fps da animação (`frameAtTime`). O canvas mostra só o retângulo que essa animação ocupa (`trimOf`: do
   * pixel mais alto ao chão), não o quadro inteiro do modelo, que tem a folga do ataque; assim o personagem enche o
   * canvas e o pé fica na linha de baixo. `k` são os pixels da tela por pixel do quadro: ampliado fica em pixels duros,
   * encolhido (a arte grande) fica suave.
   *
   * `now` é o relógio da página (ms), que a página pausa e desacelera. `guides` desenha a linha do chão e a âncora (o
   * ponto entre os pés) em vermelho; `flip` espelha, como o jogo faz para a esquerda.
   */
  import { frameAt, type AnimationName, type Atlas } from '../sprites/characters';
  import { frameAtTime, trimOf } from './anim';

  let { sheets, atlas, name, now, k, guides = false, flip = false }: {
    sheets: readonly (HTMLImageElement | undefined)[]; atlas: Atlas; name: AnimationName; now: number; k: number; guides?: boolean; flip?: boolean;
  } = $props();

  let canvas = $state<HTMLCanvasElement>();
  const a = $derived(atlas.animations[name]);
  const frame = $derived(frameAtTime(atlas, name, now));
  const sheet = $derived(sheets[atlas.animations[name].page]);
  const box = $derived(sheet ? trimOf(sheets as HTMLImageElement[], atlas, name) : { x: 0, y: 0, w: atlas.frame.w, h: atlas.anchor.y });

  $effect(() => {
    const g = canvas?.getContext('2d');
    if (!g || !canvas) return;
    const at = frameAt(atlas, name, frame);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, box.w, box.h);
    if (flip) g.setTransform(-1, 0, 0, 1, box.w, 0);
    if (sheet) g.drawImage(sheet, at.x + box.x, at.y + box.y, box.w, box.h, 0, 0, box.w, box.h);
    if (guides) {
      const px = Math.max(1, Math.round(1 / k));
      g.fillStyle = '#ff3344';
      g.fillRect(0, box.h - px, box.w, px);
      g.fillRect(atlas.anchor.x - box.x - Math.floor(px / 2), box.h - 6 * px, px, 6 * px);
    }
  });
</script>

<canvas bind:this={canvas} width={box.w} height={box.h} class:smooth={k < 1}
  style:width="{Math.round(box.w * k)}px" style:height="{Math.round(box.h * k)}px" aria-label="{name}, quadro {frame + 1} de {a.frames}"></canvas>

<style>
  canvas { display: block; image-rendering: pixelated; }
  canvas.smooth { image-rendering: auto; }
</style>
