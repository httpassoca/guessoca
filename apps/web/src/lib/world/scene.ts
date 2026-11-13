/**
 * O telhado em PixiJS v8 (ADR 0006): o fundo (céu, cidade em paralaxe, a queda até a rua), os telhados vestidos, uma
 * sombra no chão e um sprite por corpo, ordenados pela profundidade a cada quadro, a mureta da frente, o balão do emote
 * e a chuva. Tudo dentro de um contêiner só, o mundo, que leva os filtros de filme (`film.ts`) quando os efeitos de tela
 * estão ligados; os post-its e painéis são HTML por cima e nunca passam por eles. Não decide nada: desenha o que o
 * `WorldRuntime` manda, na mesma projeção (`project`) dos post-its em HTML. Não tem teste automático (Pixi e WebGL).
 *
 * Entrada: as folhas em `apps/web/public/sprites/` (servidas em `/sprites/…`: `char-N-idle.png`, `char-N-moves.png`, `emotes-<lang>.png`,
 * `rooftop.png`, `skyline-*.png`) e os atlas em `apps/web/src/lib/sprites/*.json`, tudo gerado por `bun run sprites`
 * (`tools/sprites`); os corpos (`SceneBody`, em unidades do mundo) vêm de `runtime.ts`. Saída: o canvas, em pixels da
 * tela. Vizinhos: `backdrop.ts` (céu e cidade), `platforms.ts` (telhados e caixas), `weather.ts` (chuva e neblina da
 * frente), `film.ts` (filtros), `view.ts` (escala e onde vai o balão).
 *
 * Camadas, de trás para a frente, dentro de `world`:
 *
 *     scenery [ backdrop, platforms.back,    ← bloom (`film.scenery`)
 *               rooflife ]                    respingos, poças, gotas, hélice, vapor (`rooflife.ts`)
 *     shadows                                 elipses no chão
 *     bodies                                  um sprite por corpo, ordenado por profundidade, e os bichos
 *                                             (gatos e pássaros, `fauna.ts`) entre eles pela profundidade
 *     platforms.front                         a mureta da frente, cobre os pés na beirada
 *     balloons                                balões dos emotes, sempre por cima dos corpos
 *     celebration                             o confete de quem acertou (`celebration.ts`)
 *     weather                                 neblina da frente e chuva
 *   world inteiro                             ← aberração RGB + CRT (`film.world`)
 *   (HTML por cima do canvas: post-its e painéis, fora dos filtros)
 *
 * Profundidade: a cada quadro os corpos são ordenados por `depthKey` (= `z`), maior primeiro (mais ao fundo), empate
 * pelo id para a ordem não piscar; o `zIndex` do sprite é a posição nessa lista. A altura (`y`) não entra: quem pula
 * continua na sua profundidade. Os objetos do cenário não entram nessa ordem: as caixas vão até o fundo do telhado e
 * ficam sempre atrás dos corpos (`platforms.back`), a mureta sempre na frente (`platforms.front`).
 *
 * Folhas dos personagens: **só as de quem está no telhado**, quando aparece (`want` com a turma e os bots, e cada corpo
 * desenhado), por `SheetCache` (`sheet-cache.ts`); soltas depois de `SHEET_KEEP_MS` sem ninguém daquele personagem. O
 * parado (`char-N-idle`, pequeno) chega primeiro: enquanto as outras animações não chegam, o corpo toca o parado; antes
 * do parado, o corpo não aparece. Com o telhado parado de carregar, as outras folhas são baixadas devagar (`prefetch`,
 * só para o cache do navegador, sem decodificar). Nenhuma textura maior que o `MAX_TEXTURE_SIZE` da placa sobe: uma
 * folha maior é encolhida na memória da placa (`fitFactor`), em vez de pintar de preto o lote inteiro.
 *
 * Como mudar: uma camada nova entra em `load()`, no `addChild` do `world` (ou do `scenery`, se deve ganhar o brilho);
 * uma animação nova de personagem precisa estar em `ANIMS` (na ordem das linhas da folha) e no `Anim` do `@guess/world`.
 */
import { EMOTES, type EmoteName } from '@guess/protocol';
import { BODY_RX, BODY_RZ, DEPTH_K, depthKey, groundAt, MAP, project, type Anim, type Camera, type Vec3, type View } from '@guess/world';
import { Application, Assets, ColorMatrixFilter, Container, Graphics, ImageSource, Rectangle, Sprite, Texture, TextureSource, type Renderer } from 'pixi.js';
import { effectsOn, onEffects } from '../effects';
import type { Lang } from '../i18n';
import emoteAtlas from '../sprites/emotes.json';
import { artScale, CHARACTER_ART, frameAt, frameIndex, sheetSize, type Atlas } from '../sprites/characters';
import { loadRooftopArt } from './art';
import { Backdrop } from './backdrop';
import { Celebration } from './celebration';
import { seedOf } from './critters';
import { Fauna } from './fauna';
import { Film } from './film';
import { lobbyMatrix, moodStep } from './mood';
import { Platforms } from './platforms';
import { RoofLife } from './rooflife';
import { fitFactor, SheetCache } from './sheet-cache';
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
  /** um bot engraçado (os gatos se afastam dele) */
  bot?: boolean;
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

/** quanto uma folha de personagem fica carregada sem ninguém daquele personagem no telhado, ms */
const SHEET_KEEP_MS = 60_000;
/** de quanto em quanto tempo se procura folha para soltar, ms */
const SWEEP_MS = 5_000;
/** quanto esperar, depois do primeiro quadro, para começar a baixar as outras folhas devagar, ms */
const PREFETCH_AFTER_MS = 4_000;
/** quem desenha no lugar de um personagem cuja folha do parado não carregou: o herói, a menor folha */
const FALLBACK = 0;

/** Uma folha de personagem carregada: a textura (talvez encolhida para caber na placa) e os quadros já cortados nela. */
interface LoadedSheet {
  texture: Texture;
  bitmap: ImageBitmap;
  /** quanto a folha foi encolhida na placa, em x e em y (1: no tamanho do arquivo) */
  fx: number;
  fy: number;
  /** os quadros de cada animação desta folha, cortados na primeira vez que alguém os pede */
  frames: Map<Anim, Texture[]>;
}

/** O lado da maior textura que a placa aceita (`MAX_TEXTURE_SIZE`); `?texmax=N` no endereço finge uma placa menor, para testar. */
function maxTextureOf(renderer: Renderer): number {
  let max = 4096;
  try {
    const r = renderer as unknown as { gl?: WebGL2RenderingContext; gpu?: { device: { limits: { maxTextureDimension2D: number } } } };
    if (r.gl) max = r.gl.getParameter(r.gl.MAX_TEXTURE_SIZE) as number;
    else if (r.gpu) max = r.gpu.device.limits.maxTextureDimension2D;
  } catch { /* sem como perguntar: 4096, que toda placa aceita */ }
  const forced = Number(new URLSearchParams(location.search).get('texmax'));
  return forced > 0 ? Math.min(max, forced) : max;
}

/**
 * As folhas que esta aba já baixou para o cache do navegador (`prefetch`). As folhas vão com `no-cache` e sem validador,
 * então um pedido normal baixaria de novo; estas, baixadas há pouco nesta mesma visita, saem do cache como estão
 * (`force-cache`). Uma troca feita no `/sistema` vale na próxima visita.
 */
const prefetched = new Set<string>();

/**
 * Baixa e decodifica uma folha. Se o maior lado passa de `max`, a imagem é encolhida já na decodificação
 * (`createImageBitmap` com `resize*`): o arquivo continua com os pixels da arte; só a cópia na placa é menor.
 */
async function loadSheet(url: string, size: { w: number; h: number }, max: number, smooth: boolean): Promise<LoadedSheet> {
  const res = await fetch(url, prefetched.has(url) ? { cache: 'force-cache' } : {});
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const blob = await res.blob();
  const fit = fitFactor(size, max);
  const bitmap = fit < 1
    ? await createImageBitmap(blob, { resizeWidth: Math.max(1, Math.floor(size.w * fit)), resizeHeight: Math.max(1, Math.floor(size.h * fit)), resizeQuality: 'high' })
    : await createImageBitmap(blob);
  if (fit < 1) console.warn(`folha ${url} (${size.w}×${size.h}) maior que a textura da placa (${max}): desenhada encolhida`);
  // arte grande desenhada encolhida (`artScale` < 1, ou encolhida aqui): suavizada, senão o vizinho mais próximo come
  // linhas (sem mipmaps: com eles o sprite some no WebGL por software)
  const source = new ImageSource({ resource: bitmap, alphaMode: 'premultiply-alpha-on-upload', scaleMode: smooth || fit < 1 ? 'linear' : 'nearest' });
  return { texture: new Texture({ source }), bitmap, fx: bitmap.width / size.w, fy: bitmap.height / size.h, frames: new Map() };
}

/** Solta uma folha: os quadros, a textura (e a cópia na placa) e a imagem decodificada. */
function freeSheet(s: LoadedSheet) {
  for (const list of s.frames.values()) for (const t of list) t.destroy(false);
  s.texture.destroy(true);
  s.bitmap.close();
}

/** O canvas do telhado: `create` monta, `render` desenha um quadro, `destroy` desmonta. */
export class Scene {
  /** tudo o que o Pixi desenha; os filtros de filme vão aqui */
  private readonly world = new Container();
  /** o cenário de trás (fundo e telhados): o brilho do neon vai só aqui, para não estourar os personagens */
  private readonly scenery = new Container();
  private backdrop: Backdrop | null = null;
  private platforms: Platforms | null = null;
  /** a chuva que encosta e os objetos que mexem (`rooflife.ts`, issue #70) */
  private roofLife: RoofLife | null = null;
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
  private readonly celebration = new Celebration();
  /** os gatos e os pássaros (issue #71); null até as folhas carregarem, ou se não carregarem */
  private fauna: Fauna | null = null;
  private roomCode = '';
  private readonly drawn = new Map<string, Drawn>();
  /** as folhas dos personagens que estão (ou estiveram há pouco) no telhado; criado em `load`, com o limite da placa */
  private sheets: SheetCache<LoadedSheet> | null = null;
  private sweptAt = 0;
  private prefetchAt = 0;
  private prefetched = false;
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
    const max = maxTextureOf(this.app.renderer);
    // de cada folha, o tamanho (do atlas) e se a arte é suavizada: para o carregador, que só recebe o endereço
    const info = new Map(CHARACTER_ART.flatMap((c) => c.sheets.map((url, p) => [url, { size: sheetSize(c.atlas, p), smooth: artScale(c.atlas) < 1 }] as const)));
    this.sheets = new SheetCache<LoadedSheet>({
      load: (url) => { const i = info.get(url)!; return loadSheet(url, i.size, max, i.smooth); },
      free: freeSheet,
      keepMs: SHEET_KEEP_MS,
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
    this.roofLife = new RoofLife(art);
    this.scenery.addChild(this.backdrop, this.platforms.back, this.roofLife);
    this.world.addChild(this.scenery, this.shadows, this.bodies, this.platforms.front, this.balloons, this.celebration, this.weather);
    this.applyEffects();
    // os bichos não seguram a cena: sem as folhas deles, o telhado abre sem bichos
    try {
      this.fauna = await Fauna.create(this.bodies);
      if (this.roomCode) this.fauna.setSeed(seedOf(this.roomCode));
    } catch (err) { console.error('telhado: sem bichos', err); }
  }

  /**
   * Os personagens que vão aparecer no telhado (a turma e os bots): as folhas deles começam a carregar já, e ficam
   * carregadas enquanto forem pedidas. `now` em ms, o mesmo relógio de `render`.
   */
  want(characters: readonly number[], now: number) {
    if (!this.sheets) return;
    for (const n of characters) for (const url of CHARACTER_ART[n]?.sheets ?? []) this.sheets.get(url, now);
  }

  /**
   * Os quadros que um corpo do personagem `n` mostra agora na animação `anim`: os da folha dela, se já chegou; senão os
   * do parado, que é pequeno e chega antes; senão nada (o corpo espera). Se o parado não carregou de jeito nenhum, os do
   * `FALLBACK`. Pedir marca a folha como usada (não é solta).
   */
  private framesFor(n: number, anim: Anim, now: number): { frames: Texture[]; atlas: Atlas; anim: Anim; sheet: LoadedSheet } | null {
    const art = CHARACTER_ART[n];
    if (!art || !this.sheets) return null;
    const cut = (sheet: LoadedSheet, name: Anim) => {
      let list = sheet.frames.get(name);
      if (!list) {
        const { w, h } = art.atlas.frame;
        list = Array.from({ length: art.atlas.animations[name].frames }, (_, i) => {
          const f = frameAt(art.atlas, name, i);
          return new Texture({ source: sheet.texture.source, frame: new Rectangle(f.x * sheet.fx, f.y * sheet.fy, w * sheet.fx, h * sheet.fy) });
        });
        sheet.frames.set(name, list);
      }
      return { frames: list, atlas: art.atlas, anim: name, sheet };
    };
    const page = art.atlas.animations[anim].page;
    const idle = this.sheets.get(art.sheets[0], now);
    const own = page === 0 ? idle : this.sheets.get(art.sheets[page], now);
    if (own) return cut(own, anim);
    if (idle) return cut(idle, 'idle');
    if (n !== FALLBACK && this.sheets.failed(art.sheets[0])) return this.framesFor(FALLBACK, anim, now);
    return null;
  }

  /**
   * Com nada mais carregando, baixa as folhas de todo mundo para o cache do navegador, uma de cada vez, com prioridade
   * baixa, sem decodificar: quem chegar depois aparece mais rápido, e a memória não cresce.
   */
  private prefetch() {
    this.prefetched = true;
    const queue = CHARACTER_ART.flatMap((c) => c.sheets);
    const later = (fn: () => void) => { if ('requestIdleCallback' in window) requestIdleCallback(fn, { timeout: 2000 }); else setTimeout(fn, 200); };
    const next = () => {
      const url = queue.shift();
      if (!url || !this.sheets) return;
      if (this.sheets.ready().includes(url) || this.sheets.loading(url)) { next(); return; }
      fetch(url, { priority: 'low' } as RequestInit).then((r) => r.blob()).then(() => prefetched.add(url), () => {}).finally(() => later(next));
    };
    later(next);
  }

  /** `id` acertou agora: confete em volta dele por uns 2 s, seguindo de onde ele estiver. */
  celebrate(id: string, now: number) { this.celebration.start(id, now); this.fauna?.cheer(id); }

  /** A sala (o código): os bichos tiram dela a semente da rotina, a mesma em toda aba. */
  setRoom(code: string) {
    if (code === this.roomCode) return;
    this.roomCode = code;
    this.fauna?.setSeed(seedOf(code));
  }

  /**
   * Desenha um quadro: `list` em unidades do mundo, `cam`/`view` como em `project` (a escala inteira de `view` amplia
   * cada sprite; `facing` −1 espelha), `now` em ms (animações, pisca, neon, chuva), `lang` escolhe a folha dos balões.
   * O sprite vai com a âncora do atlas (entre os pés, em pixels do quadro) no ponto projetado dos pés.
   */
  render(list: readonly SceneBody[], cam: Camera, view: View, now: number, lang: Lang) {
    const s = view.scale;
    if (this.backdrop) this.backdrop.life.lobby = this.moodTarget === 1;
    this.backdrop?.update(cam, view, now);
    this.platforms?.update(cam, view, now);
    this.roofLife?.update(list, cam, view, now);
    this.weather?.update(cam, view, now);
    if (this.effects) this.film.tick(now);
    this.stepMood(now);
    this.celebration.update((id) => list.find((b) => b.id === id), cam, view, now);

    const seen = new Set<string>();
    // quem está mais ao fundo primeiro; empate pelo id, para não piscar a ordem
    const sorted = [...list].sort((a, b) => depthKey(b) - depthKey(a) || (a.id < b.id ? -1 : 1));
    sorted.forEach((b, i) => {
      seen.add(b.id);
      const d = this.drawn.get(b.id) ?? this.add(b.id);
      const drawn = this.framesFor(b.character, ANIMS.includes(b.anim) ? b.anim : 'idle', now);
      // a folha ainda não chegou: o corpo espera (o parado é pequeno e chega logo)
      if (!drawn) { d.sprite.visible = false; d.shadow.visible = false; d.balloon.visible = false; return; }
      const { frames, atlas, anim, sheet } = drawn;
      const at = project(b, cam, view);
      d.sprite.texture = frames[frameIndex(atlas, anim, now - b.animSince)];
      d.sprite.anchor.set(atlas.anchor.x / atlas.frame.w, atlas.anchor.y / atlas.frame.h);
      d.sprite.position.set(at.x, at.y);
      const big = b.scale ?? 1;
      const k = s * artScale(atlas) * big;
      // uma folha encolhida para caber na placa (`fx`, `fy` < 1) é desenhada maior na mesma proporção
      d.sprite.scale.set((b.facing * k) / sheet.fx, k / sheet.fy);
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
    // os bichos, entre os corpos pela profundidade, no relógio de parede (o mesmo em toda aba)
    this.fauna?.update(
      list.map((b) => ({ id: b.id, x: b.x, y: b.y, z: b.z, anim: b.anim, bot: b.bot ?? false, scale: b.scale ?? 1 })),
      sorted.map((b) => depthKey(b)), cam, view, Date.now(),
    );
    for (const [id, d] of this.drawn) if (!seen.has(id)) { d.sprite.destroy(); d.shadow.destroy(); d.balloon.destroy(); this.drawn.delete(id); }
    this.app.render();
    // as folhas de quem saiu há mais de `SHEET_KEEP_MS` saem da memória (depois de desenhar: nenhum sprite as usa mais)
    if (now - this.sweptAt > SWEEP_MS) { this.sweptAt = now; this.sheets?.sweep(now); }
    if (!this.prefetchAt) this.prefetchAt = now + PREFETCH_AFTER_MS;
    if (!this.prefetched && now > this.prefetchAt && !CHARACTER_ART.some((c) => c.sheets.some((u) => this.sheets?.loading(u)))) this.prefetch();
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

  destroy() { this.offEffects(); this.sheets?.dispose(); this.sheets = null; this.app.destroy(true, { children: true }); }
}
