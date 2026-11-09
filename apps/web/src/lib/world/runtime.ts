/**
 * O telhado ligado (ADR 0005/0006): o laço de `requestAnimationFrame` que dá passos fixos de 60 Hz no meu corpo com o
 * teclado, manda a minha presença e os meus empurrões, aplica os empurrões que recebo, segue com a câmera e desenha
 * (Pixi embaixo, os post-its em HTML por cima, posicionados à mão a cada quadro, sem passar pelo Svelte).
 * Junta peças puras e testadas (`controls`, `loop`, `presence`, `crowd`, `view`, `keys`); ele mesmo é só cola e não
 * tem teste automático.
 */
import { EMOTE_MS, EMOTES, type RoomSnapshot } from '@guess/protocol';
import { applyShove, blinking, createBody, followCamera, MAP, stepBody, type Body, type Camera } from '@guess/world';
import type { Lang } from '../i18n';
import { isTextField, swallowsSpace, worldKey } from '../keys';
import type { RemoteRoom, RemoteStatus } from '../room/remote';
import { Controls } from './controls';
import { crowd, othersOf, type CrowdBody } from './crowd';
import { fixedSteps, STEP_MS } from './loop';
import { PresenceSender, presenceOfBody, type Emote } from './presence';
import type { Scene, SceneBody } from './scene';
import { headAnchor, makeView } from './view';

export type SceneStatus = 'loading' | 'ready' | 'failed';

export interface RuntimeOptions {
  remote: RemoteRoom;
  /** onde o canvas entra */
  host: HTMLElement;
  /** a camada dos post-its: cada filho com `data-member` é posto sobre a cabeça daquele membro */
  heads: HTMLElement;
  lang: Lang;
  onStatus?: (status: SceneStatus, detail?: string) => void;
}

/** onde meu corpo nasce em relação ao ponto de volta, pela minha posição na turma (para não nascer em cima de alguém) */
const spawnOffset = (index: number) => ((index % 5) - 2) * 14;

export class WorldRuntime {
  private room: RoomSnapshot | null = null;
  private blocked = false;
  private insetRight = 0;
  private lang: Lang;
  private body: Body | null = null;
  private cam: Camera | null = null;
  private emote: Emote | null = null;
  private readonly controls = new Controls();
  private readonly sender = new PresenceSender();
  private acc = 0;
  private last = 0;
  private raf = 0;
  private scene: Scene | null = null;
  private disposed = false;
  private broken = false;
  private status: RemoteStatus = 'idle';
  /** quando a animação de cada outro mudou (a presença não leva isso) */
  private readonly animOf = new Map<string, { anim: string; since: number }>();
  private readonly off: (() => void)[] = [];

  constructor(private readonly opts: RuntimeOptions) { this.lang = opts.lang; }

  setRoom(room: RoomSnapshot) { this.room = room; }
  /** um modal (menu, bloco) está aberto: o telhado não ouve, e nada fica segurado */
  setBlocked(blocked: boolean) { if (blocked && !this.blocked) this.controls.releaseAll(); this.blocked = blocked; }
  /** quanto da direita da tela a coluna cobre: a câmera centra no resto */
  setInsetRight(px: number) { this.insetRight = px; }
  setLang(lang: Lang) { this.lang = lang; }

  start() {
    const listen = <K extends keyof WindowEventMap>(type: K, fn: (e: WindowEventMap[K]) => void) => {
      window.addEventListener(type, fn);
      this.off.push(() => window.removeEventListener(type, fn));
    };
    listen('keydown', (e) => this.keydown(e));
    listen('keyup', (e) => this.keyup(e));
    listen('blur', () => this.controls.releaseAll());
    listen('focusin', (e) => { if (isTextField(e.target as HTMLElement)) this.controls.releaseAll(); });
    this.off.push(this.opts.remote.onShoved(({ dir }) => { if (this.body) this.body = applyShove(this.body, dir, performance.now()); }));

    this.opts.onStatus?.('loading');
    import('./scene')
      .then(({ Scene }) => Scene.create(this.opts.host))
      .then((scene) => {
        if (this.disposed) { scene.destroy(); return; }
        this.scene = scene;
        this.opts.onStatus?.('ready', scene.renderer);
      })
      .catch((err) => { console.error('telhado: sem como desenhar', err); this.opts.onStatus?.('failed', String(err)); });

    this.last = performance.now();
    const frame = () => { if (this.disposed) return; this.frame(); this.raf = requestAnimationFrame(frame); };
    this.raf = requestAnimationFrame(frame);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    for (const off of this.off) off();
    this.scene?.destroy();
    this.scene = null;
  }

  private ctx() { return { blocked: this.blocked || isTextField(document.activeElement as HTMLElement | null) }; }

  private keydown(e: KeyboardEvent) {
    const ctx = this.ctx();
    if (swallowsSpace(e, ctx)) e.preventDefault();
    const k = worldKey(e, ctx);
    if (!k) return;
    e.preventDefault();
    if ('hold' in k) this.controls.hold(k.hold);
    else if ('press' in k) this.controls.press(k.press);
    else this.emote = { name: EMOTES[k.emote], since: performance.now() };
  }

  private keyup(e: KeyboardEvent) {
    if (swallowsSpace(e, this.ctx())) e.preventDefault(); // o botão focado aperta na subida do Espaço
    const k = worldKey({ key: e.key, code: e.code }, { blocked: false }); // soltar vale sempre
    if (k && 'hold' in k) this.controls.release(k.hold);
  }

  private frame() {
    const now = performance.now();
    const elapsed = now - this.last;
    this.last = now;
    const room = this.room;
    if (!room || !room.you) return;
    const remote = this.opts.remote;

    // a conexão voltou: a minha presença sai de novo na hora
    const status = remote.state.status;
    if (status !== this.status) { this.status = status; if (status === 'open') this.sender.reset(); }

    const meIndex = room.members.findIndex((m) => m.id === room.you);
    const me = room.members[meIndex];
    if (!this.body) this.body = createBody(MAP, now, spawnOffset(Math.max(0, meIndex)));
    const bodies = crowd(room, (id) => remote.presenceOf(id), now, MAP);

    if (!this.broken) {
      const others = othersOf(bodies);
      const real = new Set(room.members.filter((m) => !m.fake).map((m) => m.id));
      const { steps, acc } = fixedSteps(this.acc, elapsed);
      this.acc = acc;
      try {
        for (let i = 0; i < steps; i++) {
          const stepNow = now - acc - (steps - 1 - i) * STEP_MS;
          const r = stepBody(this.body, this.controls.take(), STEP_MS / 1000, { now: stepNow, platforms: MAP, others });
          this.body = r.body;
          for (const ev of r.events) if (ev.type === 'shove') for (const id of ev.targets) if (real.has(id)) remote.shove(id, this.body.facing);
        }
        const out = this.sender.tick(now, presenceOfBody(this.body, now, this.emote));
        if (out) remote.setPresence(out);
      } catch (err) {
        this.broken = true; // o @guess/world ainda não está pronto, ou quebrou: para de simular, não derruba a tela
        console.error('telhado: a simulação parou', err);
      }
    }

    const view = makeView(window.innerWidth, window.innerHeight, this.insetRight);
    const body = this.body;
    // a primeira vez, já em cima do corpo (dt 0 só aplica os limites do mundo)
    try { this.cam = followCamera(this.cam ?? { x: body.x }, body, view, this.cam ? elapsed / 1000 : 0); }
    catch { this.cam = { x: body.x }; }
    const cam = this.cam;

    const list: SceneBody[] = [];
    if (me && me.character !== null) {
      const emote = this.emote && now - this.emote.since < EMOTE_MS ? this.emote.name : null;
      list.push({ id: me.id, character: me.character, x: body.x, y: body.y, z: body.z, facing: body.facing, anim: body.anim, animSince: body.animSince, emote, blink: this.blinks(body, now) });
    }
    for (const b of bodies) list.push(this.sceneBody(b, now));

    this.scene?.render(list, cam, view, now, this.lang);
    this.placeHeads(list, cam, view);
  }

  private blinks(body: Body, now: number) { try { return blinking(body, now); } catch { return false; } }

  private sceneBody(b: CrowdBody, now: number): SceneBody {
    let a = this.animOf.get(b.id);
    if (!a || a.anim !== b.anim) { a = { anim: b.anim, since: now }; this.animOf.set(b.id, a); }
    return { id: b.id, character: b.character, x: b.x, y: b.y, z: b.z, facing: b.facing, anim: b.anim, animSince: a.since, emote: b.emote, blink: b.blink };
  }

  /** Cada post-it vai sobre a cabeça do seu dono, com `translate3d`; quem não está no telhado some. */
  private placeHeads(list: readonly SceneBody[], cam: Camera, view: ReturnType<typeof makeView>) {
    const at = new Map(list.map((b) => [b.id, b]));
    for (const el of this.opts.heads.children as HTMLCollectionOf<HTMLElement>) {
      const b = el.dataset.member ? at.get(el.dataset.member) : undefined;
      if (!b) { if (el.style.visibility !== 'hidden') el.style.visibility = 'hidden'; continue; }
      const p = headAnchor(b, cam, view);
      el.style.transform = `translate3d(${Math.round(p.x)}px, ${Math.round(p.y)}px, 0)`;
      el.style.zIndex = String(Math.round(1000 - b.z));
      if (el.style.visibility !== 'visible') el.style.visibility = 'visible';
    }
  }
}
