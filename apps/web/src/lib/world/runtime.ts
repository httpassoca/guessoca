/**
 * O telhado ligado (ADR 0005/0006): o laço de `requestAnimationFrame` que dá passos fixos de 60 Hz no meu corpo com o
 * teclado, manda a minha presença e os meus empurrões, aplica os empurrões que recebo, comemora quem acerta (confete
 * em volta dele; se fui eu, o meu corpo é lançado para o alto), segue com a câmera e desenha
 * (Pixi embaixo, os post-its em HTML por cima, posicionados à mão a cada quadro, sem passar pelo Svelte).
 * Junta peças puras e testadas (`controls`, `loop`, `presence`, `crowd`, `view`, `keys`); ele mesmo é só cola e não
 * tem teste automático.
 *
 * O que toca na arte: monta a lista de `SceneBody` (unidades do mundo) para `scene.ts`, com `animSince` dos outros
 * medido aqui (a presença não leva quando a animação começou), e põe cada post-it em HTML em `headAnchor` (pixels da
 * tela), separado por `declutter`, com `z-index` 1000 − `z` (quem está mais à frente cobre).
 */
import { EMOTE_MS, EMOTES, type RoomSnapshot } from '@guess/protocol';
import { attackMs, character } from '../sprites/characters';
import { applyCheer, applyShove, blinking, createBody, followCamera, MAP, stepBody, type Body, type Camera, type WorldEvent } from '@guess/world';
import type { Lang } from '../i18n';
import { isTextField, swallowsSpace, worldKey } from '../keys';
import type { RemoteRoom, RemoteStatus } from '../room/remote';
import { cheerTracker } from './cheer';
import { Controls } from './controls';
import { crowd, othersOf, type CrowdBody } from './crowd';
import { fixedSteps, STEP_MS } from './loop';
import { PresenceSender, presenceOfBody, type Emote } from './presence';
import type { Scene, SceneBody } from './scene';
import { declutter, type Tag } from './declutter';
import { rememberedZoom, rememberZoom } from '../identity';
import { headAnchor, makeView, renderView, stepZoom } from './view';

/** Se o canvas já desenha: carregando as folhas, pronto, ou sem como desenhar (sem WebGL nem canvas). */
export type SceneStatus = 'loading' | 'ready' | 'failed';

/** O que o `World.svelte` passa ao ligar o telhado. */
export interface RuntimeOptions {
  remote: RemoteRoom;
  /** onde o canvas entra */
  host: HTMLElement;
  /** a camada dos post-its: cada filho com `data-member` é posto sobre a cabeça daquele membro */
  heads: HTMLElement;
  lang: Lang;
  onStatus?: (status: SceneStatus, detail?: string) => void;
  /** cada evento do meu corpo (pulo, empurrão, queda…), para os sons */
  onEvent?: (ev: WorldEvent) => void;
}

/**
 * onde meu corpo nasce em relação ao ponto de volta, pela minha posição na turma (para não nascer em cima de alguém):
 * cinco lugares de −28 a +28 unidades do mundo, de 14 em 14 (pouco menos que a largura do corpo, 16; o separar da física
 * resolve o resto)
 */
const spawnOffset = (index: number) => ((index % 5) - 2) * 14;

/** um acerto que esperou mais que isto para ser desenhado (a aba estava no fundo) não comemora mais, ms */
const CHEER_STALE_MS = 500;

/** o intervalo mínimo entre dois passos de zoom da roda, em ms */
const WHEEL_MS = 120;

/** O telhado ligado de uma aba: `start` liga o laço e carrega a cena, `dispose` desliga. */
export class WorldRuntime {
  private room: RoomSnapshot | null = null;
  private blocked = false;
  private insetLeft = 0;
  /** o zoom da roda do mouse, em passos inteiros sobre a escala automática; lembrado no navegador */
  private zoom = rememberedZoom();
  private lastWheel = 0;
  private moodSet = false;
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
  /** quem acertou desde o último quadro, e quando soubemos (issue #58) */
  private cheers: { id: string; at: number }[] = [];

  constructor(private readonly opts: RuntimeOptions) { this.lang = opts.lang; }

  setRoom(room: RoomSnapshot) { this.room = room; }
  /** um modal (menu, bloco) está aberto: o telhado não ouve, e nada fica segurado */
  setBlocked(blocked: boolean) { if (blocked && !this.blocked) this.controls.releaseAll(); this.blocked = blocked; }
  /** quanto da esquerda da tela a coluna cobre: a câmera centra no resto */
  setInsetLeft(px: number) { this.insetLeft = px; }
  setLang(lang: Lang) { this.lang = lang; }

  start() {
    const listen = <K extends keyof WindowEventMap>(type: K, fn: (e: WindowEventMap[K]) => void) => {
      window.addEventListener(type, fn);
      this.off.push(() => window.removeEventListener(type, fn));
    };
    listen('keydown', (e) => this.keydown(e));
    listen('keyup', (e) => this.keyup(e));
    listen('blur', () => this.controls.releaseAll());
    const wheel = (e: WheelEvent) => this.wheel(e);
    window.addEventListener('wheel', wheel, { passive: false });
    this.off.push(() => window.removeEventListener('wheel', wheel));
    listen('focusin', (e) => { if (isTextField(e.target as HTMLElement)) this.controls.releaseAll(); });
    this.off.push(this.opts.remote.onShoved(({ dir }) => { if (this.body) this.body = applyShove(this.body, dir, performance.now()); }));

    // quem acerta comemora: sai da diferença entre snapshots, direto do `RemoteRoom` (o primeiro é só a base)
    const cheers = cheerTracker();
    this.off.push(this.opts.remote.watch((st) => { for (const id of cheers(st.status, st.room)) this.cheers.push({ id, at: performance.now() }); }));

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

  /**
   * A roda do mouse sobre o telhado aproxima e afasta, um passo inteiro de escala por vez (no máximo um a cada
   * `WHEEL_MS`, para o trackpad não varrer tudo de uma vez). Sobre um painel a roda é do painel; com Ctrl é o zoom do
   * navegador.
   */
  private wheel(e: WheelEvent) {
    if (this.blocked || e.ctrlKey || e.metaKey || !e.deltaY) return;
    const over = e.target instanceof Element ? e.target : null;
    if (!over || !(this.opts.host.contains(over) || over === this.opts.heads)) return;
    e.preventDefault();
    const now = performance.now();
    if (now - this.lastWheel < WHEEL_MS) return;
    this.lastWheel = now;
    const zoom = stepZoom(this.zoom, e.deltaY < 0 ? 1 : -1, window.innerWidth, window.innerHeight);
    if (zoom === this.zoom) return;
    this.zoom = zoom;
    rememberZoom(zoom);
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
    if (!room || !room.you) { this.cheers = []; return; }
    const remote = this.opts.remote;

    // a conexão voltou: a minha presença sai de novo na hora
    const status = remote.state.status;
    if (status !== this.status) { this.status = status; if (status === 'open') this.sender.reset(); }

    const meIndex = room.members.findIndex((m) => m.id === room.you);
    const me = room.members[meIndex];
    if (!this.body) this.body = createBody(MAP, now, spawnOffset(Math.max(0, meIndex)));
    const bodies = crowd(room, (id) => remote.presenceOf(id), now, MAP);

    // a comemoração de quem acabou de acertar: confete em todo navegador; o salto, só no navegador de quem acertou
    // (cada um é dono do próprio corpo, ADR 0005), e os outros veem pela presença
    if (this.cheers.length) {
      for (const c of this.cheers) {
        if (now - c.at > CHEER_STALE_MS) continue;
        if (c.id === room.you && !this.broken) this.body = applyCheer(this.body);
        this.scene?.celebrate(c.id, now);
      }
      this.cheers = [];
    }

    if (!this.broken) {
      const others = othersOf(bodies);
      // o ataque dura o que dura na folha do meu personagem (o mundo põe o piso e o teto)
      const shoveMs = me && me.character !== null ? attackMs(character(me.character).atlas) : undefined;
      // quem leva o meu empurrão: as pessoas (a aba delas aplica) e os bots (o servidor aplica); o falso não
      const real = new Set([...room.members.filter((m) => !m.fake).map((m) => m.id), ...(room.bots ?? []).map((b) => b.id)]);
      const { steps, acc } = fixedSteps(this.acc, elapsed);
      this.acc = acc;
      try {
        for (let i = 0; i < steps; i++) {
          const stepNow = now - acc - (steps - 1 - i) * STEP_MS;
          const r = stepBody(this.body, this.controls.take(), STEP_MS / 1000, { now: stepNow, platforms: MAP, others, shoveMs });
          this.body = r.body;
          for (const ev of r.events) if (ev.type === 'shove') for (const id of ev.targets) if (real.has(id)) remote.shove(id, this.body.facing);
          for (const ev of r.events) this.opts.onEvent?.(ev);
        }
        const out = this.sender.tick(now, presenceOfBody(this.body, now, this.emote));
        if (out) remote.setPresence(out);
      } catch (err) {
        this.broken = true; // o @guess/world ainda não está pronto, ou quebrou: para de simular, não derruba a tela
        console.error('telhado: a simulação parou', err);
      }
    }

    // a câmera segue dentro do que se vê (à direita da coluna); desenha-se na vista larga, que põe o meio no meio dele
    const visible = makeView(window.innerWidth, window.innerHeight, this.insetLeft, this.zoom);
    const view = renderView(visible, this.insetLeft);
    const body = this.body;
    // a primeira vez, já em cima do corpo (dt 0 só aplica os limites do mundo)
    try { this.cam = followCamera(this.cam ?? { x: body.x }, body, visible, this.cam ? elapsed / 1000 : 0); }
    catch { this.cam = { x: body.x }; }
    const cam = this.cam;

    const list: SceneBody[] = [];
    if (me && me.character !== null) {
      const emote = this.emote && now - this.emote.since < EMOTE_MS ? this.emote.name : null;
      list.push({ id: me.id, character: me.character, x: body.x, y: body.y, z: body.z, facing: body.facing, anim: body.anim, animSince: body.animSince, emote, blink: this.blinks(body, now) });
    }
    for (const b of bodies) list.push(this.sceneBody(b, now));

    if (this.scene) {
      // antes de o jogo começar o telhado fica em preto e branco; a primeira vez sem transição
      this.scene.setLobby(room.phase === 'lobby', !this.moodSet);
      this.moodSet = true;
    }
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
    // primeiro lê onde cada um quer ficar e o tamanho, depois escreve (sem intercalar leitura e escrita de layout)
    const shown: { el: HTMLElement; tag: Tag }[] = [];
    for (const el of this.opts.heads.children as HTMLCollectionOf<HTMLElement>) {
      const b = el.dataset.member ? at.get(el.dataset.member) : undefined;
      if (!b) { if (el.style.visibility !== 'hidden') el.style.visibility = 'hidden'; continue; }
      const p = headAnchor(b, cam, view);
      // o `.gs-head` não tem tamanho (o conteúdo é absoluto, ancorado embaixo no meio): mede-se o de dentro
      const box = (el.firstElementChild as HTMLElement | null) ?? el;
      shown.push({ el, tag: { id: b.id, x: p.x, y: p.y, w: box.offsetWidth, h: box.offsetHeight, z: b.z } });
    }
    const lift = declutter(shown.map((s) => s.tag));
    for (const { el, tag } of shown) {
      el.style.transform = `translate3d(${Math.round(tag.x)}px, ${Math.round(tag.y - (lift.get(tag.id) ?? 0))}px, 0)`;
      // quem está mais à frente (z menor) por cima; 1000 passa de qualquer z do mapa (0–`DEPTH`)
      el.style.zIndex = String(Math.round(1000 - tag.z));
      if (el.style.visibility !== 'visible') el.style.visibility = 'visible';
    }
  }
}
