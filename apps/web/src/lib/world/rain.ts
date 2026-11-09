/**
 * A chuva, pura: um número fixo de gotas que caem na diagonal pela tela e, quando passam do fim, voltam para cima. As
 * mesmas gotas sempre (nada é criado por quadro); o Pixi só copia a posição de cada uma para um traço fino.
 * Em pixels da tela, por segundo.
 */
export interface Drop { x: number; y: number; len: number; speed: number }

export interface RainOptions {
  count: number;
  /** quanto anda para a esquerda por pixel que desce (o vento) */
  slant: number;
  speed: [number, number];
  length: [number, number];
}

/** folga dos lados antes de a gota dar a volta em x */
const MARGIN = 40;

export class Rain {
  readonly drops: Drop[];
  private w = 0;
  private h = 0;

  constructor(private readonly o: RainOptions, private readonly random: () => number = Math.random) {
    this.drops = Array.from({ length: o.count }, () => ({ x: 0, y: 0, len: 0, speed: 0 }));
  }

  /** A tela mudou de tamanho: espalha todas as gotas de novo. */
  resize(w: number, h: number) {
    if (w === this.w && h === this.h) return;
    this.w = w; this.h = h;
    for (const d of this.drops) this.spawn(d, true);
  }

  /** `dt` em segundos; `shiftX` em pixels da tela (a câmera andou: a chuva vai junto com o mundo). */
  step(dt: number, shiftX = 0) {
    const { slant } = this.o;
    const right = this.w + this.h * slant + MARGIN;
    const span = right + MARGIN;
    for (const d of this.drops) {
      const fall = d.speed * dt;
      d.y += fall;
      d.x += shiftX - fall * slant;
      if (d.y - d.len > this.h) { this.spawn(d, false); continue; }
      if (d.x < -MARGIN) d.x += span;
      else if (d.x > right) d.x -= span;
    }
  }

  private spawn(d: Drop, anywhere: boolean) {
    const r = this.random;
    const [s0, s1] = this.o.speed, [l0, l1] = this.o.length;
    d.speed = s0 + r() * (s1 - s0);
    d.len = l0 + r() * (l1 - l0);
    d.x = r() * (this.w + this.h * this.o.slant);
    d.y = anywhere ? r() * (this.h + d.len) - d.len : -r() * 60;
  }
}
