/**
 * A comemoração de quem acertou (issue #58): confete em volta do personagem, por uns 2 s. Pixi; sem teste automático
 * (a conta dos pedaços é de `confetti.ts`, pura e testada).
 *
 * Entrada: quem comemora (`start`) e, a cada quadro, os corpos que a cena desenha (unidades do mundo). Saída: um
 * `Container` que `scene.ts` põe por cima dos balões e debaixo da chuva (ganha a aberração e o VHS, não o brilho). Cada
 * pedaço é `Texture.WHITE` esticada num quadradinho de 1 ou 2 pixels do mundo, cor chapada, sem transparência nem
 * rotação, na grade de pixels do mundo (a posição em unidades inteiras, vezes a escala inteira da vista). Nasce de onde
 * o personagem está naquela hora e depois fica no mundo: quem é lançado para o alto deixa um rastro. Os sprites existem
 * só enquanto a comemoração dura.
 */
import { BODY_H, project, type Camera, type Vec3, type View } from '@guess/world';
import { Container, Sprite, Texture } from 'pixi.js';
import { CONFETTI_COLORS, CONFETTI_MS, confetti, pieceOffset, pieceShown, seeded, type Piece } from './confetti';

/** de onde o confete sai: do meio do corpo, unidades acima dos pés */
const CHEST = BODY_H / 2;

interface Party {
  id: string;
  start: number;
  pieces: Piece[];
  sprites: Sprite[];
  /** onde cada pedaço nasceu (unidades do mundo); null = ainda não nasceu */
  origins: (Vec3 | null)[];
}

/** O confete de todas as comemorações em andamento. */
export class Celebration extends Container {
  private parties: Party[] = [];

  /** `id` acertou agora (`now`, ms): começa o confete dele. Cada navegador sorteia o seu. */
  start(id: string, now: number) {
    const pieces = confetti(seeded(Math.floor(Math.random() * 2 ** 32)));
    const sprites = pieces.map((p) => {
      const s = new Sprite(Texture.WHITE);
      s.anchor.set(0.5);
      s.tint = CONFETTI_COLORS[p.color];
      s.visible = false;
      this.addChild(s);
      return s;
    });
    this.parties.push({ id, start: now, pieces, sprites, origins: pieces.map(() => null) });
  }

  /** Um quadro: `at` diz onde está cada corpo agora (os pés, unidades do mundo); quem não está no telhado não solta confete. */
  update(at: (id: string) => Vec3 | undefined, cam: Camera, view: View, now: number) {
    if (this.parties.length === 0) return;
    const s = view.scale;
    this.parties = this.parties.filter((party) => {
      if (now - party.start < CONFETTI_MS) return true;
      for (const sprite of party.sprites) sprite.destroy();
      return false;
    });
    for (const party of this.parties) {
      const body = at(party.id);
      party.pieces.forEach((p, i) => {
        const sprite = party.sprites[i];
        const age = now - party.start - p.born;
        if (age >= 0 && !party.origins[i] && body) party.origins[i] = { x: Math.round(body.x) + p.ox, y: Math.round(body.y + CHEST) + p.oy, z: body.z };
        const origin = party.origins[i];
        if (!origin || !pieceShown(p, age)) { sprite.visible = false; return; }
        const o = pieceOffset(p, age);
        const screen = project({ x: origin.x + o.x, y: origin.y + o.y, z: origin.z }, cam, view);
        sprite.position.set(screen.x, screen.y);
        sprite.width = p.size * s;
        sprite.height = p.size * s;
        sprite.visible = true;
      });
    }
  }
}
