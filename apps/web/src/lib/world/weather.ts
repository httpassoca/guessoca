/**
 * O tempo (issue #6): chuva fina na diagonal, de gotas reaproveitadas (`rain.ts`), e uma neblina rala na frente, embaixo,
 * para a rua parecer funda. Em pixels da tela, por cima do mundo e debaixo dos filtros. Pixi; sem teste automático.
 *
 * Entrada: a neblina (`fog`) de `rooftop.png` via `art.ts`; as gotas são `Texture.WHITE` esticada, sem folha. Saída: um
 * `Container` que `scene.ts` põe por último no `world` (na frente de tudo, ganha a aberração e o VHS, não o bloom).
 * Os números da chuva foram ajustados no olho a 1080p, na escala 3 (`pickScale`); em outra escala, `s / 3` mantém o
 * mesmo jeito em pixels do mundo.
 */
import type { Camera, View } from '@guess/world';
import { Container, Sprite, Texture, TilingSprite } from 'pixi.js';
import type { RooftopArt } from './art';
import { parallaxOffset } from './parallax';
import { Rain } from './rain';

/** quantas gotas na tela de uma vez (chuva fina, sem cobrir os personagens; no olho) */
const DROPS = 170;
/** o vento: a gota anda 0,22 px para a esquerda por px que desce (uns 12°) */
const SLANT = 0.22;
/** velocidade (px da tela/s) e comprimento (px) das gotas, na escala 3; cada gota sorteia entre os dois */
const SPEED: [number, number] = [900, 1300];
const LENGTH: [number, number] = [10, 22];
/** a opacidade da gota: 0,18 a mais lenta, até 0,38 a mais rápida (as de perto parecem mais rápidas e mais claras) */
const DROP_ALPHA = 0.18;
const DROP_ALPHA_FAST = 0.2;
/** a escala em que os números da chuva foram ajustados */
const TUNED_SCALE = 3;
/** a chuva está perto: quando a câmera anda, ela anda 90% do que o telhado anda (quase junto, um pouco de paralaxe) */
const RAIN_FOLLOW = 0.9;
/** as gotas, lilás claro como a luz do céu */
const RAIN_TINT = 0xb9b2ff;
/** a neblina da frente: lilás, rala (opacidade 0,2), deslizando 6 unidades/s para a direita */
const FOG_TINT = 0xc6b8ff;
const FOG_ALPHA = 0.2;
const FOG_DRIFT = 6;

/** A chuva e a neblina da frente, por cima de tudo do mundo. */
export class Weather extends Container {
  private readonly rain = new Rain({ count: DROPS, slant: SLANT, speed: SPEED, length: LENGTH });
  private readonly streaks: Sprite[] = [];
  private readonly fog: TilingSprite;
  private last = 0;
  private lastCam: number | null = null;

  constructor(art: RooftopArt) {
    super();
    this.fog = new TilingSprite({ texture: art.tile('fog'), tint: FOG_TINT, alpha: FOG_ALPHA });
    this.addChild(this.fog);
    const drops = new Container();
    for (let i = 0; i < DROPS; i++) {
      const s = new Sprite(Texture.WHITE);
      s.anchor.set(0.5, 1);
      s.rotation = Math.atan(SLANT);
      s.tint = RAIN_TINT;
      this.streaks.push(s);
      drops.addChild(s);
    }
    this.addChild(drops);
  }

  /** Um quadro: as gotas caem pelo tempo desde o último (no máximo 50 ms), a neblina desliza. `now` em ms. */
  update(cam: Camera, view: View, now: number) {
    const s = view.scale;
    const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 0;
    this.last = now;
    // a câmera andou: a chuva, que está perto, anda quase junto com o telhado
    const shift = this.lastCam === null ? 0 : -(cam.x - this.lastCam) * s * RAIN_FOLLOW;
    this.lastCam = cam.x;
    this.rain.resize(view.width, view.height);
    this.rain.step(dt * (s / TUNED_SCALE), shift);
    this.rain.drops.forEach((d, i) => {
      const sp = this.streaks[i];
      sp.position.set(d.x, d.y);
      sp.width = 1;
      sp.height = d.len * (s / TUNED_SCALE);
      sp.alpha = DROP_ALPHA + (d.speed - SPEED[0]) / (SPEED[1] - SPEED[0]) * DROP_ALPHA_FAST;
    });

    const h = this.fog.texture.height * s;
    this.fog.tileScale.set(s);
    this.fog.width = view.width;
    this.fog.height = h;
    this.fog.position.set(0, view.height - h);
    this.fog.tilePosition.set(parallaxOffset(cam.x, 1, this.fog.texture.width, s, -now / 1000 * FOG_DRIFT), 0);
  }
}
