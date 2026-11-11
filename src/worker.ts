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

    if (env.API_KEY && request.headers.get('X-API-Key') !== env.API_KEY) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      });
    }

    const url = new URL(request.url);

    if (url.pathname === '/qr.svg') {
      return handleRedirect(url, env);
    }

    if (url.pathname === '/qr.inline') {
      return handleInline(request, url, env, ctx);
    }

    const match = CANONICAL_RE.exec(url.pathname);
    if (match) {
      return handleCanonical(url, env, match[1], match[2]);
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

async function handleInline(request: Request, url: URL, env: Env, ctx: ExecutionContext): Promise<Response> {
  const cache = caches.default;

  const cached = await cache.match(request);
  if (cached) {
    const headers = new Headers(cached.headers);
    headers.set('X-QR-Cache', 'HIT');
    return new Response(cached.body, { status: 200, headers });
  }

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

    const headers = new Headers({
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
      'X-QR-Cache': 'MISS',
    });

    const response = new Response(svg, { status: 200, headers });

    ctx.waitUntil(cache.put(request, new Response(svg, { status: 200, headers })));

    return response;
  } catch (err) {
    return internalError(err instanceof Error ? err.message : 'QR generation failed');
  }
}

/**
 * Canonical URL `/qr/<preset>/<hash>.svg?data=…&ecc=…&q=…`: the image is rebuilt from the query on
 * every request and served only if the path's hash is the hash of exactly these params. Nothing is
 * cached server-side, so there is nothing to poison. Bare URLs (no data) are not supported: the hash
 * alone cannot be turned back into an image.
 */
async function handleCanonical(url: URL, env: Env, presetId: string, hash: string): Promise<Response> {
  if (!isValidPreset(presetId)) {
    return badRequest(`Invalid preset: ${presetId}`);
  }
  if (!url.searchParams.has('data')) {
    return badRequest('Canonical URL requires data, ecc and q. Use /qr.svg?data=... to get one.');
  }

  // ecc and q are required (no defaults): /qr.svg's redirect always carries both, and defaults
  // differ between configs.
  if (!url.searchParams.has('ecc') || !url.searchParams.has('q')) {
    return badRequest('Canonical URL with data requires ecc and q');
  }
  const probe = new URL(url);
  probe.searchParams.set('p', presetId);
  const result = parseParams(probe, env);
  if (!result.ok) {
    return result.status === 413 ? payloadTooLarge(result.message) : badRequest(result.message);
  }
  const { params } = result;
  if ((await computeHash(params)) !== hash) {
    return badRequest('Hash does not match the parameters');
  }

  try {
    const matrix = generateMatrix(params.data, params.ecc);
    const svg = renderSvg(matrix, params.quiet, getPreset(presetId));
    return new Response(svg, {
      status: 200,
      headers: {
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'ETag': `"${hash}"`,
      },
    });
  } catch (err) {
    return internalError(err instanceof Error ? err.message : 'QR generation failed');
  }
}
