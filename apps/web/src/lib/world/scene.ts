/**
 * O telhado em PixiJS v8 (ADR 0006): o fundo (céu, cidade em paralaxe, a queda até a rua), os telhados vestidos, uma
 * sombra no chão e um sprite por corpo, ordenados pela profundidade a cada quadro, a mureta da frente, o balão do emote
 * e a chuva. Tudo dentro de um contêiner só, o mundo, que leva os filtros de filme (`film.ts`) quando os efeitos de tela
 * estão ligados; os post-its e painéis são HTML por cima e nunca passam por eles. Não decide nada: desenha o que o
 * `WorldRuntime` manda, na mesma projeção (`project`) dos post-its em HTML. Não tem teste automático (Pixi e WebGL).
 *
 * Entrada: as folhas em `apps/web/public/sprites/` (servidas em `/sprites/…`: `char-N.png`, `emotes-<lang>.png`,
 * `rooftop.png`, `skyline-*.png`) e os atlas em `apps/web/src/lib/sprites/*.json`, tudo gerado por `bun run sprites`
 * (`tools/sprites`); os corpos (`SceneBody`, em unidades do mundo) vêm de `runtime.ts`. Saída: o canvas, em pixels da
 * tela. Vizinhos: `backdrop.ts` (céu e cidade), `platforms.ts` (telhados e caixas), `weather.ts` (chuva e neblina da
 * frente), `film.ts` (filtros), `view.ts` (escala e onde vai o balão).
 *
 * Camadas, de trás para a frente, dentro de `world`:
 *
 *     scenery [ backdrop, platforms.back ]   ← bloom (`film.scenery`)
 *     shadows                                 elipses no chão
 *     bodies                                  um sprite por corpo, ordenado por profundidade
 *     platforms.front                         a mureta da frente, cobre os pés na beirada
 *     balloons                                balões dos emotes, sempre por cima dos corpos
 *     weather                                 neblina da frente e chuva
 *   world inteiro                             ← aberração RGB + CRT (`film.world`)
 *   (HTML por cima do canvas: post-its e painéis, fora dos filtros)
 *
 * Profundidade: a cada quadro os corpos são ordenados por `depthKey` (= `z`), maior primeiro (mais ao fundo), empate
 * pelo id para a ordem não piscar; o `zIndex` do sprite é a posição nessa lista. A altura (`y`) não entra: quem pula
 * continua na sua profundidade. Os objetos do cenário não entram nessa ordem: as caixas vão até o fundo do telhado e
 * ficam sempre atrás dos corpos (`platforms.back`), a mureta sempre na frente (`platforms.front`).
 *
 * Como mudar: uma camada nova entra em `load()`, no `addChild` do `world` (ou do `scenery`, se deve ganhar o brilho);
 * uma animação nova de personagem precisa estar em `ANIMS` (na ordem das linhas da folha) e no `Anim` do `@guess/world`.
 */
import { EMOTES, type EmoteName } from '@guess/protocol';
import { BODY_RX, BODY_RZ, DEPTH_K, depthKey, groundAt, MAP, project, type Anim, type Camera, type Vec3, type View } from '@guess/world';
import { Application, Assets, ColorMatrixFilter, Container, Graphics, Rectangle, Sprite, Texture, TextureSource } from 'pixi.js';
import { effectsOn, onEffects } from '../effects';
import type { Lang } from '../i18n';
import emoteAtlas from '../sprites/emotes.json';
import { artScale, CHARACTER_ART, character, frameIndex } from '../sprites/characters';
import { loadRooftopArt } from './art';
import { Backdrop } from './backdrop';
import { Film } from './film';
import { lobbyMatrix, moodStep } from './mood';
import { Platforms } from './platforms';
import { emoteAnchor } from './view';
import { Weather } from './weather';

/** Um corpo para desenhar: `x, y, z` em unidades do mundo (os pés), o resto como na presença. */
export interface SceneBody extends Vec3 {
  id: string;
  /** o personagem (0..7), índice de `CHARACTER_ART` */
  character: number;
  /** 1 olha para a direita (como a folha); −1 espelha o sprite */
  facing: 1 | -1;
  anim: Anim;
  /** quando a animação atual começou, ms (o quadro sai de `frameIndex` com o fps do atlas) */
  animSince: number;
  emote: EmoteName | null;
  /** caído ou voltando: o sprite pisca */
  blink: boolean;
  /**
   * quantas vezes maior que o normal é desenhado (o chefão dos bots engraçados: 2); sem isto, 1. Inteiro, para o pixel
   * art continuar com pixels quadrados; o sprite, a sombra e o balão crescem juntos, a partir dos pés
   */
  scale?: number;
}

/** As animações na ordem das linhas da folha (`ANIMATION_NAMES` em `tools/sprites/src/atlas.ts`). */
const ANIMS: Anim[] = ['idle', 'walk', 'run', 'jump', 'fall', 'fall_loop', 'shove'];
const emoteSheet = (lang: Lang) => `/sprites/emotes-${lang}.png`;
const LANGS: Lang[] = ['pt-BR', 'en-US'];
/** o fundo do canvas antes do céu carregar: quase preto, puxado para o roxo do céu (no olho) */
const BG = 0x0b0a14;
/** piscando: alterna a cada tanto ms (uns 5,5 por segundo, no olho) */
const BLINK_PERIOD = 90;
/** a opacidade no meio-ciclo apagado do pisca: some quase toda, mas ainda se acha o personagem */
const BLINK_ALPHA = 0.15;
/** a sombra de quem pisca fica mais fraca */
const BLINK_SHADOW_ALPHA = 0.3;

/**
 * A sombra, em unidades do mundo antes da escala: uma elipse um pouco maior que a base do corpo (`BODY_RX`·1,3 de
 * meia-largura) e achatada pela perspectiva (`BODY_RZ`·`DEPTH_K`, vezes 1,8 para ler na tela). Ajustada no olho.
 */
const SHADOW_RX = BODY_RX * 1.3;
const SHADOW_RY = BODY_RZ * DEPTH_K * 1.8;
const SHADOW_ALPHA = 0.4;
/** a sombra encolhe com a altura acima do chão: até `SHADOW_MIN` em `SHADOW_FADE` unidades (mais que o pico do pulo, 50) */
const SHADOW_FADE = 120;
const SHADOW_MIN = 0.45;

interface Drawn { sprite: Sprite; shadow: Graphics; balloon: Sprite }

/** O canvas do telhado: `create` monta, `render` desenha um quadro, `destroy` desmonta. */
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
  /** o clima do lobby (preto e branco, mais escuro, sombras fechadas): 1 no lobby, 0 com o jogo, indo aos poucos */
  private readonly mood = new ColorMatrixFilter();
  private moodAmount = 0;
  private moodTarget: 0 | 1 = 0;
  private moodAt = 0;
  private readonly offEffects: () => void;
  private readonly shadows = new Container();
  private readonly bodies = new Container({ sortableChildren: true });
  private readonly balloons = new Container();
  private readonly drawn = new Map<string, Drawn>();
  /** quadros por personagem, animação e índice (cada personagem no atlas do seu modelo) */
  private readonly frames: Texture[][][] = [];
  private readonly emotes = new Map<Lang, Record<EmoteName, Texture>>();

  private constructor(readonly app: Application) {
    app.stage.addChild(this.world);
    this.world.filterArea = app.screen;
    this.scenery.filterArea = app.screen;
    this.mood.matrix = lobbyMatrix() as ColorMatrixFilter['matrix'];
    this.mood.alpha = 0;
    this.offEffects = onEffects((on) => { this.effects = on; this.applyEffects(); });
  }

  /** Antes de o jogo começar (`on`), o mundo fica em preto e branco; `instant` na primeira vez, sem transição. */
  setLobby(on: boolean, instant = false) {
    this.moodTarget = on ? 1 : 0;
    if (instant) { this.moodAmount = this.moodTarget; this.mood.alpha = this.moodAmount; this.applyEffects(); }
  }

  private stepMood(now: number) {
    const elapsed = this.moodAt ? now - this.moodAt : 0;
    this.moodAt = now;
    if (this.moodAmount === this.moodTarget) return;
    const was = this.moodAmount;
    this.moodAmount = moodStep(was, this.moodTarget, elapsed);
    this.mood.alpha = this.moodAmount;
    if ((was > 0) !== (this.moodAmount > 0)) this.applyEffects();
  }

  private applyEffects() {
    // o clima do lobby primeiro (só enquanto aparece), a aberração e o VHS por cima
    this.world.filters = [...(this.moodAmount > 0 ? [this.mood] : []), ...(this.effects ? this.film.world : [])];
    this.scenery.filters = this.effects ? this.film.scenery : [];
  }

  /** Cria o canvas dentro de `host` e carrega as folhas. Rejeita se não houver como desenhar (sem WebGL nem canvas). */
  static async create(host: HTMLElement): Promise<Scene> {
    // pixel art: ampliar sem borrar (vizinho mais próximo), posições arredondadas para pixel inteiro, sem antialias e
    // sem a densidade do monitor (a escala inteira de `view.ts` já faz a ampliação)
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
    const sheets = await Promise.all(CHARACTER_ART.map((c) => Assets.load<Texture>(c.sheet)));
    sheets.forEach((sheet, n) => {
      const { frame: { w, h }, animations } = CHARACTER_ART[n].atlas;
      // arte grande desenhada encolhida (`artScale` < 1): suavizada, senão o vizinho mais próximo come linhas (sem
      // mipmaps: com eles o sprite some no WebGL por software)
      if (artScale(CHARACTER_ART[n].atlas) < 1) {
        sheet.source.scaleMode = 'linear';
      }
      this.frames.push(ANIMS.map((anim) => {
        const a = animations[anim];
        return Array.from({ length: a.frames }, (_, i) => new Texture({ source: sheet.source, frame: new Rectangle(i * w, a.row * h, w, h) }));
      }));
    });
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

  /**
   * Desenha um quadro: `list` em unidades do mundo, `cam`/`view` como em `project` (a escala inteira de `view` amplia
   * cada sprite; `facing` −1 espelha), `now` em ms (animações, pisca, neon, chuva), `lang` escolhe a folha dos balões.
   * O sprite vai com a âncora do atlas (entre os pés, em pixels do quadro) no ponto projetado dos pés.
   */
  render(list: readonly SceneBody[], cam: Camera, view: View, now: number, lang: Lang) {
    const s = view.scale;
    this.backdrop?.update(cam, view, now);
    this.platforms?.update(cam, view, now);
    this.weather?.update(cam, view, now);
    if (this.effects) this.film.tick(now);
    this.stepMood(now);

    const seen = new Set<string>();
    // quem está mais ao fundo primeiro; empate pelo id, para não piscar a ordem
    const sorted = [...list].sort((a, b) => depthKey(b) - depthKey(a) || (a.id < b.id ? -1 : 1));
    sorted.forEach((b, i) => {
      seen.add(b.id);
      const d = this.drawn.get(b.id) ?? this.add(b.id);
      const anim = ANIMS.includes(b.anim) ? b.anim : 'idle';
      const frames = this.frames[b.character]?.[ANIMS.indexOf(anim)];
      if (!frames) { d.sprite.visible = false; d.shadow.visible = false; d.balloon.visible = false; return; }
      const { atlas } = character(b.character);
      const at = project(b, cam, view);
      d.sprite.texture = frames[frameIndex(atlas, anim, now - b.animSince)];
      d.sprite.anchor.set(atlas.anchor.x / atlas.frame.w, atlas.anchor.y / atlas.frame.h);
      d.sprite.position.set(at.x, at.y);
      const big = b.scale ?? 1;
      const k = s * artScale(atlas) * big;
      d.sprite.scale.set(b.facing * k, k);
      d.sprite.zIndex = i;
      d.sprite.visible = true;
      d.sprite.alpha = b.blink && Math.floor(now / BLINK_PERIOD) % 2 === 1 ? BLINK_ALPHA : 1;

      // a sombra fica no chão debaixo dos pés, não na altura do corpo: o pulo se lê como altura
      // (abaixo do chão mais de 1 unidade = caindo pelo vão: sem sombra)
      const ground = groundAt(MAP, b.x, b.z);
      if (ground === null || b.y < ground - 1) d.shadow.visible = false;
      else {
        const g = project({ x: b.x, y: ground, z: b.z }, cam, view);
        const k = Math.max(SHADOW_MIN, 1 - (b.y - ground) / SHADOW_FADE);
        d.shadow.position.set(at.x, g.y);
        d.shadow.scale.set(s * k * big);
        d.shadow.alpha = b.blink ? BLINK_SHADOW_ALPHA : 1;
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
        d.balloon.scale.set(s * big);
        d.balloon.visible = true;
      }
    });
    for (const [id, d] of this.drawn) if (!seen.has(id)) { d.sprite.destroy(); d.shadow.destroy(); d.balloon.destroy(); this.drawn.delete(id); }
    this.app.render();
  }

  private add(id: string): Drawn {
    const sprite = new Sprite();
    const shadow = new Graphics().ellipse(0, 0, SHADOW_RX, SHADOW_RY).fill({ color: 0x000000, alpha: SHADOW_ALPHA });
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
