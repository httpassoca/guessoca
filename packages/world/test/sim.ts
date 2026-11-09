import { expect } from 'bun:test';
import {
  createBody,
  groundAt,
  MAP,
  NO_INPUT,
  stepBody,
  type Body,
  type Input,
  type Other,
  type Platform,
  type WorldEvent,
} from '../src';

/** um passo de tela a 60 Hz, em segundos */
export const DT = 1 / 60;
export const T0 = 1_000_000;

/** Um corpo parado em (x, z): no chão dali, ou solto no ar em `y`. */
export function bodyAt(x: number, z: number, opts: { y?: number; platforms?: readonly Platform[]; now?: number } = {}): Body {
  const platforms = opts.platforms ?? MAP;
  const ground = groundAt(platforms, x, z);
  const body = createBody(platforms, opts.now ?? T0);
  return { ...body, x, z, y: opts.y ?? ground ?? 0, grounded: opts.y === undefined && ground !== null };
}

/** Outro corpo, parado e sólido, a menos que se diga o contrário. */
export function other(id: string, x: number, y: number, z: number, extra: Partial<Other> = {}): Other {
  return { id, x, y, z, vx: 0, vy: 0, vz: 0, solid: true, ...extra };
}

export type Keys = Partial<Input> | ((body: Body, i: number, now: number) => Partial<Input>);
export type Others = readonly Other[] | ((now: number, i: number) => readonly Other[]);

export interface Happened { now: number; i: number; event: WorldEvent; body: Body }
export interface Run { body: Body; now: number; events: Happened[]; trace: Body[] }

/** Só no primeiro passo (o aperto de uma tecla). */
export function once(keys: Partial<Input>): Keys {
  return (_b, i) => (i === 0 ? keys : {});
}

/** Roda `seconds` a 60 Hz. O passo `i` acontece em `now + (i + 1)·DT`. */
export function run(
  body: Body,
  keys: Keys,
  seconds: number,
  opts: { now?: number; platforms?: readonly Platform[]; others?: Others } = {},
): Run {
  const platforms = opts.platforms ?? MAP;
  const start = opts.now ?? T0;
  let now = start;
  const events: Happened[] = [];
  const trace: Body[] = [];
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i++) {
    now = start + (i + 1) * DT * 1000;
    const pressed = typeof keys === 'function' ? keys(body, i, now) : keys;
    const others = typeof opts.others === 'function' ? opts.others(now, i) : (opts.others ?? []);
    const out = stepBody(body, { ...NO_INPUT, ...pressed }, DT, { now, platforms, others });
    body = out.body;
    trace.push(body);
    for (const event of out.events) events.push({ now, i, event, body });
  }
  return { body, now, events, trace };
}

export function kinds(r: Run): string[] {
  return r.events.map((e) => e.event.type);
}

export function first(r: Run, type: WorldEvent['type']): Happened {
  const found = r.events.find((e) => e.event.type === type);
  if (!found) throw new Error(`nenhum evento ${type} (houve: ${kinds(r).join(', ') || 'nada'})`);
  return found;
}

export function near(actual: number, expected: number, tolerance: number) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
}
