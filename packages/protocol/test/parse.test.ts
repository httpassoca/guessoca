import { describe, expect, test } from 'bun:test';
import { CHARACTERS } from '@guess/rules';
import { CODE_RE, isWebp, MESSAGE_MAX, SOCKET_MESSAGE_BYTES_MAX, parseClientMessage, parsePresence, parseRoomInit, TOKEN_RE, type Presence } from '../src';

describe('parseClientMessage', () => {
  test('aceita as mensagens válidas', () => {
    expect(parseClientMessage('{"type":"ping"}')).toEqual({ type: 'ping' });
    expect(parseClientMessage('{"type":"join","nickname":"Zé"}')).toEqual({ type: 'join', nickname: 'Zé' });
    expect(parseClientMessage('{"type":"nickname","nickname":"Ana"}')).toEqual({ type: 'nickname', nickname: 'Ana' });
  });

  test('descarta o que não é JSON, não é objeto ou não tem tipo conhecido', () => {
    for (const raw of ['', 'oi', '[]', 'null', '42', '{"type":"voar"}', '{}']) expect(parseClientMessage(raw)).toBeNull();
    expect(parseClientMessage(123)).toBeNull();
  });

  test('descarta campos com o tipo errado ou grandes demais', () => {
    expect(parseClientMessage('{"type":"join"}')).toBeNull();
    expect(parseClientMessage('{"type":"join","nickname":7}')).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: 'join', nickname: 'x'.repeat(500) }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: 'ping', pad: 'x'.repeat(5000) }))).toBeNull();
  });

  test('só leva os campos conhecidos', () => {
    expect(parseClientMessage('{"type":"ping","extra":1}')).toEqual({ type: 'ping' });
  });
});

describe('formatos', () => {
  test('código de sala: quatro letras sem I nem O', () => {
    expect(CODE_RE.test('ABCD')).toBe(true);
    expect(CODE_RE.test('ABCI')).toBe(false);
    expect(CODE_RE.test('abcd')).toBe(false);
    expect(CODE_RE.test('ABCDE')).toBe(false);
  });

  test('token: 8 a 64 caracteres seguros para URL', () => {
    expect(TOKEN_RE.test('abcdEFGH_-12')).toBe(true);
    expect(TOKEN_RE.test('short')).toBe(false);
    expect(TOKEN_RE.test('com espaço aqui')).toBe(false);
  });
});

describe('parseClientMessage: o jogo', () => {
  const p = (v: unknown) => parseClientMessage(JSON.stringify(v));

  test('aceita as mensagens sem campos', () => {
    for (const type of ['shuffleAuthors', 'start', 'ready', 'unready', 'claim', 'skip', 'giveUp', 'endGame', 'playAgain', 'addFake']) {
      expect(p({ type })).toEqual({ type } as never);
    }
  });

  test('personagem de 0 a CHARACTERS − 1', () => {
    expect(p({ type: 'character', character: CHARACTERS - 1 })).toEqual({ type: 'character', character: CHARACTERS - 1 });
    expect(p({ type: 'character', character: CHARACTERS })).toBeNull();
    expect(p({ type: 'character', character: 1.5 })).toBeNull();
  });

  test('alvo à mão: autor e dono, ids de membro diferentes', () => {
    expect(p({ type: 'assign', author: 'm1', owner: 'm2' })).toEqual({ type: 'assign', author: 'm1', owner: 'm2' });
    expect(p({ type: 'assign', author: 'm1', owner: 'm1' })).toBeNull();
    expect(p({ type: 'assign', author: 'm1' })).toBeNull();
    expect(p({ type: 'assign', author: 'x y', owner: 'm2' })).toBeNull();
  });

  test('ordem: ids de membro sem repetir', () => {
    expect(p({ type: 'order', order: ['m1', 'm2'] })).toEqual({ type: 'order', order: ['m1', 'm2'] });
    expect(p({ type: 'order', order: ['m1', 'm1'] })).toBeNull();
    expect(p({ type: 'order', order: ['x'] })).toBeNull();
  });

  test('vez: de 30 s a 3 min, de 15 em 15 s', () => {
    expect(p({ type: 'turnMs', ms: 45_000 })).toEqual({ type: 'turnMs', ms: 45_000 });
    for (const ms of [15_000, 50_000, 195_000, '60000']) expect(p({ type: 'turnMs', ms })).toBeNull();
  });

  test('post-it: dono, texto e imagem (id ou null)', () => {
    expect(p({ type: 'write', owner: 'm2', text: 'Pelé', image: null })).toEqual({ type: 'write', owner: 'm2', text: 'Pelé', image: null });
    expect(p({ type: 'write', owner: 'm2', text: 'Pelé', image: '0123456789abcdef' })).toEqual({ type: 'write', owner: 'm2', text: 'Pelé', image: '0123456789abcdef' });
    expect(p({ type: 'write', owner: 'm2', text: 'Pelé', image: '../x' })).toBeNull();
    expect(p({ type: 'write', owner: 'm2', text: 'x'.repeat(500), image: null })).toBeNull();
    expect(p({ type: 'write', owner: 'm2', text: 'Pelé' })).toBeNull();
  });

  test('votar, marcar, pausar, expulsar, passar o papel', () => {
    expect(p({ type: 'vote', yes: false })).toEqual({ type: 'vote', yes: false });
    expect(p({ type: 'mark', member: 'm3', right: true })).toEqual({ type: 'mark', member: 'm3', right: true });
    expect(p({ type: 'pause', on: true })).toEqual({ type: 'pause', on: true });
    expect(p({ type: 'kick', member: 'm3' })).toEqual({ type: 'kick', member: 'm3' });
    expect(p({ type: 'handOver', member: 'm3' })).toEqual({ type: 'handOver', member: 'm3' });
    expect(p({ type: 'vote', yes: 'sim' })).toBeNull();
    expect(p({ type: 'swapAuthors', a: 'm1', b: 'm2' })).toBeNull(); // não existe mais
    expect(p({ type: 'startWriting' })).toBeNull();
  });
});

describe('isWebp', () => {
  test('reconhece o cabeçalho RIFF…WEBP', () => {
    const ok = new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 ');
    expect(isWebp(ok)).toBe(true);
    expect(isWebp(new TextEncoder().encode('\x89PNG\r\n\x1a\n0000'))).toBe(false);
    expect(isWebp(new Uint8Array(4))).toBe(false);
  });
});

describe('presença e empurrão', () => {
  const ok: Presence = { x: 300, y: 24, z: 20, vx: 80, vy: 0, vz: 0, facing: 1, anim: 'walk', emote: null, blink: false };
  const p = (v: unknown) => parseClientMessage(JSON.stringify(v));

  test('aceita a presença válida e só leva os campos conhecidos', () => {
    expect(p({ type: 'presence', presence: { ...ok, extra: 1 } })).toEqual({ type: 'presence', presence: ok });
    expect(parsePresence({ ...ok, emote: 'haha', facing: -1, anim: 'fall_loop', blink: true })).toEqual({ ...ok, emote: 'haha', facing: -1, anim: 'fall_loop', blink: true });
  });

  test('descarta presença fora do mundo, com número inválido ou campo errado', () => {
    for (const bad of [
      { ...ok, x: 1e9 }, { ...ok, y: NaN }, { ...ok, z: '3' }, { ...ok, vx: 99999 }, { ...ok, facing: 0 },
      { ...ok, anim: 'dance' }, { ...ok, emote: 'lol' }, { ...ok, blink: 'no' }, null, [],
    ]) expect(parsePresence(bad)).toBeNull();
    expect(p({ type: 'presence' })).toBeNull();
  });

  test('empurrão: um membro e um lado', () => {
    expect(p({ type: 'shove', target: 'm2', dir: -1 })).toEqual({ type: 'shove', target: 'm2', dir: -1 });
    expect(p({ type: 'shove', target: 'm2', dir: 2 })).toBeNull();
    expect(p({ type: 'shove', target: 'zé', dir: 1 })).toBeNull();
  });
});

describe('pré-lobby: o corpo de criar a sala', () => {
  test('leva só o que passa na validação', () => {
    expect(parseRoomInit({ turnMs: 45_000, maxPlayers: 4, onlyModerate: true })).toEqual({ turnMs: 45_000, maxPlayers: 4, onlyModerate: true });
    expect(parseRoomInit({ turnMs: 50_000, maxPlayers: 9, onlyModerate: 'sim', extra: 1 })).toEqual({});
    expect(parseRoomInit({ maxPlayers: 1 })).toEqual({});
    expect(parseRoomInit(null)).toEqual({});
    expect(parseRoomInit([])).toEqual({});
  });

  test('quantas pessoas cabem: de 2 a 8', () => {
    expect(parseClientMessage(JSON.stringify({ type: 'maxPlayers', n: 2 }))).toEqual({ type: 'maxPlayers', n: 2 });
    for (const n of [1, 9, 2.5, '4']) expect(parseClientMessage(JSON.stringify({ type: 'maxPlayers', n }))).toBeNull();
    // os bots engraçados: o interruptor do moderador, e um bot como alvo de empurrão
    expect(parseClientMessage(JSON.stringify({ type: 'funnyBots', on: true }))).toEqual({ type: 'funnyBots', on: true });
    expect(parseClientMessage(JSON.stringify({ type: 'funnyBots', on: 'sim' }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: 'shove', target: 'b12', dir: -1 }))).toEqual({ type: 'shove', target: 'b12', dir: -1 });
    expect(parseClientMessage(JSON.stringify({ type: 'shove', target: 'x12', dir: -1 }))).toBeNull();
  });
});

describe('tamanho de mensagem no socket', () => {
  test('a maior mensagem que o parser aceita, em UTF-8, cabe no limite do socket', () => {
    // a mensagem inteira tem até MESSAGE_MAX unidades de UTF-16; cada uma vira no máximo 3 bytes em UTF-8
    const text = 'ã'.repeat(160); // um post-it no limite de caracteres que o parser deixa passar (POSTIT_MAX·4)
    const write = JSON.stringify({ type: 'write', owner: 'm1', text, image: 'ab'.repeat(16) });
    expect(parseClientMessage(write)).not.toBeNull();
    expect(new TextEncoder().encode(write).length).toBeLessThan(SOCKET_MESSAGE_BYTES_MAX);
    expect(MESSAGE_MAX * 3).toBeLessThanOrEqual(SOCKET_MESSAGE_BYTES_MAX);
    expect(parseClientMessage('"' + 'x'.repeat(MESSAGE_MAX) + '"')).toBeNull();
  });
});
