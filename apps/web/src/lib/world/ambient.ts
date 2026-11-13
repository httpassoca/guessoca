/**
 * A vida no telhado (issue #70), pura: quando cada coisa acontece. Janelas acendendo e apagando, a televisão
 * tremeluzindo, alguém passando na janela, os letreiros falhando, o avião, a estrela cadente, o relâmpago, o holofote,
 * os carros e a sirene lá embaixo, e a chuva que encosta (respingos, anéis nas poças, gotas, o vapor da chaminé).
 *
 * Nada é sorteado por quadro: tudo sai do relógio (`now`, ms) e de um `hash` dos números de cada coisa, como o
 * `neonFlicker` de `dressing.ts`. A mesma hora dá sempre a mesma cena, sem estado, e o custo por quadro é só a conta.
 * Cada navegador tem o seu céu (o relógio é o da aba); ninguém precisa ver o mesmo avião.
 *
 * Quem desenha: `windows.ts` (janelas, sirene nas fachadas), `skylife.ts` (céu e rua), `rooflife.ts` (chuva que encosta,
 * hélice, vapor) e `platforms.ts` (letreiros, varal). Testado em `apps/web/test/world-ambient.test.ts`. Os números são
 * no olho; "raro" tem que continuar raro.
 */
import { DEPTH_K } from '@guess/world';

/** Um passo da mistura do `hash`: junta `n` ao estado `h` e embaralha. */
function mix(h: number, n: number): number {
  h = Math.imul(h ^ (n | 0), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return h ^ (h >>> 16);
}

/**
 * Um número de 0 a 1 que só depende dos números dados (sem sorteio). Até quatro números; os que faltam contam como 0.
 * Aridade fixa, sem `...`: roda centenas de vezes por quadro e não pode alocar.
 */
export function hash(a: number, b = 0, c = 0, d = 0): number {
  return (mix(mix(mix(mix(0x9e3779b9, a), b), c), d) >>> 0) / 4294967296;
}

/**
 * Um evento que se repete: em média a cada `every` ms, cada um adiantado ou atrasado até `jitter / 2` (então de um ao
 * outro vai de `every − jitter` a `every + jitter`), durando `dur` ms; com `p`, só essa fração das vezes acontece.
 * `salt` separa um evento do outro. Precisa de `dur ≤ every − jitter` (um não encosta no próximo).
 */
export interface Every { every: number; jitter: number; dur: number; p?: number; salt: number }

/** O evento em andamento em `now`: qual (`k`), quando começou, e há quanto tempo (`t`, ms); ou null. */
export interface Occurrence { k: number; start: number; t: number; dur: number }

export function occurrence(now: number, o: Every): Occurrence | null {
  const k0 = Math.floor(now / o.every);
  for (let k = k0 - 1; k <= k0 + 1; k++) {
    if (o.p !== undefined && hash(k, o.salt, 99) >= o.p) continue;
    const start = Math.round(k * o.every + (hash(k, o.salt) - 0.5) * o.jitter);
    if (now >= start && now < start + o.dur) return { k, start, t: now - start, dur: o.dur };
  }
  return null;
}

/** Os tempos de tudo, no olho. */
export const AMBIENT = {
  /** o avião: a cada 40–90 s, 28 s atravessando a tela */
  plane: { every: 65_000, jitter: 25_000, dur: 28_000, salt: 1 },
  /** a estrela cadente: uma janela a cada 30–50 s, e só em 40% delas; 0,8 s riscando */
  meteor: { every: 40_000, jitter: 20_000, dur: 800, p: 0.4, salt: 2 },
  /** o relâmpago: a cada 3–5 min; os dois clarões cabem em 0,32 s */
  lightning: { every: 240_000, jitter: 60_000, dur: 320, salt: 3 },
  /** a sirene: a cada 2,3–4,3 min, 16 s passando */
  siren: { every: 200_000, jitter: 60_000, dur: 16_000, salt: 4 },
  /** a vida de uma nuvenzinha de vapor, ms */
  puffMs: 3600,
} as const satisfies Record<string, Every | number>;

/**
 * O tempo do céu mais depressa, para ver o avião, o relâmpago e a sirene sem esperar minutos: `?ceu=N` (1–120) na
 * barra de endereço, só em localhost ou com `?dev`. Fora disso, 1.
 */
export function skySpeed(search: string, host: string): number {
  const q = new URLSearchParams(search);
  const dev = host === 'localhost' || host === '127.0.0.1' || q.has('dev');
  const n = Number(q.get('ceu') ?? '');
  return dev && Number.isFinite(n) && n >= 1 ? Math.min(120, Math.floor(n)) : 1;
}

/** O evento `F` vezes mais frequente (mesma duração), sem um encostar no outro. */
export function speedUp(o: Every, F: number): Every {
  if (F <= 1) return o;
  const jitter = o.jitter / F;
  return { ...o, jitter, every: Math.max(o.every / F, o.dur + jitter + 2000) };
}

// --- janelas ------------------------------------------------------------------------------------------------------------

/** O desenho de uma janela da fachada: apagada, acesa, persiana ou televisão (as letras de `WINDOWS` em `rooftop.ts`). */
export type Pane = 'd' | 'l' | 'b' | 't';

const WINDOW = {
  /** a cada época, a chance de a janela estar ao contrário do desenho */
  flipP: 0.22,
  /** cada janela tem a sua época, de 4 a 12 min: no mapa todo, uma troca a cada poucos segundos */
  periodMin: 240_000,
  periodMax: 720_000,
  /** a televisão troca de brilho a cada 140–260 ms */
  tvMin: 140,
  tvSpan: 120,
  /** alguém passando: uma janela de 26 s, em 6% delas, levando 2 s em 5 passos */
  walkEvery: 26_000,
  walkP: 0.06,
  walkMs: 2000,
  walkFrames: 5,
} as const;

/** O número de uma janela: o telhado, a coluna e o andar contados de verdade (não o ladrilho), para não repetir. */
export const windowId = (roof: number, col: number, floor: number) => (roof * 4096 + floor) * 4096 + col;

/** O desenho que a janela `id` mostra agora: o da fachada, ou ao contrário dele por uma época. */
export function shownPane(base: Pane, id: number, now: number): Pane {
  const period = WINDOW.periodMin + hash(id, 11) * (WINDOW.periodMax - WINDOW.periodMin);
  const epoch = Math.floor((now + hash(id, 12) * period) / period);
  if (hash(id, epoch, 13) >= WINDOW.flipP) return base;
  if (base !== 'd') return 'd';
  const r = hash(id, 14);
  return r < 0.6 ? 'l' : r < 0.85 ? 'b' : 't';
}

/**
 * O quadro para pôr por cima da janela (`win-*` na folha), ou null quando o desenho da fachada já basta: a janela ao
 * contrário, a televisão tremeluzindo (`win-t`, `win-t2`, `win-t3`), ou alguém passando numa janela acesa
 * (`win-walk-0..4`, de trás para a frente para quem vai para o outro lado).
 */
export function windowFrame(base: Pane, id: number, now: number): string | null {
  const p = shownPane(base, id, now);
  if (p === 't') {
    const slot = Math.floor(now / (WINDOW.tvMin + hash(id, 15) * WINDOW.tvSpan));
    const r = hash(id, slot, 16);
    const f = r < 0.7 ? 'win-t' : r < 0.88 ? 'win-t2' : 'win-t3';
    return f === 'win-t' && base === 't' ? null : f;
  }
  if (p === 'l') {
    const tt = now + hash(id, 17) * WINDOW.walkEvery;
    const k = Math.floor(tt / WINDOW.walkEvery);
    const age = tt - k * WINDOW.walkEvery;
    if (age < WINDOW.walkMs && hash(id, k, 18) < WINDOW.walkP) {
      let i = Math.min(WINDOW.walkFrames - 1, Math.floor((age / WINDOW.walkMs) * WINDOW.walkFrames));
      if (hash(id, k, 19) < 0.5) i = WINDOW.walkFrames - 1 - i;
      return `win-walk-${i}`;
    }
  }
  return p === base ? null : `win-${p}`;
}

/**
 * Uma janela da cidade ao fundo que pisca (as de `twinkle` no atlas): em cada época de 15–40 s ela fica como nasceu ou
 * ao contrário, meio a meio. `layer` separa a cidade de longe da de perto; devolve se está acesa agora.
 */
export function twinkleOn(lit: boolean, layer: number, i: number, now: number): boolean {
  const period = 15_000 + hash(layer, i, 61) * 25_000;
  const epoch = Math.floor((now + hash(layer, i, 62) * period) / period);
  return hash(layer, i, epoch, 63) < 0.5 ? !lit : lit;
}

// --- letreiros ----------------------------------------------------------------------------------------------------------

/** O BAR zumbe: em 60% dos ciclos de 9 s, uma rajada de 1,2 s em que o R pisca a cada 60 ms. */
export function barSign(now: number): 'sign-bar' | 'sign-bar-flicker' {
  const cycle = Math.floor(now / 9000);
  const t = now - cycle * 9000;
  if (hash(cycle, 21) >= 0.6 || t >= 1200) return 'sign-bar';
  return hash(cycle, Math.floor(t / 60), 22) < 0.5 ? 'sign-bar-flicker' : 'sign-bar';
}

/**
 * O 24H apaga inteiro de vez em quando: em 35% dos ciclos de 23 s, 1,8 s escuro e depois 0,8 s voltando aos trancos
 * (o H por último).
 */
export function sign24h(now: number): 'sign-24h' | 'sign-24h-flicker' | 'sign-24h-off' {
  const cycle = Math.floor(now / 23_000);
  const t = now - cycle * 23_000;
  if (hash(cycle, 23) >= 0.35 || t >= 2600) return 'sign-24h';
  if (t < 1800) return 'sign-24h-off';
  const r = hash(cycle, Math.floor(t / 80), 24);
  return r < 0.6 ? 'sign-24h-flicker' : r < 0.8 ? 'sign-24h-off' : 'sign-24h';
}

// --- céu ----------------------------------------------------------------------------------------------------------------

/** O avião em `now`: quanto já atravessou (`u`, 0–1), para que lado, a altura (`alt`, 0–1 da faixa dele) e há quanto tempo. */
export function planeAt(now: number, F = 1): { u: number; dir: 1 | -1; alt: number; t: number } | null {
  const e = occurrence(now, speedUp(AMBIENT.plane, F));
  if (!e) return null;
  return { u: e.t / e.dur, dir: hash(e.k, 5) < 0.5 ? 1 : -1, alt: hash(e.k, 6), t: e.t };
}

/** As luzes do avião `t` ms depois de aparecer: vermelha e verde 0,9 s de cada 1,2 s, o estrobo branco 70 ms por segundo. */
export function navLights(t: number): { red: boolean; green: boolean; strobe: boolean } {
  const on = t % 1200 < 900;
  return { red: on, green: on, strobe: t % 1000 < 70 };
}

/**
 * A estrela cadente em `now`: de onde sai (`x0` em fração da largura, só nos lados, longe do relógio no meio de cima;
 * `y0` em fração da altura do céu), para que lado (para fora) e quanto já andou (`u`).
 */
export function meteorAt(now: number, F = 1): { x0: number; y0: number; dx: 1 | -1; u: number } | null {
  const e = occurrence(now, speedUp(AMBIENT.meteor, F));
  if (!e) return null;
  const left = hash(e.k, 7) < 0.5;
  const x0 = left ? 0.06 + hash(e.k, 8) * 0.24 : 0.7 + hash(e.k, 8) * 0.24;
  return { x0, y0: 0.12 + hash(e.k, 9) * 0.25, dx: left ? -1 : 1, u: e.t / e.dur };
}

/** O clarão do relâmpago (0–1): dois clarões, o segundo mais fraco; nunca no lobby. */
export function lightningFlash(now: number, lobby: boolean, F = 1): number {
  if (lobby) return 0;
  const e = occurrence(now, speedUp(AMBIENT.lightning, F));
  if (!e) return 0;
  const t = e.t;
  return t < 60 ? 1 : t < 130 ? 0 : t < 220 ? 0.6 : t < 300 ? 0.25 : 0;
}

/** Quando o trovão do relâmpago em andamento em `now` chega (1,5–3,5 s depois do clarão, longe), ou null. */
export function thunderAt(now: number, F = 1): number | null {
  const e = occurrence(now, speedUp(AMBIENT.lightning, F));
  return e ? e.start + 1500 + hash(e.k, 10) * 2000 : null;
}

// --- o raio do chefão derrubado ----------------------------------------------------------------------------------------

/**
 * Quanto dura o raio que cai na cidade quando o chefão é derrubado (o servidor avisa, `bossDown`): diferente do
 * relâmpago de fundo, este se vê inteiro, do céu até o alto de um prédio, e clareia a tela toda. ms.
 */
export const STRIKE_MS = 900;

/**
 * O raio `t` ms depois de cair: o clarão da tela toda (`flash`, 0–1) e o raio em si (`bolt`, 0–1). Os dois piscam no
 * começo (acende, quase apaga, acende de novo) e depois se apagam; o raio fica um pouco mais, esfriando.
 */
export function strikeAt(t: number): { flash: number; bolt: number } {
  if (t < 0 || t >= STRIKE_MS) return { flash: 0, bolt: 0 };
  // o primeiro clarão estoura a tela (a cidade vira recorte); o segundo é mais fraco, para o raio aparecer contra o céu
  if (t < 70) return { flash: 1, bolt: 1 };
  if (t < 130) return { flash: 0.15, bolt: 0 };
  if (t < 210) return { flash: 0.5, bolt: 1 };
  const flash = t < 700 ? 0.5 * (1 - (t - 210) / 490) ** 2 : 0;
  return { flash, bolt: (1 - (t - 210) / (STRIKE_MS - 210)) ** 1.5 };
}

/**
 * O contorno de uma faixa da cidade: em cada coluna da imagem (RGBA, `w`×`h`), a primeira linha com tinta; `h` na
 * coluna vazia. É onde o raio encosta no prédio.
 */
export function roofline(data: Uint8ClampedArray, w: number, h: number): number[] {
  return Array.from({ length: w }, (_, x) => {
    for (let y = 0; y < h; y++) if (data[(y * w + x) * 4 + 3] > 0) return y;
    return h;
  });
}

/**
 * Onde o raio cai, em pixels da tela: na faixa da cidade (`factor`, a paralaxe dela; `offset`, onde começa o ladrilho
 * na tela; `tops`, o contorno dela), atrás de onde o chefão estava (`x`, unidades do mundo; `camX`, a câmera), sempre
 * dentro dos 80% do meio da tela, e no prédio mais alto a até `reach` pixels disso (o raio procura o mais alto; no
 * empate, o mais perto). Devolve o `x` da tela (o meio da coluna) e o `top` da coluna, em pixels da faixa.
 */
export function strikeTarget(o: { x: number; camX: number; width: number; scale: number; factor: number; offset: number; tops: readonly number[]; reach: number }): { x: number; top: number } {
  const lo = o.width * 0.1, hi = o.width * 0.9;
  const want = Math.max(lo, Math.min(hi, o.width / 2 + (o.x - o.camX) * o.factor * o.scale));
  const n = o.tops.length;
  if (!n) return { x: Math.round(want), top: 0 };
  const colAt = (sx: number) => Math.floor((sx - o.offset) / o.scale);
  const topAt = (sx: number) => o.tops[((colAt(sx) % n) + n) % n];
  let best = { x: want, top: topAt(want), d: 0 };
  for (let sx = Math.max(lo, want - o.reach); sx <= Math.min(hi, want + o.reach); sx += o.scale) {
    const top = topAt(sx);
    const d = Math.abs(sx - want);
    if (top < best.top || (top === best.top && d < best.d)) best = { x: sx, top, d };
  }
  const x = Math.round(o.offset + (colAt(best.x) + 0.5) * o.scale);
  return { x: Math.max(Math.ceil(lo), Math.min(Math.floor(hi), x)), top: best.top };
}

type Pt = { x: number; y: number };

/**
 * O caminho do raio, em pixels do mundo (inteiros), de `from` (no céu) até `to` (o alto do prédio): um ziguezague que
 * só desce, e uns galhos que saem dele e se perdem no ar. Sai do `seed` (o chefão), então é o mesmo em toda aba.
 */
export function boltPath(seed: number, from: Pt, to: Pt): { main: Pt[]; branches: Pt[][] } {
  const dy = to.y - from.y;
  const n = Math.max(8, Math.round(dy / 12));
  const step = dy / n;
  const main: Pt[] = [{ x: Math.round(from.x), y: Math.round(from.y) }];
  for (let i = 1; i < n; i++) {
    const u = i / n;
    // mais solto no meio, preso nas pontas
    const amp = 4 + 9 * Math.sin(Math.PI * u);
    const x = from.x + (to.x - from.x) * u + (hash(seed, i, 71) - 0.5) * 2 * amp;
    const y = from.y + step * i + (hash(seed, i, 72) - 0.5) * step * 0.5;
    main.push({ x: Math.round(x), y: Math.max(main[i - 1].y + 1, Math.round(y)) });
  }
  main.push({ x: Math.round(to.x), y: Math.max(main[n - 1].y + 1, Math.round(to.y)) });
  const branches: Pt[][] = [];
  const count = 2 + Math.floor(hash(seed, 73) * 3);
  for (let b = 0; b < count; b++) {
    let p = main[1 + Math.floor(hash(seed, b, 74) * (n * 0.65))];
    const side = hash(seed, b, 75) < 0.5 ? -1 : 1;
    const br: Pt[] = [p];
    const len = 3 + Math.floor(hash(seed, b, 76) * 3);
    for (let k = 0; k < len; k++) {
      p = { x: Math.round(p.x + side * (4 + hash(seed, b, k, 77) * 8)), y: p.y + 4 + Math.round(hash(seed, b, k, 78) * 7) };
      br.push(p);
    }
    branches.push(br);
  }
  return { main, branches };
}

/** O ângulo do holofote (radianos a partir da vertical, + para a direita): duas ondas lentas, no máximo ~31°. */
export const searchlightAngle = (now: number) => 0.42 * Math.sin(now / 9000) + 0.12 * Math.sin(now / 3700 + 1);

// --- rua ----------------------------------------------------------------------------------------------------------------

/** a rua, em unidades do mundo (na paralaxe dela): de onde os carros saem e onde somem */
export const STREET = { x0: -200, x1: 900, lanes: 2 } as const;
const CARS = 4;
const CAR: Omit<Every, 'salt'> = { every: 16_000, jitter: 6000, dur: 9000 };

/** Os carros na rua em `now`: até quatro, cada um em `x` (unidades da rua), indo para `dir`, numa das duas faixas. */
export function carsAt(now: number): { x: number; dir: 1 | -1; lane: number }[] {
  const out: { x: number; dir: 1 | -1; lane: number }[] = [];
  for (let c = 0; c < CARS; c++) {
    const e = occurrence(now, { ...CAR, salt: 20 + c });
    if (!e) continue;
    const dir = hash(e.k, c, 3) < 0.5 ? 1 : -1;
    const u = e.t / e.dur;
    const span = STREET.x1 - STREET.x0;
    out.push({ x: dir > 0 ? STREET.x0 + u * span : STREET.x1 - u * span, dir, lane: c % STREET.lanes });
  }
  return out;
}

/**
 * A sirene lá embaixo: o quanto acende (`amount`, entra em 2 s e sai em 3 s), onde está o carro (`x`, unidades do mundo,
 * passando da esquerda para a direita) e a cor agora (vermelho ou azul, trocando a cada 350 ms).
 */
export function sirenAt(now: number, F = 1): { amount: number; x: number; red: boolean; start: number } | null {
  const e = occurrence(now, speedUp(AMBIENT.siren, F));
  if (!e) return null;
  return {
    amount: Math.max(0, Math.min(1, e.t / 2000, (e.dur - e.t) / 3000)),
    x: -100 + (e.t / e.dur) * 1100,
    red: Math.floor(e.t / 350) % 2 === 0,
    start: e.start,
  };
}

// --- chuva que encosta --------------------------------------------------------------------------------------------------

/**
 * Os respingos agora, de `n` canais: cada canal pinga a cada 0,5–1,1 s num lugar novo e mostra dois quadros de 90 ms.
 * `u`, `v` (0–1) são o lugar dentro da superfície, `pick` (0–1) escolhe a superfície (o cliente pesa pela área).
 */
export function splashes(now: number, n: number): { u: number; v: number; pick: number; frame: 0 | 1 }[] {
  const out: { u: number; v: number; pick: number; frame: 0 | 1 }[] = [];
  for (let i = 0; i < n; i++) {
    const period = 520 + hash(i, 31) * 560;
    const tt = now + hash(i, 32) * period;
    const k = Math.floor(tt / period);
    const age = tt - k * period;
    if (age >= 180) continue;
    out.push({ u: hash(i, k, 33), v: hash(i, k, 34), pick: hash(i, k, 35), frame: age < 90 ? 0 : 1 });
  }
  return out;
}

/** Os anéis nas `puddles` poças, `each` canais por poça: três quadros de 150 ms; `u`, `v` (−0,35–0,35) da poça a partir do meio. */
export function ripples(now: number, puddles: number, each: number): { puddle: number; u: number; v: number; frame: 0 | 1 | 2 }[] {
  const out: { puddle: number; u: number; v: number; frame: 0 | 1 | 2 }[] = [];
  for (let j = 0; j < puddles; j++) for (let c = 0; c < each; c++) {
    const period = 900 + hash(j, c, 41) * 800;
    const tt = now + hash(j, c, 43) * period;
    const k = Math.floor(tt / period);
    const age = tt - k * period;
    if (age >= 450) continue;
    out.push({ puddle: j, u: (hash(j, c, k, 42) - 0.5) * 0.7, v: (hash(j, c, k, 44) - 0.5) * 0.7, frame: Math.floor(age / 150) as 0 | 1 | 2 });
  }
  return out;
}

/** a gota: quanto tempo fica pendurada antes de cair (ms) e a gravidade dela (unidades do mundo/s²) */
const HANG = 500;
const G = 380;

/** A gota `i` agora: pendurada, caindo `dy` unidades (até `fall`), ou já foi (null); pinga a cada 1,4–4 s. */
export function drip(now: number, i: number, fall: number): { phase: 'hang' | 'fall'; dy: number } | null {
  const period = 1400 + hash(i, 51) * 2600;
  const tt = now + hash(i, 52) * period;
  const age = tt - Math.floor(tt / period) * period;
  if (age < HANG) return { phase: 'hang', dy: 0 };
  const t = (age - HANG) / 1000;
  const dy = 0.5 * G * t * t;
  return dy > fall ? null : { phase: 'fall', dy };
}

/**
 * Uma nuvenzinha de vapor com `age` ms: sobe 28 unidades na vida toda, vai para a esquerda com o vento da chuva (o
 * mesmo lado em que a chuva inclina), cresce (quadros 0–3) e apaga (alfa de 0,5 a 0).
 */
export function puff(age: number): { rise: number; drift: number; frame: 0 | 1 | 2 | 3; alpha: number } {
  const u = Math.max(0, Math.min(1, age / AMBIENT.puffMs));
  const rise = 28 * u;
  return { rise, drift: -rise * 0.55 - 2 * Math.sin(u * Math.PI), frame: Math.min(3, Math.floor(u * 4)) as 0 | 1 | 2 | 3, alpha: 0.5 * (1 - u) };
}

/** As `n` nuvenzinhas da boca `source` agora, uma saindo a cada `puffMs / n`. */
export const puffsAt = (now: number, source: number, n: number) =>
  Array.from({ length: n }, (_, i) => puff((((now + (i * AMBIENT.puffMs) / n + source * 1337) % AMBIENT.puffMs) + AMBIENT.puffMs) % AMBIENT.puffMs));

/**
 * Se o pé em `x, z` (unidades do mundo) está dentro da poça ancorada em `p` (o meio de baixo do quadro, `w`×`h` pixels):
 * a poça é uma elipse que sobe `h` linhas da tela, ou seja `h / DEPTH_K` unidades de fundo.
 */
export function inPuddle(x: number, z: number, p: { x: number; z: number; w: number; h: number }): boolean {
  const depth = p.h / DEPTH_K;
  const dx = (x - p.x) / (p.w / 2), dz = (z - (p.z + depth / 2)) / (depth / 2);
  return dx * dx + dz * dz <= 1;
}

/** quão longe (unidades do mundo, em x) um letreiro tinge uma poça no mesmo telhado */
const GLOW_REACH = 80;

/** A cor (0xrrggbb) do letreiro mais perto da poça, no mesmo telhado e a até `GLOW_REACH`; senão null. */
export function puddleGlow(p: { roof: number; x: number }, signs: readonly { roof: number; x: number; color: number }[]): number | null {
  let best: { d: number; color: number } | null = null;
  for (const s of signs) {
    const d = Math.abs(s.x - p.x);
    if (s.roof === p.roof && d <= GLOW_REACH && (!best || d < best.d)) best = { d, color: s.color };
  }
  return best?.color ?? null;
}
