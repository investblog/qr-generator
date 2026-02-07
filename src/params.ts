import type { EccLevel, PresetId, QrParams, Env } from './types';
import { isValidPreset } from './presets';

const VALID_ECC: ReadonlySet<string> = new Set(['L', 'M', 'Q', 'H']);

export type ParseResult =
  | { ok: true; params: QrParams }
  | { ok: false; status: 400 | 413; message: string };

export function parseParams(url: URL, env: Env): ParseResult {
  const rawData = url.searchParams.get('data');
  if (rawData === null || rawData === '') {
    return { ok: false, status: 400, message: 'Missing required parameter: data' };
  }

  const data = rawData.trim();
  const maxLen = Number(env.MAX_DATA_LEN ?? '2048');
  if (data.length > maxLen) {
    return { ok: false, status: 413, message: `Data exceeds maximum length of ${maxLen}` };
  }
  if (data.length === 0) {
    return { ok: false, status: 400, message: 'Data is empty after trimming' };
  }

  const rawPreset = url.searchParams.get('p') ?? env.DEFAULT_PRESET ?? 'sq250';
  if (!isValidPreset(rawPreset)) {
    return { ok: false, status: 400, message: `Invalid preset: ${rawPreset}` };
  }

  const rawEcc = (url.searchParams.get('ecc') ?? env.DEFAULT_ECC ?? 'M').toUpperCase();
  if (!VALID_ECC.has(rawEcc)) {
    return { ok: false, status: 400, message: `Invalid ECC level: ${rawEcc}` };
  }

  const rawQuiet = url.searchParams.get('q') ?? env.DEFAULT_QUIET ?? '4';
  const quiet = Number(rawQuiet);
  if (!Number.isInteger(quiet) || quiet < 0 || quiet > 16) {
    return { ok: false, status: 400, message: `Invalid quiet zone: ${rawQuiet} (must be integer 0..16)` };
  }

  return {
    ok: true,
    params: {
      data,
      preset: rawPreset as PresetId,
      ecc: rawEcc as EccLevel,
      quiet,
    },
  };
}
