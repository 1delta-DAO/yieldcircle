# 0022 — Endpoint hardening: the order to fix what the reviews found

- status: code done in both repos, uncommitted and undeployed (2026-11-13). Open: phase 0
  dashboard items (checklist in pos-indexer `docs/edge-cloudflare.md`), `#2` (needs the
  contract list per chain), CSP still Report-Only, `XLINK_LEGACY_NONCE=0` after the app ships
- created: 2026-11-12
- builds on: [docs/security-review-2026-11.md](../docs/security-review-2026-11.md) (the findings,
  numbered `#1`–`#16` below) and the availability pass of 2026-11-12 (items `A1`–`A4` below, the ones
  the review did not have)
- repos: yieldcircle (this one), pos-indexer (index, sol-indexer, social, Caddy), Cloudflare dashboard

## Why

A community member reported "a security issue within data fetching" that could affect availability,
with no detail. Whatever they found, the two passes show the same picture: funds are safe behind the
wallet except for one bug (`#1`), and availability rests on services that anyone can ask for
expensive work without a limit. This ticket is the order of work, not a second list of findings.

## What was measured on 2026-11-12

- `positions.`, `sol-positions.` and `social.1delta.io` answer `via: 1.1 Caddy` with no `cf-ray`:
  **Cloudflare is not in front of them.** This was the open question in the review; it means `#5`–`#11`
  and `#16` stand at full severity, and `#9` (spoofable `cf-connecting-ip`) is live.
- `allocator.api.1delta.io` is behind Cloudflare, 500 requests / 15 min, counted per client and not
  per `Origin`.
- pos-indexer `deploy/Caddyfile` is one `reverse_proxy` with no limits, no header stripping and no
  path rules; it already has `TLS_MODE=origin` for running behind Cloudflare.
- Nothing from the review has been fixed yet in either repo (`AppState.tsx:352-354` and
  `_middleware.ts:123` are unchanged).

## Added by the availability pass

| # | Where | Finding | Fix |
|---|---|---|---|
| A1 | `packages/web/functions/_middleware.ts` | The app has no `_routes.json`, so the gate runs on every request, every asset included. A flood of asset requests spends the Functions quota. | `_routes.json` that excludes `/assets/*` and the static files in `public/`; the HTML document, `/gate/*` and `?access=` keep the middleware. |
| A2 | `packages/x-link/src/index.ts:68` | `GET /challenge` writes KV for any caller (CORS stops browsers only); `/begin` stores `signed` at any size. | Cap the body (a few KB), rate rule on the worker's host. |
| A3 | `packages/web/src` | No React error boundary: one record that throws in render blanks the page for everyone who loads it. | A boundary per route shell (Lite, Pro) and one around each feed/thread card, so a bad row is skipped, not the page. |
| A4 | `packages/x-link/wrangler.toml` | `ALLOWED_ORIGIN = https://yieldcircle.io`, while `.env.example` puts the app at `app.yieldcircle.io`. | Confirm which origin calls the worker; needed exactly for the cookie in phase 2. |

## Phases

Each phase can ship on its own. Phases 0 and 1 are small and should not wait for the rest.

### Phase 0 — the edge (dashboard + Caddy, no app code)

One decision covers most of the availability findings: put Cloudflare in front of the three hosts.

1. Proxy `positions.`, `sol-positions.`, `social.1delta.io` (orange cloud), Caddy to `TLS_MODE=origin`.
2. Firewall the origin to Cloudflare's ranges, or the proxy is bypassed by hitting the box directly.
   Only after that is `cf-connecting-ip` trustworthy (`#9`).
3. Rate rules per IP: a general one per host, and tight ones for `POST /accounts/*/sync`,
   `/accounts/*/pnl?request=1`, social `/write`, `/paper/ops`, `/x-link*`.
4. Caddy: `header_up -X-Cache-Refresh` (`#5`), `respond 404` for the ops routes in `#16`
   (`/ui`, `/raw/*`, `/stats`, `/coverage`, `/gaps`, `/unresolved`, `/internal/*`, `/ops/*`).
5. The same dashboard: a rate rule on `/gate/request` for both Pages projects (the waitlist flood)
   and on the x-link worker's host (`A2`).

Check: `curl -sI` shows `cf-ray` on all three; a direct request to the origin IP is refused; a
request with `x-cache-refresh: 1` is served from cache; `/ops/handovers` answers 404; the app's
`?wait=` sync still returns (Cloudflare allows 100 s, the hold is ≤ 30 s).

Risk: a rate rule that is too tight throttles real users on shared IPs. Start in log-only mode for a
day and set the numbers from what the app really sends (the feed refetches every 20 s).

### Phase 1 — funds (yieldcircle, small)

- `#1`: `actorOn` returns the signer only; tickets disabled while `viewAs` differs from the signer;
  assert the built address equals the signer before `start()`.
- `#14`: the `?access=` redirect collapses leading slashes.
- `#13`: `apiUrl` refuses `//` and `://` paths and asserts `url.origin`.

Check: with a wallet connected, `?as=0x…` shows the other wallet's page and every ticket is
disabled; `//evil.com/?access=x` redirects to the same origin; `pnpm build` and the tests pass.

### Phase 2 — identity (social + x-link)

- `#3` (pos-indexer social): server-issued nonce, exact `proofText`, post newer than issuance.
- `#12` (x-link): `/begin` sets an HttpOnly cookie that `/callback` checks. The worker and the app
  are same-site, so `SameSite=Lax` works, but the app must send `credentials: 'include'` and the
  worker must answer one named origin, not `*` — settle `A4` first.
- `#12` caps: `subjectKey` and `avatarUrl` length, per-IP limit before signature work (`#11`).

Order: deploy social first (it keeps accepting old clients for the window), then the worker, then
the app.

### Phase 3 — the services' own limits (pos-indexer)

The edge slows an attacker; these make each request cheap enough that it does not matter.

- `#5`: cache key from a per-route param allow-list; `x-cache-refresh` honoured only in-process.
- `#6`: sync re-reads and PnL requests charged to the global budget; sync POST-only.
- `#7`: a separate API pool with `statement_timeout` on both indexes; `/stats` cached; `from` clamped.
- `#8`, `#10`: hint-derived data kept private or verified; `atBlock` clamped to the observed head.
- Low: a generic 500 handler, limits clamped ≥ 1.

Check: a loop of `?x=<random>` on `/assets/:g/history` no longer grows DB time; ingest lag stays
flat while `/accounts/:a/series` is hammered on a local stack (never on production).

### Phase 4 — the app's own edge (yieldcircle)

- `A1` `_routes.json`, `A2` body cap, `A3` error boundaries.
- `#15`: CSP, HSTS, Permissions-Policy in `public/_headers`. Ship CSP as `Report-Only` first — the
  wallet connectors and RPC hosts are easy to miss in `connect-src`.
- Waitlist: Turnstile on `/gate/request` only if the rate rule from phase 0 proves not enough.
- Low: `encodeURIComponent` on path segments in `index/api.ts`, `social/api.ts`, `paperApi.ts`.

### Phase 5 — depth

- `#2`: allowlist for `to`, approval spenders, typed-data contracts and Solana program ids before
  signing. The largest item; needs the list of contracts per chain from the 1delta side.
- `#4`: paper rates from server-known markets only — before the next Yield Cup series opens.

## Not in this ticket

Load testing production, and the reporter: ask them for the endpoint, steps and observed impact; no
reward is promised before a write-up. If their finding is not on this list, add it here.
