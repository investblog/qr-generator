import { describe, it, expect } from 'vitest';
import { parseParams } from '../src/params';
import type { Env } from '../src/types';

const env: Env = {};

function u(query: string): URL {
  return new URL(`http://localhost/qr.svg?${query}`);
}

describe('parseParams', () => {
  it('rejects missing data', () => {
    const r = parseParams(u(''), env);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
  });

  it('trims data', () => {
    const r = parseParams(u('data=%20hello%20'), env);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.params.data).toBe('hello');
  });

  it('rejects data that is only whitespace', () => {
    const r = parseParams(u('data=%20%20'), env);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
  });

  it('rejects data over max length', () => {
    const r = parseParams(u(`data=${'a'.repeat(2049)}`), env);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(413);
  });

  it('accepts data at max length', () => {
    const r = parseParams(u(`data=${'a'.repeat(2048)}`), env);
    expect(r.ok).toBe(true);
  });

  it('defaults to sq250, M, 4', () => {
    const r = parseParams(u('data=test'), env);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.params.preset).toBe('sq250');
      expect(r.params.ecc).toBe('M');
      expect(r.params.quiet).toBe(4);
    }
  });

  it('accepts all valid presets', () => {
    for (const p of ['sq125', 'sq200', 'sq250', 'sq300']) {
      const r = parseParams(u(`data=test&p=${p}`), env);
      expect(r.ok).toBe(true);
    }
  });

  it('rejects invalid preset', () => {
    const r = parseParams(u('data=test&p=sq500'), env);
    expect(r.ok).toBe(false);
  });

  it('normalizes ecc to uppercase', () => {
    const r = parseParams(u('data=test&ecc=l'), env);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.params.ecc).toBe('L');
  });

  it('accepts all ecc levels', () => {
    for (const ecc of ['L', 'M', 'Q', 'H']) {
      const r = parseParams(u(`data=test&ecc=${ecc}`), env);
      expect(r.ok).toBe(true);
    }
  });

  it('rejects invalid ecc', () => {
    const r = parseParams(u('data=test&ecc=X'), env);
    expect(r.ok).toBe(false);
  });

  it('accepts quiet 0 and 16', () => {
    expect(parseParams(u('data=test&q=0'), env).ok).toBe(true);
    expect(parseParams(u('data=test&q=16'), env).ok).toBe(true);
  });

  it('rejects quiet 17', () => {
    expect(parseParams(u('data=test&q=17'), env).ok).toBe(false);
  });

  it('rejects float quiet', () => {
    expect(parseParams(u('data=test&q=4.5'), env).ok).toBe(false);
  });

  it('rejects non-numeric quiet', () => {
    expect(parseParams(u('data=test&q=abc'), env).ok).toBe(false);
  });

  it('uses env overrides', () => {
    const r = parseParams(u('data=test'), { DEFAULT_PRESET: 'sq125', DEFAULT_ECC: 'H', DEFAULT_QUIET: '2' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.params.preset).toBe('sq125');
      expect(r.params.ecc).toBe('H');
      expect(r.params.quiet).toBe(2);
    }
  });

  it('uses env MAX_DATA_LEN', () => {
    const r = parseParams(u('data=hello'), { MAX_DATA_LEN: '3' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(413);
  });
});
