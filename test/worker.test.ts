import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/worker';
import { computeHash } from '../src/hash';
import { generateMatrix } from '../src/qr';
import { renderSvg } from '../src/render';
import { getPreset } from '../src/presets';
import type { Env, QrParams } from '../src/types';

// The deployed config (wrangler.toml [vars]).
const env: Env = { DEFAULT_PRESET: 'sq250', DEFAULT_ECC: 'M', DEFAULT_QUIET: '2', MAX_DATA_LEN: '2048' };
const ORIGIN = 'https://qr.example';

// caches.default stand-in: keyed by URL, keeps the stored Response (status + headers) and counts calls.
let stored: Map<string, Response>;
let puts: string[];
let matches: number;
const fakeCache = {
  async match(req: Request) {
    matches++;
    return stored.get(req.url)?.clone();
  },
  async put(req: Request, res: Response) {
    puts.push(req.url);
    stored.set(req.url, res.clone());
  },
};
const store = {
  get: (url: string) => stored.get(url)?.clone().text(),
  set: (url: string, svg: string) =>
    stored.set(url, new Response(svg, { headers: { 'Content-Type': 'image/svg+xml; charset=utf-8' } })),
};

let pending: Promise<unknown>[];
const ctx = {
  waitUntil: (p: Promise<unknown>) => void pending.push(p),
  passThroughOnException: () => {},
} as unknown as ExecutionContext;

async function get(path: string): Promise<Response> {
  const res = await worker.fetch(new Request(ORIGIN + path), env, ctx);
  await Promise.all(pending);
  return res;
}

function svgFor(p: QrParams): string {
  return renderSvg(generateMatrix(p.data, p.ecc), p.quiet, getPreset(p.preset));
}

async function canonical(p: QrParams): Promise<{ bare: string; full: string }> {
  const bare = `/qr/${p.preset}/${await computeHash(p)}.svg`;
  return { bare, full: `${bare}?data=${encodeURIComponent(p.data)}&ecc=${p.ecc}&q=${p.quiet}` };
}

const legit: QrParams = { data: 'https://example.com/a', preset: 'sq250', ecc: 'M', quiet: 2 };
const evil = 'https://phish.example/login';

beforeEach(() => {
  stored = new Map();
  puts = [];
  matches = 0;
  pending = [];
  vi.stubGlobal('caches', { default: fakeCache });
});
afterEach(() => vi.unstubAllGlobals());

describe('canonical URL with data: verified before the cache', () => {
  it('a valid cold request renders and caches under the path-only key', async () => {
    const { bare, full } = await canonical(legit);
    const res = await get(full);
    expect(res.status).toBe(200);
    expect(res.headers.get('X-QR-Cache')).toBe('MISS');
    expect(await res.text()).toBe(svgFor(legit));
    expect(await store.get(ORIGIN + bare)).toBe(svgFor(legit));
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
    expect(res.headers.get('ETag')).toBe(`"${bare.slice(-68, -4)}"`);
  });

  it.each([
    ['data', (q: string) => q.replace(encodeURIComponent(legit.data), encodeURIComponent(evil))],
    ['ecc', (q: string) => q.replace('ecc=M', 'ecc=H')],
    ['q', (q: string) => q.replace('q=2', 'q=4')],
  ])('tampered %s under a valid hash is refused without touching the cache', async (_name, tamper) => {
    const { bare, full } = await canonical(legit);
    store.set(ORIGIN + bare, svgFor(legit)); // a real, cached code is the target
    const res = await get(tamper(full));
    expect(res.status).toBe(400);
    expect(matches).toBe(0);
    expect(puts).toEqual([]);
    expect(await store.get(ORIGIN + bare)).toBe(svgFor(legit));
  });

  it('the hash of one preset under another preset path is refused without touching the cache', async () => {
    const { full } = await canonical(legit);
    const res = await get(full.replace('/qr/sq250/', '/qr/sq300/'));
    expect(res.status).toBe(400);
    expect(matches).toBe(0);
    expect(puts).toEqual([]);
  });

  it.each([
    ['lowercase ecc', (q: string) => q.replace('ecc=M', 'ecc=m')],
    ['q as 02', (q: string) => q.replace('q=2', 'q=02')],
    ['a p param that disagrees with the path', (q: string) => `${q}&p=sq125`],
    ['surrounding spaces in data', (q: string) => q.replace('data=', 'data=%20')],
  ])('an equivalent spelling (%s) renders the same verified image', async (_name, respell) => {
    const { full } = await canonical(legit);
    const res = await get(respell(full));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(svgFor(legit));
  });

  it.each([
    ['ecc', (q: string) => q.replace('&ecc=M', '')],
    ['q', (q: string) => q.replace('&q=2', '')],
  ])('missing %s is refused (no defaults on the canonical path)', async (_name, drop) => {
    const { full } = await canonical(legit);
    const res = await get(drop(full));
    expect(res.status).toBe(400);
    expect(puts).toEqual([]);
  });

  it('a pre-poisoned cache entry is not served to a verified request, and is replaced', async () => {
    const { bare, full } = await canonical(legit);
    const poisoned = svgFor({ ...legit, data: evil });
    store.set(ORIGIN + bare, poisoned);

    const res = await get(full);
    expect(res.status).toBe(200);
    expect(res.headers.get('X-QR-Cache')).toBe('REPLACED');
    expect(await res.text()).toBe(svgFor(legit));
    expect(await store.get(ORIGIN + bare)).toBe(svgFor(legit));
    // and the bare URL now serves the verified image, with the canonical headers
    const after = await get(bare);
    expect(await after.text()).toBe(svgFor(legit));
    expect(after.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
    expect(after.headers.get('X-QR-Cache')).toBe('HIT');
  });

  it('an intact cache entry is a HIT and is not rewritten', async () => {
    const { bare, full } = await canonical(legit);
    store.set(ORIGIN + bare, svgFor(legit));
    const res = await get(full);
    expect(res.headers.get('X-QR-Cache')).toBe('HIT');
    expect(puts).toEqual([]);
  });

  it('oversized data is 413, as on /qr.svg', async () => {
    const big: QrParams = { ...legit, data: 'a'.repeat(2049) };
    const { full } = await canonical(big);
    expect((await get(full)).status).toBe(413);
  });
});

describe('the /qr.svg redirect still round-trips', () => {
  it('following the 302 renders the same image the hash names', async () => {
    const res = await get(`/qr.svg?data=${encodeURIComponent(legit.data)}`);
    expect(res.status).toBe(302);
    const location = res.headers.get('Location') ?? '';
    expect(location).toBe((await canonical(legit)).full);
    const img = await get(location);
    expect(img.status).toBe(200);
    expect(await img.text()).toBe(svgFor(legit));
  });
});

describe('bare canonical URL (legacy)', () => {
  it('serves a cached entry', async () => {
    const { bare } = await canonical(legit);
    store.set(ORIGIN + bare, svgFor(legit));
    const res = await get(bare);
    expect(res.status).toBe(200);
    expect(res.headers.get('X-QR-Cache')).toBe('HIT');
  });

  it('a miss is 400 and writes nothing', async () => {
    const { bare } = await canonical(legit);
    expect((await get(bare)).status).toBe(400);
    expect(puts).toEqual([]);
  });
});
