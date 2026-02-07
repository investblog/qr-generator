import { describe, it, expect } from 'vitest';
import { buildHashPayload, computeHash } from '../src/hash';
import type { QrParams } from '../src/types';

const base: QrParams = { data: 'https://example.com', preset: 'sq250', ecc: 'M', quiet: 4 };

describe('buildHashPayload', () => {
  it('builds correct canonical string', () => {
    expect(buildHashPayload(base)).toBe(
      'https://example.com|p=sq250|ecc=M|q=4|fg=000|bg=fff|r=v1',
    );
  });
});

describe('computeHash', () => {
  it('returns 64-char lowercase hex', async () => {
    const hash = await computeHash(base);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic', async () => {
    const h1 = await computeHash(base);
    const h2 = await computeHash(base);
    expect(h1).toBe(h2);
  });

  it('differs on different data', async () => {
    const a = await computeHash({ ...base, data: 'a' });
    const b = await computeHash({ ...base, data: 'b' });
    expect(a).not.toBe(b);
  });

  it('differs on different preset', async () => {
    const a = await computeHash(base);
    const b = await computeHash({ ...base, preset: 'sq125' });
    expect(a).not.toBe(b);
  });

  it('differs on different ecc', async () => {
    const a = await computeHash(base);
    const b = await computeHash({ ...base, ecc: 'H' });
    expect(a).not.toBe(b);
  });

  it('differs on different quiet', async () => {
    const a = await computeHash(base);
    const b = await computeHash({ ...base, quiet: 0 });
    expect(a).not.toBe(b);
  });
});
