import { describe, expect, test } from 'bun:test';
import { BOSS_SCALE } from '@guess/protocol';
import { RemoteRoom, type SocketLike } from '../src/lib/room/remote';
import { bossOf, hitTracker, segments } from '../src/lib/room/boss';
import { boltPath, roofline, STRIKE_MS, strikeAt, strikeTarget } from '../src/lib/world/ambient';
import { snapshot } from './snapshots';

describe('a barra de vida do chefão: de onde vem', () => {
  test('o chefão é o bot que manda os pontos; sem ele (ou de um servidor de antes da barra), nenhuma barra', () => {
    expect(bossOf(null)).toBeNull();
    expect(bossOf(snapshot())).toBeNull();
    expect(bossOf(snapshot({ bots: [{ id: 'b1', character: 3 }] }))).toBeNull();
    // servidor de antes da barra: o chefão vem só com a escala
    expect(bossOf(snapshot({ bots: [{ id: 'b2', character: 4, scale: BOSS_SCALE }] }))).toBeNull();
    const room = snapshot({ phase: 'playing', bots: [{ id: 'b1', character: 3 }, { id: 'b2', character: 4, scale: BOSS_SCALE, hp: 4, hpMax: 6 }] });
    expect(bossOf(room)).toEqual({ id: 'b2', character: 4, hp: 4, max: 6 });
  });

  test('pontos tortos ficam dentro da barra', () => {
    expect(bossOf(snapshot({ bots: [{ id: 'b2', character: 4, hp: 9, hpMax: 6 }] }))?.hp).toBe(6);
    expect(bossOf(snapshot({ bots: [{ id: 'b2', character: 4, hp: -2, hpMax: 6 }] }))?.hp).toBe(0);
    expect(bossOf(snapshot({ bots: [{ id: 'b2', character: 4, hp: 2, hpMax: 0 }] }))).toBeNull();
  });

  test('os gomos: um por empurrão que aguenta, cheios os que sobram', () => {
    expect(segments(6, 6)).toEqual([true, true, true, true, true, true]);
    expect(segments(4, 6)).toEqual([true, true, true, true, false, false]);
    expect(segments(0, 6)).toEqual([false, false, false, false, false, false]);
  });

  test('o golpe: avisa quando os pontos do mesmo chefão caem; chegar, trocar de chefão ou nada mudar, não', () => {
    const hit = hitTracker();
    const b = (hp: number, id = 'b2') => ({ id, character: 4, hp, max: 6 });
    expect(hit(null)).toBe(false);
    expect(hit(b(6))).toBe(false); // chegou
    expect(hit(b(6))).toBe(false);
    expect(hit(b(5))).toBe(true);
    expect(hit(b(5))).toBe(false);
    expect(hit(b(0))).toBe(true); // derrubado
    expect(hit(null)).toBe(false); // foi embora
    expect(hit(b(3, 'b9'))).toBe(false); // outro chefão, já machucado
    expect(hit(b(2, 'b9'))).toBe(true);
  });
});

describe('o raio na cidade', () => {
  test('o clarão e o raio: acendem na hora, piscam, e se apagam antes de STRIKE_MS', () => {
    expect(strikeAt(-1)).toEqual({ flash: 0, bolt: 0 });
    expect(strikeAt(0).flash).toBe(1);
    expect(strikeAt(0).bolt).toBe(1);
    // pisca: apaga um instante e volta
    const dark = [...Array(300).keys()].some((t) => strikeAt(t).bolt === 0 && t > 0);
    expect(dark).toBe(true);
    expect(strikeAt(STRIKE_MS)).toEqual({ flash: 0, bolt: 0 });
    for (let t = 0; t < STRIKE_MS; t += 10) {
      const s = strikeAt(t);
      expect(s.flash).toBeGreaterThanOrEqual(0); expect(s.flash).toBeLessThanOrEqual(1);
      expect(s.bolt).toBeGreaterThanOrEqual(0); expect(s.bolt).toBeLessThanOrEqual(1);
    }
  });

  test('o contorno da cidade: a primeira linha com tinta de cada coluna (a altura toda, sem nada)', () => {
    // 3 colunas × 4 linhas, RGBA: a do meio começa na linha 1, a da direita na 3, a da esquerda vazia
    const w = 3, h = 4;
    const data = new Uint8ClampedArray(w * h * 4);
    const paint = (x: number, y: number) => { data[(y * w + x) * 4 + 3] = 255; };
    for (let y = 1; y < h; y++) paint(1, y);
    paint(2, 3);
    expect(roofline(data, w, h)).toEqual([4, 1, 3]);
  });

  test('o alvo: o prédio mais alto perto de onde o chefão estava, sempre dentro da tela', () => {
    // a cidade de perto: um prédio alto na coluna 30 de um ladrilho de 100
    const tops = Array.from({ length: 100 }, (_, i) => (i >= 28 && i <= 32 ? 20 : 120));
    const s = 2, width = 1200;
    // o chefão estava bem na frente da câmera: o alvo fica no meio, e pula para o prédio alto se ele está perto
    const t = strikeTarget({ x: 500, camX: 500, width, scale: s, factor: 0.3, offset: 0, tops, reach: 400 });
    expect(t.x).toBeGreaterThanOrEqual(width * 0.1);
    expect(t.x).toBeLessThanOrEqual(width * 0.9);
    expect(t.top).toBe(20);
    // o chefão estava longe para a direita: o raio ainda cai dentro da tela
    const far = strikeTarget({ x: 99_999, camX: 0, width, scale: s, factor: 0.3, offset: 0, tops, reach: 4 });
    expect(far.x).toBeLessThanOrEqual(width * 0.9);
    expect(far.x).toBeGreaterThanOrEqual(width * 0.1);
  });

  test('o caminho do raio: do céu até o alvo, em ziguezague, sem voltar para cima, igual em toda aba', () => {
    const a = boltPath(7, { x: 100, y: 0 }, { x: 130, y: 200 });
    expect(a.main[0]).toEqual({ x: 100, y: 0 });
    expect(a.main.at(-1)).toEqual({ x: 130, y: 200 });
    expect(a.main.length).toBeGreaterThan(6);
    for (let i = 1; i < a.main.length; i++) expect(a.main[i].y).toBeGreaterThan(a.main[i - 1].y);
    for (const p of a.main) { expect(Number.isInteger(p.x)).toBe(true); expect(Number.isInteger(p.y)).toBe(true); }
    // não é uma reta: o ziguezague sai do caminho
    expect(a.main.some((p) => Math.abs(p.x - (100 + (30 * p.y) / 200)) > 3)).toBe(true);
    expect(a.branches.length).toBeGreaterThan(0);
    for (const br of a.branches) for (let i = 1; i < br.length; i++) expect(br[i].y).toBeGreaterThan(br[i - 1].y);
    expect(boltPath(7, { x: 100, y: 0 }, { x: 130, y: 200 })).toEqual(a);
    expect(boltPath(8, { x: 100, y: 0 }, { x: 130, y: 200 })).not.toEqual(a);
  });
});

describe('RemoteRoom: o chefão derrubado', () => {
  function setup() {
    const ws: SocketLike & { sent: string[] } = { sent: [], send(d) { ws.sent.push(d); }, close() {}, onopen: null, onmessage: null, onclose: null, onerror: null };
    const room = new RemoteRoom({ url: 'ws://x/ws', room: 'ABCD', token: 'token-aaaa' }, { socket: () => ws, clock: { setTimeout: () => 0, clearTimeout: () => {} }, now: () => 0 });
    room.connect(); ws.onopen?.({});
    const receive = (m: unknown) => ws.onmessage?.({ data: JSON.stringify(m) });
    return { room, receive };
  }

  test('quem ouve fica sabendo de qual chefão e onde; torto é ignorado e não avisa quem observa o estado', () => {
    const { room, receive } = setup();
    const got: unknown[] = [];
    const off = room.onBossDown((e) => got.push(e));
    let changes = -1;
    room.watch(() => changes++);
    for (const bad of [{ type: 'bossDown' }, { type: 'bossDown', bot: 'b1', x: 'x' }, { type: 'bossDown', bot: 3, x: 1 }, { type: 'bossDown', bot: 'b1', x: Infinity }]) receive(bad);
    receive({ type: 'bossDown', bot: 'b1', x: 321.5 });
    off();
    receive({ type: 'bossDown', bot: 'b2', x: 10 });
    expect(got).toEqual([{ bot: 'b1', x: 321.5 }]);
    expect(changes).toBe(0);
  });
});
