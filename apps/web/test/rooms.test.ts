import { describe, expect, test } from 'bun:test';
import { openRoom } from '../src/lib/rooms';

const reply = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('abrir uma sala', () => {
  test('pede ao servidor com POST e devolve o código', async () => {
    let asked: [string, RequestInit | undefined] | null = null;
    const code = await openRoom(async (url, init) => { asked = [String(url), init]; return reply(201, { code: 'ABCD' })(); });
    expect(code).toBe('ABCD');
    expect(asked![0]).toBe('/api/rooms');
    expect(asked![1]?.method).toBe('POST');
  });

  test('servidor fora do ar ou resposta estranha é erro', async () => {
    await expect(openRoom(reply(503, {}))).rejects.toThrow();
    await expect(openRoom(reply(201, { code: 'nope' }))).rejects.toThrow();
  });
});
