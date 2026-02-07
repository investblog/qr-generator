import type { Env } from './types';
import { parseParams } from './params';
import { computeHash } from './hash';
import { generateMatrix } from './qr';
import { renderSvg } from './render';
import { getPreset, isValidPreset } from './presets';
import { badRequest, payloadTooLarge, notFound, internalError } from './errors';

const CANONICAL_RE = /^\/qr\/([^/]+)\/([a-f0-9]{64})\.svg$/;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method !== 'GET') return notFound();

    const url = new URL(request.url);

    if (url.pathname === '/qr.svg') {
      return handleRedirect(url, env);
    }

    if (url.pathname === '/qr.inline') {
      return handleInline(url, env);
    }

    const match = CANONICAL_RE.exec(url.pathname);
    if (match) {
      return handleCanonical(request, url, env, ctx, match[1], match[2]);
    }

    return notFound();
  },
} satisfies ExportedHandler<Env>;

async function handleRedirect(url: URL, env: Env): Promise<Response> {
  const result = parseParams(url, env);
  if (!result.ok) {
    return result.status === 413
      ? payloadTooLarge(result.message)
      : badRequest(result.message);
  }

  const { params } = result;
  const hash = await computeHash(params);

  const location =
    `/qr/${params.preset}/${hash}.svg` +
    `?data=${encodeURIComponent(params.data)}` +
    `&ecc=${params.ecc}` +
    `&q=${params.quiet}`;

  return new Response(null, {
    status: 302,
    headers: {
      Location: location,
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

async function handleInline(url: URL, env: Env): Promise<Response> {
  const result = parseParams(url, env);
  if (!result.ok) {
    return result.status === 413
      ? payloadTooLarge(result.message)
      : badRequest(result.message);
  }

  const { params } = result;
  const preset = getPreset(params.preset);

  try {
    const matrix = generateMatrix(params.data, params.ecc);
    const svg = renderSvg(matrix, params.quiet, preset);

    return new Response(svg, {
      status: 200,
      headers: {
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (err) {
    return internalError(err instanceof Error ? err.message : 'QR generation failed');
  }
}

async function handleCanonical(
  request: Request,
  url: URL,
  env: Env,
  ctx: ExecutionContext,
  presetId: string,
  hash: string,
): Promise<Response> {
  if (!isValidPreset(presetId)) {
    return badRequest(`Invalid preset: ${presetId}`);
  }

  const preset = getPreset(presetId);
  const cache = caches.default;

  // Cache key = pathname only (no query params)
  const cacheKey = new Request(new URL(url.pathname, url.origin).toString());

  const cached = await cache.match(cacheKey);
  if (cached) {
    const headers = new Headers(cached.headers);
    headers.set('X-QR-Cache', 'HIT');
    return new Response(cached.body, { status: 200, headers });
  }

  // Cache MISS — need query params to generate
  const data = url.searchParams.get('data');
  if (!data) {
    return badRequest('Cache miss and no data param. Use /qr.svg?data=... to generate.');
  }

  const ecc = (url.searchParams.get('ecc') ?? env.DEFAULT_ECC ?? 'M').toUpperCase();
  const quiet = Number(url.searchParams.get('q') ?? env.DEFAULT_QUIET ?? '4');

  try {
    const matrix = generateMatrix(data.trim(), ecc as 'L' | 'M' | 'Q' | 'H');
    const svg = renderSvg(matrix, quiet, preset);

    const headers = new Headers({
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'ETag': `"${hash}"`,
      'X-QR-Cache': 'MISS',
    });

    const response = new Response(svg, { status: 200, headers });

    // Cache in background (path-only key)
    ctx.waitUntil(cache.put(cacheKey, new Response(svg, { status: 200, headers })));

    if (env.LOG_MISS === 'true') {
      console.log(`QR cache MISS: ${url.pathname}`);
    }

    return response;
  } catch (err) {
    return internalError(err instanceof Error ? err.message : 'QR generation failed');
  }
}
