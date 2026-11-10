/**
 * A trilha do jogo, a parte pura: quando toca e com que ganho. A faixa (`/music/city_rain.ogg`, servida do `public`)
 * toca em loop enquanto o jogo corre; o arquivo não tem fade, então ele é feito aqui: 1 s subindo no começo de cada
 * volta, 1 s descendo no fim, e 1 s para entrar e sair quando o jogo começa e acaba. Quem toca é `player.ts`.
 *
 * O arquivo vai em `apps/web/public/music/city_rain.ogg`. Sem ele (ou se o navegador não consegue abrir), a trilha
 * simplesmente não toca; o resto do som segue.
 */
import type { RoomSnapshot } from '@guess/protocol';

/** A faixa, servida como arquivo. */
export const MUSIC_URL = '/music/city_rain.ogg';
/** A duração de cada fade, em segundos. */
export const MUSIC_FADE_S = 1;
/** O volume da trilha em relação aos efeitos (o volume e o mudo do menu valem por cima). */
export const MUSIC_VOLUME = 0.45;

/** A trilha toca com o jogo correndo; no lobby e no fim, não. */
export const musicWanted = (phase: RoomSnapshot['phase']): boolean => phase === 'playing';

/**
 * O ganho (0–1) no segundo `t` de uma volta de `duration` segundos: sobe em `fade` s no começo e desce em `fade` s no
 * fim, para a emenda do loop não estalar. Sem duração conhecida ainda (carregando), só a subida.
 */
export function loopGain(t: number, duration: number, fade = MUSIC_FADE_S): number {
  if (fade <= 0) return 1;
  const up = Math.max(0, Math.min(1, t / fade));
  if (!Number.isFinite(duration) || duration <= 0) return up;
  const down = Math.max(0, Math.min(1, (duration - t) / fade));
  return Math.min(up, down);
}

/** Um passo do fade de entrar e sair: `level` (0–1) anda para `on` em `fade` s, sem passar. */
export function fadeStep(level: number, on: boolean, dt: number, fade = MUSIC_FADE_S): number {
  const step = fade > 0 ? Math.max(0, dt) / fade : 1;
  return on ? Math.min(1, level + step) : Math.max(0, level - step);
}
