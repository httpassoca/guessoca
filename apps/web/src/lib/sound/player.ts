/**
 * O tocador: um AudioContext só, para a aba inteira, criado (ou retomado) no primeiro `pointerdown` ou `keydown`, por
 * causa das regras de autoplay do navegador. Antes disso, e enquanto os efeitos carregam, os sons são descartados,
 * nunca enfileirados. Cada efeito vira um AudioBuffer uma vez, na primeira vez que toca. Cola de navegador, sem teste.
 */
import type { SfxName } from './sfx';
import { gainOf, rememberedSound, rememberMuted, rememberVolume, type SoundSettings } from './settings';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
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
        master = ctx.createGain();
        master.gain.value = gainOf(current());
        master.connect(ctx.destination);
        import('./sfx').then((m) => { sfx = m; }).catch((err) => console.error('som: sem efeitos', err));
      }
      if (ctx.state === 'suspended') void ctx.resume();
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
  if (!ctx || !master || !sfx || ctx.state !== 'running' || gainOf(current()) === 0) return;
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
    src.connect(master);
    src.start();
  } catch (err) { console.error('som: não tocou', name, err); }
}

/** O volume e o mudo de agora (o que o navegador lembra). */
export const soundSettings = (): SoundSettings => ({ ...current() });

/** Muda o volume ou o mudo: vale na hora e fica lembrado pelo navegador. */
export function setSoundSettings(patch: Partial<SoundSettings>) {
  const next = { ...current(), ...patch };
  if (patch.volume !== undefined) rememberVolume(next.volume);
  if (patch.muted !== undefined) rememberMuted(next.muted);
  settings = next; // não relê o storage: no modo privado ele não guarda, e o som ainda tem que mudar
  if (ctx && master) master.gain.setValueAtTime(gainOf(settings), ctx.currentTime);
}
