/**
 * O fundo do telhado (issue #6): o céu em faixas de cor com estrelas e a lua, a cidade em duas camadas de paralaxe (a
 * de longe enevoada, a de perto escura), e a queda até a rua nos vãos: escurece para baixo e acaba numa neblina roxa,
 * iluminada pelos letreiros lá embaixo. Tudo atrás dos telhados. Pixi; a conta da paralaxe é pura (`parallax.ts`).
 * O que mexe no céu e na rua (relâmpago, holofote, avião, janelas da cidade, carros; issue #70) é de `skylife.ts`,
 * intercalado aqui entre as camadas: atrás da cidade de longe, por cima de cada faixa e debaixo da neblina da rua.
 *
 * Entrada: a lua e a neblina de `rooftop.png` e as faixas `skyline-far.png`/`skyline-near.png` (via `art.ts`, geradas
 * por `tools/sprites/src/rooftop.ts` e `skyline.ts`); o céu e o degradê da queda são desenhados aqui, em código. Saída:
 * um `Container` que `scene.ts` põe primeiro no `scenery` (ganha o bloom). Tudo em pixels da tela; as alturas abaixo são
 * em unidades do mundo acima do chão do telhado mais baixo (`view.groundY`), vezes a escala. Cores e alturas no olho.
 */
import type { Camera, View } from '@guess/world';
import { Container, Graphics, Sprite, Texture, TilingSprite } from 'pixi.js';
import type { RooftopArt } from './art';
import { PARALLAX, parallaxOffset } from './parallax';
import { SkyLife } from './skylife';

/** o céu, do alto até o horizonte: azul quase preto descendo para o roxo do neon refletido nas nuvens (no olho) */
const SKY = [0x06051a, 0x0a0820, 0x0f0b2a, 0x150e33, 0x1c113c, 0x251545, 0x301a4f, 0x3e1f58, 0x4f2460, 0x62296a];
/**
 * A base de cada faixa da cidade, em unidades do mundo acima do chão do telhado mais baixo: a de longe pousa logo acima
 * dele (6), atrás dos telhados; a de perto desce 96 abaixo, na rua, para os prédios vizinhos subirem dos vãos.
 */
const FAR_BASE = 6;
const NEAR_BASE = -96;
/** abaixo da faixa de perto, até o fim da tela: a mesma cor da base dela (`base` de `near` em `skyline.ts`) */
const NEAR_FILL = 0x0e0c1d;
/** a neblina da rua, tingida de lilás claro (a luz dos letreiros lá embaixo) */
const FOG_TINT = 0xb7a6ff;
/** o horizonte e o topo da queda: 40 unidades acima do chão do telhado mais baixo (onde a cidade de longe some) */
const HORIZON = 40;
/** a lua: a 78% da largura da tela, 235 unidades acima do chão (no alto do céu), nunca a menos de 28 do topo */
const MOON_X = 0.78;
const MOON_Y = 235;
const MOON_TOP = 28;
/** estrelas fixas, só nos 55% de cima do céu; uma em cada 7 é brilhante */
const STARS = 70;
const STARS_SKY = 0.55;
/**
 * a neblina da rua: o ladrilho esticado 2× na vertical, andando 4 unidades/s sozinha; a opacidade ondula 0,45 ± 0,08
 * num ciclo de ~14 s (`sin(now / 2300)`)
 */
const STREET_STRETCH = 2;
const STREET_DRIFT = 4;

/** um degradê vertical num canvas de 1×128: `stops` de [posição 0–1, rgba]; o sprite estica até o tamanho certo */
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

/** a média de duas cores 0xrrggbb, canal a canal */
const mix = (a: number, b: number) => {
  const ch = (c: number, sh: number) => (c >> sh) & 0xff;
  return [16, 8, 0].reduce((acc, sh) => acc | (Math.round((ch(a, sh) + ch(b, sh)) / 2) << sh), 0);
};

/** O céu, a lua, as duas faixas da cidade e a queda até a rua, atrás dos telhados. */
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
  /** o céu e a rua vivos (`skylife.ts`): relâmpago, holofote, avião, estrela cadente, janelas piscando, carros */
  readonly life: SkyLife;

  constructor(art: RooftopArt) {
    super();
    this.moon = new Sprite(art.frame('moon'));
    this.moon.anchor.set(0.5);
    this.far = new TilingSprite({ texture: art.skyline('far') });
    this.near = new TilingSprite({ texture: art.skyline('near') });
    // a queda: transparente no horizonte, escurece rápido (78% em um terço) e no fim acende em roxo, a rua lá embaixo
    this.drop = new Sprite(gradient([[0, 'rgba(5,4,12,0)'], [0.35, 'rgba(5,4,12,0.78)'], [0.7, 'rgba(8,5,18,0.93)'], [1, 'rgba(66,28,92,0.95)']]));
    const fog = art.tile('fog');
    this.fogH = fog.height;
    this.street = new TilingSprite({ texture: fog, tint: FOG_TINT, alpha: 0.5 });
    this.life = new SkyLife(art);
    this.addChild(this.sky, this.moon, this.life.sky, this.far, this.life.far, this.near, this.life.near, this.underNear, this.drop, this.life.street, this.street);
  }

  /** Põe tudo no lugar para a câmera e a vista (pixels da tela); o céu só se redesenha quando a tela muda. `now` em ms. */
  update(cam: Camera, view: View, now: number) {
    const s = view.scale;
    const key = `${view.width}x${view.height}@${s}/${view.groundY}`;
    if (key !== this.key) { this.key = key; this.drawSky(view); }

    this.moon.scale.set(s);
    this.moon.position.set(Math.round(view.width * MOON_X - cam.x * PARALLAX.moon * s), Math.max(MOON_TOP * s, view.groundY - MOON_Y * s));

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
    const dropTop = view.groundY - HORIZON * s;
    this.drop.position.set(0, dropTop);
    this.drop.width = view.width;
    this.drop.height = Math.max(1, view.height - dropTop);

    const fogH = this.fogH * s * STREET_STRETCH;
    this.street.tileScale.set(s, s * STREET_STRETCH);
    this.street.width = view.width;
    this.street.height = fogH;
    this.street.position.set(0, view.height - fogH);
    this.street.tilePosition.set(parallaxOffset(cam.x, PARALLAX.street, this.street.texture.width, s, now / 1000 * STREET_DRIFT), 0);
    this.street.alpha = 0.45 + 0.08 * Math.sin(now / 2300);
    this.life.update(cam, view, now, { far: { top: this.far.y }, near: { top: this.near.y } });
  }

  private drawSky(view: View) {
    const s = view.scale;
    const horizon = view.groundY - HORIZON * s;
    const g = this.sky.clear();
    // faixas de cor: as do SKY e uma no meio de cada duas, para o degradê não ter degrau grande
    const bands = SKY.flatMap((c, i) => (i ? [mix(SKY[i - 1], c), c] : [c]));
    const band = horizon / bands.length;
    bands.forEach((color, i) => g.rect(0, Math.floor(i * band), view.width, Math.ceil(band) + 1).fill(color));
    g.rect(0, horizon, view.width, view.height - horizon).fill(bands[bands.length - 1]);
    // estrelas: poucas, fixas, só no alto; espalhadas sem sorteio multiplicando por primos grandes (7919, 104729) módulo
    // 1000 e 997, então caem sempre no mesmo lugar relativo da tela
    for (let i = 0; i < STARS; i++) {
      const x = ((i * 7919) % 1000) / 1000 * view.width;
      const y = ((i * 104729) % 997) / 997 * horizon * STARS_SKY;
      const bright = i % 7 === 0;
      g.rect(Math.round(x), Math.round(y), bright ? s : Math.max(1, s - 1), bright ? s : Math.max(1, s - 1)).fill({ color: bright ? 0xe8e2ff : 0x9c92d0, alpha: bright ? 0.9 : 0.55 });
    }
  }
}
