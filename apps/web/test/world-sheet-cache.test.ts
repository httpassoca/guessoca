import { describe, expect, test } from 'bun:test';
import { CHARACTER_ART, largestSheet } from '../src/lib/sprites/characters';
import { fitFactor, presentCharacters, SheetCache } from '../src/lib/world/sheet-cache';

/** um carregador falso: cada pedido fica esperando até o teste resolver ou rejeitar */
function fakeLoader() {
  const pending = new Map<string, { resolve: (v: string) => void; reject: (e: Error) => void }>();
  const loads: string[] = [];
  const freed: string[] = [];
  const cache = new SheetCache<string>({
    load: (url) => { loads.push(url); return new Promise((resolve, reject) => pending.set(url, { resolve, reject })); },
    free: (v) => freed.push(v),
    keepMs: 1000,
    retryMs: 500,
  });
  const settle = async () => { for (let i = 0; i < 3; i++) await Promise.resolve(); };
  return { cache, loads, freed, pending, settle };
}

describe('as folhas dos personagens no telhado', () => {
  test('nada carrega antes de alguém pedir; pedir de novo enquanto carrega não carrega duas vezes', async () => {
    const { cache, loads, pending, settle } = fakeLoader();
    expect(loads).toEqual([]);
    expect(cache.get('/a', 0)).toBeNull();
    expect(cache.get('/a', 10)).toBeNull();
    expect(cache.loading('/a')).toBe(true);
    expect(loads).toEqual(['/a']);
    pending.get('/a')!.resolve('A');
    await settle();
    expect(cache.get('/a', 20)).toBe('A');
    expect(cache.ready()).toEqual(['/a']);
  });

  test('uma folha que ninguém pede há mais de `keepMs` é solta; uma pedida há pouco fica', async () => {
    const { cache, freed, pending, settle } = fakeLoader();
    cache.get('/a', 0); cache.get('/b', 0);
    pending.get('/a')!.resolve('A'); pending.get('/b')!.resolve('B');
    await settle();
    cache.get('/b', 900);
    expect(cache.sweep(1500)).toEqual(['/a']);
    expect(freed).toEqual(['A']);
    expect(cache.get('/b', 1500)).toBe('B');
    // e pedir de novo a solta carrega de novo
    expect(cache.get('/a', 1600)).toBeNull();
    expect(cache.loading('/a')).toBe(true);
  });

  test('uma folha que falhou fica marcada (quem desenha usa outra) e é tentada de novo depois de `retryMs`', async () => {
    const { cache, loads, pending, settle } = fakeLoader();
    const warn = console.warn; console.warn = () => {};
    try {
      cache.get('/a', 0);
      pending.get('/a')!.reject(new Error('404'));
      await settle();
      expect(cache.failed('/a')).toBe(true);
      expect(cache.get('/a', 100)).toBeNull();
      expect(loads).toEqual(['/a']);
      cache.sweep(700);
      expect(cache.failed('/a')).toBe(false);
      cache.get('/a', 800);
      expect(loads).toEqual(['/a', '/a']);
    } finally { console.warn = warn; }
  });

  test('o que chega depois de a cena fechar é solto na hora', async () => {
    const { cache, freed, pending, settle } = fakeLoader();
    cache.get('/a', 0); cache.get('/b', 0);
    pending.get('/a')!.resolve('A');
    await settle();
    cache.dispose();
    expect(freed).toEqual(['A']);
    pending.get('/b')!.resolve('B');
    await settle();
    expect(freed).toEqual(['A', 'B']);
  });

  test('uma folha que cabe na placa não encolhe; uma maior encolhe até o maior lado caber', () => {
    expect(fitFactor({ w: 8192, h: 150 }, 8192)).toBe(1);
    const k = fitFactor({ w: 8760, h: 1050 }, 8192);
    expect(k).toBeLessThan(1);
    expect(8760 * k).toBeLessThanOrEqual(8192);
    expect(8760 * k).toBeGreaterThan(8191);
    expect(fitFactor({ w: 300, h: 5000 }, 4096) * 5000).toBeLessThanOrEqual(4096);
  });

  test('toda folha gerada cabe numa placa de 8192 sem encolher (o WebGL por software)', () => {
    for (const c of CHARACTER_ART) expect(fitFactor({ w: largestSheet(c.atlas), h: 0 }, 8192)).toBe(1);
  });

  test('quem está no telhado: o personagem de cada membro que escolheu um e o de cada bot, sem repetir', () => {
    expect(presentCharacters(null)).toEqual([]);
    expect(presentCharacters({
      members: [{ character: 3 }, { character: null }, { character: 20 }, { character: 3 }],
      bots: [{ character: 26 }, { character: 20 }],
    })).toEqual([3, 20, 26]);
  });
});
