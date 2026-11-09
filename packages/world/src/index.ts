/**
 * O telhado (ADR 0005): movimento, gravidade, colisão, ficar na cabeça dos outros, empurrão e volta depois da queda.
 * Puro: nada de DOM, Pixi ou rede. Cada navegador simula o próprio personagem com isto, contra as últimas posições
 * conhecidas dos outros; a projeção na tela (ADR 0006) mora aqui também, para o Pixi e os post-its em HTML usarem a mesma.
 *
 * Unidades: pixels do mundo (1 = 1 pixel do sprite, antes da ampliação). `x` ao longo dos telhados (direita positiva),
 * `y` para cima (0 = chão do telhado mais baixo), `z` em profundidade (0 = beirada da frente, cresce para o fundo).
 * Tempo em segundos dentro da física (`dt`), e em ms quando é hora do relógio (`now`).
 *
 * Para a arte: 1 unidade do mundo = 1 pixel do quadro do personagem e 1 pixel da folha do telhado; a tela amplia tudo
 * pela mesma escala inteira (`View.scale`). O `MAP` é a colisão; o cenário (`apps/web/src/lib/world/dressing.ts` e
 * `tools/sprites/src/rooftop.ts`) tem que bater com ele ao pixel. Ver `docs/art.md`.
 */
export interface Vec3 { x: number; y: number; z: number }

// --- física -----------------------------------------------------------------------------------------------------------

export const GRAVITY = 900;
/** velocidade inicial do pulo: o pico fica em JUMP_V² / 2·GRAVITY = 50 px */
export const JUMP_V = 300;
export const WALK = 80;
export const RUN = 150;
/** andar em profundidade (W/S) */
export const DEPTH_SPEED = 60;
/** quanto o corpo sobe sem pular (beirada baixa, degrau) */
export const STEP = 6;
/**
 * o corpo é uma elipse no chão (meia-largura em x, meia-profundidade em z) e uma altura, em unidades do mundo. A elipse
 * é mais estreita que o desenho (o herói parado tem 32 de largura) para os corpos poderem se encostar; `BODY_H` é a
 * altura da cabeça em que outro pisa (o herói parado tem 37 de altura, o esqueleto 51): não é o topo do sprite, e o
 * post-it usa a cabeça do atlas (`headY` em `apps/web/src/lib/world/view.ts`), não isto. A sombra no cliente sai da elipse.
 */
export const BODY_RX = 8;
export const BODY_RZ = 5;
export const BODY_H = 40;
/** abaixo disto, caiu na rua */
export const FALL_Y = -160;
/** quanto tempo depois de cair o personagem volta, ms */
export const RESPAWN_MS = 1500;
/** quanto tempo pisca depois de voltar, ms (só visual) */
export const BLINK_MS = 1000;

// --- empurrão ---------------------------------------------------------------------------------------------------------

/** alcance do empurrão à frente do corpo, e tolerância em profundidade e altura */
export const SHOVE_REACH = 22;
export const SHOVE_DZ = 10;
export const SHOVE_DY = 30;
/** o empurrão joga para trás e um pouco para cima; quem é empurrado perde o controle por um tempo, ms */
export const SHOVE_VX = 260;
export const SHOVE_VY = 160;
export const SHOVE_STUN_MS = 400;
/**
 * tempo entre dois empurrões da mesma pessoa, ms. É também quanto dura a animação `shove` no mundo (`anim` fica `shove`
 * até `shoveUntil`): a linha `shove` da folha tem que caber nisto (herói 7 quadros a 16 fps = 438 ms, esqueleto 5 a
 * 12 = 417 ms); mais longa, é cortada; mais curta, segura o último quadro.
 */
export const SHOVE_COOLDOWN_MS = 450;

// --- mapa -------------------------------------------------------------------------------------------------------------

/**
 * Uma caixa sólida do chão até `top`: um telhado (o vão entre telhados é onde se cai) ou algo em cima dele (ar-condicionado,
 * caixa-d'água). Dá para pisar em cima; o lado bloqueia quem está abaixo de `top - STEP`.
 */
export interface Platform { x0: number; x1: number; z0: number; z1: number; top: number; kind: 'roof' | 'box' }

/**
 * fundo do telhado (o `z` vai de 0 a isto), em unidades do mundo; na tela, `DEPTH`·`DEPTH_K` = 33,6 linhas, por isso o
 * ladrilho do tampo (`roof-top` em `tools/sprites/src/rooftop.ts`) tem 34
 */
export const DEPTH = 56;

/**
 * O telhado: três prédios com vãos de 50 px entre eles, umas duas telas de largura, o do meio o mais alto, e caixas em
 * cima para subir. Os vãos se cruzam correndo (RUN · tempo no ar ≈ 100 px, sobra uns 40 px para subir no do meio);
 * andando, só descendo (do meio para o da direita, com uns 7 px de folga): subir no telhado do meio pede corrida.
 *
 * Arte: cada `box` precisa de um objeto na folha do telhado com a mesma largura, a frente da altura `top` − telhado e o
 * tampo com `round((z1 − z0)·DEPTH_K)` linhas (`fits` em `tools/sprites/src/rooftop.ts`), senão fica invisível; cada
 * `roof` ganha tampo, muretas e fachada em `apps/web/src/lib/world/platforms.ts`.
 */
export const MAP: readonly Platform[] = [
  { kind: 'roof', x0: 0, x1: 260, z0: 0, z1: DEPTH, top: 0 },
  { kind: 'roof', x0: 310, x1: 540, z0: 0, z1: DEPTH, top: 24 },
  { kind: 'roof', x0: 590, x1: 880, z0: 0, z1: DEPTH, top: 8 },
  { kind: 'box', x0: 120, x1: 160, z0: 30, z1: DEPTH, top: 28 },
  { kind: 'box', x0: 400, x1: 440, z0: 34, z1: DEPTH, top: 56 },
  { kind: 'box', x0: 700, x1: 744, z0: 36, z1: DEPTH, top: 60 },
];

/** onde o mundo acaba dos lados (paredes invisíveis) */
export const WORLD_X0 = -20;
export const WORLD_X1 = 900;

// --- corpos -----------------------------------------------------------------------------------------------------------

/**
 * As animações do personagem (as linhas da folha gerada por `bun run sprites`, nesta ordem: `ANIMATION_NAMES` em
 * `tools/sprites/src/atlas.ts`). `animate` escolhe: `idle` parado ou atordoado, `walk` andando, `run` acima de `WALK`
 * (Shift), `jump` subindo, `fall` descendo e depois `fall_loop`, `shove` durante `SHOVE_COOLDOWN_MS` depois do J.
 */
export type Anim = 'idle' | 'walk' | 'run' | 'jump' | 'fall' | 'fall_loop' | 'shove';

export interface Body extends Vec3 {
  vx: number; vy: number; vz: number;
  facing: 1 | -1;
  /** pisando em algo (telhado, caixa ou cabeça de alguém) */
  grounded: boolean;
  /** em cima da cabeça de quem (id), para ser carregado; null = não */
  riding: string | null;
  anim: Anim;
  /** hora em que a animação atual começou, ms */
  animSince: number;
  /** empurrado: sem controle até esta hora, ms */
  stunnedUntil: number;
  /** empurrou: não empurra de novo até esta hora, ms */
  shoveUntil: number;
  /** caiu na rua: volta nesta hora, ms; null = não caiu */
  respawnAt: number | null;
  /** voltou: pisca até esta hora, ms */
  blinkUntil: number;
}

/** O que o teclado pede neste passo. `jump` e `shove` são o aperto (a borda), não a tecla segurada. */
export interface Input { left: boolean; right: boolean; up: boolean; down: boolean; run: boolean; jump: boolean; shove: boolean }
export const NO_INPUT: Input = { left: false, right: false, up: false, down: false, run: false, jump: false, shove: false };

/** Outro corpo como este navegador o conhece agora (a última presença recebida, já interpolada). */
export interface Other extends Vec3 { id: string; vx: number; vy: number; vz: number; solid: boolean }

export type WorldEvent =
  | { type: 'jump' }
  | { type: 'land' }
  | { type: 'fell' }
  | { type: 'respawn' }
  /** o empurrão saiu: `targets` são os ids que estavam ao alcance, na hora */
  | { type: 'shove'; targets: string[] };

export interface StepCtx { now: number; platforms: readonly Platform[]; others: readonly Other[] }

/** Um corpo novo, parado no ponto de volta (`spawnPoint`), com `x` deslocado por `offset` para não nascerem empilhados. */
export function createBody(platforms: readonly Platform[], now: number, offset = 0): Body {
  const s = spawnPoint(platforms);
  const x = s.x + offset;
  return {
    x,
    y: groundAt(platforms, x, s.z) ?? s.y,
    z: s.z,
    vx: 0,
    vy: 0,
    vz: 0,
    facing: 1,
    grounded: true,
    riding: null,
    anim: 'idle',
    animSince: now,
    stunnedUntil: 0,
    shoveUntil: 0,
    respawnAt: null,
    blinkUntil: 0,
  };
}

/** o passo mais longo que se simula de uma vez (aba no fundo não teletransporta), s */
const MAX_DT = 0.05;
/** atordoado no chão, a velocidade horizontal cai isto por segundo, px/s² */
const FRICTION = 1200;
/**
 * `fall` toca uma vez: 4 quadros a 12 fps em apps/web/src/lib/sprites/hero.json, ms. Fixo do herói e usado para os dois
 * modelos: o `fall` do esqueleto (2 quadros a 10 fps = 200 ms) segura o último quadro por uns 133 ms antes do
 * `fall_loop`. Um modelo com `fall` mais longo que isto tem o fim cortado.
 */
const FALL_MS = (4 / 12) * 1000;
/** parado contra um lado, fica a isto dele (para continuar fora do retângulo, que inclui as bordas) */
const GAP = 1e-6;

function contains(p: Platform, x: number, z: number): boolean {
  return x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1;
}

/** o lado de `p` bloqueia quem está em `y` */
function walls(p: Platform, y: number): boolean {
  return p.top > y + STEP;
}

/** se as elipses dos dois corpos se invadem em x/z (0 = mesmo ponto, 1 = encostando) */
function spread(dx: number, dz: number): number {
  return (dx / (2 * BODY_RX)) ** 2 + (dz / (2 * BODY_RZ)) ** 2;
}

/** os dois corpos ocupam a mesma altura (com STEP de folga, para quem está em cima de uma cabeça não ser empurrado) */
function sameHeight(y: number, o: Other): boolean {
  return y + STEP < o.y + BODY_H && o.y + STEP < y + BODY_H;
}

/** dá para estar em (x, z) nesta altura: dentro do mundo, e fora dos lados que bloqueiam */
function free(platforms: readonly Platform[], x: number, y: number, z: number): boolean {
  if (x < WORLD_X0 || x > WORLD_X1 || z < 0 || z > DEPTH) return false;
  return !platforms.some((p) => walls(p, y) && contains(p, x, z));
}

/** anda em x de `x` para `to` em profundidade `z`, parando no primeiro lado que bloqueia */
function sweepX(platforms: readonly Platform[], x: number, to: number, y: number, z: number): number {
  to = Math.min(WORLD_X1, Math.max(WORLD_X0, to));
  for (const p of platforms) {
    if (!walls(p, y) || z < p.z0 || z > p.z1) continue;
    if (to > x && x < p.x0 && to >= p.x0) to = Math.min(to, p.x0 - GAP);
    if (to < x && x > p.x1 && to <= p.x1) to = Math.max(to, p.x1 + GAP);
  }
  return to;
}

/** o mesmo em z, já na posição `x` nova */
function sweepZ(platforms: readonly Platform[], z: number, to: number, y: number, x: number): number {
  to = Math.min(DEPTH, Math.max(0, to));
  for (const p of platforms) {
    if (!walls(p, y) || x < p.x0 || x > p.x1) continue;
    if (to > z && z < p.z0 && to >= p.z0) to = Math.min(to, p.z0 - GAP);
    if (to < z && z > p.z1 && to <= p.z1) to = Math.max(to, p.z1 + GAP);
  }
  return to;
}

/**
 * Tira este corpo de dentro dos outros sólidos na mesma altura, pelo eixo de menor invasão (o outro não se mexe). Se a
 * saída mais curta cai numa parede ou fora do mundo, tenta a próxima; se nenhuma serve, fica.
 */
function separate(b: Body, others: readonly Other[], platforms: readonly Platform[]): void {
  for (const o of others) {
    if (!o.solid || !sameHeight(b.y, o)) continue;
    const dx = b.x - o.x;
    const dz = b.z - o.z;
    if (spread(dx, dz) >= 1) continue;
    // onde a borda da elipse dobrada fica, mantendo o outro eixo
    const ex = 2 * BODY_RX * Math.sqrt(Math.max(0, 1 - (dz / (2 * BODY_RZ)) ** 2));
    const ez = 2 * BODY_RZ * Math.sqrt(Math.max(0, 1 - (dx / (2 * BODY_RX)) ** 2));
    const sx = dx === 0 ? -b.facing : Math.sign(dx);
    const zs = dz === 0 ? [1, -1] : [Math.sign(dz)];
    const exits = [
      { x: o.x + sx * (ex + GAP), z: b.z, d: ex - Math.abs(dx) },
      ...zs.map((sz) => ({ x: b.x, z: o.z + sz * (ez + GAP), d: ez - Math.abs(dz) })),
    ].sort((a, c) => a.d - c.d);
    const exit = exits.find((e) => free(platforms, e.x, b.y, e.z));
    if (exit) {
      b.x = exit.x;
      b.z = exit.z;
    }
  }
}

/** O chão debaixo de (x, z): o topo mais alto entre as plataformas e as cabeças sólidas ali que não estavam acima de `wasY`. */
function floorAt(platforms: readonly Platform[], others: readonly Other[], x: number, z: number, wasY: number) {
  let top = groundAt(platforms, x, z);
  let by: string | null = null;
  for (const o of others) {
    const head = o.y + BODY_H;
    if (!o.solid || spread(x - o.x, z - o.z) >= 1 || wasY < head - STEP) continue;
    if (top === null || head > top) {
      top = head;
      by = o.id;
    }
  }
  return { top, by };
}

function animate(b: Body, now: number): Anim {
  if (now < b.shoveUntil) return 'shove';
  if (!b.grounded) {
    if (b.vy > 0) return 'jump';
    if (b.anim === 'fall_loop' || (b.anim === 'fall' && now - b.animSince >= FALL_MS)) return 'fall_loop';
    return 'fall';
  }
  if (now < b.stunnedUntil) return 'idle';
  if (b.vx !== 0 || b.vz !== 0) return Math.abs(b.vx) > WALK ? 'run' : 'walk';
  return 'idle';
}

/**
 * Um passo de `dt` segundos:
 * - caído (`respawnAt`): não se mexe; na hora, volta em `spawnPoint` parado, pisca por `BLINK_MS` e emite `respawn`.
 * - controle (se não está atordoado): esquerda/direita a `WALK` (ou `RUN` com `run`), `up`/`down` em profundidade a
 *   `DEPTH_SPEED` (`up` = para o fundo), virar para o lado em que anda; pular só pisando em algo (`jump`, vy = JUMP_V);
 *   empurrar (`shove`) se passou `shoveUntil`: emite `shove` com quem está ao alcance (`shoveTargets`) e trava até
 *   `now + SHOVE_COOLDOWN_MS`. Atordoado, a velocidade horizontal vai a zero aos poucos (atrito) e nada do teclado vale.
 * - gravidade; colisão com os lados das plataformas mais altas que `y + STEP` (para em x e em z separadamente), e com os
 *   outros corpos sólidos que ocupam a mesma altura (só este corpo é empurrado para fora, pelo eixo de menor invasão);
 *   o mundo acaba em `WORLD_X0`/`WORLD_X1`, e em z de 0 a `DEPTH` enquanto estiver em cima de um telhado.
 * - chão: o topo mais alto debaixo dos pés (plataforma ou cabeça de outro, `other.y + BODY_H`) quando descendo; pousar
 *   emite `land`. Em cima de uma cabeça, `riding` é o id, e o corpo anda junto com a velocidade dela.
 * - abaixo de `FALL_Y`: emite `fell` e marca `respawnAt = now + RESPAWN_MS`.
 * - animação (`anim`, e `animSince` quando muda): empurrando = shove (até `shoveUntil`); no ar subindo = jump,
 *   descendo = fall e depois fall_loop; no chão andando = walk ou run; parado = idle.
 */
export function stepBody(body: Body, input: Input, dt: number, ctx: StepCtx): { body: Body; events: WorldEvent[] } {
  const { now, platforms, others } = ctx;
  const events: WorldEvent[] = [];
  dt = Math.min(MAX_DT, Math.max(0, dt));

  if (body.respawnAt !== null) {
    if (now < body.respawnAt) return { body, events };
    const s = spawnPoint(platforms);
    events.push({ type: 'respawn' });
    return {
      body: {
        ...body,
        ...s,
        vx: 0,
        vy: 0,
        vz: 0,
        grounded: true,
        riding: null,
        anim: 'idle',
        animSince: now,
        stunnedUntil: 0,
        respawnAt: null,
        blinkUntil: now + BLINK_MS,
      },
      events,
    };
  }

  const b: Body = { ...body };

  // controle
  if (now >= b.stunnedUntil) {
    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    b.vx = dir * (input.run ? RUN : WALK);
    if (dir !== 0) b.facing = dir as 1 | -1;
    b.vz = ((input.up ? 1 : 0) - (input.down ? 1 : 0)) * DEPTH_SPEED;
    if (input.jump && b.grounded) {
      b.vy = JUMP_V;
      b.grounded = false;
      b.riding = null;
      events.push({ type: 'jump' });
    }
    if (input.shove && now >= b.shoveUntil) {
      events.push({ type: 'shove', targets: shoveTargets(b, others) });
      b.shoveUntil = now + SHOVE_COOLDOWN_MS;
    }
  } else if (b.grounded) {
    const speed = Math.hypot(b.vx, b.vz);
    const k = speed > 0 ? Math.max(0, speed - FRICTION * dt) / speed : 0;
    b.vx *= k;
    b.vz *= k;
  }

  // em cima de alguém, anda junto
  const carrier = b.riding === null ? undefined : others.find((o) => o.id === b.riding && o.solid);
  const cx = carrier?.vx ?? 0;
  const cz = carrier?.vz ?? 0;

  // lados: x e depois z, para deslizar pela parede
  const wantX = b.x + (b.vx + cx) * dt;
  b.x = sweepX(platforms, b.x, wantX, b.y, b.z);
  if (b.x !== wantX) b.vx = 0;
  const wantZ = b.z + (b.vz + cz) * dt;
  b.z = sweepZ(platforms, b.z, wantZ, b.y, b.x);
  if (b.z !== wantZ) b.vz = 0;
  separate(b, others, platforms);

  // gravidade (Euler explícito: a posição anda com a velocidade de antes)
  const wasY = b.y;
  const wasGrounded = b.grounded;
  b.y += b.vy * dt;
  b.vy -= GRAVITY * dt;

  // chão
  const floor = floorAt(platforms, others, b.x, b.z, wasY);
  const onFloor =
    floor.top !== null && b.vy <= 0 && (b.y <= floor.top || (wasGrounded && b.y - floor.top <= STEP));
  if (onFloor) {
    if (!body.grounded) events.push({ type: 'land' });
    b.y = floor.top!;
    b.vy = 0;
    b.grounded = true;
    b.riding = floor.by;
  } else {
    b.grounded = false;
    b.riding = null;
  }

  // caiu na rua
  if (b.y < FALL_Y) {
    events.push({ type: 'fell' });
    b.respawnAt = now + RESPAWN_MS;
    b.vx = 0;
    b.vy = 0;
    b.vz = 0;
  }

  const anim = animate(b, now);
  if (anim !== b.anim) {
    b.anim = anim;
    b.animSince = now;
  }
  return { body: b, events };
}

/** Quem este corpo alcança empurrando agora: à frente (no lado de `facing`) até `SHOVE_REACH`, perto em z e em y. */
export function shoveTargets(body: Body, others: readonly Other[]): string[] {
  return others
    .filter((o) => {
      const ahead = (o.x - body.x) * body.facing;
      return (
        o.solid &&
        ahead > 0 &&
        ahead <= SHOVE_REACH + BODY_RX &&
        Math.abs(o.z - body.z) <= SHOVE_DZ &&
        Math.abs(o.y - body.y) <= SHOVE_DY
      );
    })
    .map((o) => o.id);
}

/** Este corpo foi empurrado por alguém virado para `dir`: é jogado para lá e para cima, atordoado, solto de cabeças. */
export function applyShove(body: Body, dir: 1 | -1, now: number): Body {
  return {
    ...body,
    vx: dir * SHOVE_VX,
    vy: SHOVE_VY,
    vz: 0,
    grounded: false,
    riding: null,
    stunnedUntil: now + SHOVE_STUN_MS,
  };
}

/** Onde se volta depois de cair: no meio (em x e em z) do topo mais alto entre os telhados (`kind: 'roof'`) do meio do mapa. */
export function spawnPoint(platforms: readonly Platform[]): Vec3 {
  const roofs = platforms.filter((p) => p.kind === 'roof');
  if (roofs.length === 0) return { x: (WORLD_X0 + WORLD_X1) / 2, y: 0, z: DEPTH / 2 };
  const left = Math.min(...roofs.map((r) => r.x0));
  const right = Math.max(...roofs.map((r) => r.x1));
  const middle = (left + right) / 2;
  const off = (r: Platform) => Math.abs((r.x0 + r.x1) / 2 - middle);
  // o mais alto; no empate, o mais perto do meio do mapa
  const best = roofs.reduce((a, r) => (r.top > a.top || (r.top === a.top && off(r) < off(a)) ? r : a));
  return { x: (best.x0 + best.x1) / 2, y: best.top, z: (best.z0 + best.z1) / 2 };
}

/** A altura do chão em (x, z): o topo mais alto de plataforma que contém o ponto; null = vão (cai). */
export function groundAt(platforms: readonly Platform[], x: number, z: number): number | null {
  let top: number | null = null;
  for (const p of platforms) if (contains(p, x, z) && (top === null || p.top > top)) top = p.top;
  return top;
}

/** Se o personagem pisca agora (caído ou voltando): para quem desenha. */
export function blinking(body: Pick<Body, 'respawnAt' | 'blinkUntil'>, now: number): boolean {
  return body.respawnAt !== null || now < body.blinkUntil;
}

// --- projeção ---------------------------------------------------------------------------------------------------------

/**
 * quanto um pixel de profundidade sobe na tela (a perspectiva do beat 'em up): uma projeção oblíqua, sem encurtar a
 * altura (`y` fica 1:1) e com 1 unidade de `z` virando 0,6 de altura na tela, então o telhado (56 de fundo) ocupa umas 34
 * linhas. Os tampos e os objetos de caixa da folha do telhado são desenhados achatados por isto (o fundo de uma caixa
 * vira `round(fundo · 0,6)` linhas); mudar este número pede refazer essas grades.
 */
export const DEPTH_K = 0.6;

/** A tela onde se projeta, em pixels da tela (`makeView` em `apps/web/src/lib/world/view.ts`). */
export interface View {
  /** pixels da tela por pixel do mundo (inteiro, para o pixel art não borrar) */
  scale: number;
  width: number;
  height: number;
  /** onde, em pixels da tela a partir do topo, fica o chão (y = 0) na beirada da frente (z = 0) */
  groundY: number;
}

/** A câmera: o ponto do mundo no centro da tela, em x (unidades do mundo; não há câmera em y nem em z). */
export interface Camera { x: number }

/**
 * Um ponto do mundo na tela: `sx = (x - cam.x)·scale + width/2`, `sy = groundY - (y + z·DEPTH_K)·scale`. É a mesma conta
 * para o Pixi e para os post-its em HTML (ADR 0006). `p` em unidades do mundo; o resultado em pixels da tela, sem
 * arredondar (o Pixi arredonda com `roundPixels`, o HTML com `Math.round`).
 */
export function project(p: Vec3, cam: Camera, view: View): { x: number; y: number } {
  return {
    x: (p.x - cam.x) * view.scale + view.width / 2,
    y: view.groundY - (p.y + p.z * DEPTH_K) * view.scale,
  };
}

/**
 * A ordem de desenho: maior primeiro = mais ao fundo. Quem está mais ao fundo (z maior) fica atrás. Só `z`: a altura não
 * conta (quem pula ou está na cabeça de alguém fica na sua profundidade); `scene.ts` desempata pelo id.
 */
export function depthKey(p: Pick<Vec3, 'z'>): number {
  return p.z;
}

/**
 * A câmera segue o corpo: o centro vai na direção de `target.x` (suave, `follow` por segundo), sem mostrar além das pontas
 * do mundo (a menos que a tela seja maior que o mundo, aí fica no meio).
 */
export function followCamera(cam: Camera, target: Pick<Vec3, 'x'>, view: View, dt: number, follow = 6): Camera {
  const half = view.width / view.scale / 2;
  if (2 * half >= WORLD_X1 - WORLD_X0) return { x: (WORLD_X0 + WORLD_X1) / 2 };
  const x = cam.x + (target.x - cam.x) * (1 - Math.exp(-follow * Math.max(0, dt)));
  return { x: Math.min(WORLD_X1 - half, Math.max(WORLD_X0 + half, x)) };
}
