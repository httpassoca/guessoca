/**
 * Os telhados vestidos (issue #6): é o único lugar que sabe desenhar plataformas. Cada telhado é um tampo de concreto
 * molhado, uma mureta no fundo e outra na frente, e a fachada do prédio descendo até o fim da tela; cada caixa do mapa
 * vira o objeto do tamanho dela (ar-condicionado, chaminé, caixa-d'água); e os enfeites (antenas, letreiros de neon,
 * poças) ficam onde `dressing.ts` manda.
 *
 * Ordem: `back` vai atrás dos corpos (as caixas vão até o fundo do telhado, então ninguém fica atrás delas: quem está na
 * frente cobre, e quem está em cima é desenhado depois, por cima); `front` (a mureta da frente) vai na frente dos
 * corpos, cobrindo os pés de quem encosta na beirada. Pixi; as contas são puras e testadas em `dressing.ts`.
 *
 * Entrada: a geometria do `MAP` (`@guess/world`, unidades do mundo), os quadros de `rooftop.png` via `art.ts` e
 * `ROOFTOP` (`apps/web/src/lib/sprites/rooftop.json`, gerado por `tools/sprites/src/rooftop.ts`), e o que vai onde
 * (`dressing.ts`). Saída: os dois contêineres `back` e `front`, que `scene.ts` põe nas camadas certas; tudo em pixels da
 * tela, ampliado pela escala inteira de `view`.
 *
 * Como mudar (vestir um mapa novo): a colisão continua só no `MAP`; aqui cada `kind: 'roof'` vira tampo + mureta do
 * fundo + fachada + mureta da frente (`ROOFS`, na ordem de x, e `facadeOf(i)` escolhe a fachada); cada `kind: 'box'`
 * precisa de um quadro na folha com `face` = altura da caixa, a mesma largura e o tampo com `round(fundo · DEPTH_K)`
 * linhas (`boxLooks`), senão fica invisível; os enfeites são uma lista `DECOR` por telhado (camadas `back`, `facade`,
 * `floor`). Um mapa de outro tipo (o pub, `docs/ideas/pub-irlandes.md`) trocaria este arquivo e `dressing.ts` por um
 * par próprio, com outra folha.
 */
import { MAP, project, type Camera, type Platform, type View } from '@guess/world';
import { Container, Graphics, Sprite, Texture, TilingSprite } from 'pixi.js';
import { ROOFTOP } from '../sprites/rooftop';
import type { RooftopArt } from './art';
import { beaconOn, boxLooks, DECOR, decorAt, facadeOf, neonFlicker, ROOFS, roofRects, type BoxLook, type Decor } from './dressing';

/** a quina do prédio: o `k` da paleta do telhado (contorno, sombra funda) */
const EDGE = 0x0c0a17;
/** as linhas do ladrilho do tampo (34 = `DEPTH` · `DEPTH_K` arredondado para cima), em pixels da folha */
const TOP_ROWS = ROOFTOP.frames['roof-top'].h;
const PARAPET = ROOFTOP.frames.parapet;
const LEDGE = ROOFTOP.frames.ledge;
/** folga, em pixels do mundo, antes de esconder o que saiu da tela pelos lados */
const OFFSCREEN = 8;

interface DrawnRoof { roof: Platform; top: TilingSprite; ledge: TilingSprite; facade: TilingSprite; parapet: TilingSprite }
interface DrawnDecor { d: Decor; sprite: Sprite }

/** Os telhados, as caixas e os enfeites do `MAP`, em dois contêineres: atrás e na frente dos corpos. */
export class Platforms {
  /** enfeites de trás, tampos, muretas do fundo, fachadas, quinas, enfeites da fachada e do chão, caixas (nessa ordem) */
  readonly back = new Container();
  /** as muretas da frente */
  readonly front = new Container();
  private readonly roofs: DrawnRoof[];
  private readonly decor: DrawnDecor[] = [];
  private readonly boxes: { look: BoxLook; sprite: Sprite }[];
  private readonly edges = new Graphics();
  private readonly hotel: Texture[];

  constructor(art: RooftopArt) {
    const tiling = (name: string) => new TilingSprite({ texture: art.tile(name) });
    const sprite = (name: string) => {
      const s = new Sprite(art.frame(name));
      const f = ROOFTOP.frames[name];
      s.anchor.set(f.anchor.x / f.w, f.anchor.y / f.h);
      return s;
    };
    this.hotel = [art.frame('sign-hotel'), art.frame('sign-hotel-flicker')];
    this.roofs = ROOFS.map((roof, i) => ({ roof, top: tiling('roof-top'), ledge: tiling('ledge'), facade: tiling(facadeOf(i)), parapet: tiling('parapet') }));
    for (const d of DECOR) this.decor.push({ d, sprite: sprite(d.frame) });
    this.boxes = boxLooks(MAP).map((look) => ({ look, sprite: sprite(look.frame) }));

    const layer = (ds: DrawnDecor[]) => ds.map((x) => x.sprite);
    const of = (l: Decor['layer']) => layer(this.decor.filter((x) => x.d.layer === l));
    this.back.addChild(
      ...of('back'),
      ...this.roofs.flatMap((r) => [r.top, r.ledge, r.facade]),
      this.edges,
      ...of('facade'),
      ...of('floor'),
      ...this.boxes.map((b) => b.sprite),
    );
    this.front.addChild(...this.roofs.map((r) => r.parapet));
  }

  /** Põe tudo no lugar para a câmera `cam` (mundo) e a vista `view` (pixels da tela); `now` em ms (neon, luz da torre). */
  update(cam: Camera, view: View, now: number) {
    const s = view.scale;
    const onScreen = (x: number, w: number) => x + w > -s * OFFSCREEN && x < view.width + s * OFFSCREEN;
    this.edges.clear();
    for (const r of this.roofs) {
      const { top, facade } = roofRects(r.roof, cam, view);
      const visible = onScreen(top.x, top.w);
      for (const t of [r.top, r.ledge, r.facade, r.parapet]) { t.visible = visible; t.tileScale.set(s); }
      if (!visible) continue;
      // o tampo encosta embaixo (a beirada da frente inteira); o que sobra de cima fica sob a mureta do fundo
      r.top.position.set(top.x, top.y);
      r.top.width = top.w; r.top.height = top.h;
      r.top.tilePosition.set(0, top.h - TOP_ROWS * s);
      r.ledge.position.set(top.x, top.y - LEDGE.anchor.y * s);
      r.ledge.width = top.w; r.ledge.height = LEDGE.h * s;
      r.facade.position.set(facade.x, facade.y);
      r.facade.width = facade.w; r.facade.height = Math.max(0, facade.h);
      r.parapet.position.set(facade.x, facade.y - PARAPET.anchor.y * s);
      r.parapet.width = facade.w; r.parapet.height = PARAPET.h * s;
      // as quinas do prédio: um contorno escuro de 1 pixel do mundo separa a fachada do fundo
      const left = facade.x, right = facade.x + facade.w;
      this.edges.rect(left, top.y - LEDGE.anchor.y * s, s, view.height).rect(right - s, top.y - LEDGE.anchor.y * s, s, view.height).fill(EDGE);
    }

    const flicker = neonFlicker(now);
    for (const { d, sprite } of this.decor) {
      const at = project(decorAt(d), cam, view);
      sprite.scale.set(s);
      sprite.position.set(at.x, at.y);
      sprite.visible = onScreen(at.x - sprite.width / 2, sprite.width);
      // cada luz de torre pisca fora de fase com as outras: o x dela desloca o relógio (7 ms por unidade, no olho)
      if (d.frame === 'beacon') sprite.visible &&= beaconOn(now + d.x * 7);
      if (d.frame === 'sign-hotel') sprite.texture = this.hotel[flicker ? 1 : 0];
    }
    for (const { look, sprite } of this.boxes) {
      const at = look.place(cam, view);
      sprite.scale.set(s);
      sprite.position.set(at.x, at.y);
      sprite.visible = onScreen(at.x, sprite.width);
    }
  }
}
