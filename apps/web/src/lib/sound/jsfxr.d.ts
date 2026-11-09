/** O pedaço do jsfxr (sem tipos próprios) que usamos: os parâmetros do sfxr e o gerador de amostras. */
declare module 'jsfxr' {
  /** Os parâmetros do sfxr: em 0..1, ou -1..1 os com sinal (slides, arpejo, flanger, rampas de filtro). */
  export interface SfxrParams {
    /** 0 quadrada, 1 dente de serra, 2 senoide, 3 ruído */
    wave_type: 0 | 1 | 2 | 3;
    p_env_attack: number; p_env_sustain: number; p_env_punch: number; p_env_decay: number;
    p_base_freq: number; p_freq_limit: number; p_freq_ramp: number; p_freq_dramp: number;
    p_vib_strength: number; p_vib_speed: number;
    p_arp_mod: number; p_arp_speed: number;
    p_duty: number; p_duty_ramp: number;
    p_repeat_speed: number;
    p_pha_offset: number; p_pha_ramp: number;
    p_lpf_freq: number; p_lpf_ramp: number; p_lpf_resonance: number;
    p_hpf_freq: number; p_hpf_ramp: number;
    sound_vol: number; sample_rate: number; sample_size: number;
  }
  interface Params extends SfxrParams { fromJSON(p: Partial<SfxrParams>): Params }
  interface SoundEffect {
    sampleRate: number;
    /** `normalized`: as amostras em ponto flutuante, -1..1 */
    getRawBuffer(): { normalized: number[]; buffer: number[]; clipped: number };
  }
  export const jsfxr: {
    Params: new () => Params;
    SoundEffect: new (p: SfxrParams) => SoundEffect;
  };
}
