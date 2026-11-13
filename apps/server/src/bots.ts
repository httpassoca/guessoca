/**
 * Os bots engraçados (issue #55, emenda do ADR 0005): personagens que ninguém controla e que aparecem no telhado com o
 * jogo rodando, para distrair e fazer rir. O corpo e o que fazem não dependem do jogo (vez, voto, relógio): só veem corpos no telhado. A fala de alguns é outra coisa (`talk.ts`).
 * Puro: sem sockets nem relógio; o `RoomHost` chama `tick` umas trinta vezes por segundo com a hora, as pessoas como as
 * conhece (a última presença de cada uma) e um sorteio (`rng`), e repassa o que sai (presenças, empurrões, a lista).
 *
 * Duas camadas, as duas com dado em tudo, para ninguém conseguir deduzir o que vem:
 * - o **diretor** decide quando e quantos chegam. Tem um humor entre calmo e caótico que passeia ao acaso (e tende a
 *   subir devagar num jogo longo, sem horário); de tempos em tempos sorteia um acontecimento: um bot, alguns, um grupo,
 *   uma invasão, uma visita de clones, um sossego (alguns vão embora), uma limpa. Nunca passa de `BOTS_MAX`.
 * - cada **bot** tem pesos próprios (a personalidade, sorteada) e, quando termina o que fazia, dá nota a cada coisa
 *   que pode fazer agora pelo que há em volta, com dado, e sorteia entre as melhores. O que fazem está em `ACTIONS`.
 *
 * O corpo é o mesmo das pessoas (`stepBody` do `@guess/world`): o cérebro só "aperta teclas" (`Input`). Por isso são
 * desajeitados de propósito: calculam mal um pulo, caem do telhado, empacam numa caixa.
 *
 * O **chefão** (issue #60) é um acontecimento raro do diretor (mais raro que a invasão, um por vez, conta para o máximo):
 * a versão gigante de um personagem (`BOSS_SCALE` na lista; o desenho é do cliente), que cai do céu no telhado com mais
 * gente e aguenta `BOSS_HP` empurrões, de pessoas ou de bots (os de bot contam pouco e nunca são o último:
 * `BOSS_BOT_HIT_MS`). Os primeiros só o fazem cambalear (um tranco curto que nunca o tira do telhado) e ele costuma ir
 * atrás de quem bateu; o último o joga longe e ele some de vez. Só anda, não sai do telhado em que caiu, não é
 * desajeitado (se cair mesmo assim, volta) e só faz o que está em `BOSS_ACTIONS`: passeia, segue, encara, empurra. O
 * sossego e a limpa do diretor não o levam: sai na hora dele (um ou dois minutos), no último empurrão, ou fugindo com
 * os outros quando a opção é desligada. O corpo dele é mais alto e mais largo para os outros (`Other.h`, `Other.wide`),
 * não mais fundo. Numa sala de desenvolvimento o primeiro acontecimento é um chefão (`bossFirst`).
 */
import { BOSS_SCALE, BOTS_MAX, EMOTE_MS, type BotView, type EmoteName, type Presence } from '@guess/protocol';
import {
  applyShove, blinking, BODY_H, BODY_RX, createBody, DEPTH, groundAt, MAP, NO_INPUT, SHOVE_DZ, SHOVE_REACH, STEP, stepBody, WORLD_X0, WORLD_X1,
  type Body, type Input, type Other, type Platform,
} from '@guess/world';

/** Os bots, todos juntos, empurram a mesma pessoa no máximo uma vez a cada isto, ms. */
export const BOT_SHOVE_PLAYER_MS = 20_000;
/** Desligada a opção, cada bot foge do telhado em até isto, ms; quem ainda estiver aí some. */
export const BOTS_FLEE_MS = 6000;

/** Quantos empurrões o chefão aguenta: o último o joga para fora. */
export const BOSS_HP = 6;
/** a que distância em x o chefão e outro corpo se encostam, em vezes a de dois corpos comuns: a média das duas larguras */
const BOSS_WIDE = (1 + BOSS_SCALE) / 2;
/** onde o chefão para ao lado de quem segue, encara ou vai empurrar: logo além de onde encosta (ainda ao alcance do empurrão) */
const BOSS_NEAR = 2 * BODY_RX * BOSS_WIDE + 3;
/**
 * O empurrão de outro bot no chefão conta no máximo uma vez a cada isto, ms (os outros ele nem sente), e nunca é o
 * último: quem o derruba é sempre uma pessoa. Sem isto, dois bots brigando com ele o tiram do telhado em segundos.
 */
export const BOSS_BOT_HIT_MS = 5000;
/**
 * o tranco de um empurrão que ainda não o derruba: para o lado e para cima (unidades por segundo) e sem controle por
 * isto, ms. Anda uns 18 no ar (o empurrão comum leva uns 95); a menos de `BOSS_FLINCH_ROOM` da beirada, só o pulinho
 */
const BOSS_FLINCH_VX = 60;
const BOSS_FLINCH_VY = 130;
const BOSS_FLINCH_MS = 300;
const BOSS_FLINCH_ROOM = 26;
/** o último empurrão: voa longe (uns 250 de lado, 70 de altura) piscando e some depois disto, ms */
const BOSS_OUT_VX = 320;
const BOSS_OUT_VY = 360;
const BOSS_OUT_MS = 1300;

/** Uma pessoa no telhado como o servidor a conhece: a última presença dela. */
export interface Seen { id: string; x: number; y: number; z: number; vx: number; vy: number; vz: number; solid: boolean }

/** O que um bot pode escolher fazer quando está à toa. */
export const ACTIONS = ['wander', 'follow', 'headsit', 'stare', 'fight', 'panic', 'copycat', 'lemming', 'crowd', 'stagedive', 'statue', 'bully'] as const;
export type ActionName = (typeof ACTIONS)[number];
/** O que ele faz sem escolher: chegando, indo embora, fugindo de quem o empurrou, indo se vingar. */
/** O que o chefão escolhe fazer (o resto não se lê no tamanho dele), e quanto gosta de cada coisa além da nota de todos. */
const BOSS_LIKES: Partial<Record<ActionName, number>> = { wander: 1, follow: 2.5, stare: 1.5, bully: 2, fight: 1 };
export const BOSS_ACTIONS: readonly ActionName[] = ACTIONS.filter((a) => a in BOSS_LIKES);
type Doing = ActionName | 'arrive' | 'leave' | 'flee' | 'revenge';

/** A nota de partida de cada ação, antes da personalidade, do que há em volta e do dado. */
const BASE: Record<ActionName, number> = { wander: 3, follow: 1.6, headsit: 1.1, stare: 1.2, fight: 0.9, panic: 0.7, copycat: 1, lemming: 0.35, crowd: 1.2, stagedive: 0.7, statue: 0.8, bully: 0.8 };

/** O que um bot faz quando uma pessoa o empurra: foge, volta para se vingar, ou vai embora. */
type Temper = 'flee' | 'revenge' | 'leave';
type Exit = 'walk' | 'jump' | 'blink';

export interface Bot {
  id: string;
  character: number;
  body: Body;
  /** quanto dura o ataque do personagem dele, ms */
  shoveMs: number;
  /** a personalidade: quanto ele gosta de cada ação */
  weights: Record<ActionName, number>;
  temper: Temper;
  /** anda sem olhar o vão (cai mais) */
  clumsy: boolean;
  doing: Doing;
  since: number;
  until: number;
  /** quem ele segue, encara, imita, empurra… (id de pessoa ou de bot) */
  target: string | null;
  goal: { x: number; z: number } | null;
  /** o passo dentro da ação */
  phase: number;
  /** a próxima hora de fazer a coisa repetida da ação (balão, pulinho) */
  nextBeat: number;
  emote: { name: EmoteName; since: number } | null;
  /** quando vai embora sozinho */
  leaveAt: number;
  exit: Exit;
  /** quantas vezes ainda volta depois de cair */
  comebacks: number;
  /** quem o empurrou por último */
  grudge: string | null;
  /** o chefão: gigante, lento, aguenta `hp` empurrões */
  boss: boolean;
  /** quantos empurrões o chefão ainda aguenta (0 em quem não é) */
  hp: number;
  /** a última vez que o empurrão de um bot contou no chefão */
  botHitAt: number;
  /** de onde não sai: para notar que empacou */
  stuckX: number;
  stuckSince: number;
  /** o mesmo em profundidade, só para o chefão (largo, fica entalado entre dois corpos com mais facilidade) */
  stuckZ: number;
  /** o que quem ele imita fazia, com a hora */
  trail: { at: number; vx: number; vz: number; up: boolean }[];
}

/** Um chefão derrubado (os pontos dele acabaram): quem e onde estava. */
export interface BossDown { id: string; x: number; y: number; z: number }

/**
 * O que saiu de um passo: os empurrões em pessoas (para o `RoomHost` entregar), se a lista de bots mudou desde o passo
 * anterior (quem está no telhado, ou os pontos do chefão), os chefões derrubados desde o passo anterior (o raio) e, para a
 * fala (`talk.ts`), os empurrões de bot em bot que pegaram (`hits`) e os bots que caíram do telhado (`falls`).
 */
export interface BotTick { shoves: { target: string; by: string; dir: 1 | -1 }[]; rosterChanged: boolean; downs: BossDown[]; hits: { bot: string; by: string }[]; falls: string[] }

export interface BotWorldOptions {
  /** quantos personagens existem (`CHARACTERS`) */
  characters: number;
  /** quanto dura o ataque de cada personagem, ms, pelo lugar dele */
  attackMs?: readonly number[];
  platforms?: readonly Platform[];
  /** o primeiro acontecimento vem em até isto, ms (o padrão é de 8 a 68 s; uma sala de desenvolvimento apressa) */
  firstWithin?: number;
  /** o primeiro acontecimento é um chefão (uma sala de desenvolvimento, para dar para ver sem esperar a sorte) */
  bossFirst?: boolean;
  /** o personagem do chefão, em vez de sorteado (para testar um personagem) */
  bossCharacter?: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export class BotWorld {
  bots: Bot[] = [];
  private nextId = 1;
  private readonly platforms: readonly Platform[];
  private readonly roofs: Platform[];
  /** o diretor: humor de 0 (calmo) a 1 (caótico), quando o jogo começou e a hora do próximo acontecimento */
  private mood: number;
  private startedAt: number | null = null;
  private nextEventAt = 0;
  /** quantos acontecimentos já houve */
  private events = 0;
  /** desde quando a opção está desligada (os bots fogem) */
  private offSince: number | null = null;
  /** por pessoa: a última vez que um bot a empurrou */
  private readonly lastShoved = new Map<string, number>();
  private players: Seen[] = [];
  /** a lista como o último passo a viu (para avisar quando muda) e os chefões derrubados desde então */
  private rosterKey = '[]';
  private downs: BossDown[] = [];

  constructor(private readonly rng: () => number, private readonly opts: BotWorldOptions) {
    this.platforms = opts.platforms ?? MAP;
    this.roofs = this.platforms.filter((p) => p.kind === 'roof');
    this.mood = 0.1 + rng() * 0.2;
  }

  /** Quem está no telhado, para o snapshot. */
  roster(): BotView[] { return this.bots.map((b) => ({ id: b.id, character: b.character, ...(b.boss ? { scale: BOSS_SCALE, hp: b.hp, hpMax: BOSS_HP } : {}) })); }

  /** A presença de um bot agora, como a de uma pessoa. */
  presence(bot: Bot, now: number): Presence {
    const b = bot.body;
    const q = (n: number) => Math.round(n * 10) / 10;
    return {
      x: q(b.x), y: q(b.y), z: q(b.z), vx: q(b.vx), vy: q(b.vy), vz: q(b.vz), facing: b.facing, anim: b.anim,
      emote: bot.emote && now - bot.emote.since < EMOTE_MS ? bot.emote.name : null,
      blink: blinking(b, now),
    };
  }

  /** Alguém (`by`, pessoa ou bot) empurrou este bot para o lado `dir`. Devolve se o empurrão pegou. */
  shoved(id: string, dir: 1 | -1, by: string, now: number): boolean {
    const bot = this.bots.find((b) => b.id === id);
    if (!bot || blinking(bot.body, now) || bot.doing === 'arrive') return false;
    if (bot.boss) return this.bossShoved(bot, dir, by, now);
    bot.body = applyShove(bot.body, dir, now);
    bot.grudge = by;
    bot.emote = { name: 'exclaim', since: now };
    if (bot.doing === 'leave') return true;
    const byBot = this.bots.some((b) => b.id === by);
    if (byBot) {
      // bot contra bot: devolve ou sai correndo
      if (this.rng() < 0.6) this.start(bot, 'fight', now, by, 4000 + this.rng() * 5000);
      else this.start(bot, 'flee', now, by, 1500 + this.rng() * 2500);
      return true;
    }
    if (bot.temper === 'revenge') { bot.comebacks = Math.max(bot.comebacks, 1); this.start(bot, 'revenge', now, by, 9000 + this.rng() * 6000); }
    else if (bot.temper === 'leave') this.leave(bot, now);
    else this.start(bot, 'flee', now, by, 2000 + this.rng() * 3000);
    return true;
  }

  /**
   * O chefão levou um empurrão: perde um ponto; ainda de pé, cambaleia e reage; no último, voa para fora e some.
   * Devolve se o empurrão pegou (o de um bot, cedo demais ou no último ponto, ele nem sente).
   */
  private bossShoved(bot: Bot, dir: 1 | -1, by: string, now: number): boolean {
    const byBot = this.bots.some((o) => o.id === by);
    if (byBot) {
      if (bot.hp <= 1 || now - bot.botHitAt < BOSS_BOT_HIT_MS) return false;
      bot.botHitAt = now;
    }
    bot.grudge = by;
    bot.emote = { name: 'exclaim', since: now };
    bot.hp--;
    if (bot.hp <= 0) {
      // derrubado: o raio cai na cidade (o host avisa todo mundo no próximo passo)
      this.downs.push({ id: bot.id, x: bot.body.x, y: bot.body.y, z: bot.body.z });
      // voa piscando e some no ar: não volta
      bot.exit = 'blink';
      this.start(bot, 'leave', now, null, BOSS_OUT_MS);
      bot.body = { ...applyShove(bot.body, dir, now), vx: dir * BOSS_OUT_VX, vy: BOSS_OUT_VY, stunnedUntil: now + BOSS_OUT_MS, blinkUntil: now + BOSS_OUT_MS };
      return true;
    }
    // um tranco curto; na beirada, só o pulinho (não cai por isso)
    const b = bot.body;
    const edge = groundAt(this.platforms, b.x + dir * BOSS_FLINCH_ROOM, b.z) === null;
    bot.body = { ...b, vx: edge ? 0 : dir * BOSS_FLINCH_VX, vy: BOSS_FLINCH_VY, vz: 0, grounded: false, riding: null, stunnedUntil: now + BOSS_FLINCH_MS };
    if (bot.doing === 'leave') return true;
    // vai atrás de quem bateu (andando), ou só encara
    if (byBot) this.start(bot, 'fight', now, by, 4000 + this.rng() * 5000);
    else if (this.rng() < 0.7) this.start(bot, 'revenge', now, by, 9000 + this.rng() * 6000);
    else this.start(bot, 'stare', now, by, 4000 + this.rng() * 5000);
    return true;
  }

  /**
   * Um passo de `dt` segundos na hora `now`. `enabled`: a opção está ligada (senão, quem está no telhado foge);
   * `taken`: os personagens que as pessoas usam (os bots preferem os outros).
   */
  tick(now: number, dt: number, players: readonly Seen[], ctx: { enabled: boolean; taken: ReadonlySet<number> }): BotTick {
    const shoves: BotTick['shoves'] = [];
    const hits: BotTick['hits'] = [];
    const falls: string[] = [];
    this.players = [...players];
    // quem já pode levar outro empurrão de bot não precisa mais estar aqui (o mapa não cresce sem fim)
    for (const [id, at] of this.lastShoved) if (now - at >= BOT_SHOVE_PLAYER_MS) this.lastShoved.delete(id);

    if (ctx.enabled) {
      this.offSince = null;
      this.direct(now, ctx.taken);
    } else {
      this.offSince ??= now;
      for (const bot of this.bots) if (bot.doing !== 'leave') this.leave(bot, now);
      if (now - this.offSince > BOTS_FLEE_MS) this.bots = [];
    }

    for (const bot of [...this.bots]) {
      if (bot.doing === 'leave' && bot.exit === 'blink' && now >= bot.until) { this.remove(bot); continue; }
      // o chefão é mais alto e mais largo: os outros o veem assim, e ele vê todo mundo à mesma distância maior
      const size = (o: Bot | null) => ({ ...(o?.boss ? { h: BODY_H * BOSS_SCALE } : {}), ...(o?.boss || bot.boss ? { wide: BOSS_WIDE } : {}) });
      const others: Other[] = [
        ...this.players.map((p) => ({ id: p.id, x: p.x, y: p.y, z: p.z, vx: p.vx, vy: p.vy, vz: p.vz, solid: p.solid, ...size(null) })),
        ...this.bots.filter((o) => o !== bot).map((o) => ({ id: o.id, x: o.body.x, y: o.body.y, z: o.body.z, vx: o.body.vx, vy: o.body.vy, vz: o.body.vz, solid: !blinking(o.body, now), ...size(o) })),
      ];
      let input = bot.body.respawnAt === null ? this.think(bot, now) : NO_INPUT;
      // o chefão nunca corre nem dá um passo para o vão (nem o toque de virar o rosto), a não ser indo embora
      if (bot.boss && bot.doing !== 'leave' && bot.doing !== 'arrive') {
        const dir = input.right ? 1 : input.left ? -1 : 0;
        const gap = dir !== 0 && bot.body.grounded && groundAt(this.platforms, bot.body.x + dir * 8, bot.body.z) === null;
        input = { ...input, run: false, ...(gap ? { left: false, right: false } : {}) };
        // largo, entala entre dois corpos com facilidade: se quer andar e não sai do lugar, escolhe outra coisa em vez de
        // andar parado (`think` zera a conta quando ele se mexe)
        const wants = input.left || input.right || input.up || input.down;
        if (!wants || !bot.body.grounded || now < bot.body.stunnedUntil) bot.stuckSince = now;
        else if (now - bot.stuckSince > 1200) { this.choose(bot, now); input = NO_INPUT; }
      }
      const r = stepBody(bot.body, input, dt, { now, platforms: this.platforms, others, shoveMs: bot.shoveMs });
      bot.body = r.body;
      for (const ev of r.events) {
        if (ev.type === 'shove') {
          for (const id of ev.targets) {
            if (this.bots.some((b) => b.id === id)) { if (this.shoved(id, bot.body.facing, bot.id, now)) hits.push({ bot: id, by: bot.id }); continue; }
            if (now - (this.lastShoved.get(id) ?? -Infinity) < BOT_SHOVE_PLAYER_MS) continue; // o golpe sai, mas não pega
            this.lastShoved.set(id, now);
            shoves.push({ target: id, by: bot.id, dir: bot.body.facing });
          }
        } else if (ev.type === 'fell') {
          // caiu: em geral some; quem ainda tem volta, volta no ponto de volta (o `stepBody` cuida)
          // o chefão não vai embora por ter caído: volta sempre
          falls.push(bot.id);
          if (bot.doing === 'leave' || !ctx.enabled || (!bot.boss && bot.comebacks <= 0)) this.remove(bot);
          else { if (!bot.boss) bot.comebacks--; this.start(bot, bot.grudge && bot.temper === 'revenge' ? 'revenge' : 'wander', now, bot.grudge, 8000); }
        }
      }
    }
    // a lista muda com quem chega e sai e com os pontos do chefão (que caem também por fora do passo, no empurrão de uma pessoa)
    const key = JSON.stringify(this.roster());
    const rosterChanged = key !== this.rosterKey;
    this.rosterKey = key;
    const downs = this.downs;
    this.downs = [];
    return { shoves, rosterChanged, downs, hits, falls };
  }

  // --- o diretor ----------------------------------------------------------------------------------------------------

  private direct(now: number, taken: ReadonlySet<number>) {
    if (this.startedAt === null) {
      this.startedAt = now;
      this.nextEventAt = now + (this.opts.firstWithin === undefined ? 8000 + this.rng() * 60_000 : this.rng() * this.opts.firstWithin);
    }
    // cada um vai embora sozinho quando dá a hora dele
    for (const bot of this.bots) if (now >= bot.leaveAt && bot.doing !== 'leave') this.leave(bot, now);
    if (now < this.nextEventAt) return;

    // o humor passeia: puxa de leve para um meio que sobe devagar num jogo longo, com um empurrão ao acaso; às vezes vira de vez
    const minutes = (now - this.startedAt) / 60_000;
    const middle = 0.22 + 0.33 * Math.min(1, minutes / 35);
    this.mood = this.rng() < 0.1 ? this.rng() : clamp(this.mood + (middle - this.mood) * 0.3 + (this.rng() - 0.5) * 0.55, 0, 1);
    const m = this.mood;
    const room = BOTS_MAX - this.bots.length;
    const int = (lo: number, hi: number) => lo + Math.floor(this.rng() * (hi - lo + 1));

    const events: [string, number][] = [
      ['quiet', 1.2 - m],
      ['one', 2],
      ['few', 1 + m],
      ['group', 2 * m],
      ['invasion', 1.5 * m * m],
      ['clones', 0.3 + 0.5 * m],
      ['purge', this.bots.length > 4 ? 0.25 : 0],
      // o chefão: sempre mais raro que a invasão, um por vez, e só se cabe
      ['boss', room > 0 && !this.bots.some((b) => b.boss) ? 0.9 * m * m : 0],
    ];
    const kind = this.events++ === 0 && this.opts.bossFirst ? 'boss' : this.pick(events);
    const life = () => now + 40_000 + this.rng() ** 1.5 * 200_000;
    // o chefão não entra no sossego nem na limpa: fica pouco, e sai na hora dele ou no empurrão
    if (kind === 'quiet') { for (const bot of this.bots) if (!bot.boss && this.rng() < 0.5 && bot.doing !== 'leave') this.leave(bot, now); }
    else if (kind === 'purge') { for (const bot of this.bots) if (!bot.boss && bot.doing !== 'leave') this.leave(bot, now); }
    else if (kind === 'one') this.spawn(now, 1, taken, life);
    else if (kind === 'few') this.spawn(now, Math.min(room, int(2, 3)), taken, life);
    else if (kind === 'group') this.spawn(now, Math.min(room, int(4, 6)), taken, life);
    // a invasão é curta: chegam muitos e vão embora logo
    else if (kind === 'invasion') this.spawn(now, Math.min(room, int(7, BOTS_MAX)), taken, () => now + 20_000 + this.rng() * 20_000);
    else if (kind === 'clones') this.spawn(now, Math.min(room, int(3, 6)), taken, life, { same: this.character(taken) });
    // o chefão fica pouco: de 50 a 110 s
    else if (kind === 'boss') this.spawn(now, 1, taken, () => now + 50_000 + this.rng() * 60_000, { same: this.opts.bossCharacter, boss: true });

    // calmo, demora mais; caótico, vem logo; sempre com muita folga para os dois lados
    this.nextEventAt = now + (48_000 - 34_000 * m) * (0.4 + this.rng() * 1.4);
  }

  /** Um personagem para um bot: de preferência um que ninguém da sala usa nem outro bot. */
  private character(taken: ReadonlySet<number>): number {
    const all = Array.from({ length: this.opts.characters }, (_, n) => n);
    const used = new Set(this.bots.map((b) => b.character));
    const free = all.filter((n) => !taken.has(n) && !used.has(n));
    const pool = free.length ? free : all.filter((n) => !taken.has(n));
    const from = pool.length ? pool : all;
    return from[Math.floor(this.rng() * from.length)];
  }

  private spawn(now: number, count: number, taken: ReadonlySet<number>, life: () => number, { same, boss = false }: { same?: number; boss?: boolean } = {}) {
    // um grupo costuma chegar do mesmo jeito, com um atraso entre um e outro
    const how = this.rng();
    for (let i = 0; i < count; i++) {
      const character = same ?? this.character(taken);
      const body = createBody(this.platforms, now);
      // o chefão sempre cai do céu
      const way = boss ? 0 : this.rng() < 0.7 ? how : this.rng();
      // o chefão cai no telhado em que há mais gente (não sai dele depois)
      const spot = this.spot(boss ? this.busiestRoof() : undefined);
      let landing: Bot['goal'] = null;
      if (way < 0.4) {
        // cai do céu
        Object.assign(body, { x: spot.x, z: spot.z, y: spot.y + 200 + this.rng() * 160 + i * 30, grounded: false });
      } else if (way < 0.75) {
        // sobe pulando da rua, por um vão ou por fora
        const gaps = this.gaps();
        const gx = gaps[Math.floor(this.rng() * gaps.length)];
        Object.assign(body, { x: gx, z: 6 + this.rng() * (DEPTH - 12), y: -150 - i * 4, vy: 600 + this.rng() * 90, grounded: false });
        // o destino é a beirada do telhado mais perto do vão
        const roof = this.roofs.reduce((a, r) => (Math.min(Math.abs(r.x0 - gx), Math.abs(r.x1 - gx)) < Math.min(Math.abs(a.x0 - gx), Math.abs(a.x1 - gx)) ? r : a));
        landing = { x: Math.abs(roof.x0 - gx) < Math.abs(roof.x1 - gx) ? roof.x0 + 16 + this.rng() * 30 : roof.x1 - 16 - this.rng() * 30, z: body.z };
      } else {
        // aparece piscando
        Object.assign(body, { x: spot.x, z: spot.z, y: spot.y, blinkUntil: now + 1000 });
      }
      const weights = Object.fromEntries(ACTIONS.map((a) => [a, Math.exp((this.rng() - 0.5) * 2.4)])) as Record<ActionName, number>;
      const bot: Bot = {
        id: `b${this.nextId++}`, character, body, shoveMs: this.opts.attackMs?.[character] ?? 450, weights,
        temper: this.pick([['flee', 1], ['revenge', 1], ['leave', 0.6]]) as Temper,
        clumsy: !boss && this.rng() < 0.18,
        doing: 'arrive', since: now, until: now + 4000, target: null, goal: landing, phase: 0, nextBeat: 0, emote: null,
        leaveAt: life(), exit: this.pick([['walk', 1], ['jump', 1], ['blink', 0.6]]) as Exit,
        comebacks: this.rng() < 0.25 ? 1 : 0, grudge: null, boss, hp: boss ? BOSS_HP : 0, botHitAt: -Infinity, stuckX: body.x, stuckSince: now, stuckZ: body.z, trail: [],
      };
      this.bots.push(bot);
    }
  }

  private remove(bot: Bot) { this.bots = this.bots.filter((b) => b !== bot); }

  // --- o mapa, como um bot o vê ---------------------------------------------------------------------------------------

  /** Um ponto qualquer em cima de um telhado. */
  private spot(roof?: Platform): { x: number; y: number; z: number } {
    const r = roof ?? this.roofs[Math.floor(this.rng() * this.roofs.length)];
    const x = r.x0 + 12 + this.rng() * (r.x1 - r.x0 - 24);
    const z = 4 + this.rng() * (DEPTH - 8);
    return { x, z, y: groundAt(this.platforms, x, z) ?? r.top };
  }

  private roofAt(x: number): Platform | undefined { return this.roofs.find((r) => x >= r.x0 && x <= r.x1); }

  /** O telhado com mais pessoas em cima (no empate, ou sem ninguém, qualquer um): onde o chefão cai. */
  private busiestRoof(): Platform | undefined {
    const count = (r: Platform) => this.players.filter((p) => p.solid && this.roofAt(p.x) === r).length;
    const most = Math.max(...this.roofs.map(count));
    const best = this.roofs.filter((r) => count(r) === most);
    return best[Math.floor(this.rng() * best.length)];
  }

  /** O meio de cada vão: entre dois telhados, e por fora dos dois das pontas. */
  private gaps(): number[] {
    const sorted = [...this.roofs].sort((a, b) => a.x0 - b.x0);
    const out = [Math.max(WORLD_X0 + 4, sorted[0].x0 - 12), Math.min(WORLD_X1 - 4, sorted[sorted.length - 1].x1 + 12)];
    for (let i = 0; i + 1 < sorted.length; i++) out.push((sorted[i].x1 + sorted[i + 1].x0) / 2);
    return out;
  }

  /** O vão mais perto de `x`. */
  private nearestGap(x: number): number { return this.gaps().reduce((a, g) => (Math.abs(g - x) < Math.abs(a - x) ? g : a)); }

  /** Um corpo qualquer (pessoa ou bot) pelo id, como o bot o vê. */
  private see(id: string | null, now: number): (Seen & { bot: boolean }) | null {
    if (id === null) return null;
    const p = this.players.find((x) => x.id === id);
    if (p) return { ...p, bot: false };
    const b = this.bots.find((x) => x.id === id);
    if (!b) return null;
    return { id: b.id, x: b.body.x, y: b.body.y, z: b.body.z, vx: b.body.vx, vy: b.body.vy, vz: b.body.vz, solid: !blinking(b.body, now), bot: true };
  }

  /** Quem está no telhado além deste bot: pessoas (só as sólidas) e bots que já chegaram. */
  private around(bot: Bot, now: number): (Seen & { bot: boolean })[] {
    return [
      ...this.players.filter((p) => p.solid).map((p) => ({ ...p, bot: false })),
      ...this.bots.filter((b) => b !== bot && b.doing !== 'arrive' && !blinking(b.body, now)).map((b) => this.see(b.id, now)!),
    ];
  }

  // --- o cérebro ------------------------------------------------------------------------------------------------------

  private pick<T extends string>(options: readonly (readonly [T, number])[]): T {
    const total = options.reduce((s, [, w]) => s + Math.max(0, w), 0);
    let r = this.rng() * total;
    for (const [name, w] of options) { r -= Math.max(0, w); if (r <= 0) return name; }
    return options[options.length - 1][0];
  }

  private start(bot: Bot, doing: Doing, now: number, target: string | null, ms: number, goal: Bot['goal'] = null) {
    Object.assign(bot, { doing, since: now, until: now + ms, target, goal, phase: 0, nextBeat: now + 400 + this.rng() * 1200, stuckX: bot.body.x, stuckSince: now, stuckZ: bot.body.z, trail: [] });
  }

  private leave(bot: Bot, now: number) {
    if (bot.exit === 'blink') {
      this.start(bot, 'leave', now, null, 900);
      bot.body = { ...bot.body, blinkUntil: now + 900 };
      return;
    }
    const gap = this.nearestGap(bot.body.x);
    this.start(bot, 'leave', now, null, BOTS_FLEE_MS, { x: gap, z: bot.body.z });
  }

  /** Escolhe o que fazer agora: nota de cada ação = base × personalidade × o que há em volta × dado; sorteia pelas notas ao quadrado. */
  private choose(bot: Bot, now: number) {
    // o chefão só liga para quem está no telhado dele (não pula vão)
    const roofHere = this.roofAt(bot.body.x);
    const around = this.around(bot, now).filter((a) => !bot.boss || this.roofAt(a.x) === roofHere);
    // na cabeça do chefão ninguém sobe pulando do chão
    const low = around.filter((a) => !this.bots.some((o) => o.boss && o.id === a.id));
    const people = around.filter((a) => !a.bot);
    const robots = around.filter((a) => a.bot);
    const near = (a: Seen) => Math.abs(a.x - bot.body.x) < 160;
    const doingNear = (what: Doing) => this.bots.some((o) => o !== bot && o.doing === what && near({ ...o.body, id: o.id, solid: true }));
    const shovable = people.filter((p) => now - (this.lastShoved.get(p.id) ?? -Infinity) >= BOT_SHOVE_PLAYER_MS);
    const box = this.boxFor(bot);
    const context: Record<ActionName, number> = {
      wander: 1,
      follow: around.length ? 1 : 0,
      headsit: low.length ? 1 : 0,
      stare: around.length ? 1 : 0,
      fight: robots.length ? 1 : 0,
      panic: 1,
      copycat: around.length ? 1 : 0,
      lemming: doingNear('lemming') ? 7 : 1,
      crowd: people.length ? (doingNear('crowd') ? 2.5 : 1) : 0,
      stagedive: box ? 1 : 0,
      statue: 1,
      bully: shovable.length ? 1 : 0,
    };
    if (bot.boss) for (const a of ACTIONS) context[a] *= BOSS_LIKES[a] ?? 0;
    const scores = ACTIONS.map((a) => {
      const s = BASE[a] * bot.weights[a] * context[a] * (0.4 + this.rng() * 1.2) * (a === bot.doing ? 0.3 : 1);
      return [a, s * s] as const;
    });
    const what = this.pick(scores);
    const any = () => around[Math.floor(this.rng() * around.length)];
    const person = () => people[Math.floor(this.rng() * people.length)];
    const secs = (lo: number, hi: number) => (lo + this.rng() * (hi - lo)) * 1000;
    switch (what) {
      case 'wander': {
        // quase sempre no telhado em que está; às vezes atravessa para outro
        const here = this.roofAt(bot.body.x);
        const s = this.spot(here && (bot.boss || this.rng() < 0.7) ? here : undefined);
        return this.start(bot, 'wander', now, null, secs(4, 14), { x: s.x, z: s.z });
      }
      case 'follow': {
        // se alguém já segue o escolhido, entra atrás do último: vira fila
        let t = (this.rng() < 0.65 && people.length ? person() : any()).id;
        for (let i = 0; i < BOTS_MAX; i++) {
          const tail = this.bots.find((o) => o !== bot && o.doing === 'follow' && o.target === t);
          if (!tail) break;
          t = tail.id;
        }
        return this.start(bot, 'follow', now, t, secs(6, 20));
      }
      case 'headsit': return this.start(bot, 'headsit', now, low[Math.floor(this.rng() * low.length)].id, secs(6, 22));
      case 'stare': return this.start(bot, 'stare', now, any().id, secs(4, 9));
      case 'fight': return this.start(bot, 'fight', now, robots[Math.floor(this.rng() * robots.length)].id, secs(5, 12));
      case 'panic': return this.start(bot, 'panic', now, null, secs(4, 9), this.farEnd(bot));
      case 'copycat': return this.start(bot, 'copycat', now, (people.length && this.rng() < 0.75 ? person() : any()).id, secs(6, 15));
      case 'lemming': {
        const leader = this.bots.find((o) => o !== bot && o.doing === 'lemming' && near({ ...o.body, id: o.id, solid: true }));
        return this.start(bot, 'lemming', now, null, secs(8, 12), leader?.goal ?? { x: this.nearestGap(bot.body.x), z: bot.body.z });
      }
      case 'crowd': {
        // de preferência quem já tem bot em volta: vira aglomeração
        const crowded = this.bots.find((o) => o !== bot && o.doing === 'crowd' && people.some((p) => p.id === o.target));
        return this.start(bot, 'crowd', now, crowded && this.rng() < 0.7 ? crowded.target : person().id, secs(5, 12));
      }
      case 'stagedive': return this.start(bot, 'stagedive', now, null, secs(8, 14), { x: (box!.x0 + box!.x1) / 2, z: (box!.z0 + box!.z1) / 2 });
      case 'statue': return this.start(bot, 'statue', now, null, secs(6, 15));
      case 'bully': return this.start(bot, 'bully', now, shovable[Math.floor(this.rng() * shovable.length)].id, secs(5, 9));
    }
  }

  /** A caixa em que dá para subir pulando, no telhado em que o bot está. */
  private boxFor(bot: Bot): Platform | undefined {
    const roof = this.roofAt(bot.body.x);
    if (!roof) return undefined;
    return this.platforms.find((p) => p.kind === 'box' && p.x0 >= roof.x0 && p.x1 <= roof.x1 && p.top - roof.top <= 44);
  }

  /** A ponta mais longe do mapa, para correr até lá. */
  private farEnd(bot: Bot): { x: number; z: number } {
    const sorted = [...this.roofs].sort((a, b) => a.x0 - b.x0);
    const left = sorted[0].x0 + 14, right = sorted[sorted.length - 1].x1 - 14;
    return { x: Math.abs(bot.body.x - left) > Math.abs(bot.body.x - right) ? left : right, z: 6 + this.rng() * (DEPTH - 12) };
  }

  /**
   * As teclas para ir até (`tx`, `tz`): anda (ou corre), pula um degrau que dá para subir, e num vão: se o destino está
   * do outro lado, corre e pula; senão para na beirada. `reckless` não olha o vão (vai e cai).
   */
  private steer(bot: Bot, tx: number, tz: number, run: boolean, reckless = false): Input {
    const b = bot.body;
    // o chefão só anda e fica no telhado dele; indo embora, corre e pula como os outros
    const heavy = bot.boss && bot.doing !== 'leave';
    if (heavy) run = false;
    const input: Input = { ...NO_INPUT, run };
    const dx = tx - b.x, dz = tz - b.z;
    const dir = Math.abs(dx) > 3 ? Math.sign(dx) : 0;
    if (dir > 0) input.right = true;
    if (dir < 0) input.left = true;
    if (dz > 3) input.up = true;
    if (dz < -3) input.down = true;
    // no ar, sempre na velocidade de corrida: um pulo sobre o vão dado andando não chega do outro lado
    if (!b.grounded) {
      if (dir !== 0 && !heavy) input.run = true;
      // já em cima de chão e o destino é no vão (quem ele segue caiu, ou está pendurado na beirada): pousa primeiro
      if (!reckless && groundAt(this.platforms, b.x, b.z) !== null && groundAt(this.platforms, tx, clamp(tz, 0, DEPTH)) === null) input.left = input.right = false;
      return input;
    }
    if (dir === 0) return input;
    const ahead = groundAt(this.platforms, b.x + dir * 10, b.z);
    if (ahead === null) {
      if (reckless || bot.clumsy) return input;
      // há chão do outro lado, e o destino está para lá do vão?
      let land: number | null = null;
      for (let d = 14; d <= 80; d += 6) if (groundAt(this.platforms, b.x + dir * d, b.z) !== null) { land = d; break; }
      if (land !== null && Math.abs(dx) >= land && !heavy) { input.run = true; input.jump = true; }
      else { input.left = input.right = false; }
    } else if (ahead > b.y + STEP) {
      if (ahead - b.y <= 46) input.jump = true;
      else if (b.riding === null) input.left = input.right = false;
    }
    return input;
  }

  /** Virado para `x` sem sair do lugar: um toque para o lado. */
  private face(bot: Bot, x: number): Input {
    const want = x >= bot.body.x ? 1 : -1;
    return want === bot.body.facing ? NO_INPUT : { ...NO_INPUT, right: want === 1, left: want === -1 };
  }

  private say(bot: Bot, name: EmoteName, now: number) { bot.emote = { name, since: now }; }

  /** O que o bot "aperta" neste passo. */
  private think(bot: Bot, now: number): Input {
    const b = bot.body;
    if (now < b.stunnedUntil) return NO_INPUT;

    if (bot.doing === 'arrive') {
      // caindo do céu não faz nada; subindo da rua, vai para o telhado mais perto; no chão, começa a viver
      if (b.grounded) { this.choose(bot, now); if (bot.boss) this.say(bot, 'me', now); return NO_INPUT; }
      if (now >= bot.until) bot.until = now + 4000;
      return bot.goal && b.vy !== 0 && groundAt(this.platforms, b.x, b.z) === null ? this.steer(bot, bot.goal.x, bot.goal.z, true) : NO_INPUT;
    }
    if (bot.doing === 'leave') {
      if (bot.exit === 'blink' || !bot.goal) return NO_INPUT;
      // empacou a caminho do vão (alguém parado na frente, uma caixa alta): some piscando em vez de ficar ali para sempre
      if (Math.abs(b.x - bot.stuckX) > 1.5 || !b.grounded) { bot.stuckX = b.x; bot.stuckSince = now; }
      else if (now - bot.stuckSince > 1500) { bot.exit = 'blink'; this.leave(bot, now); return NO_INPUT; }
      const input = this.steer(bot, bot.goal.x, bot.goal.z, true, true);
      // quem sai pulando salta na beirada
      if (bot.exit === 'jump' && b.grounded && groundAt(this.platforms, b.x + Math.sign(bot.goal.x - b.x) * 12, b.z) === null) input.jump = true;
      return input;
    }

    // no ar em cima de um vão, segue em frente correndo, seja o que for que estivesse fazendo: parar ali é cair
    if (!b.grounded && bot.doing !== 'lemming' && groundAt(this.platforms, b.x, b.z) === null) {
      return { ...NO_INPUT, run: true, right: b.facing === 1, left: b.facing === -1 };
    }

    // empacou andando (uma parede, uma caixa alta, uma multidão): desiste e escolhe outra coisa
    if (Math.abs(b.x - bot.stuckX) > 1.5 || (bot.boss && Math.abs(b.z - bot.stuckZ) > 1.5) || !b.grounded) { bot.stuckX = b.x; bot.stuckZ = b.z; bot.stuckSince = now; }
    const target = this.see(bot.target, now);
    const done = () => { this.choose(bot, now); return NO_INPUT; };
    if (now >= bot.until) return done();
    const beat = (ms: number) => { if (now < bot.nextBeat) return false; bot.nextBeat = now + ms * (0.6 + this.rng() * 0.8); return true; };
    const stuck = (input: Input) => ((input.left || input.right) && now - bot.stuckSince > 1500 ? done() : input);

    switch (bot.doing) {
      case 'wander': {
        if (bot.phase === 0) {
          const g = (bot.goal ??= this.spot(this.roofAt(b.x)));
          if (Math.abs(g.x - b.x) > 5 || Math.abs(g.z - b.z) > 5) return stuck(this.steer(bot, g.x, g.z, bot.weights.panic > 2.2));
          bot.phase = 1;
          bot.until = Math.min(bot.until, now + 500 + this.rng() * 3000);
        }
        // parado, olha para os lados; às vezes solta um balão
        if (beat(1300)) { if (this.rng() < 0.15) this.say(bot, this.pick([['question', 2], ['me', 1], ['haha', 1]]), now); return this.face(bot, b.x - b.facing * 10); }
        return NO_INPUT;
      }
      case 'follow': {
        if (!target) return done();
        // um pouco atrás de quem segue, do lado de onde ele vem
        const side = target.vx !== 0 ? -Math.sign(target.vx) : Math.sign(b.x - target.x) || 1;
        const tx = target.x + side * (bot.boss ? BOSS_NEAR : 22);
        if (Math.abs(tx - b.x) < 6 && Math.abs(target.z - b.z) < 6) return this.face(bot, target.x);
        return this.steer(bot, tx, target.z, Math.abs(tx - b.x) > 60);
      }
      case 'headsit': {
        if (!target) return done();
        if (b.riding === target.id) { if (beat(2600) && this.rng() < 0.5) this.say(bot, 'haha', now); return NO_INPUT; }
        const dx = target.x - b.x;
        const input = this.steer(bot, target.x, target.z, Math.abs(dx) > 70);
        // perto o bastante: pula para cima da cabeça
        if (b.grounded && Math.abs(dx) < 26 && Math.abs(target.z - b.z) < 7 && target.y <= b.y + 10 && beat(700)) input.jump = true;
        return input;
      }
      case 'stare': {
        if (!target) return done();
        const tx = target.x + (b.x >= target.x ? 1 : -1) * (bot.boss ? BOSS_NEAR : 22);
        if (Math.abs(tx - b.x) > 5 || Math.abs(target.z - b.z) > 5) return stuck(this.steer(bot, tx, target.z, false));
        if (beat(2400)) this.say(bot, 'question', now);
        return this.face(bot, target.x);
      }
      case 'fight':
      case 'bully':
      case 'revenge': {
        if (!target || !target.solid) return bot.doing === 'revenge' && target ? NO_INPUT : done();
        const side = b.x >= target.x ? 1 : -1;
        const tx = target.x + side * (bot.boss ? BOSS_NEAR : BODY_RX * 2 + 4);
        const ahead = (target.x - b.x) * b.facing;
        const reach = ahead > 0 && ahead <= SHOVE_REACH + BODY_RX - 2 && Math.abs(target.z - b.z) <= SHOVE_DZ - 2 && Math.abs(target.y - b.y) < 24;
        if (reach) {
          // numa pessoa só quando a vez dos bots com ela voltou; enquanto isso, encara e reclama
          const allowed = target.bot || now - (this.lastShoved.get(target.id) ?? -Infinity) >= BOT_SHOVE_PLAYER_MS;
          if (!allowed) { if (beat(2200)) this.say(bot, 'exclaim', now); return NO_INPUT; }
          if (now >= b.shoveUntil) {
            if (bot.doing !== 'fight') {
              // empurrou: ri e sai correndo, ou fica por ali
              this.say(bot, 'haha', now);
              const after = !bot.boss && this.rng() < 0.6 ? 'flee' : 'wander';
              const spot = this.spot(this.roofAt(b.x));
              this.start(bot, after, now + 1, target.id, 1500 + this.rng() * 2500, { x: spot.x, z: spot.z });
              bot.grudge = null;
            }
            return { ...NO_INPUT, shove: true };
          }
          return NO_INPUT;
        }
        if (Math.abs(tx - b.x) < 4 && Math.abs(target.z - b.z) < 4) return this.face(bot, target.x);
        return this.steer(bot, tx, target.z, bot.doing !== 'fight' || Math.abs(tx - b.x) > 40);
      }
      case 'panic': {
        const g = bot.goal!;
        if (beat(1500)) this.say(bot, 'exclaim', now);
        if (Math.abs(g.x - b.x) < 12) bot.goal = this.farEnd(bot);
        const input = this.steer(bot, bot.goal!.x, bot.goal!.z, true);
        // um pulo à toa de vez em quando, se há telhado para pousar
        if (b.grounded && this.rng() < 0.02 && groundAt(this.platforms, b.x + b.facing * 110, b.z) !== null) input.jump = true;
        return stuck(input);
      }
      case 'copycat': {
        if (!target) return done();
        // chega perto e repete, com atraso, o que o outro fez
        bot.trail.push({ at: now, vx: target.vx, vz: target.vz, up: target.vy > 60 });
        while (bot.trail.length > 2 && bot.trail[1].at <= now - 450) bot.trail.shift();
        if (Math.abs(target.x - b.x) > 70) return this.steer(bot, target.x - Math.sign(target.x - b.x) * 34, target.z, true);
        const past = bot.trail[0];
        const input: Input = { ...NO_INPUT, right: past.vx > 20, left: past.vx < -20, up: past.vz > 20, down: past.vz < -20, run: Math.abs(past.vx) > 100, jump: past.up && b.grounded };
        // sem se jogar do telhado por causa disso
        const dir = input.right ? 1 : input.left ? -1 : 0;
        if (dir && b.grounded && !bot.clumsy && groundAt(this.platforms, b.x + dir * 10, b.z) === null) input.left = input.right = false;
        if (!dir && !input.jump) return this.face(bot, target.x);
        return input;
      }
      case 'lemming': {
        const g = bot.goal!;
        return this.steer(bot, g.x, g.z, false, true);
      }
      case 'crowd': {
        if (!target) return done();
        if (bot.phase === 0) { bot.goal = { x: (this.rng() < 0.5 ? -1 : 1) * (16 + this.rng() * 14), z: (this.rng() - 0.5) * 16 }; bot.phase = 1; }
        const tx = target.x + bot.goal!.x, tz = clamp(target.z + bot.goal!.z, 2, DEPTH - 2);
        if (Math.abs(tx - b.x) > 7 || Math.abs(tz - b.z) > 6) return this.steer(bot, tx, tz, Math.abs(tx - b.x) > 50);
        if (beat(1900)) {
          this.say(bot, this.pick([['haha', 2], ['exclaim', 1], ['question', 1]]), now);
          if (b.grounded && this.rng() < 0.5) return { ...NO_INPUT, jump: true };
        }
        return this.face(bot, target.x);
      }
      case 'stagedive': {
        const g = bot.goal!;
        if (bot.phase === 0) {
          // sobe na caixa
          const top = groundAt(this.platforms, g.x, g.z)!;
          if (b.grounded && Math.abs(b.y - top) < 1 && Math.abs(g.x - b.x) < 8) { bot.phase = 1; bot.nextBeat = now + 500 + this.rng() * 1200; this.say(bot, 'me', now); return NO_INPUT; }
          return stuck(this.steer(bot, g.x, g.z, false));
        }
        if (bot.phase === 1) {
          if (now < bot.nextBeat) return NO_INPUT;
          // mira no bolo de gente mais perto (ou em qualquer lado) e se joga
          const crowd = this.around(bot, now).filter((a) => Math.abs(a.x - b.x) < 140).sort((p, q) => Math.abs(p.x - b.x) - Math.abs(q.x - b.x))[0];
          const dir = crowd ? Math.sign(crowd.x - b.x) || 1 : this.rng() < 0.5 ? 1 : -1;
          bot.goal = { x: b.x + dir * 90, z: crowd?.z ?? b.z };
          bot.phase = 2;
          return { ...NO_INPUT, right: dir > 0, left: dir < 0, run: true, jump: true };
        }
        if (b.grounded && now - bot.since > 1500 && Math.abs(b.vy) < 1 && bot.phase === 2 && groundAt(this.platforms, b.x, b.z) !== null && b.y <= (this.roofAt(b.x)?.top ?? 0) + 1) return done();
        return { ...NO_INPUT, right: bot.goal!.x > b.x, left: bot.goal!.x < b.x, run: true, up: bot.goal!.z > b.z + 3, down: bot.goal!.z < b.z - 3 };
      }
      case 'statue': {
        // parado como um jogador falso; se uma pessoa chega perto, sai correndo
        const close = this.players.find((p) => p.solid && Math.abs(p.x - b.x) < 34 && Math.abs(p.z - b.z) < 20 && Math.abs(p.y - b.y) < 30);
        if (close && now - bot.since > 1200) { this.say(bot, 'exclaim', now); this.start(bot, 'flee', now, close.id, 1500 + this.rng() * 2000); }
        return NO_INPUT;
      }
      case 'flee': {
        // para longe de quem assustou; o desajeitado não olha o vão
        const from = target?.x ?? b.x - b.facing;
        const dir = b.x >= from ? 1 : -1;
        const roof = this.roofAt(b.x);
        const tx = roof && !bot.clumsy ? clamp(b.x + dir * 120, roof.x0 + 10, roof.x1 - 10) : b.x + dir * 120;
        if (Math.abs(tx - b.x) < 6) return done();
        return stuck(this.steer(bot, tx, b.z, true));
      }
    }
    return NO_INPUT;
  }
}
