import { describe, expect, test } from 'bun:test';
import { CLOSE_KICKED, CLOSE_REPLACED, CLOSE_ROOM_ENDED, CLOSE_TOO_MANY, IMAGE_BYTES_MAX, IMAGE_ID_RE, type Presence, type ServerMessage } from '@guess/protocol';
import { FALL_Y, RESPAWN_MS, SHOVE_COOLDOWN_MS } from '@guess/world';
import { IMAGE_GRACE, IMAGES_PER_UPLOADER, MESSAGE_BURST, PRESENCE_ACTIVITY_MS, RoomHost, VISITORS_MAX, type Socket } from '../src/host';
import { silentLog } from '../src/log';
import { lcg, webp } from './sim';

/** O mínimo de um socket do Bun que o host usa, com o que ele fez guardado. */
function fakeSocket(token: string) {
  const ws = {
    data: { code: 'ABCD', token }, sent: [] as string[], closedWith: null as number | null, terminated: false,
    send(d: string) { ws.sent.push(d); }, close(code?: number) { ws.closedWith = code ?? 1000; }, terminate() { ws.terminated = true; },
  };
  return ws as unknown as Socket & typeof ws;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const say = (host: RoomHost, ws: Socket, msg: object) => host.message(ws, JSON.stringify(msg));
const received = (ws: { sent: string[] }) => ws.sent.map((d) => JSON.parse(d) as ServerMessage);

const idOf = (r: ReturnType<RoomHost['addImage']>) => { if (!r.ok) throw new Error(r.error); return r.id; };

/** um host com relógio de mentira e duas pessoas, Zé (moderador) e Dita */
function hostWithTwo() {
  let now = 1_000_000;
  const clock = { advance: (ms: number) => { now += ms; } };
  const host = new RoomHost('ABCD', silentLog, () => {}, { clock: () => now });
  const a = fakeSocket('token-a'), b = fakeSocket('token-b');
  host.connect(a); say(host, a, { type: 'join', nickname: 'Zé' });
  host.connect(b); say(host, b, { type: 'join', nickname: 'Dita' });
  return { host, a, b, clock };
}

describe('host: silêncio no socket', () => {
  test('quem fica em silêncio pelo tempo limite é derrubado como se tivesse caído; ping mantém vivo', async () => {
    const host = new RoomHost('ABCD', silentLog, () => {}, { silence: 40 });
    const a = fakeSocket('token-a'), b = fakeSocket('token-b');
    const heardAt = Date.now(); // antes do último sinal de Zé, senão o relógio do host pode ficar 1 ms atrás deste
    host.connect(a); say(host, a, { type: 'join', nickname: 'Zé' });
    host.connect(b); say(host, b, { type: 'join', nickname: 'Dita' });
    await sleep(25);
    say(host, b, { type: 'ping' });
    await sleep(25); // a: 50 ms calado; b: 25 ms
    expect(a.terminated).toBe(true);
    expect(b.terminated).toBe(false);
    // o lugar de Zé fica guardado, só desconectado
    expect(host.state.members.map((m) => [m.nickname, m.connected])).toEqual([['Zé', false], ['Dita', true]]);
    expect(host.connections).toBe(1);
    // a queda conta como atividade desde o último sinal de vida dele, não desde que o silêncio foi notado
    expect(host.state.lastActivity).toBeGreaterThanOrEqual(heardAt);
    expect(host.state.lastActivity).toBeLessThan(heardAt + 20);
    // o fechamento que o Bun avisa depois não conta duas vezes
    host.disconnect(a);
    expect(host.state.members.filter((m) => !m.connected)).toHaveLength(1);
    host.dispose();
  });

  test('a aba que assumiu o lugar de outra não herda o silêncio da velha', async () => {
    const host = new RoomHost('ABCD', silentLog, () => {}, { silence: 40 });
    const old = fakeSocket('token-a');
    host.connect(old); say(host, old, { type: 'join', nickname: 'Zé' });
    await sleep(30);
    const fresh = fakeSocket('token-a');
    host.connect(fresh);
    await sleep(25); // a velha teria vencido agora; a nova tem 25 ms
    expect(fresh.terminated).toBe(false);
    expect(host.state.members[0].connected).toBe(true);
    host.dispose();
  });
});

describe('host: sockets', () => {
  test('um socket novo com o mesmo token fecha o velho, sem a sala ver queda, e recebe o snapshot', () => {
    const host = new RoomHost('ABCD', silentLog, () => {});
    const old = fakeSocket('token-a'), other = fakeSocket('token-b');
    host.connect(old); say(host, old, { type: 'join', nickname: 'Zé' });
    host.connect(other);
    other.sent = [];
    const fresh = fakeSocket('token-a');
    host.connect(fresh);
    expect(old.closedWith).toBe(CLOSE_REPLACED);
    expect(received(fresh).at(-1)).toMatchObject({ type: 'snapshot', snapshot: { you: 'm1', members: [{ nickname: 'Zé', connected: true }] } });
    // o Bun avisa o fechamento do velho depois: não derruba quem assumiu
    host.disconnect(old);
    expect(host.state.members[0].connected).toBe(true);
    expect(host.connections).toBe(2);
    expect(received(other).every((m) => m.type !== 'snapshot' || m.snapshot.members[0].connected)).toBe(true);
    host.dispose();
  });

  test('mensagem malformada é descartada sem mudar a sala', () => {
    const host = new RoomHost('ABCD', silentLog, () => {});
    const a = fakeSocket('token-a');
    host.connect(a);
    const before = structuredClone(host.state);
    host.message(a, '{"type":"join"}');
    host.message(a, 'lixo');
    expect(host.state).toEqual(before);
    host.dispose();
  });

  test('ping recebe pong', () => {
    const host = new RoomHost('ABCD', silentLog, () => {});
    const a = fakeSocket('token-a');
    host.connect(a);
    say(host, a, { type: 'ping' });
    expect(received(a).at(-1)).toEqual({ type: 'pong' });
    host.dispose();
  });
});

describe('host: morte da sala', () => {
  test('quando a sala morre, todo socket é fechado com o código de sala encerrada e o dono é avisado', async () => {
    const dead: string[] = [];
    const host = new RoomHost('ABCD', silentLog, (c) => dead.push(c), { ttl: 30 });
    const a = fakeSocket('token-a'), b = fakeSocket('token-b');
    host.connect(a); say(host, a, { type: 'join', nickname: 'Zé' });
    host.connect(b);
    await sleep(60);
    expect(a.closedWith).toBe(CLOSE_ROOM_ENDED);
    expect(b.closedWith).toBe(CLOSE_ROOM_ENDED);
    expect(host.connections).toBe(0);
    expect(dead).toEqual(['ABCD']);
    host.dispose();
  });
});

describe('host: expulsar', () => {
  test('o socket do expulso fecha com 4403 e o mesmo token não entra de novo', () => {
    const host = new RoomHost('ABCD', silentLog, () => {});
    const a = fakeSocket('token-a'), b = fakeSocket('token-b');
    host.connect(a); say(host, a, { type: 'join', nickname: 'Zé' });
    host.connect(b); say(host, b, { type: 'join', nickname: 'Dita' });
    say(host, a, { type: 'kick', member: 'm2' });
    expect(b.closedWith).toBe(CLOSE_KICKED);
    expect(host.connections).toBe(1);
    host.disconnect(b); // o Bun avisa depois; nada muda
    const again = fakeSocket('token-b');
    host.connect(again);
    expect(again.closedWith).toBe(CLOSE_KICKED);
    expect(host.connections).toBe(1);
    expect(host.state.members.map((m) => m.nickname)).toEqual(['Zé']);
    host.dispose();
  });
});

describe('host: imagens', () => {
  test('guarda o WebP de um membro e devolve um id; recusa visitante, desconhecido, grande demais e não WebP', () => {
    const { host } = hostWithTwo();
    const visitor = fakeSocket('token-v');
    host.connect(visitor);
    const bytes = webp(100);
    const r = host.addImage('token-a', bytes);
    expect(r.ok).toBe(true);
    const id = idOf(r);
    expect(id).toMatch(IMAGE_ID_RE);
    expect(host.image(id)).toEqual(bytes);
    expect(host.addImage('token-v', webp())).toEqual({ ok: false, error: 'notMember' });
    expect(host.addImage('token-zzz', webp())).toEqual({ ok: false, error: 'notMember' });
    expect(host.addImage('token-a', webp(IMAGE_BYTES_MAX + 1))).toEqual({ ok: false, error: 'tooBig' });
    expect(host.addImage('token-a', new Uint8Array(100))).toEqual({ ok: false, error: 'notWebp' });
    expect(idOf(host.addImage('token-a', webp(IMAGE_BYTES_MAX)))).toMatch(IMAGE_ID_RE);
    expect(host.image('0123456789abcdef')).toBeUndefined();
    host.dispose();
  });

  test('o expulso não sobe imagem', () => {
    const { host, a } = hostWithTwo();
    say(host, a, { type: 'kick', member: 'm2' });
    expect(host.addImage('token-b', webp())).toEqual({ ok: false, error: 'notMember' });
    host.dispose();
  });

  test('uma imagem que nenhum post-it usa morre depois da tolerância; uma usada fica; a trocada morre na hora', () => {
    expect(IMAGE_GRACE).toBe(2 * 60_000);
    const { host, a, b, clock } = hostWithTwo();
    const orphan = idOf(host.addImage('token-a', webp()));
    clock.advance(IMAGE_GRACE - 1);
    say(host, a, { type: 'ping' });
    expect(host.image(orphan)).toBeDefined(); // ainda esperando o write
    clock.advance(2);
    say(host, a, { type: 'ping' });
    expect(host.image(orphan)).toBeUndefined();

    const used = idOf(host.addImage('token-a', webp()));
    say(host, a, { type: 'write', owner: 'm2', text: 'Pelé', image: used });
    clock.advance(10 * IMAGE_GRACE);
    say(host, b, { type: 'ping' });
    expect(host.image(used)).toBeDefined();

    const replacement = idOf(host.addImage('token-a', webp()));
    say(host, a, { type: 'write', owner: 'm2', text: 'Pelé', image: replacement });
    expect(host.image(used)).toBeUndefined();
    expect(host.image(replacement)).toBeDefined();
    host.dispose();
  });

  test(`cada pessoa guarda no máximo ${IMAGES_PER_UPLOADER} imagens soltas: a mais velha sai`, () => {
    expect(IMAGES_PER_UPLOADER).toBe(2);
    const { host, clock } = hostWithTwo();
    const first = idOf(host.addImage('token-a', webp()));
    clock.advance(1);
    const second = idOf(host.addImage('token-a', webp()));
    clock.advance(1);
    const other = idOf(host.addImage('token-b', webp()));
    clock.advance(1);
    const third = idOf(host.addImage('token-a', webp()));
    expect(host.image(first)).toBeUndefined();
    expect([second, third, other].map((id) => host.image(id) !== undefined)).toEqual([true, true, true]);
    host.dispose();
  });

  test('um write com imagem que a sala não tem é recusado antes de chegar à sala', () => {
    const { host, a } = hostWithTwo();
    a.sent = [];
    say(host, a, { type: 'write', owner: 'm2', text: 'Pelé', image: '0123456789abcdef' });
    expect(received(a)).toEqual([{ type: 'error', error: 'refused' }]);
    expect(host.state.game.postits.m2.text).toBe('');
    say(host, a, { type: 'write', owner: 'm2', text: 'Pelé', image: null });
    expect(host.state.game.postits.m2.text).toBe('Pelé');
    host.dispose();
  });

  test('quando a sala morre, as imagens morrem junto', async () => {
    const host = new RoomHost('ABCD', silentLog, () => {}, { ttl: 30 });
    const a = fakeSocket('token-a');
    host.connect(a); say(host, a, { type: 'join', nickname: 'Zé' });
    const id = idOf(host.addImage('token-a', webp()));
    await sleep(60);
    expect(host.image(id)).toBeUndefined();
    expect(host.addImage('token-a', webp())).toEqual({ ok: false, error: 'notMember' });
    host.dispose();
  });
});

describe('host: presença e empurrão (por fora da sala, ADR 0005)', () => {
  const at = (x: number): Presence => ({ x, y: 0, z: 10, vx: 0, vy: 0, vz: 0, facing: 1, anim: 'idle', emote: null, blink: false });
  const presences = (ws: { sent: string[] }): ServerMessage[] => received(ws).filter((m) => m.type === 'presence');

  test('a presença de um vai aos outros, com o id de quem é, e não volta para quem mandou', () => {
    const { host, a, b } = hostWithTwo();
    a.sent.length = 0; b.sent.length = 0;
    say(host, a, { type: 'presence', presence: at(100) });
    expect(presences(b)).toEqual([{ type: 'presence', member: 'm1', presence: at(100) } as ServerMessage]);
    expect(presences(a)).toEqual([]);
    host.dispose();
  });

  test('no máximo uma por intervalo por pessoa, e a que sai depois é a mais recente', async () => {
    const host = new RoomHost('ABCD', silentLog, () => {}, { presenceInterval: 30 });
    const a = fakeSocket('token-a'), b = fakeSocket('token-b');
    host.connect(a); say(host, a, { type: 'join', nickname: 'Zé' });
    host.connect(b); say(host, b, { type: 'join', nickname: 'Dita' });
    b.sent.length = 0;
    for (const x of [1, 2, 3, 4]) say(host, a, { type: 'presence', presence: at(x) });
    expect(presences(b).map((m) => m.type === 'presence' && m.presence.x)).toEqual([1]);
    await sleep(45);
    expect(presences(b).map((m) => m.type === 'presence' && m.presence.x)).toEqual([1, 4]);
    host.dispose();
  });

  test('no lobby, presença não é atividade e não muda a sala; visitante não tem presença', () => {
    const { host, a, clock } = hostWithTwo();
    const before = host.state;
    clock.advance(5_000);
    say(host, a, { type: 'presence', presence: at(5) });
    expect(host.state).toBe(before);
    const v = fakeSocket('token-v');
    host.connect(v);
    a.sent.length = 0;
    say(host, v, { type: 'presence', presence: at(9) });
    expect(presences(a)).toEqual([]);
    host.dispose();
  });

  test('quem conecta recebe a última presença de cada um, sem esperar a próxima', () => {
    const { host, a } = hostWithTwo();
    say(host, a, { type: 'presence', presence: at(42) });
    const c = fakeSocket('token-c');
    host.connect(c);
    expect(presences(c)).toEqual([{ type: 'presence', member: 'm1', presence: at(42) } as ServerMessage]);
    host.dispose();
  });

  test('o empurrão vai só para quem foi empurrado, com quem empurrou e o lado', () => {
    const { host, a, b } = hostWithTwo();
    say(host, a, { type: 'presence', presence: { ...at(120), facing: -1 } });
    say(host, b, { type: 'presence', presence: at(100) });
    a.sent.length = 0; b.sent.length = 0;
    say(host, a, { type: 'shove', target: 'm2', dir: -1 });
    expect(received(b).filter((m) => m.type === 'shoved')).toEqual([{ type: 'shoved', by: 'm1', dir: -1 }]);
    expect(received(a).filter((m) => m.type === 'shoved')).toEqual([]);
    host.dispose();
  });

  test('empurrar a si mesmo, alguém que não existe ou estando fora da turma não faz nada', () => {
    const { host, a, b } = hostWithTwo();
    a.sent.length = 0; b.sent.length = 0;
    say(host, a, { type: 'shove', target: 'm1', dir: 1 });
    say(host, a, { type: 'shove', target: 'm9', dir: 1 });
    const v = fakeSocket('token-v');
    host.connect(v);
    say(host, v, { type: 'shove', target: 'm2', dir: 1 });
    expect([...received(a), ...received(b)].filter((m) => m.type === 'shoved')).toEqual([]);
    host.dispose();
  });
});

describe('host: bots engraçados (emenda do ADR 0005)', () => {
  /** duas pessoas com o jogo começado e a opção ligada; o relógio é o de verdade (o laço dos bots usa timers) */
  function playingWithBots() {
    const host = new RoomHost('ABCD', silentLog, () => {}, { dev: true, botTick: 5, rng: lcg(3) });
    const a = fakeSocket('token-a'), b = fakeSocket('token-b');
    host.connect(a); say(host, a, { type: 'join', nickname: 'Zé' });
    host.connect(b); say(host, b, { type: 'join', nickname: 'Dita' });
    say(host, a, { type: 'character', character: 0 }); say(host, b, { type: 'character', character: 1 });
    say(host, a, { type: 'shuffleAuthors' });
    for (const [ws, me] of [[a, 'm1'], [b, 'm2']] as const) {
      const owner = Object.keys(host.state.game.authors).find((o) => host.state.game.authors[o] === me)!;
      say(host, ws, { type: 'write', owner, text: 'Batman', image: null });
    }
    say(host, a, { type: 'funnyBots', on: true });
    say(host, a, { type: 'start' });
    expect(host.state.game.phase).toBe('playing');
    return { host, a, b };
  }
  const botPresences = (ws: { sent: string[] }) => received(ws).filter((m) => m.type === 'presence' && m.member.startsWith('b'));

  test('com o jogo rodando e a opção ligada, bots aparecem: a lista vai no snapshot e a presença de cada um a todos', async () => {
    const { host, a, b } = playingWithBots();
    for (let i = 0; i < 400 && host.state.bots.length === 0; i++) await sleep(10);
    expect(host.state.bots.length).toBeGreaterThan(0);
    await sleep(40);
    const snap = received(b).filter((m) => m.type === 'snapshot').at(-1)!;
    expect(snap.type === 'snapshot' && snap.snapshot.bots.length).toBeGreaterThan(0);
    expect(botPresences(a).length).toBeGreaterThan(0);
    expect(botPresences(b).length).toBeGreaterThan(0);
    // quem chega depois vê os bots onde estão
    const c = fakeSocket('token-c');
    host.connect(c);
    expect(botPresences(c).length).toBeGreaterThan(0);
    host.dispose();
  });

  test('quando o jogo acaba, os bots somem na hora e o laço para', async () => {
    const { host, a, b } = playingWithBots();
    for (let i = 0; i < 400 && host.state.bots.length === 0; i++) await sleep(10);
    say(host, a, { type: 'endGame' });
    expect(host.state.bots).toEqual([]);
    const before = b.sent.length;
    await sleep(40);
    expect(botPresences({ sent: b.sent.slice(before) })).toHaveLength(0);
    host.dispose();
  });

  test('sem a opção ligada não há bot nem laço', async () => {
    const { host, a, b } = hostWithTwo();
    say(host, a, { type: 'shuffleAuthors' });
    await sleep(30);
    expect(host.state.bots).toEqual([]);
    expect(botPresences(b)).toHaveLength(0);
    host.dispose();
  });
});

describe('host: estatísticas do jogo (issue #59)', () => {
  const zero = { falls: 0, shoves: 0, shovedByPlayers: 0, shovedByBots: 0 };
  const pres = (blink: boolean, x = 100, y = 0): Presence => ({ x, y, z: 40, vx: 0, vy: 0, vz: 0, facing: 1, anim: 'idle', emote: null, blink });
  /** caído na rua: abaixo de `FALL_Y`, piscando */
  const down = (x = 100) => pres(true, x, FALL_Y - 20);
  /** Zé (m1, moderador) e Dita (m2) com o jogo começado; `bots`: com os bots engraçados ligados (e o relógio de verdade) */
  function playingTwo(bots = false) {
    let now = 1_000_000;
    const clock = { advance: (ms: number) => { now += ms; } };
    const host = new RoomHost('ABCD', silentLog, () => {}, bots ? { botTick: 5, rng: lcg(3) } : { clock: () => now });
    const a = fakeSocket('token-a'), b = fakeSocket('token-b');
    host.connect(a); say(host, a, { type: 'join', nickname: 'Zé' });
    host.connect(b); say(host, b, { type: 'join', nickname: 'Dita' });
    say(host, a, { type: 'shuffleAuthors' });
    for (const [ws, me] of [[a, 'm1'], [b, 'm2']] as const) {
      const owner = Object.keys(host.state.game.authors).find((o) => host.state.game.authors[o] === me)!;
      say(host, ws, { type: 'write', owner, text: 'Batman', image: null });
    }
    if (bots) say(host, a, { type: 'funnyBots', on: true });
    say(host, a, { type: 'start' });
    expect(host.state.game.phase).toBe('playing');
    // lado a lado, virados um para o outro
    say(host, a, { type: 'presence', presence: pres(false, 100) });
    say(host, b, { type: 'presence', presence: { ...pres(false, 120), facing: -1 } });
    return { host, a, b, clock };
  }

  test('um empurrão entregue conta para quem deu e para quem levou; os que não chegam a ninguém não contam', () => {
    const { host, a, b, clock } = playingTwo();
    say(host, a, { type: 'shove', target: 'm2', dir: 1 });
    clock.advance(SHOVE_COOLDOWN_MS);
    say(host, a, { type: 'shove', target: 'm2', dir: -1 });
    say(host, b, { type: 'shove', target: 'm1', dir: 1 });
    clock.advance(SHOVE_COOLDOWN_MS);
    say(host, a, { type: 'shove', target: 'm1', dir: 1 }); // em si mesmo
    clock.advance(SHOVE_COOLDOWN_MS);
    say(host, a, { type: 'shove', target: 'm9', dir: 1 }); // em ninguém
    clock.advance(SHOVE_COOLDOWN_MS);
    say(host, a, { type: 'shove', target: 'b1', dir: 1 }); // num bot que não existe
    host.disconnect(b);
    clock.advance(SHOVE_COOLDOWN_MS);
    say(host, a, { type: 'shove', target: 'm2', dir: 1 }); // em quem caiu da sala: não é entregue
    expect(host.stats).toEqual({ m1: { ...zero, shoves: 2, shovedByPlayers: 1 }, m2: { ...zero, shoves: 1, shovedByPlayers: 2 } });
    host.dispose();
  });

  test('contar não passa pela sala: nenhum passo dela por empurrão ou queda', () => {
    const { host, a, b, clock } = playingTwo();
    const before = host.state;
    for (let i = 0; i < 20; i++) { clock.advance(SHOVE_COOLDOWN_MS); say(host, a, { type: 'shove', target: 'm2', dir: 1 }); }
    say(host, b, { type: 'presence', presence: down() });
    expect(host.state).toBe(before);
    expect(host.stats.m1.shoves).toBe(20);
    host.dispose();
  });

  test('uma queda é a presença passar para baixo da rua: uma por queda, também logo depois de voltar (ainda piscando)', () => {
    const { host, a, b, clock } = playingTwo();
    // lá embaixo por RESPAWN_MS, como o corpo fica até voltar
    const fall = () => { for (let i = 0; i < 24; i++) { clock.advance(66); say(host, a, { type: 'presence', presence: down(100 + i) }); } };
    fall();
    clock.advance(66); say(host, a, { type: 'presence', presence: pres(true) }); // voltou, piscando
    fall(); // caiu de novo antes de parar de piscar
    clock.advance(66); say(host, a, { type: 'presence', presence: pres(false) });
    say(host, b, { type: 'presence', presence: pres(false) });
    expect(host.stats).toEqual({ m1: { ...zero, falls: 2 } });
    // quem cai da sala e volta já caído não ganha uma queda a mais (não há "antes")
    host.disconnect(b);
    host.connect(b);
    say(host, b, { type: 'presence', presence: down() });
    expect(host.stats.m2).toBeUndefined();
    host.dispose();
  });

  test('piscar de mentira não infla as quedas: no máximo uma a cada RESPAWN_MS', () => {
    const { host, a, clock } = playingTwo();
    // 3 s alternando em cima e embaixo da rua a 50 presenças por segundo
    for (let i = 1; i <= 150; i++) { clock.advance(20); say(host, a, { type: 'presence', presence: i % 2 ? down() : pres(false) }); }
    expect(a.closedWith).toBeNull();
    const falls = host.stats.m1.falls;
    expect(falls).toBeLessThanOrEqual(1 + Math.floor(3000 / RESPAWN_MS));
    clock.advance(RESPAWN_MS);
    say(host, a, { type: 'presence', presence: pres(false) });
    say(host, a, { type: 'presence', presence: down() });
    expect(host.stats.m1.falls).toBe(falls + 1);
    host.dispose();
  });

  test('fora do jogo nada conta; no fim, o snapshot de todo mundo leva os números', () => {
    const { host, a, b } = hostWithTwo();
    say(host, a, { type: 'presence', presence: pres(false, 100) });
    say(host, b, { type: 'presence', presence: pres(false, 110) });
    say(host, a, { type: 'shove', target: 'm2', dir: 1 });
    say(host, b, { type: 'presence', presence: down() });
    expect(host.stats).toEqual({});
    host.dispose();

    const p = playingTwo();
    say(p.host, p.a, { type: 'shove', target: 'm2', dir: 1 });
    say(p.host, p.b, { type: 'presence', presence: down() });
    say(p.host, p.a, { type: 'endGame' });
    const last = received(p.b).filter((m) => m.type === 'snapshot').at(-1)!;
    expect(last.type === 'snapshot' && last.snapshot.stats).toEqual({ m1: { ...zero, shoves: 1 }, m2: { ...zero, falls: 1, shovedByPlayers: 1 } });
    // depois do fim nada mais conta
    say(p.host, p.a, { type: 'presence', presence: down(300) });
    expect(p.host.state.stats).toEqual({ m1: { ...zero, shoves: 1 }, m2: { ...zero, falls: 1, shovedByPlayers: 1 } });
    p.host.dispose();
  });

  test('um jogo novo conta do zero; quem é expulso leva os números junto', () => {
    const { host, a, clock } = playingTwo();
    say(host, a, { type: 'shove', target: 'm2', dir: 1 });
    say(host, a, { type: 'kick', member: 'm2' });
    clock.advance(SHOVE_COOLDOWN_MS);
    say(host, a, { type: 'endGame' });
    expect(host.state.stats).toEqual({ m1: { ...zero, shoves: 1 } });
    say(host, a, { type: 'playAgain' });
    expect(host.stats).toEqual({});
    host.dispose();
  });

  test('o empurrão de um bot numa pessoa conta como levado dos bots; o de uma pessoa num bot, como dado, se acertou', async () => {
    const { host, a, b } = playingTwo(true);
    // um mundo de bots de mentira no lugar do sorteado: um passo dele empurra Dita uma vez; só o bot b1 se deixa empurrar
    let shoves = [{ target: 'm2', by: 'b1', dir: 1 as const }, { target: 'm9', by: 'b1', dir: 1 as const }];
    const fake = {
      // b1 e b2 ao alcance de Zé (em x = 100, virado para a direita); b3 do outro lado do telhado
      bots: [{ id: 'b1', body: { x: 115, y: 0, z: 40 } }, { id: 'b2', body: { x: 115, y: 0, z: 40 } }, { id: 'b3', body: { x: 700, y: 0, z: 40 } }],
      roster: () => [], presence: () => pres(false),
      tick: () => { const r = { shoves, rosterChanged: false, downs: [] }; shoves = []; return r; },
      shoved: (id: string) => id === 'b1' || id === 'b3',
    };
    (host as unknown as { botWorld: unknown }).botWorld = fake;
    for (let i = 0; i < 200 && !host.stats.m2; i++) await sleep(5);
    say(host, a, { type: 'shove', target: 'b1', dir: 1 });
    say(host, a, { type: 'shove', target: 'b2', dir: 1 }); // este bot não levou (piscando, chegando ou não existe)
    say(host, a, { type: 'shove', target: 'b3', dir: 1 }); // longe demais: nem chega ao bot
    expect(host.stats).toEqual({ m1: { ...zero, shoves: 1 }, m2: { ...zero, shovedByBots: 1 } });
    expect(received(b).filter((m) => m.type === 'shoved')).toEqual([{ type: 'shoved', by: 'b1', dir: 1 }]);
    host.dispose();
  });
});

describe('host: o chefão derrubado', () => {
  test('o raio: quando os pontos do chefão acabam, todo mundo da sala recebe `bossDown` com onde ele estava, uma vez', async () => {
    const host = new RoomHost('ABCD', silentLog, () => {}, { botTick: 5, rng: lcg(3) });
    const a = fakeSocket('token-a'), b = fakeSocket('token-b');
    host.connect(a); say(host, a, { type: 'join', nickname: 'Zé' });
    host.connect(b); say(host, b, { type: 'join', nickname: 'Dita' });
    say(host, a, { type: 'shuffleAuthors' });
    for (const [ws, me] of [[a, 'm1'], [b, 'm2']] as const) {
      const owner = Object.keys(host.state.game.authors).find((o) => host.state.game.authors[o] === me)!;
      say(host, ws, { type: 'write', owner, text: 'Batman', image: null });
    }
    say(host, a, { type: 'funnyBots', on: true });
    say(host, a, { type: 'start' });
    let downs = [{ id: 'b1', x: 321.5, y: 0, z: 40 }];
    const fake = {
      bots: [], roster: () => [], presence: () => null,
      tick: () => { const r = { shoves: [], rosterChanged: false, downs }; downs = []; return r; },
      shoved: () => false,
    };
    (host as unknown as { botWorld: unknown }).botWorld = fake;
    const strikes = (ws: { sent: string[] }) => received(ws).filter((m) => m.type === 'bossDown');
    for (let i = 0; i < 200 && strikes(b).length === 0; i++) await sleep(5);
    await sleep(30);
    expect(strikes(a)).toEqual([{ type: 'bossDown', bot: 'b1', x: 321.5 }]);
    expect(strikes(b)).toEqual([{ type: 'bossDown', bot: 'b1', x: 321.5 }]);
    host.dispose();
  });
});

describe('host: limites contra enxurradas (issue #72)', () => {
  const at = (x: number, facing: 1 | -1 = 1): Presence => ({ x, y: 0, z: 10, vx: 0, vy: 0, vz: 0, facing, anim: 'idle', emote: null, blink: false });
  const shovedTo = (ws: { sent: string[] }) => received(ws).filter((m) => m.type === 'shoved');

  test('uma enxurrada de pedidos: só a rajada passa, o log não registra cada um, e quem insiste é fechado com 4429', () => {
    const now = 1_000_000;
    const lines: string[] = [];
    const host = new RoomHost('ABCD', (e) => { lines.push(e); }, () => {}, { clock: () => now });
    const a = fakeSocket('token-a');
    host.connect(a); say(host, a, { type: 'join', nickname: 'Zé' });
    const logged = lines.length;
    for (let i = 0; i < 5000 && a.closedWith === null; i++) say(host, a, { type: 'nickname', nickname: `n${i % 2}` });
    expect(a.closedWith).toBe(CLOSE_TOO_MANY);
    const renamed = lines.slice(logged).filter((e) => e === 'room.renamed').length;
    expect(renamed).toBeLessThanOrEqual(MESSAGE_BURST);
    expect(lines.length - logged).toBeLessThan(MESSAGE_BURST + 10);
    // o socket fechado saiu da sala: o que ainda chegar dele não faz nada
    const s0 = host.state;
    say(host, a, { type: 'nickname', nickname: 'outro' });
    expect(host.state).toBe(s0);
    expect(host.state.phase !== 'dead' && host.state.members[0].connected).toBe(false);
    host.dispose();
  });

  test('no ritmo de gente de verdade nada é recusado: digitar no post-it, falar, pingar, empurrar', () => {
    let now = 1_000_000;
    const host = new RoomHost('ABCD', silentLog, () => {}, { clock: () => now });
    const a = fakeSocket('token-a'), b = fakeSocket('token-b');
    host.connect(a); say(host, a, { type: 'join', nickname: 'Zé' });
    host.connect(b); say(host, b, { type: 'join', nickname: 'Dita' });
    say(host, a, { type: 'shuffleAuthors' });
    const owner = Object.keys(host.state.game.authors).find((o) => host.state.game.authors[o] === 'm1')!;
    // 30 s digitando no ritmo do editor (uma escrita a cada 100 ms), com fala, ping e empurrão no meio
    for (let i = 0; i < 300; i++) {
      now += 100;
      say(host, a, { type: 'write', owner, text: `Batman ${i}`, image: null });
      if (i % 10 === 0) say(host, a, { type: 'chat', text: 'oi' });
      if (i % 5 === 0) say(host, a, { type: 'shove', target: 'm2', dir: 1 });
      if (i % 150 === 0) say(host, a, { type: 'ping' });
    }
    expect(a.closedWith).toBeNull();
    expect(host.state.game.postits[owner].text).toBe('Batman 299');
    host.dispose();
  });

  test('a presença não gasta o balde dos pedidos; só uma enxurrada dela (bem acima do ritmo da aba) fecha', () => {
    const { host, a, clock } = hostWithTwo();
    // um minuto de presença no ritmo da aba (uma a cada 66 ms), e os pedidos continuam com a rajada inteira
    for (let i = 0; i < 900; i++) { clock.advance(66); say(host, a, { type: 'presence', presence: at(i % 500) }); }
    for (let i = 0; i < MESSAGE_BURST; i++) say(host, a, { type: 'ping' });
    expect(received(a).filter((m) => m.type === 'pong')).toHaveLength(MESSAGE_BURST);
    expect(a.closedWith).toBeNull();
    for (let i = 0; i < 5000 && a.closedWith === null; i++) say(host, a, { type: 'presence', presence: at(i % 500) });
    expect(a.closedWith).toBe(CLOSE_TOO_MANY);
    host.dispose();
  });

  test('empurrões mais rápidos que o intervalo do empurrão são descartados; os alvos de um mesmo golpe passam', () => {
    const { host, a, b, clock } = hostWithTwo();
    const c = fakeSocket('token-c');
    host.connect(c); say(host, c, { type: 'join', nickname: 'Lia' });
    say(host, a, { type: 'presence', presence: at(100) });
    say(host, b, { type: 'presence', presence: at(115, -1) });
    say(host, c, { type: 'presence', presence: at(118, -1) });
    // um golpe que pega dois de uma vez
    say(host, a, { type: 'shove', target: 'm2', dir: 1 });
    say(host, a, { type: 'shove', target: 'm3', dir: 1 });
    // e uma enxurrada logo atrás
    for (let i = 0; i < 30; i++) say(host, a, { type: 'shove', target: 'm2', dir: 1 });
    clock.advance(SHOVE_COOLDOWN_MS / 2);
    say(host, a, { type: 'shove', target: 'm2', dir: 1 });
    expect(shovedTo(b)).toHaveLength(1);
    expect(shovedTo(c)).toHaveLength(1);
    clock.advance(SHOVE_COOLDOWN_MS / 2);
    say(host, a, { type: 'shove', target: 'm2', dir: 1 });
    expect(shovedTo(b)).toHaveLength(2);
    host.dispose();
  });

  test('empurrão em quem está longe, atrás, piscando, ou sem presença não sai', () => {
    const { host, a, b, clock } = hostWithTwo();
    say(host, a, { type: 'shove', target: 'm2', dir: 1 }); // ninguém mandou presença ainda
    say(host, a, { type: 'presence', presence: at(100) });
    say(host, b, { type: 'presence', presence: at(600) });
    clock.advance(SHOVE_COOLDOWN_MS); say(host, a, { type: 'shove', target: 'm2', dir: 1 });
    say(host, b, { type: 'presence', presence: at(20) });
    clock.advance(SHOVE_COOLDOWN_MS); say(host, a, { type: 'shove', target: 'm2', dir: 1 });
    say(host, b, { type: 'presence', presence: { ...at(115), blink: true } });
    clock.advance(SHOVE_COOLDOWN_MS); say(host, a, { type: 'shove', target: 'm2', dir: 1 });
    expect(shovedTo(b)).toHaveLength(0);
    say(host, b, { type: 'presence', presence: at(115) });
    clock.advance(SHOVE_COOLDOWN_MS); say(host, a, { type: 'shove', target: 'm2', dir: 1 });
    expect(shovedTo(b)).toHaveLength(1);
    host.dispose();
  });

  test(`no máximo ${VISITORS_MAX} visitantes por sala; quem é da turma sempre volta`, () => {
    const { host, a } = hostWithTwo();
    const vs = Array.from({ length: VISITORS_MAX + 1 }, (_, i) => fakeSocket(`token-v${i}`));
    for (const v of vs) host.connect(v);
    expect(vs.slice(0, VISITORS_MAX).every((v) => v.closedWith === null)).toBe(true);
    expect(vs[VISITORS_MAX].closedWith).toBe(CLOSE_TOO_MANY);
    expect(host.state.phase !== 'dead' && host.state.visitors).toHaveLength(VISITORS_MAX);
    const again = fakeSocket('token-a');
    host.connect(again);
    expect(again.closedWith).toBeNull();
    expect(a.closedWith).toBe(CLOSE_REPLACED);
    host.dispose();
  });

  test('o que o host guarda por pessoa some quando ela sai', () => {
    const { host, b } = hostWithTwo();
    say(host, b, { type: 'character', character: 1 });
    say(host, b, { type: 'chat', text: 'oi' });
    say(host, b, { type: 'presence', presence: at(1) });
    say(host, b, { type: 'shove', target: 'm1', dir: 1 });
    host.disconnect(b);
    const priv = host as unknown as Record<string, Map<unknown, unknown>>;
    for (const name of ['chats', 'presences', 'buckets', 'shoveVolleys', 'fallAt']) {
      expect([name, [...priv[name].keys()].filter((k) => k === 'token-b' || k === b)]).toEqual([name, []]);
    }
    host.dispose();
  });
});

describe('host: atividade com o jogo rodando (issue #72, emenda do ADR 0005)', () => {
  const at = (x: number): Presence => ({ x, y: 0, z: 10, vx: 0, vy: 0, vz: 0, facing: 1, anim: 'idle', emote: null, blink: false });
  function playing() {
    let now = 1_000_000;
    const clock = { advance: (ms: number) => { now += ms; } };
    const host = new RoomHost('ABCD', silentLog, () => {}, { clock: () => now });
    const a = fakeSocket('token-a'), b = fakeSocket('token-b');
    host.connect(a); say(host, a, { type: 'join', nickname: 'Zé' });
    host.connect(b); say(host, b, { type: 'join', nickname: 'Dita' });
    say(host, a, { type: 'shuffleAuthors' });
    for (const [ws, me] of [[a, 'm1'], [b, 'm2']] as const) {
      const owner = Object.keys(host.state.game.authors).find((o) => host.state.game.authors[o] === me)!;
      say(host, ws, { type: 'write', owner, text: 'Batman', image: null });
    }
    say(host, a, { type: 'start' });
    say(host, a, { type: 'pause', on: true }); // o relógio da vez parado: só a presença pode segurar a sala
    return { host, a, b, clock, now: () => now };
  }

  test('a presença de alguém da turma conta como atividade, no máximo uma vez por minuto, sem mandar snapshot', () => {
    const { host, a, b, clock, now } = playing();
    clock.advance(30_000);
    b.sent.length = 0;
    say(host, a, { type: 'presence', presence: at(1) });
    expect(host.state.lastActivity).toBe(now());
    expect(received(b).filter((m) => m.type === 'snapshot')).toHaveLength(0);
    const s0 = host.state;
    clock.advance(10_000);
    say(host, a, { type: 'presence', presence: at(2) });
    expect(host.state).toBe(s0); // dentro do minuto: nem passa pela sala
    clock.advance(PRESENCE_ACTIVITY_MS);
    say(host, a, { type: 'presence', presence: at(3) });
    expect(host.state.lastActivity).toBe(now());
    host.dispose();
  });
});
