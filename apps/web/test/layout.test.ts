import { describe, expect, test } from 'bun:test';
import { project } from '@guess/world';
import { besideSide, EDGE, GAP, NOTEPAD_W, notepadBox, sideInset } from '../src/lib/layout';
import { makeView, renderView } from '../src/lib/world/view';

describe('o que fica ao lado da coluna', () => {
  test('com a coluna aberta, logo à direita dela; recolhida, no canto', () => {
    expect(besideSide({ open: true, width: 380 })).toBe(EDGE + 380 + GAP);
    expect(besideSide({ open: false, width: 380 })).toBe(EDGE);
    expect(besideSide({ open: true, width: 0 })).toBe(EDGE); // ainda sem medida
  });

  test('o bloco: preso embaixo, ao lado da coluna, sem sair da tela', () => {
    expect(notepadBox({ open: true, width: 380 }, 1600)).toEqual({ left: EDGE + 380 + GAP, width: NOTEPAD_W });
    expect(notepadBox({ open: false, width: 380 }, 1600)).toEqual({ left: EDGE, width: NOTEPAD_W });
    // tela estreita: o bloco encolhe até caber
    expect(notepadBox({ open: true, width: 380 }, 600)).toEqual({ left: EDGE + 380 + GAP, width: 600 - (EDGE + 380 + GAP) - EDGE });
    // nem assim cabe: vai para o canto por cima da coluna
    expect(notepadBox({ open: true, width: 380 }, 500)).toEqual({ left: EDGE, width: NOTEPAD_W });
    expect(notepadBox({ open: true, width: 380 }, 300)).toEqual({ left: EDGE, width: 300 - 2 * EDGE });
  });

  test('quanto da esquerda a coluna cobre (o telhado centra no resto)', () => {
    expect(sideInset({ open: true, width: 380 })).toBe(EDGE + 380);
    expect(sideInset({ open: false, width: 380 })).toBe(0);
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
