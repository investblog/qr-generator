import type { QrParams } from './types';

export function buildHashPayload(params: QrParams): string {
  return `${params.data}|p=${params.preset}|ecc=${params.ecc}|q=${params.quiet}|fg=000|bg=fff|r=v1`;
}

export async function computeHash(params: QrParams): Promise<string> {
  const payload = buildHashPayload(params);
  const encoded = new TextEncoder().encode(payload);
  const buffer = await crypto.subtle.digest('SHA-256', encoded);
  const bytes = new Uint8Array(buffer);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}
