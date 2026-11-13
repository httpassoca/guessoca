/**
 * Os bichos do telhado (issue #71), puro: três gatos e seis pássaros que moram nos telhados, o que cada um faz agora e
 * onde está. Nada aqui desenha (`fauna.ts` desenha) e nada vai pela rede: cada aba calcula sozinha, e todas chegam ao
 * mesmo bicho fazendo a mesma coisa porque
 *
 * - a rotina de cada gato é uma lista fixa de "batidas" (`Beat`) tocada num relógio de parede (`Date.now()`), com uma
 *   defasagem sorteada pela semente da sala (o código dela, `seedOf`): parado → lambendo → coçando → espreguiçando →
 *   deitando → dormindo, e o gato da direita ainda passeia da mureta da frente para a do fundo;
 * - as reações saem da presença (quem corre, pula, empurra, pousa, fica parado), que é quase a mesma em toda aba; depois
 *   de reagir o bicho volta ao poleiro do horário, então duas abas nunca ficam diferentes por muito tempo.
 *
 * Sem física nem colisão: os gatos andam por caminhos de linhas retas entre lugares conhecidos (tampa das caixas do
 * `MAP`, mureta da frente, mureta do fundo, o chão), pulando o vão entre os prédios num arco (o pulo que os jogadores
 * vivem errando). Os pássaros saem em bando num arco para cima, para fora da tela, e voltam 20–60 s depois caindo do
 * alto. Unidades do mundo (1 = 1 pixel do sprite: os bichos são desenhados a 1×), `y` para cima, tempo em ms do relógio
 * de parede. Testado em `apps/web/test/world-critters.test.ts`.
 */
import { DEPTH, MAP, type Anim, type Platform, type Vec3 } from '@guess/world';
import { seeded, type Piece } from './confetti';

// --- quem está no telhado ---------------------------------------------------------------------------------------------

/** Alguém no telhado como os bichos o veem: os pés (unidades do mundo), a animação, se é bot, e o tamanho (o chefão: 2). */
export interface Folk extends Vec3 { id: string; anim: Anim; bot: boolean; scale: number }

/** Uma coisa que espanta: alguém correndo, pulando, empurrando ou pousando de um pulo, onde está agora. */
export interface Stir extends Vec3 { id: string; kind: 'run' | 'jump' | 'shove' | 'land'; bot: boolean; boss: boolean }

const AIR: readonly Anim[] = ['jump', 'fall', 'fall_loop'];
/** quanto alguém pode se mexer e ainda contar como parado (unidades) */
const STILL_SLOP = 3;

/**
 * Lê a presença quadro a quadro e diz o que mudou: quem começou a pular, a empurrar, quem pousou (saiu do ar), quem está
 * correndo, e há quanto tempo cada um está parado no mesmo lugar.
 */
export class Watcher {
  private readonly prev = new Map<string, Anim>();
  private readonly still = new Map<string, { x: number; z: number; since: number }>();

  tick(folk: readonly Folk[], now: number): Stir[] {
    const out: Stir[] = [];
    const seen = new Set<string>();
    for (const f of folk) {
      seen.add(f.id);
      const was = this.prev.get(f.id);
      this.prev.set(f.id, f.anim);
      const stir = (kind: Stir['kind']) => out.push({ id: f.id, x: f.x, y: f.y, z: f.z, kind, bot: f.bot, boss: f.scale > 1 });
      if (f.anim === 'run') stir('run');
      if (was !== undefined && was !== f.anim) {
        if (f.anim === 'jump') stir('jump');
        if (f.anim === 'shove') stir('shove');
        if (AIR.includes(was) && !AIR.includes(f.anim)) stir('land');
      }
      const s = this.still.get(f.id);
      const moved = !s || Math.abs(s.x - f.x) > STILL_SLOP || Math.abs(s.z - f.z) > STILL_SLOP || f.anim !== 'idle';
      if (moved) this.still.set(f.id, { x: f.x, z: f.z, since: now });
    }
    for (const id of [...this.prev.keys()]) if (!seen.has(id)) { this.prev.delete(id); this.still.delete(id); }
    return out;
  }

  /** Há quanto tempo `id` está parado (em `idle`, no mesmo lugar), ms; 0 se acabou de se mexer ou não está. */
  stillFor(id: string, now: number): number {
    const s = this.still.get(id);
    return s ? now - s.since : 0;
  }
}

// --- o mapa visto pelos bichos ----------------------------------------------------------------------------------------

/** Os telhados da esquerda para a direita. */
export const ROOF_LIST: readonly Platform[] = MAP.filter((p) => p.kind === 'roof').sort((a, b) => a.x0 - b.x0);
const BOXES: readonly Platform[] = MAP.filter((p) => p.kind === 'box');

/** Em que telhado (índice em `ROOF_LIST`) está o `x`; fora de todos, o mais perto. */
export function roofAt(x: number): number {
  let best = 0, gap = Infinity;
  ROOF_LIST.forEach((r, i) => {
    const d = x < r.x0 ? r.x0 - x : x > r.x1 ? x - r.x1 : 0;
    if (d < gap) { gap = d; best = i; }
  });
  return best;
}

/** um lugar conhecido: onde ficam as patas (unidades do mundo) e o telhado embaixo */
export interface Spot extends Vec3 { roof: number }

/** a mureta da frente fica 4 unidades acima do tampo (`parapet` em `rooftop.json`, âncora 4); a do fundo, 5 (`ledge`) */
const PARAPET_Y = 4;
const LEDGE_Y = 5;
/** os enfeites de trás ficam 3 unidades atrás da mureta do fundo (`BEHIND` em `dressing.ts`) */
const BEHIND = DEPTH + 3;

const roofTop = (i: number) => ROOF_LIST[i].top;
const spot = (roof: number, x: number, dy: number, z: number): Spot => ({ x, y: roofTop(roof) + dy, z, roof });

/**
 * Os lugares dos gatos. As tampas das caixas são as do `MAP` (o ar-condicionado em x 120–160, top 28; a chaminé em
 * 400–440, top 56; a caixa-d'água em 700–744, top 60). Na mureta do fundo do telhado da direita o gato só anda à direita
 * da caixa-d'água (ela vai até o fundo e cobriria o gato se ele passasse atrás dela).
 */
export const CAT_SPOTS = {
  ac: { x: 140, y: 28, z: 44, roof: 0 },
  'chimney-side': spot(1, 452, 0, 46),
  parapet: spot(2, 660, PARAPET_Y, 0),
  'ledge-a': spot(2, 772, LEDGE_Y, DEPTH),
  'ledge-b': spot(2, 852, LEDGE_Y, DEPTH),
  // refúgios de quem foge, um por telhado
  'roof0-corner': spot(0, 34, 0, 40),
  chimney: { x: 420, y: 56, z: 46, roof: 1 },
  tank: { x: 728, y: 60, z: 46, roof: 2 },
} satisfies Record<string, Spot>;
export type CatSpot = keyof typeof CAT_SPOTS;
const REFUGE: readonly CatSpot[] = ['roof0-corner', 'chimney', 'tank'];

/** a faixa do chão por onde os gatos atravessam um telhado: perto da frente, longe das caixas (todas começam em z ≥ 30) */
const LANE_Z = 18;
/** o quanto o gato fica longe da beirada do vão antes de pular, e da beirada da frente/fundo no chão */
const EDGE = 3;
const FLOOR_Z: [number, number] = [6, DEPTH - 6];

/** Onde o gato pisa no chão para subir ou descer de `s`: debaixo dele, fora do pé das caixas e longe das beiradas. */
export function floorOf(s: Spot): Spot {
  let z = Math.max(FLOOR_Z[0], Math.min(FLOOR_Z[1], s.z));
  for (const b of BOXES) if (s.x >= b.x0 - 2 && s.x <= b.x1 + 2 && z >= b.z0 - 4) z = Math.min(z, b.z0 - 6);
  return { x: s.x, y: roofTop(s.roof), z, roof: s.roof };
}

// --- caminhos ---------------------------------------------------------------------------------------------------------

/** O passo do gato num trecho: anda ou corre (o pulo, num arco, usa o correr). */
export type Gait = 'walk' | 'run';
/** Um trecho reto de `from` a `to` em `ms`; `arc` é a altura extra do meio do trecho (um pulo), 0 no chão. */
export interface Leg { from: Vec3; to: Vec3; ms: number; arc: number; gait: Gait }
export interface Route { legs: Leg[]; ms: number }

/** velocidades do gato, unidades/s (no olho, para os pés não patinarem: andar 8 quadros a 10 fps, correr 8 a 14) */
export const CAT_WALK = 26;
export const CAT_RUN = 105;
/** subir ou descer de uma caixa ou mureta: o tempo e a altura do arco acima da ponta mais alta */
const HOP_MS = 360;
const HOP_ARC = 8;
/** o pulo do vão (50 unidades): o tempo e a altura do arco */
const LEAP_MS = 520;
const LEAP_ARC = 22;

const dist = (a: Vec3, b: Vec3) => Math.hypot(b.x - a.x, b.z - a.z);
const same = (a: Vec3, b: Vec3) => Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01 && Math.abs(a.z - b.z) < 0.01;

/**
 * O caminho de `a` até `b`: desce para o chão, vai até a faixa da frente, segue nela (pulando cada vão no arco, de
 * beirada a beirada), sai da faixa em frente ao destino e sobe nele. `gait` diz se anda ou corre no chão.
 */
export function route(a: Spot, b: Spot, gait: Gait): Route {
  const speed = gait === 'walk' ? CAT_WALK : CAT_RUN;
  const legs: Leg[] = [];
  let at: Vec3 = { x: a.x, y: a.y, z: a.z };
  const ground = (to: Vec3) => { if (!same(at, to)) legs.push({ from: at, to, ms: (dist(at, to) / speed) * 1000, arc: 0, gait }); at = to; };
  const hop = (to: Vec3, ms: number, arc: number) => { if (!same(at, to)) legs.push({ from: at, to, ms, arc: Math.max(at.y, to.y) - Math.min(at.y, to.y) + arc, gait: 'run' }); at = to; };
  const fa = floorOf(a), fb = floorOf(b);
  if (Math.abs(a.y - fa.y) > 0.5) hop(fa, HOP_MS, HOP_ARC); else ground(fa);
  if (a.roof === b.roof) {
    // no mesmo telhado: pela faixa só se precisa trocar de profundidade (senão em linha reta pelo chão)
    if (Math.abs(fa.z - fb.z) > 1) { ground({ x: fa.x, y: fa.y, z: LANE_Z }); ground({ x: fb.x, y: fb.y, z: LANE_Z }); }
  } else {
    ground({ x: fa.x, y: fa.y, z: LANE_Z });
    const step = b.roof > a.roof ? 1 : -1;
    for (let r = a.roof; r !== b.roof; r += step) {
      const here = ROOF_LIST[r], next = ROOF_LIST[r + step];
      const edge = step > 0 ? here.x1 - EDGE : here.x0 + EDGE;
      const land = step > 0 ? next.x0 + EDGE : next.x1 - EDGE;
      ground({ x: edge, y: here.top, z: LANE_Z });
      hop({ x: land, y: next.top, z: LANE_Z }, LEAP_MS, LEAP_ARC);
    }
    ground({ x: fb.x, y: fb.y, z: LANE_Z });
  }
  ground(fb);
  if (Math.abs(b.y - fb.y) > 0.5) hop({ x: b.x, y: b.y, z: b.z }, HOP_MS, HOP_ARC); else ground({ x: b.x, y: b.y, z: b.z });
  return { legs, ms: legs.reduce((t, l) => t + l.ms, 0) };
}

/** Onde o gato está `t` ms depois de sair, com o passo e para onde olha (1 = direita, como a folha). */
export function routeAt(r: Route, t: number): { at: Vec3; gait: Gait; facing: 1 | -1; airborne: boolean } {
  let facing: 1 | -1 = 1;
  let left = Math.max(0, t);
  for (const [i, l] of r.legs.entries()) {
    if (Math.abs(l.to.x - l.from.x) > 0.01) facing = l.to.x > l.from.x ? 1 : -1;
    if (left <= l.ms || i === r.legs.length - 1) {
      const u = l.ms > 0 ? Math.min(1, left / l.ms) : 1;
      return {
        at: { x: l.from.x + (l.to.x - l.from.x) * u, y: l.from.y + (l.to.y - l.from.y) * u + l.arc * 4 * u * (1 - u), z: l.from.z + (l.to.z - l.from.z) * u },
        gait: l.gait, facing, airborne: l.arc > 0,
      };
    }
    left -= l.ms;
  }
  return { at: { x: 0, y: 0, z: 0 }, gait: 'walk', facing, airborne: false };
}

// --- a rotina dos gatos -----------------------------------------------------------------------------------------------

/** O que o gato faz parado: cada um vira uma tira da folha (`fauna.ts`). */
export type Act = 'idle' | 'lick' | 'itch' | 'stretch' | 'lie' | 'sleep' | 'sit';
/** Uma batida da rotina: parado num lugar fazendo algo por `ms`, ou andando de um lugar a outro (o tempo é o do caminho). */
export type Beat = { at: CatSpot; act: Act; ms: number } | { walk: [CatSpot, CatSpot] };

/** quanto dura o espreguiçar (13 quadros a 8 fps) e o deitar (8 a 8), ms, com uma folga para o último quadro */
const STRETCH_MS = 1800;
const LIE_MS = 1300;

/**
 * Os gatos: o nome da tira (`critters.json`) e a rotina. O preto dorme na tampa do ar-condicionado; o tigrado, o "vem
 * ver", fica do lado da chaminé no prédio do meio (onde se nasce, visível com o painel aberto); o branco senta na
 * mureta da frente do prédio da direita e passeia na do fundo.
 */
export const CATS: readonly { name: string; home: CatSpot; beats: readonly Beat[] }[] = [
  {
    name: 'preto', home: 'ac',
    beats: [
      { at: 'ac', act: 'sleep', ms: 40000 }, { at: 'ac', act: 'idle', ms: 7000 }, { at: 'ac', act: 'lick', ms: 9000 },
      { at: 'ac', act: 'itch', ms: 2500 }, { at: 'ac', act: 'stretch', ms: STRETCH_MS }, { at: 'ac', act: 'idle', ms: 4000 },
      { at: 'ac', act: 'lie', ms: LIE_MS },
    ],
  },
  {
    name: 'tigrado', home: 'chimney-side',
    beats: [
      { at: 'chimney-side', act: 'idle', ms: 8000 }, { at: 'chimney-side', act: 'lick', ms: 10000 },
      { at: 'chimney-side', act: 'itch', ms: 3000 }, { at: 'chimney-side', act: 'stretch', ms: STRETCH_MS },
      { at: 'chimney-side', act: 'sit', ms: 8000 }, { at: 'chimney-side', act: 'lie', ms: LIE_MS },
      { at: 'chimney-side', act: 'sleep', ms: 30000 },
    ],
  },
  {
    name: 'branco', home: 'parapet',
    beats: [
      { at: 'parapet', act: 'sit', ms: 7000 }, { at: 'parapet', act: 'idle', ms: 6000 }, { at: 'parapet', act: 'lick', ms: 8000 },
      { at: 'parapet', act: 'itch', ms: 2500 }, { walk: ['parapet', 'ledge-a'] }, { walk: ['ledge-a', 'ledge-b'] },
      { at: 'ledge-b', act: 'idle', ms: 4000 }, { at: 'ledge-b', act: 'stretch', ms: STRETCH_MS }, { at: 'ledge-b', act: 'lie', ms: LIE_MS },
      { at: 'ledge-b', act: 'sleep', ms: 24000 }, { at: 'ledge-b', act: 'idle', ms: 3000 }, { walk: ['ledge-b', 'parapet'] },
    ],
  },
];

/** A batida que toca agora: parado (`at`, `act`) ou andando (`route`), e quando começou (relógio de parede). */
export type Scheduled =
  | { kind: 'perch'; at: CatSpot; act: Act; since: number; ends: number }
  | { kind: 'move'; route: Route; to: CatSpot; since: number; ends: number };

const beatMs = (b: Beat) => ('walk' in b ? route(CAT_SPOTS[b.walk[0]], CAT_SPOTS[b.walk[1]], 'walk').ms : b.ms);

/** Um número de 0 a 1 que só depende dos inteiros dados (sem sorteio guardado). */
export function hash(...ns: number[]): number {
  let h = 0x811c9dc5;
  for (const n of ns) {
    h = Math.imul(h ^ (n | 0), 0x01000193);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h ^= h >>> 13;
  }
  return (h >>> 0) / 4294967296;
}

/** A semente da sala: o código dela virado número (toda aba da sala chega ao mesmo). */
export function seedOf(code: string): number {
  let h = 2166136261;
  for (const ch of code) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** O que o gato `i` faz às `now` (relógio de parede), na sala de semente `seed`. */
export function scheduled(i: number, seed: number, now: number): Scheduled {
  const beats = CATS[i].beats;
  const lengths = beats.map(beatMs);
  const cycle = lengths.reduce((a, b) => a + b, 0);
  const shift = Math.floor(hash(seed, i) * cycle);
  const t = now + shift;
  const start = t - (((t % cycle) + cycle) % cycle); // o começo do ciclo, no relógio defasado
  let at = start;
  for (const [k, b] of beats.entries()) {
    const end = at + lengths[k];
    if (t < end) {
      if ('walk' in b) return { kind: 'move', route: route(CAT_SPOTS[b.walk[0]], CAT_SPOTS[b.walk[1]], 'walk'), to: b.walk[1], since: at - shift, ends: end - shift };
      return { kind: 'perch', at: b.at, act: b.act, since: at - shift, ends: end - shift };
    }
    at = end;
  }
  const b = beats[0] as Extract<Beat, { at: CatSpot }>;
  return { kind: 'perch', at: b.at, act: b.act, since: now, ends: now };
}

// --- as reações dos gatos ---------------------------------------------------------------------------------------------

/** a esta distância (em x; em profundidade e altura menos) alguém faz o gato sentar e olhar */
export const CAT_LOOK_R = 40;
/** correr, empurrar ou pousar a esta distância espanta o gato */
export const CAT_SCARE_R = 40;
/** um bot a esta distância faz o gato ir embora (sem miar) */
export const CAT_BOT_R = 30;
/** ficar parado este tempo perto do gato, no chão do telhado dele, faz ele vir sentar do lado */
export const CAT_VISIT_MS = 4000;
/** de quão longe (em x) o gato vem fazer companhia */
export const CAT_VISIT_R = 90;
/** a que distância (em x) da pessoa o gato senta */
const BESIDE = 20;
/** depois de chegar do lado: senta este tempo, depois deita e dorme */
const BESIDE_SIT_MS = 3500;
/** a pessoa se mexeu mais que isto (do lugar onde estava): o gato vai embora */
const BESIDE_LEAVE = 24;
/** quanto o miau dura (4 quadros a 8 fps), ms: o gato que foge mia antes de sair correndo */
export const MEOW_MS = 500;
/** quanto o gato fica no refúgio antes de voltar, ms (mais um tanto sorteado de até `AWAY_JITTER`) */
const AWAY_MS = 18000;
const AWAY_JITTER = 10000;

/** O que o gato tem na cabeça além da rotina. */
export type CatMind =
  | { kind: 'home' }
  | { kind: 'travel'; route: Route; start: number; purpose: 'flee' | 'visit' | 'back'; to: Spot; target: CatSpot | null; visitor?: string; anchor?: Vec3 }
  | { kind: 'away'; at: Spot; since: number; until: number; facing: 1 | -1 }
  | { kind: 'beside'; at: Spot; since: number; visitor: string; anchor: Vec3; facing: 1 | -1 }
  | { kind: 'linger'; at: Spot; spot: CatSpot; facing: 1 | -1 };

/** Como desenhar um gato agora: a tira (`<nome>/<animação>` em `critters.json`), desde quando, o lado e o miau. */
export interface CatPose extends Vec3 { name: string; strip: string; since: number; facing: 1 | -1; meow: number | null }

/** Como desenhar o que o gato está fazendo parado: a tira e desde quando (o lamber e o dormir trocam de tira no meio). */
function actStrip(act: Act, since: number, ends: number, now: number): { strip: string; since: number } {
  const half = since + (ends - since) / 2;
  switch (act) {
    case 'idle': return { strip: 'idle', since };
    case 'lick': return now < half ? { strip: 'lick1', since } : { strip: 'lick2', since: half };
    case 'itch': return { strip: 'itch', since };
    case 'stretch': return { strip: 'stretch', since };
    case 'lie': return { strip: 'lying', since };
    case 'sleep': return now < half ? { strip: 'sleep1', since } : { strip: 'sleep2', since: half };
    case 'sit': return { strip: 'sitting', since };
  }
}

const near = (a: Vec3, b: Vec3, r: number) => Math.abs(a.x - b.x) <= r && Math.abs(a.z - b.z) <= r * 0.75 && Math.abs(a.y - b.y) <= r;

/** Um gato: a rotina de `scheduled` mais o que ele faz por conta da presença (olhar, fugir, fazer companhia, voltar). */
export class Cat {
  mind: CatMind = { kind: 'home' };
  /** quando miou pela última vez (acerto, ou antes de fugir); null = não está miando */
  meowAt: number | null = null;
  /** onde ele está e para onde olhava no último quadro (de onde sai a fuga) */
  private last: { at: Spot; facing: 1 | -1 } | null = null;

  constructor(readonly index: number, readonly seed: number) {}

  get name() { return CATS[this.index].name; }

  /** Onde o gato está agora, como lugar (com o telhado). */
  where(now: number): Spot { return this.last?.at ?? this.restingSpot(now); }

  private restingSpot(now: number): Spot {
    const s = scheduled(this.index, this.seed, now);
    if (s.kind === 'perch') return CAT_SPOTS[s.at];
    const r = routeAt(s.route, now - s.since);
    return { ...r.at, roof: roofAt(r.at.x) };
  }

  /** Um quadro: lê a presença, o que espantou, há quanto tempo cada um está parado, e muda de ideia se preciso. */
  step(folk: readonly Folk[], stirs: readonly Stir[], stillFor: (id: string) => number, now: number) {
    const here = this.where(now);
    const m = this.mind;
    // chegou ao fim de uma viagem
    if (m.kind === 'travel' && now - m.start >= m.route.ms) {
      const facing = routeAt(m.route, m.route.ms).facing;
      if (m.purpose === 'flee') this.mind = { kind: 'away', at: m.to, since: now, until: now + AWAY_MS + Math.floor(hash(this.seed, this.index, Math.floor(now / 1000)) * AWAY_JITTER), facing };
      else if (m.purpose === 'visit' && m.visitor && m.anchor) this.mind = { kind: 'beside', at: m.to, since: now, visitor: m.visitor, anchor: m.anchor, facing };
      else this.mind = { kind: 'linger', at: m.to, spot: m.target ?? CATS[this.index].home, facing };
    }
    const fleeing = this.mind.kind === 'travel' && this.mind.purpose === 'flee';
    if (!fleeing) {
      const roof = here.roof;
      // o chefão pousou neste telhado: foge, de onde estiver no telhado
      const boss = stirs.find((s) => s.boss && s.kind === 'land' && roofAt(s.x) === roof);
      const scare = boss ?? stirs.find((s) => s.kind !== 'jump' && near(s, here, CAT_SCARE_R));
      const bot = folk.find((f) => f.bot && near(f, here, CAT_BOT_R));
      if (scare) { this.flee(here, scare, now, !scare.bot || scare.boss); return; }
      if (bot) { this.flee(here, bot, now, false); return; }
    }
    const cur = this.mind;
    if (cur.kind === 'away' && now >= cur.until) { this.goBack(here, now); return; }
    if (cur.kind === 'beside') {
      const v = folk.find((f) => f.id === cur.visitor);
      if (!v || Math.abs(v.x - cur.anchor.x) > BESIDE_LEAVE || Math.abs(v.z - cur.anchor.z) > BESIDE_LEAVE || Math.abs(v.y - cur.anchor.y) > 4) this.goBack(here, now);
      return;
    }
    if (cur.kind === 'travel' && cur.purpose === 'visit') {
      const v = folk.find((f) => f.id === cur.visitor);
      if (!v || !cur.anchor || Math.abs(v.x - cur.anchor.x) > BESIDE_LEAVE || Math.abs(v.z - cur.anchor.z) > BESIDE_LEAVE) this.goBack(here, now);
      return;
    }
    if (cur.kind === 'linger') {
      const s = scheduled(this.index, this.seed, now);
      if (s.kind === 'perch') {
        if (s.at === cur.spot) this.mind = { kind: 'home' };
        else this.travel(here, CAT_SPOTS[s.at], s.at, 'walk', 'back', now);
      }
      // a rotina está andando: espera aqui até ela parar
    }
    if (this.mind.kind === 'home' || this.mind.kind === 'linger') this.maybeVisit(folk, stillFor, here, now);
  }

  /** Alguém parado perto, no chão deste telhado, há `CAT_VISIT_MS`: o gato vai sentar do lado dele. */
  private maybeVisit(folk: readonly Folk[], stillFor: (id: string) => number, here: Spot, now: number) {
    if (this.mind.kind === 'home' && scheduled(this.index, this.seed, now).kind === 'move') return;
    const roof = ROOF_LIST[here.roof];
    const who = folk
      .filter((f) => !f.bot && f.scale === 1 && Math.abs(f.y - roof.top) < 1 && roofAt(f.x) === here.roof && f.x >= roof.x0 && f.x <= roof.x1)
      .filter((f) => Math.abs(f.x - here.x) <= CAT_VISIT_R && stillFor(f.id) >= CAT_VISIT_MS)
      .sort((a, b) => Math.abs(a.x - here.x) - Math.abs(b.x - here.x) || (a.id < b.id ? -1 : 1))[0];
    if (!who) return;
    const side = here.x >= who.x ? 1 : -1;
    let x = who.x + side * BESIDE;
    if (x < roof.x0 + 8 || x > roof.x1 - 8) x = who.x - side * BESIDE;
    const z = Math.max(FLOOR_Z[0], Math.min(FLOOR_Z[1], who.z));
    if (BOXES.some((b) => x >= b.x0 - 4 && x <= b.x1 + 4 && z >= b.z0 - 4)) return;
    const to: Spot = { x, y: roof.top, z, roof: here.roof };
    this.mind = { kind: 'travel', route: route(here, to, 'walk'), start: now, purpose: 'visit', to, target: null, visitor: who.id, anchor: { x: who.x, y: who.y, z: who.z } };
  }

  /** Foge de `from`: mia (se `meow`) e corre para o refúgio do telhado vizinho, pulando o vão. */
  private flee(here: Spot, from: Vec3, now: number, meow: boolean) {
    const r = here.roof;
    const next = r === 0 ? 1 : r === 2 ? 1 : from.x < here.x ? 2 : 0;
    const to = CAT_SPOTS[REFUGE[next]];
    if (meow) this.meowAt = now;
    this.mind = { kind: 'travel', route: route(here, to, 'run'), start: now + (meow ? MEOW_MS : 0), purpose: 'flee', to, target: REFUGE[next] };
  }

  /** Volta para o lugar da rotina (o de agora, ou o fim do passeio que ela está fazendo). */
  private goBack(here: Spot, now: number) {
    const s = scheduled(this.index, this.seed, now);
    const target = s.kind === 'perch' ? s.at : s.to;
    this.travel(here, CAT_SPOTS[target], target, 'walk', 'back', now);
  }

  private travel(here: Spot, to: Spot, target: CatSpot, gait: Gait, purpose: 'back', now: number) {
    this.mind = { kind: 'travel', route: route(here, to, gait), start: now, purpose, to, target };
  }

  /** Mia agora (alguém acertou e este é o gato mais perto). Fugindo, não. */
  meow(now: number) { if (!(this.mind.kind === 'travel' && this.mind.purpose === 'flee')) this.meowAt = now; }

  /** Como desenhar o gato agora; `folk` para sentar e olhar quem chegou perto. */
  pose(folk: readonly Folk[], now: number): CatPose {
    const name = this.name;
    const m = this.mind;
    const meow = this.meowAt !== null && now - this.meowAt < MEOW_MS ? this.meowAt : null;
    if (meow === null) this.meowAt = null;
    let out: Omit<CatPose, 'name' | 'meow'>;
    let resting = false;
    if (m.kind === 'travel') {
      if (now < m.start) {
        const at = this.where(now);
        out = { ...at, strip: 'meow', since: m.start - MEOW_MS, facing: this.last?.facing ?? 1 };
      } else {
        const r = routeAt(m.route, now - m.start);
        out = { ...r.at, strip: r.gait === 'run' ? 'run' : 'walk', since: m.start, facing: r.facing };
      }
    } else if (m.kind === 'away') { out = { ...m.at, strip: 'sitting', since: m.since, facing: m.facing }; resting = true; }
    else if (m.kind === 'linger') { out = { ...m.at, strip: 'idle', since: 0, facing: m.facing }; resting = true; }
    else if (m.kind === 'beside') {
      const t = now - m.since;
      const s = t < BESIDE_SIT_MS ? { strip: 'sitting', since: m.since }
        : t < BESIDE_SIT_MS + LIE_MS ? { strip: 'lying', since: m.since + BESIDE_SIT_MS } : { strip: 'sleep1', since: m.since + BESIDE_SIT_MS + LIE_MS };
      const v = folk.find((f) => f.id === m.visitor);
      out = { ...m.at, ...s, facing: v ? (v.x >= m.at.x ? 1 : -1) : m.facing };
    } else {
      const s = scheduled(this.index, this.seed, now);
      if (s.kind === 'move') {
        const r = routeAt(s.route, now - s.since);
        out = { ...r.at, strip: 'walk', since: s.since, facing: r.facing };
      } else {
        out = { ...CAT_SPOTS[s.at], ...actStrip(s.act, s.since, s.ends, now), facing: hash(this.seed, this.index, Math.floor(s.since / 1000)) < 0.5 ? 1 : -1 };
        resting = true;
      }
    }
    // parado e alguém chegou perto: senta e olha para ele (o mais perto; bot não conta)
    if (resting) {
      const look = folk.filter((f) => !f.bot && near(f, out, CAT_LOOK_R)).sort((a, b) => Math.abs(a.x - out.x) - Math.abs(b.x - out.x))[0];
      if (look) out = { ...out, strip: 'sitting', since: 0, facing: look.x >= out.x ? 1 : -1 };
    }
    // o miau troca a tira só de quem está parado; andando, só as linhas do som saem da boca
    if (meow !== null && resting) out = { ...out, strip: 'meow', since: meow };
    this.last = { at: { x: out.x, y: out.y, z: out.z, roof: roofAt(out.x) }, facing: out.facing };
    return { ...out, name, meow };
  }
}

// --- os pássaros ------------------------------------------------------------------------------------------------------

export type BirdKind = 'pigeon' | 'crow';
/** Um pássaro: a espécie, o poleiro (as patas, unidades do mundo) e o bando (que sai junto). */
export interface BirdSpec { kind: BirdKind; perch: Spot; flock: number; facing: 1 | -1 }

/**
 * Os pássaros: cinco pombos e um corvo. Bando 0, no prédio do meio: dois em cima da placa HOTEL (39 de largura,
 * 23 de altura, em x 333–371) e um na mureta do fundo; bando 1, no da direita: um na tampa da caixa-d'água e um na
 * travessa do meio da antena (a 24 do pé dela). O corvo (bando 2) fica na torre do prédio da direita, logo acima da
 * luz vermelha (torre de 38, a luz de 3×3 centrada no topo: o corvo pisa em cima dela), e só sai pelo chefão.
 */
export const BIRDS: readonly BirdSpec[] = [
  { kind: 'pigeon', perch: spot(1, 343, 23, BEHIND), flock: 0, facing: 1 },
  { kind: 'pigeon', perch: spot(1, 362, 23, BEHIND), flock: 0, facing: -1 },
  { kind: 'pigeon', perch: spot(1, 488, LEDGE_Y, DEPTH), flock: 0, facing: -1 },
  { kind: 'pigeon', perch: { x: 716, y: 60, z: 50, roof: 2 }, flock: 1, facing: 1 },
  { kind: 'pigeon', perch: spot(2, 839, 24, BEHIND), flock: 1, facing: -1 },
  { kind: 'crow', perch: spot(2, 622, 39, BEHIND), flock: 2, facing: 1 },
];
/** o bando que só sai pelo chefão */
const BOSS_ONLY = 2;

/** correr, pular, empurrar ou pousar a esta distância (em x) de um pássaro do bando faz o bando sair */
export const BIRD_SCARE_R = 30;
/** a volta: de 20 a 60 s depois de sair */
export const BIRD_AWAY_MS: [number, number] = [20000, 60000];
/** cada pássaro sai um pouco depois do outro, até isto, ms */
const BIRD_STAGGER = 220;
/**
 * o voo de ida: unidades/s e unidades/s² para os lados e para cima (no olho; em 3 s sobe uns 580, o bastante para sair
 * da tela mesmo no zoom mais afastado)
 */
const FLY_VX = 40, FLY_AX = 12, FLY_VY = 60, FLY_AY = 45;
/** quanto dura a ida até sumir no alto (e a volta, o mesmo arco ao contrário), ms */
export const FLIGHT_MS = 3000;

/** Onde o pássaro está `t` ms depois de levantar voo (em relação ao poleiro), saindo para `dir`. */
export function flightOffset(t: number, dir: 1 | -1): { x: number; y: number } {
  const s = Math.max(0, t) / 1000;
  return { x: dir * (FLY_VX * s + FLY_AX * s * s), y: FLY_VY * s + FLY_AY * s * s };
}

export type FlockMind = { kind: 'perched' } | { kind: 'away'; left: number; dir: 1 | -1; back: number };

/** Como desenhar um pássaro agora: a tira (`<espécie>/idle` ou `/fly`), desde quando, o lado, e se aparece. */
export interface BirdPose extends Vec3 { strip: string; since: number; facing: 1 | -1; visible: boolean }

/** Uma pena solta: de onde sai (unidades do mundo), quando, e a conta fechada do confete (`pieceOffset`). */
export interface Feather { from: Vec3; at: number; piece: Piece }

/** as penas: cinza (da paleta dos pombos e do corvo), poucas por pássaro, devagar */
export const FEATHER_COLORS: readonly number[] = [0x8b90a5, 0xcecbcb, 0x4c5165];
const FEATHERS_PER_BIRD = 2;

/** Um bando que sai e volta: o mesmo arco em todo pássaro dele, cada um com um atraso. */
export class Flocks {
  readonly minds: FlockMind[];
  feathers: Feather[] = [];

  constructor(readonly seed: number) {
    this.minds = Array.from({ length: Math.max(...BIRDS.map((b) => b.flock)) + 1 }, () => ({ kind: 'perched' as const }));
  }

  /** Um quadro: quem espantou cada bando; quem já voltou pousa. */
  step(stirs: readonly Stir[], now: number) {
    this.feathers = this.feathers.filter((f) => now - f.at < f.piece.born + f.piece.life);
    this.minds.forEach((m, flock) => {
      if (m.kind === 'away') {
        if (now >= m.back + FLIGHT_MS + BIRD_STAGGER * BIRDS.length) this.minds[flock] = { kind: 'perched' };
        return;
      }
      const birds = BIRDS.filter((b) => b.flock === flock);
      const roof = birds[0]?.perch.roof;
      const boss = stirs.find((s) => s.boss && s.kind === 'land' && roofAt(s.x) === roof);
      const scare = boss ?? (flock === BOSS_ONLY ? undefined : stirs.find((s) => birds.some((b) => Math.abs(s.x - b.perch.x) <= BIRD_SCARE_R && b.perch.y - s.y < 60 && s.y - b.perch.y < 30)));
      if (!scare) return;
      const cx = birds.reduce((a, b) => a + b.perch.x, 0) / birds.length;
      const dir: 1 | -1 = scare.x <= cx ? 1 : -1;
      const back = now + BIRD_AWAY_MS[0] + Math.floor(hash(this.seed, flock, Math.floor(now / 1000)) * (BIRD_AWAY_MS[1] - BIRD_AWAY_MS[0]));
      this.minds[flock] = { kind: 'away', left: now, dir, back };
      const random = seeded(Math.floor(hash(this.seed, flock, now) * 2 ** 32));
      for (const b of birds) for (let k = 0; k < FEATHERS_PER_BIRD; k++) {
        this.feathers.push({
          from: { x: b.perch.x, y: b.perch.y + 6, z: b.perch.z }, at: now,
          piece: { born: Math.floor(random() * 200), life: 1400 + Math.floor(random() * 700), ox: Math.round(random() * 6 - 3), oy: Math.round(random() * 4), vx: (random() * 2 - 1) * 40, vy: 15 + random() * 30, fall: 9 + random() * 6, sway: 2 + random() * 2, phase: random() * Math.PI * 2, color: Math.floor(random() * FEATHER_COLORS.length), size: 1 },
        });
      }
    });
  }

  /** Cada pássaro agora: no poleiro (o parado defasado por pássaro), indo embora, sumido, ou voltando. */
  poses(now: number): BirdPose[] {
    return BIRDS.map((b, i): BirdPose => {
      const m = this.minds[b.flock];
      // o parado de cada um começa num ponto diferente do ciclo, sempre o mesmo em toda aba
      const idle: BirdPose = { ...b.perch, strip: `${b.kind}/idle`, since: -Math.floor(hash(this.seed, 100 + i) * 1200), facing: b.facing, visible: true };
      if (m.kind === 'perched') return idle;
      const delay = Math.floor(hash(this.seed, 200 + i) * BIRD_STAGGER);
      const out = now - m.left - delay;
      if (now < m.back + delay) {
        if (out < 0) return idle;
        if (out > FLIGHT_MS) return { ...idle, visible: false };
        const o = flightOffset(out, m.dir);
        return { x: b.perch.x + o.x, y: b.perch.y + o.y, z: b.perch.z, strip: `${b.kind}/fly`, since: m.left + delay, facing: m.dir, visible: true };
      }
      // a volta: o mesmo arco de trás para a frente, chegando no poleiro; olha para onde vai (o contrário da ida)
      const left = FLIGHT_MS - (now - m.back - delay);
      if (left <= 0) return idle;
      const o = flightOffset(left, m.dir);
      return { x: b.perch.x + o.x, y: b.perch.y + o.y, z: b.perch.z, strip: `${b.kind}/fly`, since: m.back + delay, facing: m.dir === 1 ? -1 : 1, visible: true };
    });
  }
}

// --- tudo junto -------------------------------------------------------------------------------------------------------

/** Os bichos de uma sala: os gatos, os bandos e quem os espanta. `fauna.ts` chama `tick` a cada quadro e desenha. */
export class Critters {
  readonly cats: Cat[];
  readonly flocks: Flocks;
  private readonly watcher = new Watcher();
  private cheers: string[] = [];

  constructor(readonly seed: number) {
    this.cats = CATS.map((_, i) => new Cat(i, seed));
    this.flocks = new Flocks(seed);
  }

  /** `id` acertou: no próximo quadro, o gato mais perto dele mia. */
  cheer(id: string) { this.cheers.push(id); }

  /** Um quadro: `folk` é todo mundo no telhado (eu também), `now` o relógio de parede, ms. */
  tick(folk: readonly Folk[], now: number): { cats: CatPose[]; birds: BirdPose[] } {
    const stirs = this.watcher.tick(folk, now);
    const still = (id: string) => this.watcher.stillFor(id, now);
    for (const c of this.cats) c.step(folk, stirs, still, now);
    for (const id of this.cheers) {
      const f = folk.find((p) => p.id === id);
      if (!f) continue;
      const cat = [...this.cats].sort((a, b) => Math.abs(a.where(now).x - f.x) - Math.abs(b.where(now).x - f.x))[0];
      cat?.meow(now);
    }
    this.cheers = [];
    this.flocks.step(stirs, now);
    return { cats: this.cats.map((c) => c.pose(folk, now)), birds: this.flocks.poses(now) };
  }
}
