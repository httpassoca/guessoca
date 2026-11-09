import { describe, expect, test } from 'bun:test';
import { declutter, TAG_GAP } from '../src/lib/world/declutter';

const tag = (id: string, x: number, z: number, y = 500) => ({ id, x, y, w: 100, h: 40, z });

describe('post-its sobre as cabeças não se cobrem', () => {
  test('longe um do outro, ninguém sobe', () => {
    const lift = declutter([tag('a', 100, 10), tag('b', 400, 20)]);
    expect([lift.get('a'), lift.get('b')]).toEqual([0, 0]);
  });

  test('encostados, o da frente fica e o de trás sobe até ficar acima', () => {
    const lift = declutter([tag('fundo', 130, 30), tag('frente', 100, 10)]);
    expect(lift.get('frente')).toBe(0);
    expect(lift.get('fundo')).toBe(40 + TAG_GAP);
  });

  test('três empilhados sobem em escada, sem nenhum cobrir outro', () => {
    const tags = [tag('a', 100, 10), tag('b', 110, 20), tag('c', 120, 30)];
    const lift = declutter(tags);
    const rects = tags.map((t) => ({ top: t.y - lift.get(t.id)! - t.h, bottom: t.y - lift.get(t.id)! }));
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      expect(rects[i].bottom <= rects[j].top || rects[j].bottom <= rects[i].top).toBe(true);
    }
    expect(lift.get('a')).toBe(0);
  });

  test('a mesma entrada dá sempre o mesmo resultado (empate na profundidade decide pelo id)', () => {
    const tags = [tag('b', 100, 10), tag('a', 105, 10)];
    expect(declutter(tags)).toEqual(declutter([...tags].reverse()));
  });
});
