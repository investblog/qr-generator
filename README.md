# qr-generator

Cloudflare Worker that generates ultra-lightweight B/W QR codes as optimized SVG with edge caching.

**80 KB** (QR Monkey) → **5 KB** (this) for the same URL. Single `<path>` with run-length encoding, integer coordinates, no masks/clipPaths/floats.

## Endpoints

### `GET /qr.svg` — redirect to canonical (for caching)

| Param | Required | Default | Description |
|-------|----------|---------|-------------|
| `data` | yes | — | URL or string to encode |
| `p` | no | `sq250` | Preset: `sq125`, `sq200`, `sq250`, `sq300` |
| `ecc` | no | `M` | Error correction: `L`, `M`, `Q`, `H` |
| `q` | no | `4` | Quiet zone in modules (0–16) |

Returns **302** → `/qr/<preset>/<sha256>.svg` with params in query for cold-cache regeneration.

### `GET /qr.inline` — direct SVG response (for embedding)

Same params as above. Returns **200** with `image/svg+xml` — no redirect, no edge cache magic. Use this for Webstudio inline embedding or copy-paste.

### `GET /qr/<preset>/<hash>.svg` — canonical (edge-cached)

Serves SVG from Cloudflare edge cache. Cache key is pathname only (no query).
- **HIT** → instant response, `X-QR-Cache: HIT`
- **MISS** → generates SVG, caches in background, `X-QR-Cache: MISS`
- **MISS without query params** → `400` with instructions

Headers on canonical response:
```
Content-Type: image/svg+xml; charset=utf-8
Cache-Control: public, max-age=31536000, immutable
ETag: "<hash>"
X-QR-Cache: HIT|MISS
```

## SVG output

- Single-line, no formatting
- `shape-rendering="crispEdges"`
- One `<rect>` (white background) + one `<path>` (black modules)
- Horizontal run-length encoding: `M{x} {y}h{w}v1h-{w}z`
- All coordinates are integers
- No `mask`, `clipPath`, `<g>`, or float values
- `viewBox` in module units, `width`/`height` from preset in px

## Development

```bash
npm install
npm run dev          # wrangler dev
npm test             # vitest
npm run typecheck    # tsc --noEmit
```

## Deploy

Deployment runs automatically via GitHub Actions on push to `main`.

Requires repo secrets:
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

## Tech

- **Runtime**: Cloudflare Workers
- **QR library**: [uqr](https://github.com/unjs/uqr) (zero deps, pure ESM)
- **Tests**: Vitest (37 tests — params, hash, render, golden snapshots)
- **Hash**: SHA-256 via Web Crypto API
