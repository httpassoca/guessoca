import { describe, expect, test } from 'bun:test';
import { parallaxOffset } from '../src/lib/world/parallax';
import { Rain } from '../src/lib/world/rain';

describe('paralaxe', () => {
  test('parado na origem, o ladrilho começa no zero', () => {
    expect(parallaxOffset(0, 0.3, 100, 3)).toBe(0);
  });

  test('a faixa anda a uma fração da câmera, para o outro lado', () => {
    // câmera 10 px do mundo à direita, faixa a 0,5: o ladrilho anda 5 px do mundo = 15 px da tela para a esquerda
    expect(parallaxOffset(10, 0.5, 100, 3)).toBe(-15);
  });

  test('dá a volta no tamanho do ladrilho: sempre em (−ladrilho, 0], em pixels inteiros da tela', () => {
    for (const cam of [-500, -33.3, 0, 7.7, 299, 1234.5, 99999]) {
      const o = parallaxOffset(cam, 0.35, 448, 3);
      expect(o).toBeLessThanOrEqual(0);
      expect(o).toBeGreaterThan(-448 * 3);
      expect(Number.isInteger(o)).toBe(true);
    }
  });

  test('um ladrilho inteiro de câmera não muda nada; o deslize (drift) soma ao da câmera', () => {
    expect(parallaxOffset(200, 0.5, 100, 2)).toBe(parallaxOffset(0, 0.5, 100, 2));
    expect(parallaxOffset(4, 0.5, 100, 2, 3)).toBe(parallaxOffset(10, 0.5, 100, 2));
  });

  test('fator 0 fica parado (a lua), fator 1 anda junto com o telhado', () => {
    expect(parallaxOffset(123, 0, 64, 3)).toBe(0);
    expect(parallaxOffset(10, 1, 64, 3)).toBe(-30);
  });
});

/** sorteio de mentira, repetível */
function seq(seed = 1) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

describe('chuva', () => {
  const opts = { count: 50, slant: 0.25, speed: [600, 900] as [number, number], length: [8, 16] as [number, number] };

  test('um número fixo de gotas, espalhadas pela tela ao começar', () => {
    const rain = new Rain(opts, seq());
    rain.resize(800, 600);
    expect(rain.drops).toHaveLength(50);
    for (const d of rain.drops) {
      expect(d.y).toBeGreaterThanOrEqual(-d.len);
      expect(d.y).toBeLessThanOrEqual(600);
    }
  });

  test('caem na diagonal: descem e vão um pouco para a esquerda', () => {
    const rain = new Rain(opts, seq());
    rain.resize(800, 600);
    const d = rain.drops[0];
    const before = { x: d.x, y: d.y };
    rain.step(0.01);
    if (d.y > before.y) {
      expect(d.y - before.y).toBeCloseTo(d.speed * 0.01, 6);
      expect(before.x - d.x).toBeCloseTo(d.speed * 0.01 * 0.25, 6);
    }
  });

  test('quem passa do chão volta para cima: as mesmas gotas, reaproveitadas', () => {
    const rain = new Rain(opts, seq());
    rain.resize(800, 600);
    const same = [...rain.drops];
    let recycled = 0;
    for (let i = 0; i < 200; i++) {
      const ys = rain.drops.map((d) => d.y);
      rain.step(1 / 60);
      rain.drops.forEach((d, j) => { if (d.y < ys[j]) { recycled++; expect(d.y).toBeLessThanOrEqual(0); } });
    }
    expect(recycled).toBeGreaterThan(50);
    expect(rain.drops).toHaveLength(50);
    rain.drops.forEach((d, i) => expect(d).toBe(same[i]));
    for (const d of rain.drops) {
      expect(d.y - d.len).toBeLessThanOrEqual(600);
      expect(d.x).toBeGreaterThanOrEqual(-50);
      expect(d.x).toBeLessThanOrEqual(800 + 600 * 0.25 + 50);
    }
  });

  test('a câmera anda, a chuva anda junto (deslocamento em x)', () => {
    const a = new Rain(opts, seq(7)), b = new Rain(opts, seq(7));
    a.resize(800, 600); b.resize(800, 600);
    a.step(0.001, 0); b.step(0.001, -12);
    a.drops.forEach((d, i) => {
      const e = b.drops[i];
      expect(e.y).toBe(d.y);
      if (d.x > 20 && d.x < 780) expect(e.x).toBeCloseTo(d.x - 12, 6);
    });
  });

  test('mesmo sorteio, mesma chuva', () => {
    const a = new Rain(opts, seq(3)), b = new Rain(opts, seq(3));
    a.resize(640, 360); b.resize(640, 360);
    for (let i = 0; i < 30; i++) { a.step(1 / 60); b.step(1 / 60); }
    expect(a.drops).toEqual(b.drops);
  });
});
