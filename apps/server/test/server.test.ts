import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CLOSE_REPLACED, CLOSE_ROOM_NOT_FOUND, CODE_RE, IMAGE_BYTES_MAX, IMAGE_ID_RE, type ClientMessage, type RoomSnapshot, type ServerMessage } from '@guess/protocol';
import { createServer } from '../src/server';
import { silentLog } from '../src/log';
import { Rooms } from '../src/rooms';
import { webp } from './sim';

/** Servidor de verdade numa porta livre; o adaptador de socket é coberto aqui só no que o deploy e o cliente dependem. */
let app: ReturnType<typeof createServer>;
let base: string;
const wsUrl = (room: string, token: string) => `${base.replace('http', 'ws')}/ws?room=${room}&token=${token}`;

beforeAll(() => {
  app = createServer({ port: 0, distDir: '/nonexistent', log: silentLog });
  base = `http://localhost:${app.server.port}`;
});
afterAll(() => app.stop());

function nextMessage(ws: WebSocket): Promise<ServerMessage> {
  return new Promise((res) => ws.addEventListener('message', (e) => res(JSON.parse(String(e.data))), { once: true }));
}
function closed(ws: WebSocket): Promise<CloseEvent> {
  return new Promise((res) => ws.addEventListener('close', (e) => res(e as CloseEvent), { once: true }));
}
const openRoom = async () => ((await (await fetch(`${base}/api/rooms`, { method: 'POST' })).json()) as { code: string }).code;

describe('servidor', () => {
  test('/health responde', async () => {
    const r = await fetch(`${base}/health`);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, rooms: 0 });
  });

  test('sem cliente buildado, a raiz explica em vez de quebrar', async () => {
    const r = await fetch(`${base}/sala/ABCD`);
    expect(r.status).toBe(503);
    expect(await r.text()).toContain('bun run build');
  });

  test('POST /api/rooms abre uma sala com código de quatro letras; outro método é recusado', async () => {
    const code = await openRoom();
    expect(code).toMatch(CODE_RE);
    expect(app.rooms.get(code)).toBeDefined();
    expect((await fetch(`${base}/api/rooms`)).status).toBe(405);
  });

  test('token inválido ou sala ausente no WebSocket: 400 antes do upgrade', async () => {
    const code = await openRoom();
    expect((await fetch(`${base}/ws?room=${code}&token=curto`)).status).toBe(400);
    expect((await fetch(`${base}/ws?token=token-aaaaaaaa`)).status).toBe(400);
  });

  test('sala desconhecida fecha o socket com o código que o cliente entende', async () => {
    const ws = new WebSocket(wsUrl('ZZZZ', 'token-desconhecido-1'));
    const e = await closed(ws);
    expect(e.code).toBe(CLOSE_ROOM_NOT_FOUND);
  });

  test('duas conexões na mesma sala entram e cada uma vê as duas', async () => {
    const code = await openRoom();
    const a = new WebSocket(wsUrl(code, 'token-aaaaaaaa'));
    expect(await nextMessage(a)).toMatchObject({ type: 'snapshot', snapshot: { code, phase: 'lobby', you: null, moderator: null, members: [] } });
    a.send(JSON.stringify({ type: 'join', nickname: 'Zé' }));
    expect(await nextMessage(a)).toMatchObject({ type: 'snapshot', snapshot: { you: 'm1', moderator: 'm1' } });

    const b = new WebSocket(wsUrl(code.toLowerCase(), 'token-bbbbbbbb'));
    await nextMessage(b);
    const seen = Promise.all([nextMessage(a), nextMessage(b)]);
    b.send(JSON.stringify({ type: 'join', nickname: 'Zé' }));
    const [snapA, snapB] = (await seen) as { snapshot: RoomSnapshot }[];
    const members = [
      { id: 'm1', nickname: 'Zé', connected: true, character: 0, ghost: false, fake: false },
      { id: 'm2', nickname: 'Zé 2', connected: true, character: 1, ghost: false, fake: false },
    ];
    expect(snapA.snapshot).toMatchObject({ code, phase: 'lobby', you: 'm1', moderator: 'm1', dev: false, members });
    expect(snapB.snapshot).toMatchObject({ code, phase: 'lobby', you: 'm2', moderator: 'm1', dev: false, members });

    // quem fecha a aba continua na turma, desconectado
    const after = nextMessage(a);
    b.close();
    expect(((await after) as { snapshot: RoomSnapshot }).snapshot.members[1]).toMatchObject({ id: 'm2', nickname: 'Zé 2', connected: false });
    a.close();
  });

  test('um socket novo com o mesmo token assume o lugar do velho e recebe o snapshot na hora', async () => {
    const code = await openRoom();
    const a1 = new WebSocket(wsUrl(code, 'token-cccccccc'));
    await nextMessage(a1);
    a1.send(JSON.stringify({ type: 'join', nickname: 'Zé' }));
    await nextMessage(a1);

    const a2 = new WebSocket(wsUrl(code, 'token-cccccccc'));
    const [gone, snap] = await Promise.all([closed(a1), nextMessage(a2)]);
    expect(gone.code).toBe(CLOSE_REPLACED);
    expect(snap).toMatchObject({ type: 'snapshot', snapshot: { you: 'm1', members: [{ nickname: 'Zé', connected: true }] } });
    expect(app.rooms.get(code)!.connections).toBe(1);
    a2.close();
  });
});

/** Uma aba de verdade: guarda tudo o que chegou, cru, e espera a sala ficar de um jeito. */
class Tab {
  raw: string[] = [];
  snap: RoomSnapshot | null = null;
  private waiters: (() => void)[] = [];
  private constructor(readonly ws: WebSocket) {
    ws.addEventListener('message', (e) => {
      const data = String(e.data);
      this.raw.push(data);
      const m = JSON.parse(data) as ServerMessage;
      if (m.type === 'snapshot') this.snap = m.snapshot;
      for (const w of this.waiters.splice(0)) w();
    });
  }
  static async open(code: string, token: string) {
    const tab = new Tab(new WebSocket(wsUrl(code, token)));
    await tab.until((s) => s.code === code);
    return tab;
  }
  send(m: ClientMessage) { this.ws.send(JSON.stringify(m)); }
  /** espera o último snapshot satisfazer `pred` */
  until(pred: (s: RoomSnapshot) => boolean, ms = 2_000): Promise<RoomSnapshot> {
    return new Promise((res, rej) => {
      const timeout = setTimeout(() => rej(new Error(`esperando a sala: ${JSON.stringify(this.snap)}`)), ms);
      const check = () => {
        if (this.snap && pred(this.snap)) { clearTimeout(timeout); res(this.snap); } else this.waiters.push(check);
      };
      check();
    });
  }
  get you() { return this.snap!.you!; }
  /** o dono do post-it que esta aba escreve */
  get writesFor() { const s = this.snap!; return Object.keys(s.authors).find((o) => s.authors[o] === s.you)!; }
  wire() { return this.raw.join('\n'); }
}

const upload = (code: string, token: string, body: Uint8Array<ArrayBuffer>) =>
  fetch(`${base}/api/rooms/${code}/images?token=${token}`, { method: 'POST', body, headers: { 'content-type': 'image/webp' } });

describe('servidor: um jogo inteiro com três abas', () => {
  test('lobby, escrita, vezes, acertei que falha e que passa, desistir, fim e jogar de novo', async () => {
    const code = await openRoom();
    const [a, b, c] = await Promise.all(['token-jogo-a', 'token-jogo-b', 'token-jogo-c'].map((t) => Tab.open(code, t)));
    a.send({ type: 'join', nickname: 'Ana' });
    await a.until((s) => s.you === 'm1');
    b.send({ type: 'join', nickname: 'Bia' });
    await b.until((s) => s.you === 'm2');
    c.send({ type: 'join', nickname: 'Caio' });
    await c.until((s) => s.you === 'm3');
    const tabs = [a, b, c];
    const all = (pred: (s: RoomSnapshot) => boolean) => Promise.all(tabs.map((t) => t.until(pred)));

    // lobby: o moderador sorteia e muda o tempo da vez
    a.send({ type: 'shuffleAuthors' });
    a.send({ type: 'turnMs', ms: 90_000 });
    const [lobby] = await all((s) => s.turnMs === 90_000);
    expect(lobby.order).toEqual(['m1', 'm2', 'm3']);
    for (const [owner, author] of Object.entries(lobby.authors)) expect(owner).not.toBe(author);
    b.send({ type: 'turnMs', ms: 30_000 });
    await b.until(() => b.raw.some((r) => r.includes('"refused"')));

    // escrita: cada um escreve o seu, Ana com imagem, e aperta Pronto
    a.send({ type: 'startWriting' });
    await all((s) => s.phase === 'writing');
    const res = await upload(code, 'token-jogo-a', webp(200));
    expect(res.status).toBe(200);
    const { id } = (await res.json()) as { id: string };
    for (const t of tabs) t.send({ type: 'write', owner: t.writesFor, text: `segredo de ${t.writesFor}`, image: t === a ? id : null });
    for (const t of tabs) t.send({ type: 'ready' });
    await all((s) => s.phase === 'playing');

    // ninguém vê o próprio; todo mundo vê o dos outros; a imagem de Ana chega ao dono pelo endereço
    for (const t of tabs) {
      expect(t.snap!.postits[t.you]).toMatchObject({ text: null, image: null, revealed: false });
      for (const other of tabs.filter((o) => o !== t)) expect(t.snap!.postits[other.you].text).toBe(`segredo de ${other.you}`);
    }
    const imageOwner = a.writesFor;
    const viewer = tabs.find((t) => t.you !== imageOwner)!;
    const url = viewer.snap!.postits[imageOwner].image!;
    expect(url).toBe(`/api/rooms/${code}/images/${id}`);
    const img = await fetch(`${base}${url}`);
    expect(img.status).toBe(200);
    expect(new Uint8Array(await img.arrayBuffer())).toEqual(webp(200));

    // a vez de Ana: acertei, e os dois votam não; a vez continua
    expect(a.snap!.turn).toMatchObject({ owner: 'm1', running: true });
    a.send({ type: 'claim' });
    await all((s) => s.vote !== null);
    b.send({ type: 'vote', yes: false });
    c.send({ type: 'vote', yes: false });
    const failed = await a.until((s) => s.vote === null);
    expect(failed.got).toEqual([]);
    expect(failed.turn).toMatchObject({ owner: 'm1', running: true });

    // até aqui, nenhuma aba recebeu o próprio post-it, nem a imagem dele
    for (const t of tabs) expect(t.wire()).not.toContain(`segredo de ${t.you}`);
    expect(tabs.find((t) => t.you === imageOwner)!.wire()).not.toContain(id);

    // de novo: um sim, um não; empate vale sim
    a.send({ type: 'claim' });
    await all((s) => s.vote !== null);
    b.send({ type: 'vote', yes: true });
    c.send({ type: 'vote', yes: false });
    const passed = await a.until((s) => s.got.length === 1);
    expect(passed.got).toEqual(['m1']);
    expect(passed.turn?.owner).toBe('m2');
    expect(passed.postits.m1).toMatchObject({ text: 'segredo de m1', revealed: true });

    // Bia desiste; Caio acerta; o jogo acaba
    b.send({ type: 'giveUp' });
    await all((s) => s.turn?.owner === 'm3');
    expect(c.wire()).not.toContain('segredo de m3');
    c.send({ type: 'claim' });
    await all((s) => s.vote !== null);
    a.send({ type: 'vote', yes: true });
    b.send({ type: 'vote', yes: true });
    const [end] = await all((s) => s.phase === 'ended');
    expect(end.got).toEqual(['m1', 'm3']);
    expect(end.gaveUp).toEqual(['m2']);
    for (const owner of ['m1', 'm2', 'm3']) expect(end.postits[owner]).toMatchObject({ text: `segredo de ${owner}`, revealed: true });

    // jogar de novo com a mesma turma
    b.send({ type: 'playAgain' });
    const [again] = await all((s) => s.phase === 'lobby');
    expect(again.postits).toEqual({});
    expect(again.order).toEqual(['m1', 'm2', 'm3']);
    expect((await fetch(`${base}${url}`)).status).toBe(404); // nenhum post-it usa mais a imagem
    for (const t of tabs) t.ws.close();
  });
});

describe('servidor: imagens', () => {
  test('sobe e baixa uma imagem; recusa sala, token, tamanho e tipo errados', async () => {
    const code = await openRoom();
    const tab = await Tab.open(code, 'token-img-aaaa');
    tab.send({ type: 'join', nickname: 'Zé' });
    await tab.until((s) => s.you === 'm1');
    await Tab.open(code, 'token-img-visit');

    const ok = await upload(code.toLowerCase(), 'token-img-aaaa', webp(300));
    expect(ok.status).toBe(200);
    const { id } = (await ok.json()) as { id: string };
    expect(id).toMatch(IMAGE_ID_RE);

    expect((await upload('ZZZZ', 'token-img-aaaa', webp())).status).toBe(404);
    expect((await upload(code, 'token-img-visit', webp())).status).toBe(403);
    expect((await upload(code, 'token-ninguem', webp())).status).toBe(403);
    expect((await fetch(`${base}/api/rooms/${code}/images`, { method: 'POST', body: webp() })).status).toBe(403);
    expect((await upload(code, 'token-img-aaaa', webp(IMAGE_BYTES_MAX + 1))).status).toBe(413);
    expect((await upload(code, 'token-img-aaaa', new Uint8Array(300))).status).toBe(415);

    const got = await fetch(`${base}/api/rooms/${code}/images/${id}`);
    expect(got.status).toBe(200);
    expect(got.headers.get('content-type')).toBe('image/webp');
    expect(got.headers.get('cache-control')).toBe('private, max-age=86400, immutable');
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(webp(300));
    expect((await fetch(`${base}/api/rooms/${code}/images/0123456789abcdef`)).status).toBe(404);
    expect((await fetch(`${base}/api/rooms/${code}/images/nao-e-id`)).status).toBe(404);
    expect((await fetch(`${base}/api/rooms/ZZZZ/images/${id}`)).status).toBe(404);
    tab.ws.close();
  });
});

describe('servidor: cliente estático', () => {
  test('serve os arquivos do build e cai no index.html em qualquer rota que não seja arquivo', async () => {
    const dist = mkdtempSync(join(tmpdir(), 'guess-dist-'));
    writeFileSync(join(dist, 'index.html'), '<!doctype html><title>guessoca</title>');
    writeFileSync(join(dist, 'app.js'), 'console.log(1)');
    const s = createServer({ port: 0, distDir: dist, log: silentLog });
    try {
      const url = `http://localhost:${s.server.port}`;
      expect(await (await fetch(`${url}/sala/ABCD`)).text()).toContain('guessoca');
      expect(await (await fetch(`${url}/app.js`)).text()).toBe('console.log(1)');
      expect(await (await fetch(`${url}/%2e%2e/%2e%2e/etc/passwd`)).text()).toContain('guessoca'); // vira o index, nunca sai de dist
    } finally { s.stop(); rmSync(dist, { recursive: true }); }
  });
});

describe('salas', () => {
  test('códigos são quatro letras do alfabeto sem I nem O, e nunca repetem uma sala viva', () => {
    const seq = [0, 0, 0, 0, 0, 0, 0, 0, 0.99, 0.99, 0.99, 0.99];
    let i = 0;
    const rooms = new Rooms(silentLog, () => seq[i++]);
    const first = rooms.create(), second = rooms.create();
    expect(first.code).toBe('AAAA');
    expect(second.code).toBe('ZZZZ'); // AAAA de novo foi sorteado e descartado
    expect(rooms.get('zzzz')).toBe(second);
    expect(rooms.size).toBe(2);
    first.dispose(); second.dispose();
  });
});
