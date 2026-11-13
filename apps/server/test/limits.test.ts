import { describe, expect, test } from 'bun:test';
import { clientIp, KeyedBuckets, TokenBucket } from '../src/limits';

describe('balde de fichas', () => {
  test('deixa passar uma rajada, depois só no ritmo de recarga', () => {
    const b = new TokenBucket(3, 2, 0); // 3 de rajada, 2 por segundo
    expect([b.take(0), b.take(0), b.take(0), b.take(0)]).toEqual([true, true, true, false]);
    expect(b.take(400)).toBe(false); // 0,8 ficha
    expect(b.take(500)).toBe(true); // 1 ficha
    expect(b.take(500)).toBe(false);
    // parado muito tempo, não passa da rajada
    expect([b.take(60_000), b.take(60_000), b.take(60_000), b.take(60_000)]).toEqual([true, true, true, false]);
  });

  test('cheio: sabe que pode ser esquecido', () => {
    const b = new TokenBucket(2, 1, 0);
    expect(b.full(0)).toBe(true);
    b.take(0);
    expect(b.full(500)).toBe(false);
    expect(b.full(1000)).toBe(true);
  });
});

describe('baldes por chave', () => {
  test('cada chave tem o seu, e os cheios são esquecidos para o mapa não crescer', () => {
    const k = new KeyedBuckets(2, 1, 4);
    expect([k.take('a', 0), k.take('a', 0), k.take('a', 0)]).toEqual([true, true, false]);
    expect(k.take('b', 0)).toBe(true);
    for (let i = 0; i < 10; i++) k.take(`x${i}`, 10_000);
    expect(k.size).toBeLessThanOrEqual(4 + 1);
    expect(k.take('a', 10_000)).toBe(true);
  });
});

describe('IP de quem pede', () => {
  const req = (headers: Record<string, string>) => new Request('http://x/', { headers });
  test('atrás do nginx (conexão do loopback ou de rede privada), vale o X-Real-IP', () => {
    expect(clientIp(req({ 'x-real-ip': '203.0.113.9' }), '127.0.0.1')).toBe('203.0.113.9');
    expect(clientIp(req({ 'x-real-ip': '203.0.113.9' }), '172.17.0.1')).toBe('203.0.113.9');
    expect(clientIp(req({ 'x-real-ip': '203.0.113.9' }), '::ffff:127.0.0.1')).toBe('203.0.113.9');
    // sem X-Real-IP, o último do X-Forwarded-For (o que o nginx acrescentou; os de antes vêm do cliente)
    expect(clientIp(req({ 'x-forwarded-for': '1.2.3.4, 198.51.100.7' }), '127.0.0.1')).toBe('198.51.100.7');
  });

  test('de fora, os cabeçalhos são ignorados: vale o endereço da conexão', () => {
    expect(clientIp(req({ 'x-real-ip': '1.1.1.1', 'x-forwarded-for': '2.2.2.2' }), '198.51.100.7')).toBe('198.51.100.7');
    expect(clientIp(req({}), null)).toBe('?');
  });
});
