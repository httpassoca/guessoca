/**
 * O volume (0 a 100) e o mudo, lembrados pelo navegador inteiro (localStorage), como o apelido em `identity.ts`.
 */
import { local, readKey, writeKey, type MaybeStore } from '../identity';

const VOLUME_KEY = 'guess.volume';
const MUTED_KEY = 'guess.muted';
export const DEFAULT_VOLUME = 60;

export interface SoundSettings { volume: number; muted: boolean }

const clampVolume = (v: number) => Math.min(100, Math.max(0, Math.round(v)));

/** O que este navegador lembra; volume estragado volta ao padrão, fora de 0..100 vai ao limite. */
export function soundIn(store: MaybeStore): SoundSettings {
  const s = readKey(store, VOLUME_KEY);
  const n = s === '' ? NaN : Number(s);
  return { volume: Number.isFinite(n) ? clampVolume(n) : DEFAULT_VOLUME, muted: readKey(store, MUTED_KEY) === '1' };
}
export const rememberVolumeIn = (store: MaybeStore, volume: number) => writeKey(store, VOLUME_KEY, String(clampVolume(volume)));
export const rememberMutedIn = (store: MaybeStore, muted: boolean) => writeKey(store, MUTED_KEY, muted ? '1' : '0');

/** O ganho de saída: 0 no mudo; o volume ao quadrado, que o ouvido acha mais linear que o volume cru. */
export function gainOf(s: SoundSettings): number {
  if (s.muted) return 0;
  const v = clampVolume(s.volume) / 100;
  return v * v;
}

export const rememberedSound = () => soundIn(local());
export const rememberVolume = (volume: number) => rememberVolumeIn(local(), volume);
export const rememberMuted = (muted: boolean) => rememberMutedIn(local(), muted);
