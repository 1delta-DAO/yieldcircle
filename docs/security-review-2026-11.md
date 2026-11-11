# Security review — API calls + pos-indexer (2026-11-11)

Read-only review, no requests sent to production. Covers the yieldcircle client's API layer and edge
(`packages/core`, `packages/app`, `packages/web/functions`, `packages/x-link`) and pos-indexer's public
services: the EVM index (`packages/indexer/src/api`), the Solana index (`apps/sol-indexer/src/api`),
`apps/positions-fetcher`, the social service (`packages/social`), and the deploy edge (Caddy, compose).
Paths into pos-indexer are prefixed `pos-indexer/`. Items marked ✔ were re-checked in the code by hand.

**One fact changes many severities:** whether Cloudflare (orange cloud, `TLS_MODE=origin`, with rate
rules) sits in front of `positions.`, `sol-positions.` and `social.1delta.io`. The code assumes a
DNS-only edge in places (`responseCache.ts`), and nothing in the services limits per IP. Confirm this first.

## What held up

- **No SQL injection** in any of the four services. All request values are bound parameters; dynamic
  SQL is fixed enums / constants; LIKE input escaped.
- **No stored XSS path**: no `dangerouslySetInnerHTML` / `innerHTML` in app or mobile; social
  validates `evidenceUrl` (https) and avatars (https/ipfs).
- **Social EIP-712 design is sound**: `primaryType` binds the action (no cross-action replay), batch
  items cannot be lifted out, signer = author enforced, ±600 s window, deletes scoped by author,
  ERC-1271 chain chosen by the server.
- **Sync hints never write balances** (EVM and Solana) — they only buy an on-chain read.
- **No secrets in the yieldcircle bundle or repo**; `apiHeaders()` empty; ingest/scan routes use
  HMAC + `timingSafeEqual`; prod compose binds internal ports to loopback / private IP.

## Critical / High

| # | Where | Finding | Fix |
|---|---|---|---|
| 1 ✔ | web `state/AppState.tsx:352-354` | **`?as=<addr>` becomes the transaction actor while a wallet is connected.** `account` prefers `viewAs`, `actorOn()` returns it, and every ticket builds for it (`operator`, bridge `receiver` in `tickets/get.ts`). `Action` only disables when *no* wallet is connected. A link `yieldcircle.io/?as=0xAttacker` → victim connects, bridges or deposits; the victim pays and the attacker is the receiver/operator. Today only the beta gate stands in the way. | `actorOn` returns the signer only; disable tickets when `viewAs` ≠ signer; assert build address = signer before `start()`. |
| 2 | app `ladder.ts:118-139,213-255`, core `sdk/signedAction.ts:56` | **API-built transactions are signed blind**: `to`/`data`/`value`, approvals (spender, amount), API-supplied EIP-712 typed data (permits), Solana tx bytes — none checked. A compromised/MITM'd 1delta API or a bad `VITE_BACKEND_BASE_URL` (any URL incl. `http:` accepted) drains whatever the user approves. | Per-chain allowlist for `to` and approval spenders, decode `approve` and refuse unlimited/unknown, bound `value`, allowlist typed-data `primaryType`/`verifyingContract`, Solana program-id allowlist, https-only base URLs at build. |
| 3 ✔ | social `xVerify.ts:83-90`, `index.ts:628-740` | **Free X-link: the nonce is client-chosen**, only non-empty. The post check is `text.includes(account) && text.includes(nonce)`; a nonce like `0` or `a` is in any post that contains the address. Anyone gets a famous account's badge from any post of theirs that mentions the attacker's address, and the real owner then gets a 409. | Server-issued nonce (HMAC of account+expiry, ≥16 random chars), require the exact `proofText`, post id (snowflake) newer than issuance, require `author_url` to parse. |
| 4 | social `paperModel.ts:456,612-654`, `paper.ts:523,837` | **Paper ledger trusts client rates**: `rateKind:'fixed'` keeps the client's rate (supply ≤100 %, borrow down to −100 %) and maturity; unknown `marketUid`s keep a client borrow rate forever. Tops `/paper/board` → the Yield Cup. | Fixed rate/maturity only from server-known fixed markets; never negative borrow; unverified-rate positions off the board. |
| 5 ✔ | pos-indexer `indexer/src/api/responseCache.ts:93,153` | **Cache bypass → DB exhaustion**: key is the raw URL (`?x=random` misses) and a client-sent `x-cache-refresh` header skips cache + coalescing (Caddy forwards it). Cold `/assets/:g/history` ≈13 s on a 20-conn pool; junk keys evict prewarmed boards; two hits enrol a URL into keep-warm. | Honour `x-cache-refresh` only from `app.inject`/a per-process token, strip it in Caddy (`header_up -X-Cache-Refresh`); per-route param allow-list in the key; per-IP limits. |
| 6 | sol-indexer `api/accountSync.ts:327`, `history/pnlRequests.ts:129`, `api/earners.ts:526` | **Sync/PnL request skip the global budget** (only a 5-min per-account cooldown): walk `/earners` and GET `/accounts/<a>/sync` for each → reader queue flooded, RPC quota burned, PnL lane starved. Same shape on EVM (`accountSync.ts:89-106`, shared 120 tickets/min eaten by ~5 whales/min). | Charge `requestPnl`/re-reads to the global bucket, global cap on PnL requests, sync POST-only, per-IP limit. |
| 7 | sol-indexer `db.ts:13` | **One 8-conn pool, no `statement_timeout`**, shared by API, ingest, reader and jobs. Slow public routes (`/accounts/:a/series`, `/stats` 9× uncached `count(*)` — polled by `/ui` every 3 s, `/raw/*`, `/gaps?hours=720`) → a few requests stall ingest. EVM `/accounts/:a/series` similar (6-conn pool, 90 s, `from` unclamped). | Separate API pool with timeout; cache `/stats` or use `pg_class` estimates; clamp `from`; cap concurrent series. |

## Medium

| # | Where | Finding | Fix |
|---|---|---|---|
| 8 | indexer `api/accountSync.ts:146-175,276-302`, store `pnlRequests.ts:203` | Anonymous `POST /accounts/:a/sync` hints for **any** account overwrite that account's public `unsupported` list (≤200 rows, free-text `lender`, `marketUid` with `<>"'`), served by `/accounts/:a/pnl`. | Verify before storing, or keep hint-derived data private; restrict `marketUid` charset. |
| 9 ✔ | indexer `api/balances.ts:70` | `cf-connecting-ip` trusted while Cloudflare is not in front (acme) → spoofed per request, bypasses `enrolPerMinute`, fills `maxEnrolled` with junk; box-2 listener spends RPC on it. | `req.ip` with `trustProxy` = Caddy network; trust CF header only in origin mode from CF ranges. |
| 10 | indexer `api/hints.ts:52-63`, `follow/tip.ts:157,212` | Client `atBlock=` becomes the follower's head: back-to-back `eth_getLogs`, and on RPC sources a clamped future `toBlock` can mark future blocks empty → missed positions ≤60 s. | Clamp to the last observed head; rate-limit `ensure`. |
| 11 | social `index.ts:296-316,775-800`, `erc1271.ts:448` | Bad signatures for known multi-chain addresses trigger ERC-1271 RPC calls (2/chain, 8 s timeout) **before** `rateOk`. | Per-IP limit before verifying; cache "no code"; cap chains + overall deadline. |
| 12 | social, x-link `src/index.ts:77-157` | Sybil spam: limits are per author only; `subjectKey` unvalidated (≤64 KB), `avatarUrl` uncapped. **OAuth login CSRF** in x-link: `state` not bound to the browser, so a victim approving the attacker's authorize URL binds the victim's X id to the attacker's wallet. | Per-IP/global limits, length caps; x-link `/begin` sets an HttpOnly SameSite cookie checked at `/callback`. |
| 13 | core `vendor/allocator/http.ts:96`, `sdk/signedAction.ts:35` | `new URL(path, base)` with API-supplied `submit.endpoint` `//evil.host/x` leaves the 1delta origin. | Refuse `//` and `://` paths; assert `url.origin`. |
| 14 ✔ | web `functions/_middleware.ts:123` | Open redirect: `location: url.pathname + url.search`; `//evil.com/?access=x` → 302 `//evil.com/`. | Collapse leading slashes / absolute same-origin URL. |
| 15 | web `public/_headers` | No CSP / HSTS / Permissions-Policy on a signing frontend. | `script-src 'self'`, `connect-src` to the known API/RPC/WalletConnect hosts (also contains #13). |
| 16 | sol-indexer `deploy/sites-sol/sol-index.caddy`, indexer `/ops/*`, `/health` | Ops routes public: `/ui`, `/raw/*`, `/stats`, `/coverage`, `/gaps`, `/unresolved`, `/internal/pnl-board`, `/ops/handovers`, `/ops/pnl-suspects`; `/health` shows error text, RPC hosts, jobs. Sol RPC redaction strips only `api_key=` (a path/`token=` key would leak). | Caddy `respond 404` or basic auth for those paths; print RPC host or label only. |

## Low

- Default Fastify 500 bodies leak `err.message` (Postgres text; negative `limit` passes through, e.g.
  indexer `server.ts:1021`, sol `unified.ts:237`) → generic error handler, clamp limits ≥1.
- Social: high-s signature malleability dedupes on `(author, sig)` → reject s > n/2 or dedupe on the
  EIP-712 hash; follow/reaction upserts have no `signed_at` ordering (old captured toggle undoes a newer
  one); one X account linkable twice (`x.id` vs `oembed:<handle>`); `XLINK_SECRET` compared with `!==`;
  `/alerts/:a/notifications` public (confirm intended); Solana sign message has no readable domain line.
- Shared 30/min remote-lookup budgets (`/find`, `.sol`/`.skr`, ENS) spendable by one caller; sol `/find`
  misses persist junk rows; `/find/click` boosts ranking anonymously.
- `/ingest/blocks` reads ≤256 MB before the HMAC check (private only unless `SOL_INGEST_PUBLIC=1`).
- positions-fetcher `/health` returns full RPC URLs (keys) and binds 0.0.0.0 in-app; private by compose.
- `stack.yml:72` publishes 8090 ingress (bypasses Caddy; not used by `deploy.sh`); dev
  `docker-compose.yml` publishes Postgres 5433 on 0.0.0.0 with password `positions`.
- pos-indexer `.env.example:65` and `tickets/0030-history-backfill.md:292` contain nodereal URLs with
  path keys — confirm they are public keys or rotate.
- yieldcircle: waitlist has no rate limit/captcha and the first email for an address stands; beta gate is
  client-side only (`wallet/gate.ts:16`); paper wallet keys sit in localStorage and its connector signs
  without prompting; unencoded path segments in `index/api.ts`, `social/api.ts`, `paperApi.ts` (Lite's
  `liteLinks.ts:68` skips `isAddr`); `evidenceUrl` href should be http(s)-only; any key put in
  `VITE_RPC_*` ships publicly.

## Not traced

`loadSeries` worst-case cost, `bundle`/`assets`/`exposure` query costs, the store side of
`accountSync()`, whether Caddy's `/ingest` matcher survives `//` or case variants (HMAC still guards it),
Hetzner firewall state, how prod RPC nodes treat a future `toBlock`, and whether the 1delta builders
actually credit `operator` (#1's deposit path; the bridge `receiver` path is direct).

## Suggested order

1. #1 (`?as=` actor) — small fix, real funds.
2. #3 X-link nonce and #12 x-link CSRF — identity is the social layer's trust anchor.
3. Edge: confirm/enable Cloudflare proxy + rate rules for the three hosts; strip `x-cache-refresh`; 404
   the ops routes. Covers most of #5-#11 and #16 at once.
4. #2 transaction allowlist + #15 CSP + #13 origin check — defence in depth against an API compromise.
5. #4 paper rates before the next Yield Cup series.
