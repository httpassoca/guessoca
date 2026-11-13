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
 * O raio do chefão derrubado (`strike`, quando o servidor avisa `bossDown`) é diferente do relâmpago de fundo: vale também
 * fora da hora sorteada, e se vê inteiro, do alto da tela até o prédio mais alto da cidade de perto atrás de onde ele
 * estava (por cima da cidade de longe, atrás da de perto), com o brilho e as faíscas no alto do prédio; o céu clareia
 * mais. O clarão da tela toda e o tremor são de `scene.ts`; o som, do `WorldRuntime`.
 *
 * Em desenvolvimento, `?ceu=N` acelera o céu N vezes (`skySpeed`), para ver o avião, o relâmpago e a sirene sem
 * esperar minutos.
 */
import type { Camera, View } from '@guess/world';
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { playSfx } from '../sound/player';
import { ROOFTOP, type SkylineStrip } from '../sprites/rooftop';
import { boltPath, carsAt, hash, lightningFlash, meteorAt, navLights, planeAt, searchlightAngle, sirenAt, skySpeed, STRIKE_MS, strikeAt, strikeTarget, thunderAt, twinkleOn } from './ambient';
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
/**
 * o raio do chefão derrubado: o miolo branco, o meio lilás e o halo roxo (largura em pixels do mundo), o clarão do céu
 * mais forte que o do relâmpago de fundo, o quanto procura um prédio alto para os lados (pixels do mundo) e o brilho no
 * alto do prédio atingido (raio em pixels do mundo)
 */
const BOLT = [
  { w: 7, color: 0x6f5cff, alpha: 0.22 },
  { w: 3, color: 0xb9adff, alpha: 0.7 },
  { w: 1, color: 0xffffff, alpha: 1 },
] as const;
const STRIKE_SKY_ALPHA = 0.6;
const STRIKE_REACH = 70;
const IMPACT_R = 16;
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
  /** o raio do chefão derrubado: por cima da cidade de longe (atrás da de perto, que esconde o pé dele) e o brilho no prédio */
  private readonly bolt = new Graphics();
  private readonly impact = new Graphics();
  private readonly nearTops: readonly number[];
  /** o raio em andamento: o sorteio dele, onde o chefão estava, quando caiu e, depois do primeiro quadro, em que ponto da faixa de perto */
  private struck: { seed: number; x: number; at: number; layerX: number | null; top: number } | null = null;
  private bolted = false;

  constructor(art: RooftopArt) {
    this.flash.blendMode = 'add';
    this.bolt.blendMode = 'add';
    this.impact.blendMode = 'add';
    this.nearTops = art.roofline('near');
    // por cima das janelas que piscam (que entram nos mesmos contêineres depois, conforme aparecem)
    this.bolt.zIndex = this.impact.zIndex = 1;
    this.far.sortableChildren = this.near.sortableChildren = true;
    this.far.addChild(this.bolt);
    this.near.addChild(this.impact);
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

  /**
   * O chefão foi derrubado (o servidor avisou): um raio cai num prédio da cidade de perto, atrás de onde ele estava
   * (`x`, unidades do mundo). `seed` dá o desenho do raio (o mesmo em toda aba). `now` em ms, o relógio de `update`.
   */
  strike(seed: number, x: number, now: number) { this.struck = { seed, x, at: now, layerX: null, top: 0 }; }

  /** Um quadro: `strips` diz onde está o topo de cada faixa da cidade (pixels da tela). `now` em ms. */
  update(cam: Camera, view: View, now: number, strips: Record<'far' | 'near', { top: number }>) {
    const s = view.scale;
    const F = this.speed;
    const horizon = view.groundY - HORIZON * s;

    // o relâmpago: o céu clareia atrás da cidade (os prédios ficam recortados contra ele); nunca no lobby
    const strike = this.struck ? strikeAt(now - this.struck.at) : null;
    if (this.struck && now - this.struck.at >= STRIKE_MS) this.struck = null;
    const flash = Math.max(FLASH_ALPHA * lightningFlash(now, this.lobby, F), STRIKE_SKY_ALPHA * (strike?.flash ?? 0));
    if (this.flashed) this.flash.clear();
    this.flashed = flash > 0;
    if (flash > 0) this.flash.rect(0, 0, view.width, horizon + 4 * s).fill({ color: FLASH_COLOR, alpha: flash });
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

    this.drawStrike(cam, view, now, strips.near.top, strike?.bolt ?? 0);

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

  /**
   * O raio do chefão: do alto da tela até o prédio mais alto perto de onde ele estava, na cidade de perto (o lugar é
   * escolhido no primeiro quadro e depois anda com a faixa, como o prédio), desenhado em pixels do mundo; e o brilho no
   * alto do prédio, com umas faíscas.
   */
  private drawStrike(cam: Camera, view: View, now: number, nearTop: number, amount: number) {
    if (this.bolted) { this.bolt.clear(); this.impact.clear(); }
    this.bolted = amount > 0 && !!this.struck;
    this.bolt.visible = this.impact.visible = this.bolted;
    const st = this.struck;
    if (!st || amount <= 0) return;
    const s = view.scale;
    const shift = cam.x * PARALLAX.near;
    if (st.layerX === null) {
      const strip = ROOFTOP.skylines.find((k) => k.layer === 'near');
      const offset = parallaxOffset(cam.x, PARALLAX.near, strip?.w ?? 1, s);
      const t = strikeTarget({ x: st.x, camX: cam.x, width: view.width, scale: s, factor: PARALLAX.near, offset, tops: this.nearTops, reach: STRIKE_REACH * s });
      st.layerX = Math.floor(t.x / s) + Math.round(shift);
      st.top = t.top;
    }
    // em pixels do mundo: x na faixa de perto (que anda com a câmera), y a partir do alto da tela
    const ox = -Math.round(shift) * s, top = Math.round(nearTop / s);
    const hit = { x: st.layerX, y: top + st.top };
    const from = { x: st.layerX + Math.round((hash(st.seed, 81) - 0.5) * 50), y: -4 };
    const path = boltPath(st.seed, from, hit);
    const dot = (g: Graphics, x: number, y: number, w: number, color: number, alpha: number) => g.rect(ox + (x - (w >> 1)) * s, y * s, w * s, s).fill({ color, alpha });
    const line = (g: Graphics, pts: readonly { x: number; y: number }[], w: number, color: number, alpha: number) => {
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const n = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
        for (let k = 0; k < n; k++) dot(g, Math.round(a.x + ((b.x - a.x) * k) / n), Math.round(a.y + ((b.y - a.y) * k) / n), w, color, alpha);
      }
    };
    for (const layer of BOLT) {
      line(this.bolt, path.main, layer.w, layer.color, layer.alpha * amount);
      for (const br of path.branches) line(this.bolt, br, Math.max(1, layer.w - 2), layer.color, layer.alpha * amount * 0.6);
    }
    // o alto do prédio acende: um halo e umas faíscas que voam para os lados e caem
    const cx = ox + hit.x * s, cy = hit.y * s;
    this.impact.circle(cx, cy, IMPACT_R * s).fill({ color: 0x6f5cff, alpha: 0.35 * amount });
    this.impact.circle(cx, cy, IMPACT_R * 0.45 * s).fill({ color: 0xd9d2ff, alpha: 0.6 * amount });
    const age = (now - st.at) / 1000;
    for (let i = 0; i < 10; i++) {
      const vx = (hash(st.seed, i, 82) - 0.5) * 70, vy = -20 - hash(st.seed, i, 83) * 50;
      const x = hit.x + vx * age, y = hit.y + vy * age + 90 * age * age;
      this.impact.rect(ox + Math.round(x) * s, Math.round(y) * s, s, s).fill({ color: i % 3 ? 0xfff1c2 : 0xffffff, alpha: amount });
    }
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
