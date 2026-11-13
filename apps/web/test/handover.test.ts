import { describe, expect, test } from 'bun:test';
import { moderatorTracker } from '../src/lib/room/handover';

describe('aviso de moderação recebida', () => {
  test('avisa quando o papel passa para mim, não quando já era meu ao abrir', () => {
    const seen = moderatorTracker();
    expect(seen('a', 'a')).toBe(false); // criei a sala, ou voltei já moderador
    expect(seen('a', 'a')).toBe(false);
    const other = moderatorTracker();
    expect(other('a', 'b')).toBe(false); // abri a sala: a é o moderador
    expect(other('b', 'b')).toBe(true); // a passou (ou caiu e eu assumi)
    expect(other('b', 'b')).toBe(false); // uma vez só
    expect(other('a', 'b')).toBe(false); // passei de volta
    expect(other('b', 'b')).toBe(true); // e recebi de novo
  });

  test('fora da turma (ainda sem `you`) não avisa', () => {
    const seen = moderatorTracker();
    expect(seen('a', null)).toBe(false);
    expect(seen('b', null)).toBe(false);
  });
});
