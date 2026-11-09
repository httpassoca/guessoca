/**
 * Regras da sala e do jogo, puras: nada de DOM, rede ou relógio. O servidor (`apps/server/src/room.ts`) as usa como
 * autoridade; o vocabulário é o do `CONTEXT.md`.
 */

/** Apelido: tamanho máximo depois de aparado. */
export const NICKNAME_MAX = 20;
/** Uma sala tem no máximo esta turma, conectada ou não (o lugar de quem cai fica guardado até a sala morrer). */
export const MAX_MEMBERS = 8;
/** Quem entra sem apelido aparece assim. */
export const FALLBACK_NICKNAME = 'Alguém';

/** Junta espaços, apara e corta em `NICKNAME_MAX`; vazio vira `FALLBACK_NICKNAME`. */
export function cleanNickname(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, NICKNAME_MAX) || FALLBACK_NICKNAME;
}

/**
 * O apelido limpo, com um sufixo (" 2", " 3"…) se outra pessoa da turma já usa o mesmo, sem diferenciar maiúsculas.
 * `taken`: os apelidos dos outros (não inclua o da própria pessoa ao renomear). Nunca passa de `NICKNAME_MAX`.
 */
export function uniqueNickname(raw: string, taken: readonly string[]): string {
  const base = cleanNickname(raw);
  const used = new Set(taken.map((n) => n.toLocaleLowerCase()));
  if (!used.has(base.toLocaleLowerCase())) return base;
  for (let n = 2; ; n++) {
    const suffix = ` ${n}`;
    const candidate = base.slice(0, NICKNAME_MAX - suffix.length).trimEnd() + suffix;
    if (!used.has(candidate.toLocaleLowerCase())) return candidate;
  }
}

export * from './game';
