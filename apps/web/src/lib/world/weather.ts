/**
 * O tempo (issue #6): chuva fina na diagonal, de gotas reaproveitadas (`rain.ts`), e uma neblina rala na frente, embaixo,
 * para a rua parecer funda. Em pixels da tela, por cima do mundo e debaixo dos filtros. Pixi; sem teste automático.
 */
import type { Camera, View } from '@guess/world';
import { Container, Sprite, Texture, TilingSprite } from 'pixi.js';
import type { RooftopArt } from './art';
import { parallaxOffset } from './parallax';
import { Rain } from './rain';

const DROPS = 170;
const SLANT = 0.22;
const RAIN_TINT = 0xb9b2ff;
const FOG_TINT = 0xc6b8ff;

export class Weather extends Container {
  private readonly rain = new Rain({ count: DROPS, slant: SLANT, speed: [900, 1300], length: [10, 22] });
  private readonly streaks: Sprite[] = [];
  private readonly fog: TilingSprite;
  private last = 0;
  private lastCam: number | null = null;

  constructor(art: RooftopArt) {
    super();
    this.fog = new TilingSprite({ texture: art.tile('fog'), tint: FOG_TINT, alpha: 0.2 });
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

  update(cam: Camera, view: View, now: number) {
    const s = view.scale;
    const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 0;
    this.last = now;
    // a câmera andou: a chuva, que está perto, anda quase junto com o telhado
    const shift = this.lastCam === null ? 0 : -(cam.x - this.lastCam) * s * 0.9;
    this.lastCam = cam.x;
    this.rain.resize(view.width, view.height);
    this.rain.step(dt * (s / 3), shift);
    this.rain.drops.forEach((d, i) => {
      const sp = this.streaks[i];
      sp.position.set(d.x, d.y);
      sp.width = 1;
      sp.height = d.len * (s / 3);
      sp.alpha = 0.18 + (d.speed - 900) / 400 * 0.2;
    });

    const h = this.fog.texture.height * s;
    this.fog.tileScale.set(s);
    this.fog.width = view.width;
    this.fog.height = h;
    this.fog.position.set(0, view.height - h);
    this.fog.tilePosition.set(parallaxOffset(cam.x, 1, this.fog.texture.width, s, -now / 1000 * 6), 0);
  }
}
