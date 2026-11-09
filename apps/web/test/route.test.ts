import { describe, expect, test } from 'bun:test';
import { parseRoute, roomPath } from '../src/lib/route';

describe('rotas', () => {
  test('a raiz e qualquer caminho desconhecido são o início', () => {
    expect(parseRoute('/')).toEqual({ name: 'home' });
    expect(parseRoute('')).toEqual({ name: 'home' });
    expect(parseRoute('/qualquer/coisa')).toEqual({ name: 'home' });
    expect(parseRoute('/sala')).toEqual({ name: 'home' });
  });

  test('/sala/CODE é a sala, com o código em maiúsculas', () => {
    expect(parseRoute('/sala/ABCD')).toEqual({ name: 'sala', code: 'ABCD' });
    expect(parseRoute('/sala/abcd')).toEqual({ name: 'sala', code: 'ABCD' });
    expect(parseRoute('/sala/WXYZ/')).toEqual({ name: 'sala', code: 'WXYZ' });
  });

  test('código fora do formato volta ao início', () => {
    for (const p of ['/sala/ABC', '/sala/ABCDE', '/sala/AB1D', '/sala/ABIO', '/sala/AB-D', '/sala/ABCD/x']) expect(parseRoute(p), p).toEqual({ name: 'home' });
  });

  test('o caminho da sala sai em maiúsculas', () => {
    expect(roomPath('abcd')).toBe('/sala/ABCD');
  });
});
