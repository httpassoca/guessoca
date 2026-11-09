/**
 * O fundo do telhado (issue #6): o céu em faixas de cor com estrelas e a lua, a cidade em duas camadas de paralaxe (a
 * de longe enevoada, a de perto escura), e a queda até a rua nos vãos: escurece para baixo e acaba numa neblina roxa,
 * iluminada pelos letreiros lá embaixo. Tudo atrás dos telhados. Pixi; a conta da paralaxe é pura (`parallax.ts`).
 */
import type { Camera, View } from '@guess/world';
import { Container, Graphics, Sprite, Texture, TilingSprite } from 'pixi.js';
import type { RooftopArt } from './art';
import { PARALLAX, parallaxOffset } from './parallax';

/** do alto até o horizonte */
const SKY = [0x06051a, 0x0a0820, 0x0f0b2a, 0x150e33, 0x1c113c, 0x251545, 0x301a4f, 0x3e1f58, 0x4f2460, 0x62296a];
/** a base de cada faixa da cidade, em pixels do mundo acima do chão do telhado mais baixo */
const FAR_BASE = 6;
const NEAR_BASE = -96;
const NEAR_FILL = 0x0e0c1d;
const FOG_TINT = 0xb7a6ff;

/** um degradê vertical num canvas: `stops` de [posição 0–1, rgba] */
function gradient(stops: [number, string][]): Texture {
  const c = document.createElement('canvas');
  c.width = 1; c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  for (const [at, color] of stops) g.addColorStop(at, color);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1, 128);
  return Texture.from(c);
}

const mix = (a: number, b: number) => {
  const ch = (c: number, sh: number) => (c >> sh) & 0xff;
  return [16, 8, 0].reduce((acc, sh) => acc | (Math.round((ch(a, sh) + ch(b, sh)) / 2) << sh), 0);
};

export class Backdrop extends Container {
  private readonly sky = new Graphics();
  private readonly moon: Sprite;
  private readonly far: TilingSprite;
  private readonly near: TilingSprite;
  private readonly underNear = new Graphics();
  private readonly drop: Sprite;
  private readonly street: TilingSprite;
  private readonly fogH: number;
  private key = '';

  constructor(art: RooftopArt) {
    super();
    this.moon = new Sprite(art.frame('moon'));
    this.moon.anchor.set(0.5);
    this.far = new TilingSprite({ texture: art.skyline('far') });
    this.near = new TilingSprite({ texture: art.skyline('near') });
    this.drop = new Sprite(gradient([[0, 'rgba(5,4,12,0)'], [0.35, 'rgba(5,4,12,0.78)'], [0.7, 'rgba(8,5,18,0.93)'], [1, 'rgba(66,28,92,0.95)']]));
    const fog = art.tile('fog');
    this.fogH = fog.height;
    this.street = new TilingSprite({ texture: fog, tint: FOG_TINT, alpha: 0.5 });
    this.addChild(this.sky, this.moon, this.far, this.near, this.underNear, this.drop, this.street);
  }

  update(cam: Camera, view: View, now: number) {
    const s = view.scale;
    const key = `${view.width}x${view.height}@${s}/${view.groundY}`;
    if (key !== this.key) { this.key = key; this.drawSky(view); }

    this.moon.scale.set(s);
    this.moon.position.set(Math.round(view.width * 0.78 - cam.x * PARALLAX.moon * s), Math.max(28 * s, view.groundY - 235 * s));

    const strip = (t: TilingSprite, base: number, factor: number) => {
      const bottom = view.groundY - base * s;
      t.tileScale.set(s);
      t.width = view.width;
      t.height = t.texture.height * s;
      t.position.set(0, bottom - t.height);
      t.tilePosition.set(parallaxOffset(cam.x, factor, t.texture.width, s), 0);
      return bottom;
    };
    strip(this.far, FAR_BASE, PARALLAX.far);
    const nearBottom = strip(this.near, NEAR_BASE, PARALLAX.near);
    this.underNear.clear();
    if (nearBottom < view.height) this.underNear.rect(0, nearBottom, view.width, view.height - nearBottom).fill(NEAR_FILL);

    // a queda até a rua: de um pouco acima do chão do telhado mais baixo até o fim da tela
    const dropTop = view.groundY - 40 * s;
    this.drop.position.set(0, dropTop);
    this.drop.width = view.width;
    this.drop.height = Math.max(1, view.height - dropTop);

    const fogH = this.fogH * s * 2;
    this.street.tileScale.set(s, s * 2);
    this.street.width = view.width;
    this.street.height = fogH;
    this.street.position.set(0, view.height - fogH);
    this.street.tilePosition.set(parallaxOffset(cam.x, PARALLAX.street, this.street.texture.width, s, now / 1000 * 4), 0);
    this.street.alpha = 0.45 + 0.08 * Math.sin(now / 2300);
  }

  private drawSky(view: View) {
    const s = view.scale;
    const horizon = view.groundY - 40 * s;
    const g = this.sky.clear();
    // faixas de cor: as do SKY e uma no meio de cada duas, para o degradê não ter degrau grande
    const bands = SKY.flatMap((c, i) => (i ? [mix(SKY[i - 1], c), c] : [c]));
    const band = horizon / bands.length;
    bands.forEach((color, i) => g.rect(0, Math.floor(i * band), view.width, Math.ceil(band) + 1).fill(color));
    g.rect(0, horizon, view.width, view.height - horizon).fill(bands[bands.length - 1]);
    // estrelas: poucas, fixas, só no alto
    for (let i = 0; i < 70; i++) {
      const x = ((i * 7919) % 1000) / 1000 * view.width;
      const y = ((i * 104729) % 997) / 997 * horizon * 0.55;
      const bright = i % 7 === 0;
      g.rect(Math.round(x), Math.round(y), bright ? s : Math.max(1, s - 1), bright ? s : Math.max(1, s - 1)).fill({ color: bright ? 0xe8e2ff : 0x9c92d0, alpha: bright ? 0.9 : 0.55 });
    }
  }
}
