import { describe, it, expect } from 'vitest';
import { generateMatrix } from '../src/qr';
import { renderSvg } from '../src/render';
import { computeHash } from '../src/hash';
import type { QrParams } from '../src/types';

describe('golden: deterministic output', () => {
  it('SVG snapshot for https://example.com', () => {
    const matrix = generateMatrix('https://example.com', 'M');
    const svg = renderSvg(matrix, 4, { id: 'sq250', width: 250, height: 250 });
    expect(svg).toMatchSnapshot();
  });

  it('hash snapshot for https://example.com', async () => {
    const params: QrParams = { data: 'https://example.com', preset: 'sq250', ecc: 'M', quiet: 4 };
    const hash = await computeHash(params);
    expect(hash).toMatchSnapshot();
  });
});

describe('golden: same matrix, different presets', () => {
  it('path data identical, width/height differ', () => {
    const matrix = generateMatrix('hello', 'M');
    const svg125 = renderSvg(matrix, 4, { id: 'sq125', width: 125, height: 125 });
    const svg300 = renderSvg(matrix, 4, { id: 'sq300', width: 300, height: 300 });

    const d125 = svg125.match(/d="([^"]+)"/)?.[1];
    const d300 = svg300.match(/d="([^"]+)"/)?.[1];
    expect(d125).toBe(d300);

    expect(svg125).toContain('width="125"');
    expect(svg300).toContain('width="300"');
  });
});
