import { describe, expect, test } from 'bun:test';
import { roomView } from '../src/lib/room/view';
import { heads, tiltOf } from '../src/lib/world/heads';
import { member, postit, snapshot } from './snapshots';

const members = [member('m1', 'Zé', { character: 0 }), member('m2', 'Ana', { character: 1 }), member('m3', 'Bia', { character: null }), member('m4', 'Gasparzinho', { character: 3, ghost: true }), member('m5', 'Fake', { character: 4, fake: true })];

describe('o que vai sobre cada cabeça', () => {
  test('no lobby, só o apelido; quem não tem personagem não tem cabeça', () => {
    const s = snapshot({ members, order: ['m1', 'm2', 'm3', 'm5'] });
    const h = heads(s, roomView(s));
    expect(h.map((x) => x.id)).toEqual(['m1', 'm2', 'm4', 'm5']);
    expect(h.every((x) => x.card === null)).toBe(true);
    expect(h[0]).toMatchObject({ nickname: 'Zé', mine: true });
  });

  test('a partir da escrita, o post-it de cada jogador; o meu como "?" até revelar; fantasma sem post-it', () => {
    const postits = { m1: postit('m2', { text: null, written: true }), m2: postit('m1', { text: 'Pelé' }), m5: postit('m4', { text: 'Xuxa', ready: true }) };
    const s = snapshot({ members, order: ['m1', 'm2', 'm5'], phase: 'playing', postits });
    const h = heads(s, roomView(s));
    expect(h.find((x) => x.id === 'm1')?.card).toMatchObject({ hidden: true, mine: true });
    expect(h.find((x) => x.id === 'm2')?.card).toMatchObject({ hidden: false, text: 'Pelé' });
    expect(h.find((x) => x.id === 'm4')?.card).toBeNull();
  });

  test('cada dono tem o seu ângulo torto, sempre o mesmo, pequeno', () => {
    expect(tiltOf('m1')).toBe(tiltOf('m1'));
    for (const id of ['m1', 'm2', 'm3', 'm12']) expect(Math.abs(tiltOf(id))).toBeLessThanOrEqual(3);
  });
});
