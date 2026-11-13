/**
 * Os seis efeitos sonoros, cada um como parâmetros do sfxr escritos aqui (nenhum arquivo de áudio no repositório).
 * `renderSfx` gera as amostras com o jsfxr, sem DOM: o tocador (`player.ts`) põe isso num AudioBuffer uma vez só.
 */
import { jsfxr, type SfxrParams } from 'jsfxr';

export type SfxName = 'jump' | 'shove' | 'vote' | 'gotIt' | 'turnEnd' | 'yourTurn';
export const SFX_NAMES: readonly SfxName[] = ['jump', 'shove', 'vote', 'gotIt', 'turnEnd', 'yourTurn'];

const SQUARE = 0, SAW = 1, SINE = 2, NOISE = 3;

/**
 * Durações no sfxr: `p_env_*` ao quadrado × 100 000 amostras (0,2 ≈ 0,09 s; 0,4 ≈ 0,36 s). `p_freq_ramp` positivo sobe.
 * O que não está aqui fica no padrão do sfxr.
 */
export const SFX: Record<SfxName, Partial<SfxrParams>> = {
  /** um blip curto que sobe */
  jump: { wave_type: SQUARE, p_base_freq: 0.34, p_freq_ramp: 0.24, p_duty: 0.35, p_env_sustain: 0.12, p_env_decay: 0.2, p_hpf_freq: 0.1, sound_vol: 0.38 },
  /** um baque de ruído grave, que desce */
  shove: { wave_type: NOISE, p_base_freq: 0.14, p_freq_ramp: -0.22, p_env_sustain: 0.08, p_env_punch: 0.55, p_env_decay: 0.26, p_lpf_freq: 0.55, sound_vol: 0.17 },
  /** um sininho de duas notas: a segunda uma quarta acima */
  vote: { wave_type: SINE, p_base_freq: 0.42, p_arp_mod: 0.53, p_arp_speed: 0.49, p_env_sustain: 0.26, p_env_punch: 0.3, p_env_decay: 0.4, sound_vol: 0.2 },
  /** um power-up feliz: subidas repetidas */
  gotIt: { wave_type: SQUARE, p_base_freq: 0.3, p_freq_ramp: 0.26, p_repeat_speed: 0.58, p_duty: 0.4, p_env_sustain: 0.34, p_env_punch: 0.2, p_env_decay: 0.42, p_hpf_freq: 0.05, sound_vol: 0.3 },
  /** uma cigarra grave e curta, que cai um pouco */
  /** a sua vez: dois toques agudos e rápidos que sobem (um arpejo), para chamar a atenção sem assustar */
  yourTurn: { wave_type: SQUARE, p_base_freq: 0.46, p_arp_mod: 0.42, p_arp_speed: 0.62, p_duty: 0.5, p_env_attack: 0, p_env_sustain: 0.22, p_env_punch: 0.4, p_env_decay: 0.3, p_hpf_freq: 0.12, sound_vol: 0.26 },
  turnEnd: { wave_type: SAW, p_base_freq: 0.17, p_freq_ramp: -0.08, p_vib_strength: 0.25, p_vib_speed: 0.55, p_env_sustain: 0.24, p_env_decay: 0.22, p_lpf_freq: 0.5, sound_vol: 0.3 },
};

/**
 * As amostras de um efeito, em -1..1, e a taxa delas. Puro (o ruído usa `Math.random`). O jsfxr não corta o que passa
 * de 1 (o soco do envelope e o filtro podem passar); aqui se corta, por garantia.
 */
export function renderSfx(name: SfxName): { samples: Float32Array; sampleRate: number } {
  const fx = new jsfxr.SoundEffect(new jsfxr.Params().fromJSON(SFX[name]));
  const samples = Float32Array.from(fx.getRawBuffer().normalized, (s) => Math.max(-1, Math.min(1, s)));
  return { samples, sampleRate: fx.sampleRate };
}
