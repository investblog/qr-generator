import type { Preset, PresetId } from './types';

export const PRESETS: ReadonlyMap<string, Preset> = new Map([
  ['sq125', { id: 'sq125' as PresetId, width: 125, height: 125 }],
  ['sq200', { id: 'sq200' as PresetId, width: 200, height: 200 }],
  ['sq250', { id: 'sq250' as PresetId, width: 250, height: 250 }],
  ['sq300', { id: 'sq300' as PresetId, width: 300, height: 300 }],
]);

export function isValidPreset(value: string): value is PresetId {
  return PRESETS.has(value);
}

export function getPreset(id: PresetId): Preset {
  return PRESETS.get(id)!;
}
