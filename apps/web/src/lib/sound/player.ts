/**
 * O tocador: um AudioContext só, para a aba inteira, com duas mesas de som (`settings.ts`): a do mapa (pular, empurrar,
 * a trilha) e a do jogo (votação, acerto, fim de vez), cada uma com o seu volume no menu. O contexto é criado (ou retomado) no primeiro `pointerdown` ou `keydown`, por
 * causa das regras de autoplay do navegador. Antes disso, e enquanto os efeitos carregam, os sons são descartados,
 * nunca enfileirados. Cada efeito vira um AudioBuffer uma vez, na primeira vez que toca. Cola de navegador, sem teste.
 *
 * A trilha do jogo (`setMusic`) é diferente: um `<audio>` em loop (a faixa tem uns 14 minutos; decodificar inteira
 * gastaria centenas de MB) ligado à mesa do mapa, com os fades de `music.ts` aplicados num ganho próprio. Se o
 * jogo começa antes da primeira interação, ela entra quando o áudio ligar.
 */
import { fadeStep, loopGain, MUSIC_URL, MUSIC_VOLUME } from './music';
import type { SfxName } from './sfx';
import { gainOf, MIXERS, mixerOf, rememberedSound, rememberMuted, rememberVolume, type Mixer, type SoundSettings } from './settings';

let ctx: AudioContext | null = null;
/** um ganho por mesa de som, os dois ligados à saída */
let buses: Record<Mixer, GainNode> | null = null;
let sfx: typeof import('./sfx') | null = null;
const buffers = new Map<SfxName, AudioBuffer>();
let settings: SoundSettings | null = null;

const current = () => (settings ??= rememberedSound());

/** Ouve a primeira interação para ligar o áudio. Devolve como parar de ouvir. */
export function installAudioUnlock(): () => void {
  const opts = { capture: true } as const;
  const unlock = () => {
    try {
      if (!ctx) {
        ctx = new AudioContext();
        const bus = (m: Mixer) => { const g = ctx!.createGain(); g.gain.value = gainOf(current(), m); g.connect(ctx!.destination); return g; };
        buses = { map: bus('map'), game: bus('game') };
        syncMusic();
        import('./sfx').then((m) => { sfx = m; }).catch((err) => console.error('som: sem efeitos', err));
      }
      if (ctx.state === 'suspended') void ctx.resume();
      if (musicOn && music?.el.paused) startMusic();
    } catch (err) {
      console.error('som: sem áudio', err);
      off();
    }
    if (ctx?.state === 'running') off();
  };
  const off = () => { window.removeEventListener('pointerdown', unlock, opts); window.removeEventListener('keydown', unlock, opts); };
  window.addEventListener('pointerdown', unlock, opts);
  window.addEventListener('keydown', unlock, opts);
  return off;
}

/** Toca um efeito, se o áudio já está ligado e o som não está mudo; senão, nada. Nunca lança (roda dentro do laço do telhado). */
export function playSfx(name: SfxName) {
  if (!ctx || !buses || !sfx || ctx.state !== 'running' || gainOf(current(), mixerOf(name)) === 0) return;
  try {
    let buffer = buffers.get(name);
    if (!buffer) {
      const { samples, sampleRate } = sfx.renderSfx(name);
      buffer = ctx.createBuffer(1, samples.length, sampleRate);
      buffer.getChannelData(0).set(samples);
      buffers.set(name, buffer);
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(buses[mixerOf(name)]);
    src.start();
  } catch (err) { console.error('som: não tocou', name, err); }
}

let musicOn = false;
let music: { el: HTMLAudioElement; gain: GainNode; level: number; last: number; timer: ReturnType<typeof setInterval> } | null = null;

/** Liga ou desliga a trilha do jogo: entra e sai em 1 s; ligada, toca em loop desde o começo da faixa. */
export function setMusic(on: boolean) {
  musicOn = on;
  syncMusic();
}

function syncMusic() {
  if (!ctx || !buses || !musicOn) return;
  if (music) { if (music.el.paused) startMusic(); return; }
  try {
    const el = new Audio(MUSIC_URL);
    el.loop = true;
    el.preload = 'auto';
    const gain = ctx.createGain();
    gain.gain.value = 0;
    ctx.createMediaElementSource(el).connect(gain).connect(buses[mixerOf('music')]);
    music = { el, gain, level: 0, last: performance.now(), timer: setInterval(tickMusic, 50) };
    startMusic();
  } catch (err) { console.error('som: sem trilha', err); }
}

function startMusic() {
  if (!music) return;
  music.el.currentTime = 0;
  music.last = performance.now();
  void music.el.play().catch(() => { /* o navegador ainda não deixa: a próxima interação tenta de novo */ });
}

/** A cada 50 ms: o fade de entrar e sair vezes o fade da emenda do loop; parada e em silêncio, a faixa pausa. */
function tickMusic() {
  if (!music || !ctx) return;
  const now = performance.now();
  music.level = fadeStep(music.level, musicOn && !music.el.paused, (now - music.last) / 1000);
  music.last = now;
  const g = music.level * loopGain(music.el.currentTime, music.el.duration) * MUSIC_VOLUME;
  music.gain.gain.setTargetAtTime(g, ctx.currentTime, 0.02);
  if (!musicOn && music.level === 0 && !music.el.paused) music.el.pause();
}

/** Os volumes das duas mesas e o mudo de agora (o que o navegador lembra). */
export const soundSettings = (): SoundSettings => ({ ...current() });

/** Muda o volume de uma mesa ou o mudo: vale na hora e fica lembrado pelo navegador. */
export function setSoundSettings(patch: Partial<SoundSettings>) {
  const next = { ...current(), ...patch };
  for (const m of MIXERS) if (patch[m] !== undefined) rememberVolume(m, next[m]);
  if (patch.muted !== undefined) rememberMuted(next.muted);
  settings = next; // não relê o storage: no modo privado ele não guarda, e o som ainda tem que mudar
  if (ctx && buses) for (const m of MIXERS) buses[m].gain.setValueAtTime(gainOf(settings, m), ctx.currentTime);
}
