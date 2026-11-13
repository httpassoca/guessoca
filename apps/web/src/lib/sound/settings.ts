/**
 * O som que o navegador lembra (localStorage), como o apelido em `identity.ts`: dois volumes (0 a 100), um por mesa de
 * som, e o mudo, que vale para as duas. As mesas: `map`, os sons do telhado (pular, empurrar, a trilha da chuva, o
 * trovão e a sirene), e `game`, os sons do jogo (votação, acertou, fim de vez, sua vez). `mixerOf` diz de que mesa é cada som.
 */
import { local, readKey, writeKey, type MaybeStore } from '../identity';
import type { SfxName } from './sfx';

/** o volume único de antes das duas mesas: quem já tinha um guardado começa com ele nas duas */
const LEGACY_VOLUME_KEY = 'guess.volume';
const VOLUME_KEY = 'guess.volume.';
const MUTED_KEY = 'guess.muted';
export const DEFAULT_VOLUME = 60;

/** Uma mesa de som: os sons do mapa (o telhado) ou os do jogo. */
export type Mixer = 'map' | 'game';
export const MIXERS: readonly Mixer[] = ['map', 'game'];

/** O volume de cada mesa (0 a 100) e o mudo, que cala as duas. */
export interface SoundSettings { map: number; game: number; muted: boolean }

/**
 * De que mesa é cada som: pular, empurrar, a trilha e o telhado em volta (o trovão, a sirene lá embaixo, o raio do chefão) são do mapa;
 * votação, acerto, fim de vez e sua vez são do jogo.
 */
export function mixerOf(sound: SfxName | 'music'): Mixer {
  return sound === 'vote' || sound === 'gotIt' || sound === 'turnEnd' || sound === 'yourTurn' ? 'game' : 'map';
}

const clampVolume = (v: number) => Math.min(100, Math.max(0, Math.round(v)));
const volumeOf = (s: string): number | null => {
  const n = s === '' ? NaN : Number(s);
  return Number.isFinite(n) ? clampVolume(n) : null;
};

/** O que este navegador lembra; volume estragado volta ao padrão, fora de 0..100 vai ao limite. */
export function soundIn(store: MaybeStore): SoundSettings {
  const legacy = volumeOf(readKey(store, LEGACY_VOLUME_KEY)) ?? DEFAULT_VOLUME;
  const of = (m: Mixer) => volumeOf(readKey(store, VOLUME_KEY + m)) ?? legacy;
  return { map: of('map'), game: of('game'), muted: readKey(store, MUTED_KEY) === '1' };
}
export const rememberVolumeIn = (store: MaybeStore, mixer: Mixer, volume: number) => writeKey(store, VOLUME_KEY + mixer, String(clampVolume(volume)));
export const rememberMutedIn = (store: MaybeStore, muted: boolean) => writeKey(store, MUTED_KEY, muted ? '1' : '0');

/** O ganho de saída de uma mesa: 0 no mudo; o volume ao quadrado, que o ouvido acha mais linear que o volume cru. */
export function gainOf(s: SoundSettings, mixer: Mixer): number {
  if (s.muted) return 0;
  const v = clampVolume(s[mixer]) / 100;
  return v * v;
}

export const rememberedSound = () => soundIn(local());
export const rememberVolume = (mixer: Mixer, volume: number) => rememberVolumeIn(local(), mixer, volume);
export const rememberMuted = (muted: boolean) => rememberMutedIn(local(), muted);
