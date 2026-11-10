import { describe, expect, test } from 'bun:test';
import { project, type View } from '@guess/world';
import { character, frameIndex } from '../src/lib/sprites/characters';
import { EMOTE_GAP, emoteAnchor, emoteY, headAnchor, headY, makeView, pickScale, stepZoom } from '../src/lib/world/view';

const HERO = character(0).atlas;
const HEAD_Y = headY(0);

describe('escala do telhado', () => {
  test('inteira: 3 numa janela 1080p, 4 numa 1440p, nunca menos de 2', () => {
    expect(pickScale(1920, 1080)).toBe(3);
    expect(pickScale(2560, 1440)).toBe(4);
    expect(pickScale(1366, 768)).toBe(2);
    expect(pickScale(800, 500)).toBe(2);
  });

  test('a vista: a área visível desconta a coluna da direita; o chão fica embaixo', () => {
    const v = makeView(1920, 1080, 440);
    expect(v).toMatchObject({ scale: 3, width: 1480, height: 1080 });
    expect(v.groundY).toBeGreaterThan(1080 / 2);
    expect(v.groundY).toBeLessThan(1080);
    expect(Number.isInteger(v.groundY)).toBe(true);
  });
});

describe('post-it sobre a cabeça', () => {
  const view: View = { scale: 3, width: 1000, height: 800, groundY: 600 };
  const cam = { x: 400 };

  test('a mesma projeção do Pixi, um pouco acima da cabeça', () => {
    const at = { x: 420, y: 24, z: 10, character: 0 };
    expect(headAnchor(at, cam, view)).toEqual(project({ x: 420, y: 24 + HEAD_Y, z: 10 }, cam, view));
    // sx = (x - cam)·escala + largura/2; sy = chão - (y + z·0,6)·escala
    expect(headAnchor(at, cam, view)).toEqual({ x: 560, y: 600 - (24 + HEAD_Y + 6) * 3 });
  });

  test('o post-it fica acima do topo da cabeça de cada modelo, dentro do quadro', () => {
    for (const n of [0, 4, 6, 8, 9]) {
      const { atlas } = character(n);
      const k = atlas.scale ?? 1; // o Vorcaro é arte grande, desenhada encolhida
      expect(headY(n)).toBeGreaterThanOrEqual((atlas.anchor.y - atlas.head.y) * k);
      expect(headY(n)).toBeLessThan(atlas.frame.h * k + 4);
    }
    // o esqueleto é mais alto que o herói: o post-it dele vai mais alto
    expect(headY(4)).toBeGreaterThan(headY(0));
    expect(emoteY(4) - emoteY(0)).toBe(headY(4) - headY(0));
  });

  test('pular leva o post-it junto', () => {
    const a = headAnchor({ x: 0, y: 0, z: 0, character: 0 }, cam, view), b = headAnchor({ x: 0, y: 10, z: 0, character: 0 }, cam, view);
    expect(a.y - b.y).toBe(30);
    expect(a.x).toBe(b.x);
  });

  test('o balão do emote fica ao lado da cabeça, para o lado em que olha', () => {
    const r = emoteAnchor({ x: 400, y: 0, z: 0, facing: 1, character: 0 }, cam, view);
    const l = emoteAnchor({ x: 400, y: 0, z: 0, facing: -1, character: 0 }, cam, view);
    expect(r.x - 500).toBe(EMOTE_GAP * 3);
    expect(l.x - 500).toBe(-EMOTE_GAP * 3);
    expect(r.y).toBeLessThan(600);
  });
});

describe('quadro da animação pelo tempo', () => {
  test('conta quadros no fps da folha', () => {
    const { fps } = HERO.animations.walk;
    expect(frameIndex(HERO, 'walk', 0)).toBe(0);
    expect(frameIndex(HERO, 'walk', 999 / fps)).toBe(0);
    expect(frameIndex(HERO, 'walk', 1000 / fps)).toBe(1);
    expect(frameIndex(HERO, 'walk', (3.5 * 1000) / fps)).toBe(3);
  });

  test('em loop dá a volta; sem loop para no último', () => {
    const idle = HERO.animations.idle, shove = HERO.animations.shove;
    expect(frameIndex(HERO, 'idle', (idle.frames * 1000) / idle.fps)).toBe(0);
    expect(frameIndex(HERO, 'shove', 60_000)).toBe(shove.frames - 1);
  });

  test('tempo negativo (relógio torto) é o primeiro quadro', () => expect(frameIndex(HERO, 'jump', -50)).toBe(0));
});

describe('zoom com a roda do mouse', () => {
  test('soma passos inteiros à escala automática, entre 2 e 6', () => {
    expect(makeView(1920, 1080).scale).toBe(3);
    expect(makeView(1920, 1080, 0, 1).scale).toBe(4);
    expect(makeView(1920, 1080, 0, -1).scale).toBe(2);
    expect(makeView(1920, 1080, 0, -5).scale).toBe(2);
    expect(makeView(1920, 1080, 0, 9).scale).toBe(6);
  });

  test('um passo da roda anda 1 e para nos limites, sem guardar passos além deles', () => {
    expect(stepZoom(0, 1, 1920, 1080)).toBe(1);
    expect(stepZoom(0, -1, 1920, 1080)).toBe(-1);
    expect(stepZoom(-1, -1, 1920, 1080)).toBe(-1);
    expect(stepZoom(3, 1, 1920, 1080)).toBe(3);
    // um zoom guardado numa tela maior, além do que esta deixa: o primeiro passo de volta já muda a escala
    expect(stepZoom(8, -1, 1920, 1080)).toBe(2);
    expect(makeView(1920, 1080, 0, 2).scale).toBe(5);
  });
});
