import { describe, expect, test } from 'bun:test';
import {
  AMBIENT, barSign, carsAt, drip, hash, inPuddle, lightningFlash, meteorAt, navLights, occurrence, planeAt, puddleGlow, puff,
  ripples, searchlightAngle, shownPane, sign24h, sirenAt, skySpeed, speedUp, splashes, thunderAt, twinkleOn, windowFrame, windowId,
} from '../src/lib/world/ambient';

const MIN = 60_000;
/** os começos de um evento ao longo de `span` ms, olhando de `step` em `step` */
function starts(o: Parameters<typeof occurrence>[1], span: number, step = 100): number[] {
  const out: number[] = [];
  for (let now = 0; now < span; now += step) {
    const e = occurrence(now, o);
    if (e && !out.includes(e.start)) out.push(e.start);
  }
  return out;
}
const gaps = (xs: number[]) => xs.slice(1).map((x, i) => x - xs[i]);

describe('o sorteio sem sorteio', () => {
  test('hash: entre 0 e 1, sempre igual para os mesmos números, diferente para outros', () => {
    expect(hash(1, 2, 3)).toBe(hash(1, 2, 3));
    expect(hash(1, 2, 3)).not.toBe(hash(3, 2, 1));
    for (let i = 0; i < 1000; i++) { const h = hash(i, 7); expect(h).toBeGreaterThanOrEqual(0); expect(h).toBeLessThan(1); }
  });

  test('occurrence: cada evento dura `dur` e os intervalos ficam em every ± jitter', () => {
    const o = { every: 10_000, jitter: 4000, dur: 3000, salt: 9 };
    const s = starts(o, 20 * MIN);
    expect(s.length).toBeGreaterThan(100);
    for (const g of gaps(s)) { expect(g).toBeGreaterThanOrEqual(6000 - 100); expect(g).toBeLessThanOrEqual(14_000 + 100); }
    const e = occurrence(s[3] + 1500, o)!;
    expect(e.start).toBe(s[3]);
    expect(e.t).toBe(1500);
    expect(occurrence(s[3] + 3001, o)?.start).not.toBe(s[3]);
  });

  test('occurrence com chance: só uma parte das janelas tem evento', () => {
    const s = starts({ every: 1000, jitter: 400, dur: 100, p: 0.3, salt: 2 }, 1000 * 1000, 50);
    expect(s.length).toBeGreaterThan(200);
    expect(s.length).toBeLessThan(400);
  });
});

describe('as janelas vivas', () => {
  const ids = Array.from({ length: 300 }, (_, i) => windowId(i % 3, i % 40, Math.floor(i / 40)));
  const bases = ids.map((_, i) => (['d', 'd', 'l', 'd', 'b', 'd', 't'] as const)[i % 7]);

  test('ids diferentes para janelas diferentes', () => {
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('uma parte das janelas fica ao contrário do desenho (quebra a repetição de três andares)', () => {
    const flipped = ids.filter((id, i) => shownPane(bases[i], id, 1000) !== bases[i]).length;
    expect(flipped / ids.length).toBeGreaterThan(0.1);
    expect(flipped / ids.length).toBeLessThan(0.35);
  });

  test('acende ou apaga devagar: no mapa todo, uma troca a cada poucos segundos', () => {
    let changes = 0;
    const span = 60 * MIN;
    let prev = ids.map((id, i) => shownPane(bases[i], id, 0));
    for (let now = 1000; now <= span; now += 1000) {
      const cur = ids.map((id, i) => shownPane(bases[i], id, now));
      changes += cur.filter((p, i) => p !== prev[i]).length;
      prev = cur;
    }
    const every = span / changes / 1000;
    expect(every).toBeGreaterThan(1.5);
    expect(every).toBeLessThan(10);
  });

  test('apagada vira acesa, persiana ou televisão; acesa vira apagada', () => {
    for (let i = 0; i < ids.length; i++) for (const now of [0, 5 * MIN, 30 * MIN]) {
      const p = shownPane(bases[i], ids[i], now);
      if (p !== bases[i]) expect(bases[i] === 'd' ? ['l', 'b', 't'] : ['d']).toContain(p);
    }
  });

  test('igual ao desenho e parada: nada por cima', () => {
    const i = bases.findIndex((b, j) => b === 'd' && shownPane(b, ids[j], 0) === 'd');
    expect(windowFrame('d', ids[i], 0)).toBeNull();
  });

  test('a televisão tremeluz entre três brilhos, e às vezes alguém passa numa janela acesa', () => {
    const seen = new Set<string | null>();
    const walks = new Set<string>();
    for (let i = 0; i < ids.length; i++) for (let now = 0; now < 5 * MIN; now += 97) {
      const f = windowFrame(bases[i], ids[i], now);
      seen.add(f);
      if (f?.startsWith('win-walk-')) walks.add(f);
    }
    expect(seen).toContain('win-t2');
    expect(seen).toContain('win-t3');
    expect([...walks].sort()).toEqual(['win-walk-0', 'win-walk-1', 'win-walk-2', 'win-walk-3', 'win-walk-4']);
  });

  test('a silhueta é rara: menos de 5% do tempo numa janela acesa', () => {
    const lit = ids.filter((id, i) => bases[i] === 'l');
    let walking = 0, total = 0;
    for (const id of lit) for (let now = 0; now < 10 * MIN; now += 250) {
      if (shownPane('l', id, now) !== 'l') continue;
      total++;
      if (windowFrame('l', id, now)?.startsWith('win-walk')) walking++;
    }
    expect(walking / total).toBeGreaterThan(0.001);
    expect(walking / total).toBeLessThan(0.05);
  });
});

describe('a cidade ao fundo', () => {
  test('umas janelas piscam devagar: cada uma troca a cada 15–40 s, no máximo', () => {
    let changes = 0;
    const n = 20, span = 20 * MIN;
    for (let i = 0; i < n; i++) {
      let prev = twinkleOn(true, 0, i, 0);
      for (let now = 500; now < span; now += 500) { const cur = twinkleOn(true, 0, i, now); if (cur !== prev) changes++; prev = cur; }
    }
    const every = (span * n) / changes / 1000;
    expect(every).toBeGreaterThan(20);
    expect(every).toBeLessThan(120);
  });
});

describe('os letreiros falham cada um do seu jeito', () => {
  test('BAR: o R zumbe em rajadas; quase sempre aceso', () => {
    const frames = Array.from({ length: 6000 }, (_, i) => barSign(i * 50));
    const on = frames.filter((f) => f === 'sign-bar').length / frames.length;
    expect(on).toBeGreaterThan(0.85);
    expect(frames).toContain('sign-bar-flicker');
  });

  test('24H: às vezes apaga inteiro e volta gaguejando', () => {
    const frames = Array.from({ length: 20_000 }, (_, i) => sign24h(i * 50));
    expect(frames).toContain('sign-24h-off');
    expect(frames).toContain('sign-24h-flicker');
    expect(frames.filter((f) => f === 'sign-24h').length / frames.length).toBeGreaterThan(0.85);
  });
});

describe('o céu', () => {
  test('o avião passa a cada 40–90 s', () => {
    const s = starts(AMBIENT.plane, 60 * MIN, 250);
    for (const g of gaps(s)) { expect(g).toBeGreaterThanOrEqual(40_000 - 250); expect(g).toBeLessThanOrEqual(90_000 + 250); }
    const p = planeAt(s[2] + AMBIENT.plane.dur / 2)!;
    expect(p.u).toBeCloseTo(0.5, 2);
    expect([1, -1]).toContain(p.dir);
    expect(p.alt).toBeGreaterThanOrEqual(0);
    expect(p.alt).toBeLessThanOrEqual(1);
  });

  test('as luzes do avião piscam: o estrobo branco é curto', () => {
    const l = Array.from({ length: 1000 }, (_, i) => navLights(i * 10));
    const strobe = l.filter((x) => x.strobe).length / l.length;
    expect(strobe).toBeGreaterThan(0.03);
    expect(strobe).toBeLessThan(0.2);
    expect(l.some((x) => x.red) && l.some((x) => !x.red)).toBe(true);
  });

  test('o relâmpago é muito raro (3–5 min) e nunca no lobby; dois clarões e o trovão depois', () => {
    const s = starts(AMBIENT.lightning, 120 * MIN, 50);
    for (const g of gaps(s)) { expect(g).toBeGreaterThanOrEqual(3 * MIN - 100); expect(g).toBeLessThanOrEqual(5 * MIN + 100); }
    const t0 = s[1];
    expect(lightningFlash(t0 + 20, false)).toBeGreaterThan(0.5);
    expect(lightningFlash(t0 + 20, true)).toBe(0);
    const bright = Array.from({ length: 40 }, (_, i) => lightningFlash(t0 + i * 10, false) > 0);
    // aceso, apagado, aceso de novo: dois clarões
    const flips = bright.slice(1).filter((b, i) => b !== bright[i]).length;
    expect(flips).toBeGreaterThanOrEqual(3);
    const th = thunderAt(t0)!;
    expect(th).toBeGreaterThan(t0 + 1000);
    expect(th).toBeLessThan(t0 + 4000);
  });

  test('a estrela cadente é rara e fica longe do meio de cima', () => {
    let n = 0;
    for (let now = 0; now < 30 * MIN; now += 100) {
      const m = meteorAt(now);
      if (!m) continue;
      n++;
      expect(m.x0 < 0.32 || m.x0 > 0.68).toBe(true);
    }
    expect(n).toBeGreaterThan(0);
    expect(n * 100).toBeLessThan(0.02 * 30 * MIN);
  });

  test('o holofote varre devagar, sem passar de ~35° da vertical', () => {
    for (let now = 0; now < 5 * MIN; now += 333) expect(Math.abs(searchlightAngle(now))).toBeLessThan(0.62);
    expect(searchlightAngle(0)).not.toBeCloseTo(searchlightAngle(4000), 2);
  });

  test('o tempo do céu acelera só em desenvolvimento, com ?ceu=N', () => {
    expect(skySpeed('?ceu=20', 'localhost')).toBe(20);
    expect(skySpeed('?ceu=20&dev', 'guess.passoca.dev')).toBe(20);
    expect(skySpeed('?ceu=20', 'guess.passoca.dev')).toBe(1);
    expect(skySpeed('', 'localhost')).toBe(1);
    expect(skySpeed('?ceu=abc', 'localhost')).toBe(1);
    const o = speedUp(AMBIENT.lightning, 20);
    expect(o.every).toBeLessThan(AMBIENT.lightning.every);
    expect(o.dur).toBe(AMBIENT.lightning.dur);
    expect(o.every).toBeGreaterThan(o.dur + o.jitter);
  });
});

describe('a rua', () => {
  test('carros vão e vêm pelas duas faixas, nunca mais que quatro', () => {
    let seen = 0;
    const dirs = new Set<number>();
    for (let now = 0; now < 10 * MIN; now += 500) {
      const cs = carsAt(now);
      expect(cs.length).toBeLessThanOrEqual(4);
      seen += cs.length;
      for (const c of cs) { dirs.add(c.dir); expect([0, 1]).toContain(c.lane); }
    }
    expect(seen).toBeGreaterThan(100);
    expect([...dirs].sort()).toEqual([-1, 1]);
  });

  test('a sirene passa de vez em quando, alternando vermelho e azul, entrando e saindo devagar', () => {
    const s = starts(AMBIENT.siren, 60 * MIN, 250);
    expect(s.length).toBeGreaterThanOrEqual(12);
    expect(s.length).toBeLessThanOrEqual(26);
    const mid = sirenAt(s[0] + AMBIENT.siren.dur / 2)!;
    expect(mid.amount).toBeCloseTo(1, 5);
    expect(sirenAt(s[0] + 200)!.amount).toBeLessThan(0.3);
    const colors = new Set(Array.from({ length: 20 }, (_, i) => sirenAt(s[0] + 3000 + i * 100)!.red));
    expect(colors.size).toBe(2);
  });
});

describe('a chuva que encosta', () => {
  test('respingos: cada canal mostra dois quadros curtos e some; posições entre 0 e 1', () => {
    let shown = 0, total = 0;
    for (let now = 0; now < 20_000; now += 37) {
      const sp = splashes(now, 24);
      total += 24;
      shown += sp.length;
      for (const p of sp) {
        expect([0, 1]).toContain(p.frame);
        for (const v of [p.u, p.v, p.pick]) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
      }
    }
    expect(shown / total).toBeGreaterThan(0.1);
    expect(shown / total).toBeLessThan(0.4);
  });

  test('anéis nas poças: três quadros abrindo, dentro da poça', () => {
    const frames = new Set<number>();
    for (let now = 0; now < 10_000; now += 23) for (const r of ripples(now, 3, 2)) {
      frames.add(r.frame);
      expect(Math.abs(r.u)).toBeLessThanOrEqual(0.4);
      expect(Math.abs(r.v)).toBeLessThanOrEqual(0.4);
      expect(r.puddle).toBeLessThan(3);
    }
    expect([...frames].sort()).toEqual([0, 1, 2]);
  });

  test('a gota pendura, cai acelerando e some ao chegar', () => {
    const states = Array.from({ length: 400 }, (_, i) => drip(i * 20, 5, 30));
    expect(states.some((s) => s?.phase === 'hang')).toBe(true);
    const falling = states.filter((s) => s?.phase === 'fall').map((s) => s!.dy);
    expect(falling.length).toBeGreaterThan(3);
    for (const dy of falling) { expect(dy).toBeGreaterThanOrEqual(0); expect(dy).toBeLessThanOrEqual(30); }
    expect(states.some((s) => s === null)).toBe(true);
  });

  test('o vapor sobe, vai com o vento para a esquerda, cresce e apaga', () => {
    const a = puff(0), b = puff(AMBIENT.puffMs * 0.9);
    expect(b.rise).toBeGreaterThan(a.rise);
    expect(b.drift).toBeLessThan(a.drift);
    expect(b.frame).toBeGreaterThan(a.frame);
    expect(b.alpha).toBeLessThan(a.alpha);
    expect(b.frame).toBeLessThanOrEqual(3);
  });

  test('pisar na poça: dentro da elipse dela, no chão', () => {
    const p = { x: 70, z: 14, w: 14, h: 5 };
    // a poça sobe da âncora (meio de baixo) h linhas da tela = h / 0,6 unidades de fundo
    expect(inPuddle(70, 14 + 4, p)).toBe(true);
    expect(inPuddle(76, 14 + 4, p)).toBe(true);
    expect(inPuddle(80, 18, p)).toBe(false);
    expect(inPuddle(70, 30, p)).toBe(false);
  });

  test('a poça perto de um letreiro pega a cor dele; longe, nenhuma', () => {
    const signs = [{ roof: 0, x: 24, color: 0xff3cc8 }, { roof: 1, x: 352, color: 0x3ef0ff }];
    expect(puddleGlow({ roof: 0, x: 70 }, signs)).toBe(0xff3cc8);
    expect(puddleGlow({ roof: 1, x: 360 }, signs)).toBe(0x3ef0ff);
    expect(puddleGlow({ roof: 1, x: 520 }, signs)).toBeNull();
    expect(puddleGlow({ roof: 2, x: 30 }, signs)).toBeNull();
  });
});
