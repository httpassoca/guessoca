import { describe, expect, test } from 'bun:test';
import { openRoom } from '../src/lib/rooms';

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
