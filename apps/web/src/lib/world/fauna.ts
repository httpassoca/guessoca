/**
 * Os bichos do telhado na tela (issue #71): os três gatos, o miau, os seis pássaros e as penas. Pixi; sem teste
 * automático (quem decide o que cada bicho faz é `critters.ts`, puro e testado).
 *
 * Entrada: as folhas `/sprites/cats.png` e `/sprites/birds.png` com o atlas `CRITTERS` (`../sprites/critters.ts`),
 * geradas por `bun run sprites`; a cada quadro, quem está no telhado (`Folk`, unidades do mundo) e a profundidade dos
 * corpos já ordenados. Saída: sprites dentro do contêiner dos corpos (`scene.ts`), sem brilho, cada um com o `zIndex`
 * entre os corpos de trás e os da frente dele, para quem passa na frente cobrir o gato e quem está atrás ficar atrás.
 *
 * Desenho: a 1× (um pixel da folha = uma unidade do mundo, vezes a escala inteira da vista), espelhado pelo lado para
 * onde olha, tingido para a noite (`TINT`) sem mudar os pixels da arte; o preto e branco do lobby vem do filtro do
 * mundo. O relógio é o de parede (`Date.now()`), o mesmo em toda aba, para os quadros também baterem.
 */
import { project, type Camera, type View } from '@guess/world';
import { Assets, Container, Rectangle, Sprite, Texture } from 'pixi.js';
import { CRITTERS, stripFrame, type Strip } from '../sprites/critters';
import { pieceOffset, pieceShown } from './confetti';
import { Critters, FEATHER_COLORS, type Folk } from './critters';

/** a cor que tinge os bichos: a arte é de dia; um lilás frio a põe na noite do telhado (no olho) */
const TINT = 0xc8c0ff;
/** o miau sai da boca: tanto à frente e acima dos pés, unidades do mundo (o gato tem uns 20×14) */
const MEOW_DX = 8;
const MEOW_DY = 13;
/** um bicho mais alto que isto acima do chão já saiu da tela por cima (unidades); some */
const OFF_TOP = 420;

type Strips = Map<string, { strip: Strip; frames: Texture[] }>;

function cut(sheet: Texture, strips: Record<string, Strip>, prefix = ''): Strips {
  const out: Strips = new Map();
  for (const [name, s] of Object.entries(strips)) {
    out.set(prefix + name, { strip: s, frames: Array.from({ length: s.frames }, (_, i) => new Texture({ source: sheet.source, frame: new Rectangle(s.x + i * s.w, s.y, s.w, s.h) })) });
  }
  return out;
}

/** Os bichos de uma sala, desenhados dentro de `bodies` (o contêiner ordenado dos corpos). */
export class Fauna {
  private critters: Critters | null = null;
  private seed: number | null = null;
  private readonly cats: Sprite[] = [];
  private readonly meows: Sprite[] = [];
  private readonly birds: Sprite[] = [];
  private readonly feathers: Sprite[] = [];

  private constructor(private readonly bodies: Container, private readonly strips: Strips) {}

  /** Carrega as duas folhas. Rejeita se não carregar (a cena segue sem bichos). */
  static async create(bodies: Container): Promise<Fauna> {
    const [cats, birds] = await Promise.all([Assets.load<Texture>(CRITTERS.cats.sheet), Assets.load<Texture>(CRITTERS.birds.sheet)]);
    return new Fauna(bodies, new Map([...cut(cats, CRITTERS.cats.strips), ...cut(birds, CRITTERS.birds.strips)]));
  }

  /** A sala mudou (ou é a primeira): os bichos recomeçam com a semente dela. */
  setSeed(seed: number) {
    if (seed === this.seed) return;
    this.seed = seed;
    this.critters = new Critters(seed);
  }

  /** `id` acertou: o gato mais perto mia. */
  cheer(id: string) { this.critters?.cheer(id); }

  private sprite(list: Sprite[], i: number): Sprite {
    let s = list[i];
    if (!s) {
      s = new Sprite();
      s.tint = TINT;
      this.bodies.addChild(s);
      list[i] = s;
    }
    return s;
  }

  /**
   * Um quadro: `folk` é todo mundo no telhado, `depths` a profundidade de cada corpo na ordem em que a cena os desenha
   * (o `zIndex` do corpo é a posição nela), `wall` o relógio de parede, ms.
   */
  update(folk: readonly Folk[], depths: readonly number[], cam: Camera, view: View, wall: number) {
    const c = this.critters;
    if (!c) return;
    const s = view.scale;
    const { cats, birds } = c.tick(folk, wall);
    // entre os corpos: depois de todos os que estão mais ao fundo que ele (a cena desenha do fundo para a frente)
    const zOf = (z: number) => depths.filter((d) => d > z).length - 0.5;
    const place = (sp: Sprite, name: string, since: number, at: { x: number; y: number; z: number }, facing: 1 | -1) => {
      const t = this.strips.get(name);
      if (!t) { sp.visible = false; return; }
      sp.texture = t.frames[stripFrame(t.strip, wall - since)];
      sp.anchor.set(t.strip.anchor.x / t.strip.w, t.strip.anchor.y / t.strip.h);
      const p = project({ x: Math.round(at.x), y: Math.round(at.y), z: at.z }, cam, view);
      sp.position.set(p.x, p.y);
      sp.scale.set(facing * s, s);
      sp.zIndex = zOf(at.z);
      sp.visible = p.x > -40 * s && p.x < view.width + 40 * s;
    };
    cats.forEach((cat, i) => {
      place(this.sprite(this.cats, i), `${cat.name}/${cat.strip}`, cat.since, cat, cat.facing);
      const m = this.sprite(this.meows, i);
      if (cat.meow === null) m.visible = false;
      else place(m, 'meow/pop', cat.meow, { x: cat.x + cat.facing * MEOW_DX, y: cat.y + MEOW_DY, z: cat.z }, cat.facing);
    });
    birds.forEach((b, i) => {
      const sp = this.sprite(this.birds, i);
      if (!b.visible || b.y > OFF_TOP) { sp.visible = false; return; }
      place(sp, b.strip, b.since, b, b.facing);
    });
    // as penas: um quadradinho de 1 pixel do mundo, cinza, na conta fechada do confete
    const list = c.flocks.feathers;
    list.forEach((f, i) => {
      const sp = this.sprite(this.feathers, i);
      if (sp.texture !== Texture.WHITE) { sp.texture = Texture.WHITE; sp.anchor.set(0.5); }
      const age = wall - f.at - f.piece.born;
      if (!pieceShown(f.piece, age)) { sp.visible = false; return; }
      const o = pieceOffset(f.piece, age);
      const p = project({ x: f.from.x + f.piece.ox + o.x, y: f.from.y + f.piece.oy + o.y, z: f.from.z }, cam, view);
      sp.tint = FEATHER_COLORS[f.piece.color];
      sp.position.set(p.x, p.y);
      sp.width = s; sp.height = s;
      sp.zIndex = zOf(f.from.z);
      sp.visible = true;
    });
    for (let i = list.length; i < this.feathers.length; i++) this.feathers[i].visible = false;
  }
}
