import { encode } from 'uqr';
import type { EccLevel } from './types';

export interface QrMatrix {
  readonly data: boolean[][];
  readonly size: number;
}

export function generateMatrix(text: string, ecc: EccLevel): QrMatrix {
  const result = encode(text, { ecc, border: 0 });
  return { data: result.data, size: result.size };
}
