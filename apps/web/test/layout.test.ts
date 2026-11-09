import { describe, expect, test } from 'bun:test';
import { project } from '@guess/world';
import { besideSide, EDGE, GAP, NOTEPAD_W, notepadBox, sideCollapsedAfter, sideInset } from '../src/lib/layout';
import { makeView, renderView } from '../src/lib/world/view';

describe('o que fica ao lado da coluna', () => {
  /** a largura da coluna (`--gs-side-w` em `app.css`) */
  const W = 480;

  test('com a coluna aberta, logo à direita dela; recolhida, no canto', () => {
    expect(besideSide({ open: true, width: W })).toBe(EDGE + W + GAP);
    expect(besideSide({ open: true, width: W })).toBe(504);
    expect(besideSide({ open: false, width: W })).toBe(EDGE);
    expect(besideSide({ open: true, width: 0 })).toBe(EDGE); // ainda sem medida
  });

  test('o bloco: preso embaixo, ao lado da coluna, sem sair da tela', () => {
    expect(notepadBox({ open: true, width: W }, 1600)).toEqual({ left: EDGE + W + GAP, width: NOTEPAD_W });
    expect(notepadBox({ open: false, width: W }, 1600)).toEqual({ left: EDGE, width: NOTEPAD_W });
    // tela estreita: o bloco encolhe até caber
    expect(notepadBox({ open: true, width: W }, 760)).toEqual({ left: EDGE + W + GAP, width: 760 - (EDGE + W + GAP) - EDGE });
    // nem assim cabe: vai para o canto por cima da coluna
    expect(notepadBox({ open: true, width: W }, 600)).toEqual({ left: EDGE, width: NOTEPAD_W });
    expect(notepadBox({ open: true, width: W }, 300)).toEqual({ left: EDGE, width: 300 - 2 * EDGE });
  });

  test('quanto da esquerda a coluna cobre (o telhado centra no resto)', () => {
    expect(sideInset({ open: true, width: W })).toBe(EDGE + W);
    expect(sideInset({ open: false, width: W })).toBe(0);
  });
});

describe('a coluna recolhe e abre sozinha na troca de fase', () => {
  test('o jogo começa: recolhe, aberta ou não', () => {
    expect(sideCollapsedAfter('lobby', 'playing', false)).toBe(true);
    expect(sideCollapsedAfter('lobby', 'playing', true)).toBe(true);
  });

  test('o jogo acaba: abre (o "Jogar de novo" está nela)', () => {
    expect(sideCollapsedAfter('playing', 'ended', true)).toBe(false);
    expect(sideCollapsedAfter('playing', 'ended', false)).toBe(false);
  });

  test('de volta ao lobby: abre', () => {
    expect(sideCollapsedAfter('ended', 'lobby', true)).toBe(false);
    expect(sideCollapsedAfter('playing', 'lobby', true)).toBe(false);
  });

  test('sem troca de fase, fica como a pessoa deixou', () => {
    for (const phase of ['lobby', 'playing', 'ended'] as const) {
      expect(sideCollapsedAfter(phase, phase, true)).toBe(true);
      expect(sideCollapsedAfter(phase, phase, false)).toBe(false);
    }
  });

  test('ao chegar na sala (sem fase anterior), vale o que a aba lembrou', () => {
    expect(sideCollapsedAfter(null, 'playing', false)).toBe(false);
    expect(sideCollapsedAfter(null, 'lobby', true)).toBe(true);
  });
});

describe('o telhado com a coluna à esquerda', () => {
  test('a câmera fica no meio do que se vê, à direita da coluna', () => {
    const visible = makeView(1280, 720, 400);
    const view = renderView(visible, 400);
    expect(view.scale).toBe(visible.scale);
    const cam = { x: 300 };
    // o ponto da câmera cai no meio da parte visível
    expect(project({ x: 300, y: 0, z: 0 }, cam, view).x).toBe(400 + (1280 - 400) / 2);
    // e tudo anda a coluna para a direita, com a mesma escala
    const p = { x: 340, y: 10, z: 5 };
    expect(project(p, cam, view).x).toBe(project(p, cam, visible).x + 400);
    expect(project(p, cam, view).y).toBe(project(p, cam, visible).y);
  });

  test('sem coluna, nada muda', () => {
    const visible = makeView(1280, 720);
    expect(renderView(visible, 0)).toEqual(visible);
  });
});
