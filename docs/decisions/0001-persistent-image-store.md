---
type: adr
status: accepted
tags: [adr, storage, privacy]
project: qr-generator
---

# 0001 — Persistent store for canonical QR images

**Status:** accepted (2026-11-12) — no store; bare canonical URLs are dropped altogether (see
*Decision*).

## Context (when this was decided)

- A canonical URL is `/qr/<preset>/<sha256>.svg`. With `data`, `ecc` and `q` in the query the worker
  re-created the image, checked it against the hash and served it (since 2026-11-11). Without them it
  could only answer from `caches.default`, which is **per Cloudflare location** and may evict entries
  early; a miss was `400`.
- The browser extension issued such bare URLs up to version 1.0.x. From 1.1.0 it issues self-contained
  URLs (the query included), which work from every location. Its history re-links old entries from
  their stored data, so users who copy a link again get a working one.
- What a store would still have added:
  1. **Old bare links** already pasted somewhere. A store can only keep an image the worker has seen
     with its data *after* the store goes live; the data of links nobody re-issues is gone.
  2. **Short links** (no query) as a product feature.
- Traffic is low. How often bare links failed was not measured: a canonical path looks the same with
  and without a query, and `400` also covers missing parameters and hash mismatches, so path + status
  is not enough — it would need a categorical counter (for example `reason=bare-miss`, no data).

## Options

**A. No store (status quo with self-contained links).** Nothing new to run or disclose. Old bare links
keep working only while cached.

**B. Workers KV, key `<preset>/<hash>`, value = verified SVG.** Write only a freshly generated image
from a request whose hash matched — never a cache body; bare URLs read cache → KV → `400`. Limits,
from <https://developers.cloudflare.com/kv/platform/limits/> and
<https://developers.cloudflare.com/kv/platform/pricing/> (both checked 2026-11-12):

| | Workers Free | Workers Paid |
|---|---|---|
| Reads | 100,000 / day | 10 million / month included, then $0.50 / million |
| Writes (different keys) | 1,000 / day | 1 million / month included, then $5.00 / million |
| Writes to the same key | 1 / second | 1 / second |
| Storage | 1 GB | 1 GB included, then $0.50 / GB-month |
| Value / key size | 25 MiB / 512 bytes | same |

Image size depends on the payload and ECC, not on the preset (the preset only sets `width`/`height`).
Measured on production 2026-11-12: a typical URL ≈ 3 KB, 2,048 ASCII characters at ECC L ≈ 80 KB, the
largest QR (984 CJK characters, ECC L) ≈ 126 KB. So 1 GB holds roughly 8,000 worst-case or ~300,000
typical images. Over the free daily limit, writes fail with an error, so the write path must tolerate
failure. KV is eventually consistent across locations: right after a link is issued, a recipient
elsewhere may still get `400` for a short while, so a short link would have to be handed out only
after the write is confirmed, with that delay accepted or retried.

**C. R2.** Same shape as B with object storage. No advantage in size or cost here; its stronger
read-after-write consistency would matter if short links had to work the moment they are issued.

## Privacy and abuse (applies to B and C)

- A stored image **is** the encoded data: the store retains user content, where today the policies
  promise that cached images expire. Every policy surface must change before launch: the service
  privacy policy, the extension's `PRIVACY.md` and store listing, and the extension guide.
- Only explicit issuance may be stored. Extension versions before 1.1.0 request the link on every
  generation, including the automatic code for the current page whenever the panel opens; the server
  cannot tell those requests from real issuance (nor from a recipient opening a link). Storing them
  would keep pages people merely visited. A store therefore needs a future
  extension change: a marker (such as a request header, not part of the shared URL) sent only when the
  user copies a link. Clients can forge it, so it does not replace the write budget below.
- Retention needs a concrete period, chosen when a storage option is approved (none is chosen here),
  and expiring or deleting a KV entry is not enough on its own:
  copies already in `caches.default` keep being served (canonical responses are cacheable for a year).
  The cache lifetime must not exceed the retention period, and there must be a takedown procedure
  (delete from KV + purge the cache).
- Anyone can create entries by sending valid `data` (the hash is checked, so no one can overwrite
  someone else's image, but volume is unbounded): needs a write budget, a kill switch, and monitoring.
- KV namespace ids are per Cloudflare account. Every deploy path of this worker must bind a namespace
  in the account it deploys to (per-environment bindings in `wrangler.toml`), or the extra deploy paths
  must go.

## Decision

Option **A**, and further: **bare canonical URLs are not supported at all.** After self-contained
links, a store would only rescue a subset of old bare links (those re-issued after launch) and add
retained user content, a policy change, abuse controls and a new operational dependency.

So the canonical path no longer uses `caches.default`: a URL with `data`, `ecc` and `q` is rebuilt and
verified on every request, and a URL without `data` is `400`. The server-side cache existed only to
answer bare URLs; without them it is dead weight and the only place an image could be planted.

Revisit only if short links become a product requirement.

## Consequences

- No persistent storage, and canonical images are not cached on the server (`/qr.inline` responses
  are still edge-cached for 24 hours by full URL). Extension 1.1.0 makes no requests of its own: its
  cache warm-up had no effect once the canonical path stopped caching, and was removed.
- Bare links issued before extension 1.1.0 stop working once this is deployed. It must ship **after**
  1.1.0 reaches users, since 1.0.x still hands out bare links.
- Entries already in `caches.default` under canonical paths are never read again and expire on their own.
- Every canonical request renders the QR (CPU per request instead of a cache hit); at current traffic
  this is negligible. Browsers still cache the response (`immutable`).
- The API documentation recommends `/qr.svg` (redirect with query) or `/qr.inline` for embeds.
