export type EccLevel = 'L' | 'M' | 'Q' | 'H';

export type PresetId = 'sq125' | 'sq200' | 'sq250' | 'sq300';

export interface Preset {
  readonly id: PresetId;
  readonly width: number;
  readonly height: number;
}

export interface QrParams {
  readonly data: string;
  readonly preset: PresetId;
  readonly ecc: EccLevel;
  readonly quiet: number;
}

export interface Env {
  readonly DEFAULT_PRESET?: string;
  readonly DEFAULT_ECC?: string;
  readonly DEFAULT_QUIET?: string;
  readonly MAX_DATA_LEN?: string;
  readonly LOG_MISS?: string;
}
