/**
 * As janelas vivas (issue #70): uma camada por cima das fachadas que acende e apaga janelas devagar, faz a televisão
 * tremeluzir e, de vez em quando, passa alguém na frente de uma janela acesa; e a luz da sirene (vermelho e azul) nas
 * fachadas quando um carro de polícia passa lá embaixo. Pixi; quando e o quê saem de `ambient.ts` (puro, testado).
 *
 * Entrada: as fachadas do `MAP` (`ROOFS`, `facadeOf` e `roofRects` de `dressing.ts`), onde ficam as janelas em cada
 * fachada (`windows` do quadro em `rooftop.json`, gerado por `tools/sprites/src/rooftop.ts`) e os quadros `win-*`
 * (`tools/sprites/src/life.ts`). Só desenha as janelas diferentes do desenho da fachada, então quase sempre são poucas
 * dezenas de sprites. Saída: um `Container` que `platforms.ts` põe logo depois das fachadas (ganha o bloom do cenário).
 */
import type { Camera, View } from '@guess/world';
import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { ROOFTOP } from '../sprites/rooftop';
import { sirenAt, skySpeed, windowFrame, windowId, type Pane } from './ambient';
import type { RooftopArt } from './art';
import { facadeOf, ROOFS, roofRects } from './dressing';

/** a luz da sirene nas fachadas: a cor (vermelho e azul de giroflex) e a força máxima, somando luz (no olho, bem fraca) */
const SIREN_RED = 0xff2a3c;
const SIREN_BLUE = 0x2f5bff;
const SIREN_ALPHA = 0.11;
/** até onde a luz da sirene chega, em unidades do mundo a partir do carro */
const SIREN_REACH = 260;
/** de quanto em quanto tempo as janelas são recontadas (ms) e a altura de um andar da fachada (unidades do mundo) */
const RECALC_MS = 150;
const FLOOR_H = ROOFTOP.frames['facade-a']?.windows?.floor ?? 22;

/** As janelas por cima das fachadas e a luz da sirene. */
export class WindowLife extends Container {
  private readonly textures = new Map<string, Texture>();
  private readonly wash = new Graphics();
  private readonly panes = new Container();
  private readonly speed = typeof location === 'undefined' ? 1 : skySpeed(location.search, location.hostname);

  constructor(private readonly art: RooftopArt) {
    super();
    this.wash.blendMode = 'add';
    for (const f of this.facades) this.panes.addChild(f.box);
    this.addChild(this.panes, this.wash);
  }

  private texture(name: string): Texture {
    let t = this.textures.get(name);
    if (!t) { t = this.art.frame(name); this.textures.set(name, t); }
    return t;
  }

  /**
   * Um contêiner por fachada, na escala do mundo: as janelas que pedem quadro ficam nele em pixels da fachada, recontadas
   * no máximo a cada `RECALC_MS` (a televisão troca a cada 140 ms ou mais, a silhueta a cada 400); a cada quadro só o
   * contêiner anda com a câmera.
   */
  private readonly facades: { box: Container; used: number }[] = ROOFS.map(() => ({ box: new Container(), used: 0 }));
  private calcAt = -Infinity;
  /** quantos andares de cada fachada aparecem (da beirada até o fim da tela) na última contagem */
  private calcFloors: number[] = [];
  private washed = false;

  private recalc(now: number, floorsOf: number[]) {
    this.calcAt = now;
    this.calcFloors = floorsOf;
    ROOFS.forEach((roof, r) => {
      const floorsNeeded = floorsOf[r];
      const slot = this.facades[r];
      let used = 0;
      const f = ROOFTOP.frames[facadeOf(r)];
      const win = f?.windows;
      if (win) {
        const bays = win.plan[0].length, floors = win.plan.length;
        const roofW = roof.x1 - roof.x0;
        for (let c = 0; ; c++) {
          // em pixels da fachada (= unidades do mundo): o ladrilho inteiro mais a baia dentro dele
          const x = Math.floor(c / bays) * f.w + win.x + (c % bays) * win.bay;
          if (x + win.w > roofW) break;
          for (let fl = 0; fl < floorsNeeded; fl++) {
            const base = win.plan[fl % floors][c % bays];
            if (base === '.') continue;
            const name = windowFrame(base as Pane, windowId(r, c, fl), now);
            if (!name) continue;
            const sp = (slot.box.children[used] as Sprite | undefined) ?? slot.box.addChild(new Sprite());
            used++;
            sp.texture = this.texture(name);
            sp.position.set(x, Math.floor(fl / floors) * f.h + win.y + (fl % floors) * win.floor);
            sp.visible = true;
          }
        }
      }
      for (let i = used; i < slot.used; i++) slot.box.children[i].visible = false;
      slot.used = used;
    });
  }

  /** Um quadro: as janelas diferentes do desenho, em cima da janela da fachada; a sirene, se estiver passando. `now` em ms. */
  update(cam: Camera, view: View, now: number) {
    const s = view.scale;
    // os andares de cada fachada que cabem entre a beirada e o fim da tela, mais um de folga
    const rects = ROOFS.map((roof) => roofRects(roof, cam, view).facade);
    const floorsOf = rects.map((f) => Math.max(0, Math.ceil(f.h / s / FLOOR_H) + 1));
    if (now - this.calcAt >= RECALC_MS || now < this.calcAt || floorsOf.some((n, i) => n > (this.calcFloors[i] ?? 0))) this.recalc(now, floorsOf);
    const siren = sirenAt(now, this.speed);
    if (this.washed) { this.wash.clear(); this.washed = false; }
    ROOFS.forEach((roof, r) => {
      const facade = rects[r];
      const box = this.facades[r].box;
      box.visible = !(facade.x > view.width || facade.x + facade.w < 0 || facade.y > view.height);
      if (!box.visible) return;
      box.position.set(facade.x, facade.y);
      if (box.scale.x !== s) box.scale.set(s);
      // a sirene: cada fachada acende pelo quão perto o carro está dela, mais forte embaixo (a luz vem da rua)
      if (siren) {
        const roofW = roof.x1 - roof.x0;
        const mid = (roof.x0 + roof.x1) / 2;
        const near = Math.max(0, 1 - Math.max(0, Math.abs(siren.x - mid) - roofW / 2) / SIREN_REACH);
        const a = SIREN_ALPHA * siren.amount * near;
        if (a > 0.005) {
          const color = siren.red ? SIREN_RED : SIREN_BLUE;
          const top = Math.max(facade.y, 0);
          const h = view.height - top;
          // três faixas, mais fortes perto da rua: degraus em vez de degradê, como o resto
          for (let i = 0; i < 3; i++) this.wash.rect(facade.x, top + (h * i) / 3, facade.w, h / 3 + 1).fill({ color, alpha: a * (0.35 + 0.325 * i) });
          this.washed = true;
        }
      }
    });
    this.wash.visible = this.washed;
  }
}
