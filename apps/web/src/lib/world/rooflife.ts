/**
 * A chuva que encosta e os objetos que mexem (issue #70): respingos nos tampos e nas tampas das caixas, anéis nas poças,
 * o reflexo do letreiro mais perto nas poças (acendendo e falhando junto com ele), gotas pingando da cornija, dos
 * letreiros e da caixa-d'água, a hélice do ar-condicionado girando, o vapor da chaminé indo com o vento, e o espirro de
 * quem corre numa poça. Pixi; o quando de cada coisa sai de `ambient.ts` (puro, testado).
 *
 * Entrada: o `MAP` (`ROOFS`, `boxLooks`, `DECOR` de `dressing.ts`, unidades do mundo), os quadros da vida na folha do
 * telhado (`splash-*`, `ripple-*`, `drip-*`, `fan-*`, `puff-*`, `kick-*`, `puddle-*-shine`, de
 * `tools/sprites/src/life.ts`) e os corpos (`SceneBody`) para os espirros. Saída: um `Container` que `scene.ts` põe no
 * cenário logo depois dos telhados (atrás dos corpos, com o bloom). Um punhado de sprites reaproveitados; nada é criado
 * por quadro depois que o monte cresce.
 */
import { BODY_RX, DEPTH, groundAt, MAP, project, type Camera, type Platform, type View } from '@guess/world';
import { Container, Sprite, type Texture } from 'pixi.js';
import { ROOFTOP } from '../sprites/rooftop';
import { barSign, drip, inPuddle, puddleGlow, puffsAt, ripples, sign24h, splashes } from './ambient';
import type { RooftopArt } from './art';
import { boxLooks, DECOR, decorAt, neonFlicker, ROOFS, type Decor } from './dressing';
import type { SceneBody } from './scene';

/** quantos canais de respingo no mapa inteiro (cada um pinga a cada 0,5–1,1 s; uns 20% aparecem por vez) */
const SPLASHES = 60;
/** anéis por poça */
const RIPPLES_EACH = 2;
/** nuvenzinhas por boca da chaminé */
const PUFFS = 5;
/** de quanto em quanto tempo quem corre numa poça espirra de novo, e quanto dura o espirro (ms) */
const KICK_EVERY = 260;
const KICK_MS = 240;
/** a hélice: um passo a cada tanto ms (três passos) */
const FAN_MS = 70;
/** as bocas da hélice no tampo do ar-condicionado e da chaminé, em pixels do quadro (o canto de cima à esquerda) */
const FANS = [[3, 3], [21, 3]];
const FLUES = [[12, 5], [28, 5]];
/** o reflexo do neon na poça: a força com o letreiro aceso e com ele falhando */
const SHINE = 0.5;
const SHINE_FLICKER = 0.22;
/** as cores dos letreiros (o tubo, `x` e `z` em `rooftop.ts`) */
const SIGN_COLOR: Record<string, number> = { 'sign-bar': 0xff3cc8, 'sign-24h': 0xff3cc8, 'sign-hotel': 0x3ef0ff };

/** Um lugar de onde pinga: o ponto no mundo e quanto a gota cai antes de sumir. */
interface Dripper { x: number; y: number; z: number; fall: number }

/** Um lugar que respinga: um retângulo em x e z, na altura `y`, e o peso dele (a área). */
interface Surface { x0: number; x1: number; z0: number; z1: number; y: number; area: number }

/** A chuva que encosta e os objetos que mexem, num contêiner atrás dos corpos. */
export class RoofLife extends Container {
  private readonly pool: Sprite[] = [];
  private used = 0;
  private readonly textures = new Map<string, Texture>();
  private readonly surfaces: Surface[] = [];
  private readonly area: number;
  private readonly boxes = boxLooks(MAP);
  private readonly puddles: { d: Decor; w: number; h: number; glow: number | null; sign: string | null }[];
  private readonly drippers: Dripper[] = [];
  private readonly kicks = new Map<string, number>();

  constructor(private readonly art: RooftopArt) {
    super();
    // os tampos dos telhados e as tampas das caixas, pesados pela área (onde mais chove, mais respinga)
    for (const r of ROOFS) this.surfaces.push({ x0: r.x0 + 2, x1: r.x1 - 2, z0: 1, z1: DEPTH - 1, y: r.top, area: 0 });
    for (const b of this.boxes) this.surfaces.push({ x0: b.box.x0 + 2, x1: b.box.x1 - 2, z0: b.box.z0 + 1, z1: b.box.z1 - 1, y: b.box.top, area: 0 });
    for (const s of this.surfaces) s.area = (s.x1 - s.x0) * (s.z1 - s.z0);
    this.area = this.surfaces.reduce((a, s) => a + s.area, 0);

    // as poças e a cor do letreiro mais perto de cada uma (pelo meio do letreiro)
    const signs = DECOR.filter((d) => d.frame in SIGN_COLOR).map((d) => {
      const f = ROOFTOP.frames[d.frame];
      return { roof: d.roof, x: d.x - f.anchor.x + f.w / 2, color: SIGN_COLOR[d.frame], frame: d.frame };
    });
    this.puddles = DECOR.filter((d) => /^puddle-[a-z]$/.test(d.frame)).map((d) => {
      const f = ROOFTOP.frames[d.frame];
      const glow = puddleGlow(d, signs);
      const sign = glow === null ? null : signs.filter((s) => s.roof === d.roof && s.color === glow).sort((a, b) => Math.abs(a.x - d.x) - Math.abs(b.x - d.x))[0].frame;
      return { d, w: f.w, h: f.h, glow, sign };
    });

    // de onde pinga: a cornija da frente de cada prédio (cai pela fachada), o pé dos letreiros, o estrado da caixa-d'água
    ROOFS.forEach((r) => { for (let x = r.x0 + 14; x < r.x1 - 6; x += 41) this.drippers.push({ x, y: r.top - 4, z: 0, fall: 46 }); });
    for (const d of DECOR) {
      const f = ROOFTOP.frames[d.frame];
      if (d.layer !== 'facade' || !f) continue;
      const at = decorAt(d), left = d.x - f.anchor.x;
      for (const k of [0.25, 0.7]) this.drippers.push({ x: Math.round(left + f.w * k), y: at.y - (f.h - f.anchor.y), z: 0, fall: 40 });
    }
    const tank = this.boxes.find((b) => b.frame === 'tank');
    if (tank) for (const dx of [9, 31]) this.drippers.push({ x: tank.box.x0 + dx, y: tank.box.top - 39, z: tank.box.z0, fall: tank.box.top - 39 - tank.base });
  }

  private texture(name: string): Texture {
    let t = this.textures.get(name);
    if (!t) { t = this.art.frame(name); this.textures.set(name, t); }
    return t;
  }

  /** Um sprite do monte com o quadro `name`, a âncora do atlas, em `x, y` (pixels da tela), na escala `s`. */
  private put(name: string, x: number, y: number, s: number, alpha = 1, tint = 0xffffff): Sprite {
    const sp = this.pool[this.used] ?? this.grow();
    this.used++;
    const tex = this.texture(name);
    // só mexe no que mudou: cada atribuição no Pixi marca o sprite para refazer
    if (sp.texture !== tex) {
      const f = ROOFTOP.frames[name];
      sp.texture = tex;
      sp.anchor.set(f.anchor.x / f.w, f.anchor.y / f.h);
    }
    sp.position.set(x, y);
    if (sp.scale.x !== s) sp.scale.set(s);
    if (sp.alpha !== alpha) sp.alpha = alpha;
    if (sp.tint !== tint) sp.tint = tint;
    sp.visible = true;
    return sp;
  }

  private grow(): Sprite {
    const sp = new Sprite();
    this.pool.push(sp);
    this.addChild(sp);
    return sp;
  }

  /** Um quadro: os corpos (para os espirros nas poças), a câmera, a vista e `now` em ms. */
  update(list: readonly SceneBody[], cam: Camera, view: View, now: number) {
    const s = view.scale;
    const margin = 24 * s;
    const seen = (x: number) => x > -margin && x < view.width + margin;
    this.used = 0;

    // o reflexo do letreiro nas poças, embaixo de tudo (acende e falha junto com o letreiro)
    for (const p of this.puddles) {
      if (p.glow === null || !p.sign) continue;
      const at = project(decorAt(p.d), cam, view);
      if (!seen(at.x)) continue;
      const k = signLevel(p.sign, now);
      if (k > 0) this.put(`${p.d.frame}-shine`, at.x, at.y, s, k, p.glow);
    }

    // os respingos: cada canal escolhe a superfície pela área e o lugar dentro dela; debaixo de uma caixa não aparece
    for (const sp of splashes(now, SPLASHES)) {
      let w = sp.pick * this.area, i = 0;
      while (i < this.surfaces.length - 1 && w >= this.surfaces[i].area) w -= this.surfaces[i++].area;
      const surf = this.surfaces[i];
      const x = Math.round(surf.x0 + sp.u * (surf.x1 - surf.x0)), z = surf.z0 + sp.v * (surf.z1 - surf.z0);
      if (i < ROOFS.length && this.underBox(x, z)) continue;
      const at = project({ x, y: surf.y, z }, cam, view);
      if (seen(at.x)) this.put(`splash-${sp.frame}`, at.x, at.y, s);
    }

    // os anéis nas poças, em pixels inteiros do mundo a partir do meio da poça
    for (const r of ripples(now, this.puddles.length, RIPPLES_EACH)) {
      const p = this.puddles[r.puddle];
      const at = project(decorAt(p.d), cam, view);
      if (!seen(at.x)) continue;
      this.put(`ripple-${r.frame}`, at.x + Math.round(r.u * p.w) * s, at.y - Math.round(p.h / 2 + r.v * p.h) * s, s);
    }

    // as gotas: penduradas um instante, depois caem acelerando e somem
    this.drippers.forEach((d, i) => {
      const st = drip(now, i, d.fall);
      if (!st) return;
      const at = project({ x: d.x, y: d.y - Math.round(st.dy), z: d.z }, cam, view);
      if (seen(at.x)) this.put(st.phase === 'hang' ? 'drip-0' : 'drip-1', at.x, at.y, s, 0.85);
    });

    // a hélice do ar-condicionado e o vapor da chaminé
    for (const b of this.boxes) {
      const at = b.place(cam, view);
      if (!seen(at.x)) continue;
      const top = at.y - ROOFTOP.frames[b.frame].h * s;
      if (b.frame === 'ac' && ROOFTOP.frames['fan-0']) {
        const step = Math.floor(now / FAN_MS) % 3;
        for (const [fx, fy] of FANS) this.put(`fan-${step}`, at.x + fx * s, top + fy * s, s);
      }
      if (b.frame === 'chimney') {
        FLUES.forEach(([fx, fy], src) => {
          for (const p of puffsAt(now, src, PUFFS)) this.put(`puff-${p.frame}`, at.x + Math.round(fx + p.drift) * s, top + Math.round(fy - p.rise) * s, s, p.alpha);
        });
      }
    }

    // quem corre (ou anda) numa poça espirra água dos dois lados dos pés
    const alive = new Set<string>();
    for (const body of list) {
      alive.add(body.id);
      const moving = body.anim === 'walk' || body.anim === 'run';
      const ground = groundAt(MAP, body.x, body.z);
      let last = this.kicks.get(body.id) ?? -Infinity;
      if (moving && ground !== null && Math.abs(body.y - ground) < 1 && now - last >= KICK_EVERY
        && this.puddles.some((p) => ROOFS[p.d.roof].top === ground && inPuddle(body.x, body.z, { x: p.d.x, z: p.d.z ?? DEPTH / 2, w: p.w, h: p.h }))) {
        last = now;
        this.kicks.set(body.id, now);
      }
      const age = now - last;
      if (age < KICK_MS) {
        const at = project({ x: body.x, y: body.y, z: body.z }, cam, view);
        this.put(`kick-${age < KICK_MS / 2 ? 0 : 1}`, at.x + Math.round(body.facing * BODY_RX * 0.3) * s, at.y, s);
      }
    }
    for (const id of this.kicks.keys()) if (!alive.has(id)) this.kicks.delete(id);

    for (let i = this.used; i < this.pool.length; i++) this.pool[i].visible = false;
  }

  /** Se o ponto do tampo do telhado fica debaixo de uma caixa (a caixa cobre o respingo). */
  private underBox(x: number, z: number) {
    return this.boxes.some(({ box }: { box: Platform }) => x >= box.x0 - 1 && x <= box.x1 + 1 && z >= box.z0 - 1);
  }
}

/** O quanto o reflexo de um letreiro brilha agora: aceso, falhando (uma letra apagada) ou apagado. */
function signLevel(sign: string, now: number): number {
  if (sign === 'sign-hotel') return neonFlicker(now) ? SHINE_FLICKER : SHINE;
  if (sign === 'sign-bar') return barSign(now) === 'sign-bar' ? SHINE : SHINE_FLICKER;
  if (sign === 'sign-24h') { const f = sign24h(now); return f === 'sign-24h' ? SHINE : f === 'sign-24h-off' ? 0 : SHINE_FLICKER; }
  return SHINE;
}
