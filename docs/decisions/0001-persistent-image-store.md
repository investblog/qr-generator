---
type: adr
status: proposed
tags: [adr, storage, privacy]
project: qr-generator
---

# 0001 — Persistent store for canonical QR images

**Status:** proposed (2026-11-12) — recommendation: do not build it now (option A). Awaiting the
maintainer's decision.

## Context

- A canonical URL is `/qr/<preset>/<sha256>.svg`. With `data`, `ecc` and `q` in the query the worker
  re-creates the image, checks it against the hash and serves it (since 2026-11-11, see README). Without
  them it can only answer from `caches.default`, which is **per Cloudflare location** and may evict
  entries early; a miss is `400`.
- The browser extension issued bare URLs until version 1.0.1. From 1.1.0 it issues self-contained URLs
  (the query included), which work from every location. Its history re-links old entries from their
  stored data, so users who copy a link again get a working one.
- What a store would still add:
  1. **Old bare links** already pasted somewhere. A store can only keep an image the worker has seen
     with its data *after* the store goes live; the data of links nobody re-issues is gone.
  2. **Short links** (no query) as a product feature.
- Traffic is low (hundreds of requests a day). How often bare links fail is not measured: a canonical
  path looks the same with and without a query, and `400` also covers missing parameters and hash
  mismatches, so path + status is not enough — it needs a categorical counter (for example
  `reason=bare-miss`, no data) in logs or Workers Analytics Engine.

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
  cannot tell those requests from real issuance, and in 1.1.0 the warm-up after a copy is an ordinary
  request too. Storing them would keep pages people merely visited. A store therefore needs a future
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

## Decision (proposed)

Option **A**. After self-contained links, a store only rescues a subset of old bare links (those
re-issued after launch) and adds retained user content, a policy change, abuse controls and a new
operational dependency. Revisit if either holds:

- short links become a product requirement, or
- measured `400`s on bare canonical URLs show old links failing at a meaningful rate.

## Consequences

- No new data retention to disclose (the policies still need to follow extension 1.1.0, which sends
  data only when a link is copied or opened).
- Bare links issued before extension 1.1.0 remain best effort (cache only).
- The API documentation keeps recommending `/qr.svg` (redirect with query) or `/qr.inline` for embeds.
