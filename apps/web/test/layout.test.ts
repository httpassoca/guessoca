import { describe, expect, test } from 'bun:test';
import { project } from '@guess/world';
import { besideSide, BOSS_BAR_MIN, BOSS_BAR_W, bossBarBox, CHAT_H, CHAT_W, clampNotepadSize, EDGE, GAP, NOTEPAD_H, NOTEPAD_MIN_H, NOTEPAD_MIN_W, NOTEPAD_SIZE, NOTEPAD_STEP, NOTEPAD_W, notepadBox, notepadMax, resizeNotepad, sideCollapsedAfter, sideInset, TOP_HUD_H } from '../src/lib/layout';
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

  test('o bloco com outra largura pedida: a mesma regra, com a largura pedida no lugar da padrão', () => {
    expect(notepadBox({ open: false, width: W }, 1600, 520)).toEqual({ left: EDGE, width: 520 });
    expect(notepadBox({ open: true, width: W }, 900, 520)).toEqual({ left: EDGE + W + GAP, width: 900 - (EDGE + W + GAP) - EDGE });
    expect(notepadBox({ open: true, width: W }, 600, 520)).toEqual({ left: EDGE, width: 520 });
  });

  test('quanto o bloco pode crescer: até metade da tela, sem chegar no campo da fala nem no alto', () => {
    // tela larga, coluna recolhida: metade da largura e metade da altura
    expect(notepadMax({ open: false, width: W }, 1920, 1080)).toEqual({ w: 960, h: 540 });
    // com a coluna aberta, o campo da fala (o mais largo) limita antes da metade
    expect(notepadMax({ open: true, width: W }, 1600, 900)).toEqual({ w: 1600 - (EDGE + W + GAP) - EDGE - GAP - CHAT_W, h: 450 });
    // tela baixa: nunca passa do que fica em cima
    expect(notepadMax({ open: false, width: W }, 1920, 300).h).toBe(NOTEPAD_MIN_H); // nem o mínimo cabe: fica o mínimo
    for (const [vw, vh] of [[1280, 720], [1366, 768], [1920, 1080], [2560, 1440]]) for (const open of [true, false]) {
      const max = notepadMax({ open, width: W }, vw, vh);
      expect(max.w).toBeGreaterThanOrEqual(NOTEPAD_MIN_W);
      expect(max.h).toBeGreaterThanOrEqual(NOTEPAD_MIN_H);
      expect(max.h).toBeLessThanOrEqual(Math.max(NOTEPAD_MIN_H, vh - EDGE - TOP_HUD_H));
      expect(max.h).toBeLessThanOrEqual(Math.max(NOTEPAD_MIN_H, vh / 2));
    }
  });

  test('o tamanho padrão já é o que era e cabe nas telas comuns', () => {
    expect(NOTEPAD_SIZE).toEqual({ w: NOTEPAD_W, h: NOTEPAD_H });
    expect(NOTEPAD_MIN_W).toBeLessThanOrEqual(NOTEPAD_W);
    expect(NOTEPAD_MIN_H).toBeLessThanOrEqual(NOTEPAD_H);
    expect(clampNotepadSize(NOTEPAD_SIZE, { open: false, width: W }, 1366, 768)).toEqual(NOTEPAD_SIZE);
  });

  test('o tamanho guardado é preso entre o mínimo e o máximo da tela de agora', () => {
    const side = { open: false, width: W };
    expect(clampNotepadSize({ w: 100, h: 50 }, side, 1920, 1080)).toEqual({ w: NOTEPAD_MIN_W, h: NOTEPAD_MIN_H });
    expect(clampNotepadSize({ w: 5000, h: 5000 }, side, 1920, 1080)).toEqual({ w: 960, h: 540 });
    expect(clampNotepadSize({ w: 500, h: 300 }, side, 1920, 1080)).toEqual({ w: 500, h: 300 });
    // a tela encolheu: encolhe junto, sem esquecer o que foi pedido (o pedido é outro valor)
    expect(clampNotepadSize({ w: 900, h: 500 }, side, 1280, 720)).toEqual({ w: notepadMax(side, 1280, 720).w, h: 360 });
  });

  test('arrastar a alça: em degraus de pixel, para a direita e para cima cresce, só nos lados pegos', () => {
    const side = { open: false, width: W };
    const start = { w: 400, h: 240 };
    // o canto: os dois lados; para cima é dy negativo
    expect(resizeNotepad(start, 40, -24, { w: true, h: true }, side, 1920, 1080)).toEqual({ w: 440, h: 264 });
    // em degraus de NOTEPAD_STEP: um movimento pequeno não muda nada, um quase-degrau arredonda
    expect(resizeNotepad(start, 3, -3, { w: true, h: true }, side, 1920, 1080)).toEqual(start);
    expect(resizeNotepad(start, NOTEPAD_STEP - 2, 0, { w: true, h: true }, side, 1920, 1080)).toEqual({ w: 400 + NOTEPAD_STEP, h: 240 });
    // a borda de cima só mexe na altura, a da direita só na largura
    expect(resizeNotepad(start, 80, -80, { w: false, h: true }, side, 1920, 1080)).toEqual({ w: 400, h: 320 });
    expect(resizeNotepad(start, 80, -80, { w: true, h: false }, side, 1920, 1080)).toEqual({ w: 480, h: 240 });
    // sempre preso aos limites
    expect(resizeNotepad(start, -1000, 1000, { w: true, h: true }, side, 1920, 1080)).toEqual({ w: NOTEPAD_MIN_W, h: NOTEPAD_MIN_H });
    expect(resizeNotepad(start, 5000, -5000, { w: true, h: true }, side, 1920, 1080)).toEqual({ w: 960, h: 540 });
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

describe('a barra de vida do chefão, embaixo', () => {
  const W = 480;
  /** não encosta no bloco (aberto ou a aba dele) nem no campo da fala (aberto, o mais largo) */
  const clear = (box: { left: number; width: number; bottom: number }, side: { open: boolean; width: number }, vw: number, minimized: boolean, padW = NOTEPAD_W) => {
    const pad = notepadBox(side, vw, padW);
    const padRight = pad.left + (minimized ? 160 : pad.width);
    const chatLeft = vw - EDGE - CHAT_W;
    expect(box.left).toBeGreaterThanOrEqual(padRight + GAP);
    expect(box.left + box.width).toBeLessThanOrEqual(vw - EDGE);
    if (box.bottom === EDGE) expect(box.left + box.width).toBeLessThanOrEqual(chatLeft - GAP);
    else expect(box.bottom).toBeGreaterThanOrEqual(EDGE + CHAT_H + GAP);
    expect(box.width).toBeGreaterThanOrEqual(BOSS_BAR_MIN);
    expect(box.width).toBeLessThanOrEqual(BOSS_BAR_W);
  };

  test('numa tela larga: no meio da tela, na linha de baixo, do tamanho cheio', () => {
    const box = bossBarBox({ open: false, width: W }, 1920, false);
    expect(box.bottom).toBe(EDGE);
    expect(box.width).toBe(BOSS_BAR_W);
    expect(box.left + box.width / 2).toBe(960);
    clear(box, { open: false, width: W }, 1920, false);
  });

  test('nas telas comuns, com a coluna aberta ou não e o bloco aberto ou não, nunca encosta em nada', () => {
    for (const vw of [1280, 1366, 1440, 1536, 1600, 1920, 2560]) for (const open of [true, false]) for (const minimized of [true, false]) {
      clear(bossBarBox({ open, width: W }, vw, minimized), { open, width: W }, vw, minimized);
    }
  });

  test('com o bloco do maior tamanho que cabe, a barra ainda foge dele e do campo da fala', () => {
    for (const vw of [1280, 1366, 1440, 1600, 1920, 2560]) for (const open of [true, false]) for (const minimized of [true, false]) {
      const side = { open, width: W };
      for (const padW of [NOTEPAD_MIN_W, notepadMax(side, vw, 1080).w]) clear(bossBarBox(side, vw, minimized, padW), side, vw, minimized, padW);
    }
  });

  test('o bloco mais largo empurra a barra para a direita', () => {
    const side = { open: false, width: W };
    const narrow = bossBarBox(side, 1920, false);
    const wide = bossBarBox(side, 1920, false, 900);
    expect(wide.left).toBeGreaterThanOrEqual(EDGE + 900 + GAP);
    expect(wide.left).toBeGreaterThan(narrow.left);
    // minimizado, a largura do bloco não importa: só a aba
    expect(bossBarBox(side, 1920, true, 900)).toEqual(bossBarBox(side, 1920, true));
  });

  test('sem lugar na linha de baixo (1280 com a coluna aberta), sobe para cima do campo da fala', () => {
    const box = bossBarBox({ open: true, width: W }, 1280, false);
    expect(box.bottom).toBe(EDGE + CHAT_H + GAP);
    expect(box.left + box.width).toBe(1280 - EDGE);
  });
});
