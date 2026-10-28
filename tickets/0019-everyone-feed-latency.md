# 0019 — Home's "Everyone" feed waited 31 s for its EVM half

- status: **open, not reproduced.** Seen once on 2026-10-28 while checking
  [`docs/rate-boards.md`](../docs/rate-boards.md) phase 0. The cause is not known.
- area: `src/ui/lite/LiteSocial.tsx` (`LiteMoves`, the *Everyone* tab),
  `packages/app/src/index/queries.ts` (`useFeedPage`, `useRateLeaders`), core `index/api.ts`
  (`recentTxs`: it splits `accounts` by VM since 2026-10-27). Server side: pos-indexer
  `GET /events/recent` (`packages/indexer/src/api/server.ts`).
- depends on: nothing. If the cause turns out to be the index, this becomes a pos-indexer ticket.

## What happened

Lite's Home, *Everyone* tab, at phone width in headless Chromium against `pnpm dev` (local app,
prod indexes). The tab asks for the moves of the rate board's top 40 wallets, one request per index:

| Request | Issued | Answered |
|---|---|---|
| `sol-positions.1delta.io/events/recent?accounts=<Solana wallets>&limit=80&group=tx` | 0.5 s | 0.8 s |
| `positions.1delta.io/events/recent?accounts=<≈38 EVM wallets>&limit=80&group=tx` | 0.5 s | **31.5 s** |

Until the EVM half answers, the tab shows a skeleton. `recentTxs` waits for both halves, so
the Solana rows that had already arrived were not shown either. In an earlier run (22 s timeout) the
EVM half had not answered at all.

## What was ruled out

- **The query itself.** The same EVM URL by curl, right afterwards: **0.38 s**. Wallet lists the
  server had not seen before (reversed order, 5 / 20 / 40 wallets): **0.56 / 1.34 / 0.84 s**.
- **A browser connection limit.** Both index hosts answer over HTTP/2.
- **The rate-board switch as such.** It changed which wallets are asked about, not how. The
  dollars-a-day list (before phase 0) answered within about 12 s in every run, but that was not timed
  per request.

## Hypotheses, in the order to check them

1. **The index was busy.** A cold Lite Home sends many requests to `positions.1delta.io` at
   once: proofs, trending per chain (several answered **500** in the same runs), the feed and the
   board. If `/events/recent` with `accounts=` queues behind them, in the pool, a lock or the
   statement queue, it waits.
   Check: the server's request log and `pg_stat_activity` for that minute; run the page while
   timing the feed with nothing else in flight.
2. **A cold plan for that particular account set.** The browser's call was the first ever for
   that exact list and it warmed the cache, so the curl afterwards was a cache hit.
   Check: `EXPLAIN (ANALYZE, BUFFERS)` of the `accounts = ANY($1)` feed query with 40 EVM wallets
   that hold many positions (the rate board's wallets have 1–8 each; desks have hundreds).
3. **Client-side.** Something in the page held the request back: React Query retry or backoff,
   or the dev server's proxy. Check: the HAR's timing breakdown (stalled vs waiting) for that
   request.

## What to do whatever the cause

- **Do not let one index hold the other back.** `recentTxs` could show the half that answered,
  marked as partial, instead of waiting for both. *Everyone* only needs a few rows.
- **Ask for fewer wallets.** The tab shows 6 moves; 40 wallets × `limit=80` is far more than that
  needs. 20 wallets and `limit=40` would be enough.
- **Or serve it precomputed.** "Recent moves by the rate board's top 50" is the same for every
  reader. The index could build it with the board tick and serve it from its response cache, as
  it does the boards (see `docs/rate-boards.md` §5). That turns the read into one cached request.

## Done when

The cause is named. A cold Lite Home shows *Everyone*'s first rows within 2 s at p95, measured on
prod. A slow index costs only its own rows.
