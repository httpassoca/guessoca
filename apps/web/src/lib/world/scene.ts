/**
 * O telhado em PixiJS v8 (ADR 0006): o fundo (céu, cidade em paralaxe, a queda até a rua), os telhados vestidos, uma
 * sombra no chão e um sprite por corpo, ordenados pela profundidade a cada quadro, a mureta da frente, o balão do emote
 * e a chuva. Tudo dentro de um contêiner só, o mundo, que leva os filtros de filme (`film.ts`) quando os efeitos de tela
 * estão ligados; os post-its e painéis são HTML por cima e nunca passam por eles. Não decide nada: desenha o que o
 * `WorldRuntime` manda, na mesma projeção (`project`) dos post-its em HTML. Não tem teste automático (Pixi e WebGL).
 */
import { EMOTES, type EmoteName } from '@guess/protocol';
import { BODY_RX, BODY_RZ, DEPTH_K, depthKey, groundAt, MAP, project, type Anim, type Camera, type Vec3, type View } from '@guess/world';
import { Application, Assets, Container, Graphics, Rectangle, Sprite, Texture, TextureSource } from 'pixi.js';
import { effectsOn, onEffects } from '../effects';
import type { Lang } from '../i18n';
import emoteAtlas from '../sprites/emotes.json';
import { frameIndex, HERO, heroSheet } from '../sprites/hero';
import { loadRooftopArt } from './art';
import { Backdrop } from './backdrop';
import { Film } from './film';
import { Platforms } from './platforms';
import { emoteAnchor } from './view';
import { Weather } from './weather';

export interface SceneBody extends Vec3 {
  id: string;
  character: number;
  facing: 1 | -1;
  anim: Anim;
  /** quando a animação atual começou, ms */
  animSince: number;
  emote: EmoteName | null;
  blink: boolean;
}

const CHARACTERS = HERO.hairs.length;
const ANIMS = Object.keys(HERO.animations) as Anim[];
const emoteSheet = (lang: Lang) => `/sprites/emotes-${lang}.png`;
const LANGS: Lang[] = ['pt-BR', 'en-US'];
const BG = 0x0b0a14;
/** piscando: alterna a cada tanto ms */
const BLINK_PERIOD = 90;

interface Drawn { sprite: Sprite; shadow: Graphics; balloon: Sprite }

export class Scene {
  /** tudo o que o Pixi desenha; os filtros de filme vão aqui */
  private readonly world = new Container();
  /** o cenário de trás (fundo e telhados): o brilho do neon vai só aqui, para não estourar os personagens */
  private readonly scenery = new Container();
  private backdrop: Backdrop | null = null;
  private platforms: Platforms | null = null;
  private weather: Weather | null = null;
  private readonly film = new Film();
  private effects = effectsOn();
  private readonly offEffects: () => void;
  private readonly shadows = new Container();
  private readonly bodies = new Container({ sortableChildren: true });
  private readonly balloons = new Container();
  private readonly drawn = new Map<string, Drawn>();
  /** quadros por personagem, animação e índice */
  private readonly frames: Texture[][][] = [];
  private readonly emotes = new Map<Lang, Record<EmoteName, Texture>>();

  private constructor(readonly app: Application) {
    app.stage.addChild(this.world);
    this.world.filterArea = app.screen;
    this.scenery.filterArea = app.screen;
    this.offEffects = onEffects((on) => { this.effects = on; this.applyEffects(); });
  }

  private applyEffects() {
    this.world.filters = this.effects ? this.film.world : [];
    this.scenery.filters = this.effects ? this.film.scenery : [];
  }

  /** Cria o canvas dentro de `host` e carrega as folhas. Rejeita se não houver como desenhar (sem WebGL nem canvas). */
  static async create(host: HTMLElement): Promise<Scene> {
    TextureSource.defaultOptions.scaleMode = 'nearest';
    const app = new Application();
    await app.init({
      resizeTo: window, background: BG, antialias: false, roundPixels: true, resolution: 1, autoDensity: false,
      autoStart: false, sharedTicker: false, preference: 'webgl',
    });
    app.ticker.stop();
    app.canvas.classList.add('gs-world-canvas');
    host.appendChild(app.canvas);
    const scene = new Scene(app);
    await scene.load();
    return scene;
  }

  get renderer() { return this.app.renderer.name; }

  private async load() {
    const sheets = await Promise.all(Array.from({ length: CHARACTERS }, (_, n) => Assets.load<Texture>(heroSheet(n))));
    const { w, h } = HERO.frame;
    for (const sheet of sheets) {
      this.frames.push(ANIMS.map((anim) => {
        const a = HERO.animations[anim];
        return Array.from({ length: a.frames }, (_, i) => new Texture({ source: sheet.source, frame: new Rectangle(i * w, a.row * h, w, h) }));
      }));
    }
    for (const lang of LANGS) {
      const sheet = await Assets.load<Texture>(emoteSheet(lang));
      const map = {} as Record<EmoteName, Texture>;
      for (const name of EMOTES) {
        const f = emoteAtlas.frames[name];
        map[name] = new Texture({ source: sheet.source, frame: new Rectangle(f.x, f.y, f.w, f.h) });
      }
      this.emotes.set(lang, map);
    }
    const art = await loadRooftopArt();
    this.backdrop = new Backdrop(art);
    this.platforms = new Platforms(art);
    this.weather = new Weather(art);
    this.scenery.addChild(this.backdrop, this.platforms.back);
    this.world.addChild(this.scenery, this.shadows, this.bodies, this.platforms.front, this.balloons, this.weather);
    this.applyEffects();
  }

  render(list: readonly SceneBody[], cam: Camera, view: View, now: number, lang: Lang) {
    const s = view.scale;
    this.backdrop?.update(cam, view, now);
    this.platforms?.update(cam, view, now);
    this.weather?.update(cam, view, now);
    if (this.effects) this.film.tick(now);

    const seen = new Set<string>();
    // quem está mais ao fundo primeiro; empate pelo id, para não piscar a ordem
    const sorted = [...list].sort((a, b) => depthKey(b) - depthKey(a) || (a.id < b.id ? -1 : 1));
    sorted.forEach((b, i) => {
      seen.add(b.id);
      const d = this.drawn.get(b.id) ?? this.add(b.id);
      const anim = HERO.animations[b.anim] ? b.anim : 'idle';
      const frames = this.frames[b.character]?.[ANIMS.indexOf(anim)];
      if (!frames) { d.sprite.visible = false; d.shadow.visible = false; d.balloon.visible = false; return; }
      const at = project(b, cam, view);
      d.sprite.texture = frames[frameIndex(anim, now - b.animSince)];
      d.sprite.position.set(at.x, at.y);
      d.sprite.scale.set(b.facing * s, s);
      d.sprite.zIndex = i;
      d.sprite.visible = true;
      d.sprite.alpha = b.blink && Math.floor(now / BLINK_PERIOD) % 2 === 1 ? 0.15 : 1;

      // a sombra fica no chão debaixo dos pés, não na altura do corpo: o pulo se lê como altura
      const ground = groundAt(MAP, b.x, b.z);
      if (ground === null || b.y < ground - 1) d.shadow.visible = false;
      else {
        const g = project({ x: b.x, y: ground, z: b.z }, cam, view);
        const k = Math.max(0.45, 1 - (b.y - ground) / 120);
        d.shadow.position.set(at.x, g.y);
        d.shadow.scale.set(s * k);
        d.shadow.alpha = b.blink ? 0.3 : 1;
        d.shadow.visible = true;
      }

      const tex = b.emote ? this.emotes.get(lang)?.[b.emote] : undefined;
      if (!tex || !b.emote) d.balloon.visible = false;
      else {
        const f = emoteAtlas.frames[b.emote];
        const tip = emoteAnchor(b, cam, view);
        d.balloon.texture = tex;
        d.balloon.anchor.set(f.tip.x / f.w, f.tip.y / f.h);
        d.balloon.position.set(tip.x, tip.y);
        d.balloon.scale.set(s);
        d.balloon.visible = true;
      }
    });
    for (const [id, d] of this.drawn) if (!seen.has(id)) { d.sprite.destroy(); d.shadow.destroy(); d.balloon.destroy(); this.drawn.delete(id); }
    this.app.render();
  }

  private add(id: string): Drawn {
    const sprite = new Sprite();
    sprite.anchor.set(HERO.anchor.x / HERO.frame.w, HERO.anchor.y / HERO.frame.h);
    const shadow = new Graphics().ellipse(0, 0, BODY_RX * 1.3, BODY_RZ * DEPTH_K * 1.8).fill({ color: 0x000000, alpha: 0.4 });
    const balloon = new Sprite();
    this.bodies.addChild(sprite);
    this.shadows.addChild(shadow);
    this.balloons.addChild(balloon);
    const d = { sprite, shadow, balloon };
    this.drawn.set(id, d);
    return d;
  }

  destroy() { this.offEffects(); this.app.destroy(true, { children: true }); }
}
