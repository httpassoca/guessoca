/**
 * O céu e a rua vivos (issue #70): o relâmpago clareando o céu atrás da cidade (e o trovão, longe, depois), o holofote
 * varrendo de lá de baixo, o avião com as luzes de navegação, a estrela cadente, as janelas da cidade ao fundo que
 * acendem e apagam, e os carros passando na neblina da rua. Pixi; o quando de cada coisa é de `ambient.ts` (puro).
 *
 * Entrada: `plane` e `car` da folha do telhado (`tools/sprites/src/life.ts`) e as janelas que piscam de cada faixa da
 * cidade (`twinkle` em `rooftop.json`, de `tools/sprites/src/skyline.ts`). Saída: quatro contêineres que `backdrop.ts`
 * intercala com as camadas dele: `sky` (atrás da cidade de longe), `far` e `near` (por cima de cada faixa) e `street`
 * (antes da neblina da rua). Tudo em pixels da tela. Os sons (trovão, sirene) vão para a mesa do mapa (`playSfx`).
 *
 * Em desenvolvimento, `?ceu=N` acelera o céu N vezes (`skySpeed`), para ver o avião, o relâmpago e a sirene sem
 * esperar minutos.
 */
import type { Camera, View } from '@guess/world';
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { playSfx } from '../sound/player';
import { ROOFTOP, type SkylineStrip } from '../sprites/rooftop';
import { carsAt, lightningFlash, meteorAt, navLights, planeAt, searchlightAngle, sirenAt, skySpeed, thunderAt, twinkleOn } from './ambient';
import type { RooftopArt } from './art';
import { PARALLAX, parallaxOffset } from './parallax';

/** o clarão: lilás quase branco, somando luz no céu (no olho; o `flash` de `ambient.ts` vai de 0 a 1) */
const FLASH_COLOR = 0xd9d2ff;
const FLASH_ALPHA = 0.28;
/** o holofote: lilás, bem fraco; a base atrás da cidade de longe, um pouco à esquerda do meio */
const BEAM_COLOR = 0xc9c0ff;
const BEAM_ALPHA = 0.09;
const BEAM_AT = 0.3;
/** o avião voa entre 14% e 34% da altura do céu (abaixo do relógio, no meio de cima) */
const PLANE_TOP = 0.14;
const PLANE_SPAN = 0.2;
/** as luzes do avião, em pixels da grade `plane` a partir da âncora (6, 2): vermelha na asa de baixo, verde na de cima, estrobo na cauda */
const LIGHTS: { x: number; y: number; color: number; key: 'red' | 'green' | 'strobe' }[] = [
  { x: -1, y: 1, color: 0xff4256, key: 'red' },
  { x: 3, y: -1, color: 0x4dff9a, key: 'green' },
  { x: -4, y: -2, color: 0xfff1c2, key: 'strobe' },
];
/** a estrela cadente: quantos pixels do mundo anda na vida dela e o rastro */
const METEOR_RUN = 46;
const METEOR_TAIL = 7;
/** os carros: a altura de cada faixa acima do fim da tela, em unidades do mundo, e o quanto aparecem */
const LANES = [5, 13];
const CAR_ALPHA = 0.85;
/** o horizonte, como em `backdrop.ts`: 40 unidades acima do chão do telhado mais baixo */
const HORIZON = 40;

/** um cone de luz num canvas: estreito embaixo, largo em cima, apagando para cima; o sprite estica e gira */
function coneTexture(): Texture {
  const c = document.createElement('canvas');
  c.width = 32; c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 128, 0, 0);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.beginPath(); g.moveTo(15, 128); g.lineTo(17, 128); g.lineTo(32, 0); g.lineTo(0, 0); g.closePath(); g.fill();
  return Texture.from(c);
}

const hex = (h: string) => parseInt(h, 16);

/** O céu e a rua vivos, em quatro camadas que `backdrop.ts` intercala com as suas. */
export class SkyLife {
  /** atrás da cidade de longe: clarão, holofote, avião, estrela cadente */
  readonly sky = new Container();
  /** por cima da cidade de longe e da de perto: as janelas que piscam */
  readonly far = new Container();
  readonly near = new Container();
  /** a rua, debaixo da neblina dela: os carros */
  readonly street = new Container();
  /** antes de o jogo começar: sem relâmpago nem trovão */
  lobby = false;
  private readonly flash = new Graphics();
  private readonly beam: Sprite;
  private readonly plane = new Container();
  private readonly lights: Sprite[] = [];
  private readonly meteor = new Graphics();
  private readonly carPool: Sprite[] = [];
  private readonly twinkles = new Map<string, Sprite[]>();
  /** as janelas da cidade que estão ao contrário agora, por faixa, recontadas a cada 250 ms (trocam a cada 15–40 s) */
  private readonly flipped = new Map<string, { at: number; on: boolean[] }>();
  private readonly speed = typeof location === 'undefined' ? 1 : skySpeed(location.search, location.hostname);
  private readonly carTexture: Texture;
  /** o trovão esperando a hora, e de que relâmpago já tocou; a sirene que já tocou */
  private thunder: number | null = null;
  private heard = new Set<number>();
  private sirenHeard = -1;
  private last = 0;
  /** o que está desenhado nos `Graphics` (para não limpar à toa a cada quadro) */
  private flashed = false;
  private streaked = false;

  constructor(art: RooftopArt) {
    this.flash.blendMode = 'add';
    this.beam = new Sprite({ texture: coneTexture(), anchor: { x: 0.5, y: 1 }, tint: BEAM_COLOR, alpha: BEAM_ALPHA });
    const body = new Sprite(art.frame('plane'));
    const f = ROOFTOP.frames.plane;
    body.anchor.set(f.anchor.x / f.w, f.anchor.y / f.h);
    this.plane.addChild(body);
    for (const l of LIGHTS) {
      const sp = new Sprite({ texture: Texture.WHITE, tint: l.color });
      sp.width = 1; sp.height = 1;
      sp.position.set(l.x, l.y);
      this.lights.push(sp);
      this.plane.addChild(sp);
    }
    this.sky.addChild(this.flash, this.beam, this.meteor, this.plane);
    this.carTexture = art.frame('car');
  }

  /** Um quadro: `strips` diz onde está o topo de cada faixa da cidade (pixels da tela). `now` em ms. */
  update(cam: Camera, view: View, now: number, strips: Record<'far' | 'near', { top: number }>) {
    const s = view.scale;
    const F = this.speed;
    const horizon = view.groundY - HORIZON * s;

    // o relâmpago: o céu clareia atrás da cidade (os prédios ficam recortados contra ele); nunca no lobby
    const flash = lightningFlash(now, this.lobby, F);
    if (this.flashed) this.flash.clear();
    this.flashed = flash > 0;
    if (flash > 0) this.flash.rect(0, 0, view.width, horizon + 4 * s).fill({ color: FLASH_COLOR, alpha: FLASH_ALPHA * flash });
    this.flash.visible = this.flashed;
    if (!this.lobby) {
      const th = thunderAt(now, F);
      if (th !== null && !this.heard.has(th)) { this.heard.add(th); this.thunder = th; }
    }
    if (this.thunder !== null && now >= this.thunder) {
      // a aba voltou do fundo muito depois: trovão velho não toca
      if (now - this.thunder < 1000) playSfx('thunder');
      this.thunder = null;
    }
    const siren = sirenAt(now, F);
    if (siren && siren.start !== this.sirenHeard) {
      this.sirenHeard = siren.start;
      if (now - this.last < 1000) playSfx('siren');
    }
    this.last = now;

    // o holofote: sai de trás da cidade de longe, um pouco à esquerda, e varre devagar
    const baseX = view.width * BEAM_AT - cam.x * PARALLAX.far * s;
    const wrap = view.width * 1.2;
    this.beam.position.set(((baseX % wrap) + wrap) % wrap - view.width * 0.1, view.groundY - 6 * s);
    this.beam.rotation = searchlightAngle(now);
    this.beam.width = 26 * s;
    this.beam.height = (view.groundY - 6 * s) * 0.95;

    // o avião: atravessa a tela inteira, devagar, nas alturas de cima do céu
    const p = planeAt(now, F);
    this.plane.visible = !!p;
    if (p) {
      const run = view.width + 40 * s;
      const x = p.dir > 0 ? -20 * s + p.u * run : view.width + 20 * s - p.u * run;
      const y = horizon * (PLANE_TOP + p.alt * PLANE_SPAN);
      this.plane.position.set(Math.round(x / s) * s, Math.round(y / s) * s);
      this.plane.scale.set(p.dir * s, s);
      const l = navLights(p.t);
      LIGHTS.forEach((def, i) => { this.lights[i].visible = l[def.key]; });
    }

    // a estrela cadente: um risco curto num dos lados, longe do meio de cima
    const m = meteorAt(now, F);
    if (this.streaked) this.meteor.clear();
    this.streaked = !!m;
    this.meteor.visible = !!m;
    if (m) {
      const hx = Math.round(m.x0 * view.width / s + m.dx * m.u * METEOR_RUN);
      const hy = Math.round(m.y0 * horizon / s + m.u * METEOR_RUN * 0.45);
      for (let i = 0; i < METEOR_TAIL; i++) {
        const x = hx - m.dx * i, y = hy - Math.round(i * 0.45);
        this.meteor.rect(x * s, y * s, s, s).fill({ color: i === 0 ? 0xfff1c2 : 0xb9b1d9, alpha: (1 - i / METEOR_TAIL) * (1 - m.u * 0.6) });
      }
    }

    // as janelas da cidade ao fundo que piscam: por cima de cada repetição da faixa
    for (const strip of ROOFTOP.skylines) this.twinkle(strip, cam, view, now, strips[strip.layer as 'far' | 'near']?.top);

    // os carros, lá embaixo na neblina da rua, andando com a rua (a paralaxe dela)
    const cars = carsAt(now);
    cars.forEach((c, i) => {
      const sp = this.carPool[i] ?? this.addCar();
      sp.visible = true;
      sp.scale.set(c.dir * s, s);
      sp.position.set(Math.round((c.x - cam.x * PARALLAX.street) * s + view.width / 2), view.height - LANES[c.lane] * s);
    });
    for (let i = cars.length; i < this.carPool.length; i++) this.carPool[i].visible = false;
  }

  private addCar(): Sprite {
    const f = ROOFTOP.frames.car;
    const sp = new Sprite({ texture: this.carTexture, alpha: CAR_ALPHA });
    sp.anchor.set(f.anchor.x / f.w, f.anchor.y / f.h);
    this.carPool.push(sp);
    this.street.addChild(sp);
    return sp;
  }

  private twinkle(strip: SkylineStrip, cam: Camera, view: View, now: number, top: number | undefined) {
    const layer = strip.layer === 'far' ? 0 : 1;
    const host = layer ? this.near : this.far;
    let pool = this.twinkles.get(strip.layer);
    if (!pool) { pool = []; this.twinkles.set(strip.layer, pool); }
    let used = 0;
    if (top !== undefined && strip.twinkle?.length) {
      const s = view.scale;
      const factor = layer ? PARALLAX.near : PARALLAX.far;
      const tile = strip.w * s;
      let st = this.flipped.get(strip.layer);
      if (!st || now - st.at >= 250 || now < st.at) {
        st = { at: now, on: strip.twinkle.map((t, i) => twinkleOn(t.lit, layer, i, now)) };
        this.flipped.set(strip.layer, st);
      }
      const state = st.on;
      for (let x0 = parallaxOffset(cam.x, factor, strip.w, s); x0 < view.width; x0 += tile) {
        strip.twinkle.forEach((t, i) => {
          const on = state[i];
          if (on === t.lit) return;
          const sp = pool[used] ?? (pool[used] = host.addChild(new Sprite(Texture.WHITE)));
          used++;
          const tint = hex(on ? t.on : t.off);
          if (sp.tint !== tint) sp.tint = tint;
          sp.position.set(x0 + t.x * s, top + t.y * s);
          if (sp.width !== t.w * s) sp.width = t.w * s;
          if (sp.height !== t.h * s) sp.height = t.h * s;
          sp.visible = true;
        });
      }
    }
    for (let i = used; i < pool.length; i++) pool[i].visible = false;
  }
}
