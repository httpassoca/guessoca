import { describe, expect, test } from 'bun:test';
import { openRoom, peekRoom, roomCheck } from '../src/lib/rooms';

const reply = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('abrir uma sala', () => {
  test('pede ao servidor com POST, levando as configurações em JSON, e devolve o código', async () => {
    let asked: [string, RequestInit | undefined] | null = null;
    const code = await openRoom({ turnMs: 45_000, maxPlayers: 4, onlyModerate: true }, async (url, init) => { asked = [String(url), init]; return reply(201, { code: 'ABCD' })(); });
    expect(code).toBe('ABCD');
    expect(asked![0]).toBe('/api/rooms');
    expect(asked![1]?.method).toBe('POST');
    expect(new Headers(asked![1]?.headers).get('content-type')).toBe('application/json');
    expect(JSON.parse(String(asked![1]?.body))).toEqual({ turnMs: 45_000, maxPlayers: 4, onlyModerate: true });
  });

  test('sem configurações, o corpo vai vazio e o servidor usa o padrão', async () => {
    let body: unknown;
    await openRoom({}, async (_url, init) => { body = JSON.parse(String(init?.body)); return reply(201, { code: 'WXYZ' })(); });
    expect(body).toEqual({});
  });

  test('servidor fora do ar ou resposta estranha é erro', async () => {
    await expect(openRoom({}, reply(503, {}))).rejects.toThrow();
    await expect(openRoom({}, reply(201, { code: 'nope' }))).rejects.toThrow();
  });
});

describe('olhar uma sala antes de entrar', () => {
  const peek = { phase: 'lobby', members: 2, maxPlayers: 8, member: false };
  test('404 do servidor: código errado', () => {
    expect(roomCheck(404, { found: false })).toEqual({ kind: 'missing' });
  });
  test('cheia: só para quem ainda não é da turma', () => {
    expect(roomCheck(200, { ...peek, members: 3, maxPlayers: 3 })).toEqual({ kind: 'full', max: 3 });
    expect(roomCheck(200, { ...peek, members: 3, maxPlayers: 3, member: true })).toEqual({ kind: 'ok' });
  });
  test('jogo em andamento: avisa que entra de fantasma (quem já é da turma só volta)', () => {
    expect(roomCheck(200, { ...peek, phase: 'playing' })).toEqual({ kind: 'playing' });
    expect(roomCheck(200, { ...peek, phase: 'ended' })).toEqual({ kind: 'playing' });
    expect(roomCheck(200, { ...peek, phase: 'playing', member: true })).toEqual({ kind: 'ok' });
    expect(roomCheck(200, peek)).toEqual({ kind: 'ok' });
  });
  test('servidor antigo (index.html), 404 sem corpo, erro ou corpo estranho: não se sabe', () => {
    expect(roomCheck(200, null)).toEqual({ kind: 'unknown' });
    expect(roomCheck(404, null)).toEqual({ kind: 'unknown' });
    expect(roomCheck(500, { found: false })).toEqual({ kind: 'unknown' });
    expect(roomCheck(200, { members: '2' })).toEqual({ kind: 'unknown' });
  });
  test('peekRoom pede com o token e nunca lança', async () => {
    let asked = '';
    const r = await peekRoom('ABCD', 'tok', async (url) => { asked = url; return new Response(JSON.stringify(peek)); });
    expect(asked).toBe('/api/rooms/ABCD?token=tok');
    expect(r).toEqual({ kind: 'ok' });
    expect(await peekRoom('ABCD', 'tok', async () => new Response('<!doctype html>'))).toEqual({ kind: 'unknown' });
    expect(await peekRoom('ABCD', 'tok', async () => { throw new Error('rede'); })).toEqual({ kind: 'unknown' });
  });
});
