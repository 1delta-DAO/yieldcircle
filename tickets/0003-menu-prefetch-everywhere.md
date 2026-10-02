# 0003 — The Earn menu preloads ~7.5 MB on every route, not just Earn

- status: open
- created: 2026-10-02
- area: `src/ui/useMenu.ts` / `src/ui/useBook.ts` (wherever the earn + pairs
  prefetch mounts), `src/App.tsx`

## Symptom

Measured with Playwright against a local index (board page,
`#/board`, cold load, 2026-10-02): the page itself is fast — DOM at 253 ms,
rows painted at 618 ms, the board's own data 67 kB — but the load fires **46
requests and 10.5 MB**, of which ~**7.5 MB** is allocator-api `/v1/data/earn`
(six chain batches, one of them 2.7 MB) and `/v1/data/lending/pairs/optimize`
(twelve variants). None of it is used by the board; it is the Earn menu's
warm-up, mounted app-wide.

## Why it matters

- On a phone or a slow link the board (and Home, Feed, a wallet page…)
  competes with 7.5 MB of background JSON for bandwidth and battery.
- allocator-api pays ~18 requests per app open, whatever the user came for.

## Fix (sketch)

Mount the earn/pairs prefetch lazily: on first navigation to `earn` (or on
idle AFTER the current route's own queries settled — `requestIdleCallback` +
react-query `prefetchQuery`), not at app mount. The menu seed JSON already
ships in the bundle for instant first paint of the Earn tab, so the deferred
warm-up costs one spinner at most.

## Acceptance

- Opening `#/board` cold fires no `/v1/data/earn` or `/pairs/optimize`
  requests until the user visits Earn (or the route has been idle for a few
  seconds).
- The Earn tab's first paint is unchanged (seed), and its live numbers arrive
  as they do today.
