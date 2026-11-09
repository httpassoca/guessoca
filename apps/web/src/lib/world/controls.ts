import type { Input } from '@guess/world';
import type { Hold } from '../keys';

/**
 * O teclado do telhado como o passo da física o lê: o que está segurado vale a cada passo; pular e empurrar valem num
 * passo só (o primeiro depois do aperto, mesmo que a tecla já tenha subido). Esquerda e direita (e fundo e frente)
 * juntas: vale a última apertada.
 */
export class Controls {
  /** o que está segurado, na ordem em que foi apertado */
  private held: Hold[] = [];
  private jump = false;
  private shove = false;

  hold(h: Hold) { this.held = [...this.held.filter((x) => x !== h), h]; }
  release(h: Hold) { this.held = this.held.filter((x) => x !== h); }
  press(p: 'jump' | 'shove') { if (p === 'jump') this.jump = true; else this.shove = true; }
  /** perdeu o foco, abriu um modal, entrou num campo: nada fica segurado nem apertado */
  releaseAll() { this.held = []; this.jump = false; this.shove = false; }

  /** O `Input` de um passo; os apertos são consumidos. */
  take(): Input {
    const last = (a: Hold, b: Hold) => {
      const ia = this.held.lastIndexOf(a), ib = this.held.lastIndexOf(b);
      return { a: ia > ib, b: ib > ia };
    };
    const lr = last('left', 'right'), ud = last('up', 'down');
    const input: Input = { left: lr.a, right: lr.b, up: ud.a, down: ud.b, run: this.held.includes('run'), jump: this.jump, shove: this.shove };
    this.jump = false; this.shove = false;
    return input;
  }
}
