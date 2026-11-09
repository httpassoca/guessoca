import { describe, expect, test } from 'bun:test';
import { project, type View } from '@guess/world';
import { frameIndex, HERO } from '../src/lib/sprites/hero';
import { EMOTE_GAP, emoteAnchor, HEAD_Y, headAnchor, makeView, pickScale } from '../src/lib/world/view';

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
    const at = { x: 420, y: 24, z: 10 };
    expect(headAnchor(at, cam, view)).toEqual(project({ x: 420, y: 24 + HEAD_Y, z: 10 }, cam, view));
    // sx = (x - cam)·escala + largura/2; sy = chão - (y + z·0,6)·escala
    expect(headAnchor(at, cam, view)).toEqual({ x: 560, y: 600 - (24 + HEAD_Y + 6) * 3 });
  });

  test('a cabeça fica acima do topo do quadro do personagem', () => {
    expect(HEAD_Y).toBeGreaterThanOrEqual(HERO.anchor.y - HERO.head.y);
    expect(HEAD_Y).toBeLessThan(HERO.frame.h);
  });

  test('pular leva o post-it junto', () => {
    const a = headAnchor({ x: 0, y: 0, z: 0 }, cam, view), b = headAnchor({ x: 0, y: 10, z: 0 }, cam, view);
    expect(a.y - b.y).toBe(30);
    expect(a.x).toBe(b.x);
  });

  test('o balão do emote fica ao lado da cabeça, para o lado em que olha', () => {
    const r = emoteAnchor({ x: 400, y: 0, z: 0, facing: 1 }, cam, view);
    const l = emoteAnchor({ x: 400, y: 0, z: 0, facing: -1 }, cam, view);
    expect(r.x - 500).toBe(EMOTE_GAP * 3);
    expect(l.x - 500).toBe(-EMOTE_GAP * 3);
    expect(r.y).toBeLessThan(600);
  });
});

describe('quadro da animação pelo tempo', () => {
  test('conta quadros no fps da folha', () => {
    const { fps } = HERO.animations.walk;
    expect(frameIndex('walk', 0)).toBe(0);
    expect(frameIndex('walk', 999 / fps)).toBe(0);
    expect(frameIndex('walk', 1000 / fps)).toBe(1);
    expect(frameIndex('walk', (3.5 * 1000) / fps)).toBe(3);
  });

  test('em loop dá a volta; sem loop para no último', () => {
    const idle = HERO.animations.idle, shove = HERO.animations.shove;
    expect(frameIndex('idle', (idle.frames * 1000) / idle.fps)).toBe(0);
    expect(frameIndex('shove', 60_000)).toBe(shove.frames - 1);
  });

  test('tempo negativo (relógio torto) é o primeiro quadro', () => expect(frameIndex('jump', -50)).toBe(0));
});
