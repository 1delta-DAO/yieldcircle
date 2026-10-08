# APIs — where each call lives and the rules around it

A map for anyone (human or agent) editing code that talks to a backend. The app
has **no backend of its own**; it reads three services:

| Service | Base URL (env) | Default | What for | Client code |
|---|---|---|---|---|
| **1delta API** (worker-api / "allocator") | `VITE_BACKEND_BASE_URL` | `https://allocator.api.1delta.io` | catalogue, the connected user's positions + balances, every transaction built | `src/vendor/allocator/http.ts` → `src/sdk/api.ts` → `src/sdk/queries.ts` |
| **Position index** (`pos-indexer`) | `VITE_INDEX_BASE_URL` | `https://positions.1delta.io` | other wallets, feed, markets, hot/trending, board, curators, assets, idle-balance snapshots — the EVM chains | `src/index/api.ts` → `src/index/queries.ts` |
| **Solana position index** (`pos-indexer/apps/sol-indexer`) | `VITE_SOL_INDEX_BASE_URL` | `https://sol-positions.1delta.io` | the same ledger questions for `solana`, a separate service until the merge ([`solana.md`](solana.md)) | `src/index/api.ts` routes to it by chain / address shape / uid; it must answer the EVM index's shapes — no adapter here |
| **Social service** (`pos-indexer/packages/social`) | `VITE_SOCIAL_BASE_URL` | `https://social.1delta.io` | threads, profiles, follows, ratings (EIP-712 signed writes) | `src/social/api.ts` → `src/social/queries.ts` (see [`social.md`](social.md)) |

All base URLs are resolved in `src/config/backend.ts`. Vite bakes them in at
**build** time.

**Rates are APR, and the UI says APR.** Every backend rate (`depositApr*`,
`borrowApr*`, `rewardApr*`, `aprTotal`, `intrinsicYield`, the index's `apr*`)
is a nominal, simple APR in percent, so legs add: base + rewards + intrinsic,
and a loop's net is `dep·L − bor·(L−1)`. APYs would not add. Label every rate
"APR" (or "net yield"); never "APY", and never compound one for display.

## The layering (keep it)

```
config/backend.ts          base URLs, apiHeaders()  (the only auth hook)
vendor/allocator/http.ts   apiFetch / apiFetchEnvelope / apiFetchLoose — envelope, errors, 429 gate
sdk/api.ts                 one function per 1delta endpoint; wire names translated HERE only
index/api.ts               one function per index endpoint (own tiny `get`, no envelope)
sdk/queries.ts             React Query hooks for the 1delta API (+ the index balance POST)
index/queries.ts           React Query hooks for the index
social/sign.ts             every signed social write; social/pending.ts queues follows + profile edits for ONE Batch signature
model/*.ts                 pure functions turning responses into Strategy / Holding / uid
ui/*                       components; call hooks, not fetch
```

Rules:

- **No raw `fetch` in `ui/`, `model/` or `state/`.** Add a function to the
  matching `api.ts`, a hook to the matching `queries.ts`, and call the hook.
  (Existing exceptions: `Board`, `Search`, `Stats` call a few `index/api`
  functions directly inside their own `useQuery`; `GetAsset` and `Ticket` call
  `sdk/api` action builders imperatively. Follow that only for the same kind
  of one-off.)
- **Follows and profile edits are queued, not signed on the spot**
  (`social/pending.ts`, [`social.md`](social.md) §17). Read follow state
  through `useMyFollows`, which lays the queue over the service's answer;
  stage with `usePending()`. Comments, reactions, ratings, deletes and links
  still sign immediately.
- **Every 1delta request goes through `vendor/allocator/http.ts`.** It owns the
  envelope, `ApiError`, and the shared rate-limit gate (one 429 pauses *all*
  requests until `retryAfter`). Never add a key there or in `apiHeaders()` —
  it ships in the bundle; a keyed setup points `VITE_BACKEND_BASE_URL` at a proxy.
- **Translate wire names once**, in `api.ts`. Callers speak *collateral / debt*;
  the API's `marketUidIn` / `marketUidOut` flip meaning between open and close
  (see below) and must not leak further.
- **Types:** 1delta wire shapes in `src/sdk/types.ts`, index shapes in
  `src/index/types.ts` (a few index response types sit next to their function
  in `index/api.ts`).

## 1delta API — endpoints used

Envelope: `{ success, data, actions: { transactions, permissions }, error }`.
`apiFetch` returns `data`; `apiFetchEnvelope` returns all of it (the
`/v1/actions/*` builders need `actions`); `apiFetchLoose` is for the endpoints
that sometimes answer un-enveloped or with `ok` instead of `success`
(`/lending/pairs/optimize`, `/v1/data/earn`, `/earn/positions`).

### Reads (`src/sdk/api.ts`)

| Function | Endpoint | Used by | Notes |
|---|---|---|---|
| `fetchEarn` | `GET /v1/data/earn` | `useCatalog` → deposit rows (lending markets + vaults); `useAssetStrategies` → one token's rows for its asset page (`assetGroup=<g>&passthrough=include`, with `pairs/optimize?collaterals=<its addresses>` per chain) | `chainIds` CSV; `terms: 'digest'` (not `none`, not `full`); pages only while a page is full; worker-api's cron pre-warms these exact params — don't change them casually. The one source for vaults and lending — there is no separate `/v1/data/vaults` fetch. A vault is named from the row's `curator`/`brand`/`name` (unnamed vaults arrive as `USDC · 0x5b8b`; the tail is stripped); `shareToken` is null on vault rows today, so the share symbol, logo and index group fall back to the build-time token map (`src/data/strategy-tokens.json`, `node scripts/logos.mjs`, every chain in `CHAINS`; a savings vault like Nest's is then filed by its share — `holds: nOPAL`, `shareGroup` = nOPAL's group, listed on that asset page). Missing identity is fixed in the earn row, not with a second fetch. One narrow extra request per **exposure asset** (`EXPOSURE` in `model/assets.ts`, JLP today) on its home chain: `assetSymbol=<sym>&passthrough=include`, because its deposits pay only the token's own yield and are excluded by default. |
| `fetchRateHistory` | `POST /v1/data/earn/rate-history` | `useRateHistory` (over `sdk/rateHistoryStore.ts`) → the 30-day line in AssetPage's rate and Earning cells, the ticket's "Last 30 days" block, `30d x%` on the Earn digest, Hot cards, the market header and search; and `steadyRate`, which those lists RANK by | body `{ uids }` (≤ 1000 per request, chunked; a deposit's `earnUid`, a loop's `marketLongUid` + `marketShortUid`). A per-UID cache shared by every surface: only uids not held (or older than 30 min) are queued, and everything asked in one tick goes out as ONE request — a page with list + ticket + header costs one call (origin rebuilds hourly, worker caches 10 min). A failed read backs off 5 min and leaves rows without a line. Points are bps, one time-weighted mean per UTC day; base and rewards apart so the line can be drawn with or without them; a loop nets its legs per day in `model/rateHistory.ts`. |
| `fetchOptimizerPairs` | `GET /v1/data/lending/pairs/optimize` | `useCatalog` → loop rows (`optimizerPages`) | `chainId` for one chain, `chainIds` for several; archetypes = tag filters; asked with no risk cap / liquidity floor (floors are applied client-side in `model/visibility.ts`); plus one `collaterals=<address>&debtTags=stablecoin` request per exposure asset (JLP carries no tag an archetype matches) |
| `fetchIrm` | `GET /v1/data/lending/irm` | `useIrm` | **max 8 uids** per call (`IRM_MAX_BATCH`) — 10 returns 500 |
| `fetchLendingBook` | `GET /v1/data/lending/book` | `useLendingBooks` → the dated-loan ticket (Morpho Midnight) | `marketUid` = the DEBT market, `side=borrow`; `pricing: 'marginal'` = each level its own lot, so a size pays the assets-weighted mean of the levels it walks (`bookAprAt`). The pairs feed gives a Midnight row only its top of book as `borrowAprShort` (and 0 % + `debtTerms.canOpen: false` on an empty book, which `classifyPair` hides). Each maturity is its own `MORPHO_MIDNIGHT_<id>` market; `foldDates` folds a pair's maturities into one row with `dates` for the ticket's picker. Zero-coupon: the face owed is fixed at the open, repaid 1:1 early (no penalty), liquidatable once past due. |
| `fetchChains` | `GET /v1/data/chains` | `chainsQuery`, `ChainMark` | names + logos |
| `fetchTokenBalances` | `GET /v1/data/token/balances` | `useBalances`, `useBalancesPerChain` (live fallback), `txTrace`, `GetAsset` | single chain only; route answers `max-age=15` → pass `fresh` after a tx |
| `fetchEarnPositions` | `GET /v1/data/earn/positions` | `useEarnPositions`, `txTrace` | **the only source for the connected user's positions**; `lenders` / `vaults` narrow a post-tx re-read; always read past the browser cache (`max-age=15`) |
| `fetchLoopPayAssets` | `GET /v1/actions/loop/leverage/pay-assets` | `useLoopPayAssets` | |
| `bridgeStatus` | `GET /v1/data/bridge/status` | `txTrace` | |

### Action builders (return `actions`, signed by `ui/useLadder.ts`)

| Function | Endpoint | Param mapping |
|---|---|---|
| `earnDeposit` | `/v1/actions/earn/deposit` | `earnUid`, `amount`, `operator`, optional `payAsset`; `slippage` on a booked row (Pendle PT, `SimpleStrategy.booked`, from the capability's `requires`) or with a `payAsset` |
| `earnWithdraw` | `/v1/actions/earn/withdraw` | `receiveAsset = ZERO` unwraps to native; always pass `amount` (`isAll` not honoured everywhere, refused on a booked row); `slippage` on a booked row |
| `loopOpen` | `/v1/actions/loop/leverage` | **`marketUidIn` = DEBT, `marketUidOut` = COLLATERAL** on open; `termId` for Lista broker debt; `duration` + `durationType` (0 days · 1 weeks · 2 months) **required** on a Loopscale pair (`LoopStrategy.tenors`) — the feed carries no per-tenor rate, so `useTenorQuotes` quotes each tenor and reads `data.offer` (`apy` / `lqt` in CBPS); a size bigger than the tenor's deepest lender answers 400 `INSUFFICIENT_DEPTH` (one loan = one lender) with a readable message and `error.details` (amounts in tokens, `fit.margin` / `fit.leverage` that fit) — `loopDepthShort` passes them through, `ApiError.details` carries them |
| `loopClose` | `/v1/actions/loop/close` | **`marketUidIn` = COLLATERAL, `marketUidOut` = DEBT** on close; `loanId` for Lista broker debt |
| `spotSwapQuote` | `/v1/actions/swap/spot` | one tx per route in `actions.alternatives`, matched by index to `data.quotes` |
| `xchainSwapQuote` | `/v1/actions/swap/x-chain` | approvals per bridge (`permissions[].spender`) |

Quotes that the UI shows before signing are hooks: `useLoopQuote`,
`useCloseQuote` (`sdk/queries.ts`, `staleTime` 20 s). Execution order is
permissions → transactions → one route (`useLadder.ts`); every sent tx is
followed by `sdk/txTrace.ts`, which re-reads positions/balances only once the
tx is final and the answer has *changed*. A ticket passes the wallet tokens it
moves (`useLadder`'s `watch`: pay asset, both loop legs, the withdrawn token);
after the positions show the change those are read fresh until they move too —
the Solana balance read answers at `finalized`, behind the positions — and what
went up is said under the step (`to your wallet: +0.001484 nOPAL`, a swap's dust).

`ZERO` (`0x000…0`) is the native coin everywhere (`payAsset`, `receiveAsset`,
`tokenIn`, balance reads).

### Rate limits and request budget

- `allocator.api.1delta.io` (the default) carries credits.
  `portal.1delta.io` (public) is ~10 requests / 15 min per IP; the Earn page
  shows a hint when a build is pointed at it.
- `chainBuckets()` groups chains: `1, 8453, 42161, 56, 43114` alone, every
  other chain in one bundled request. New multi-chain queries should use it.
- Filters that are cheap to apply client-side stay out of the request (so they
  are not in the query key). Only `minTvlUsd` and `wideNet` change requests.

### Dollar desks (whose credit)

The US Dollar group is grouped by the collateral's **credit desk**, never by
the debt ([`stablecoin-exposure.md`](stablecoin-exposure.md)). The API serves
the resolved desk where it can — `collateralDesk` / `debtDesk` on optimizer
rows, `asset.desk` + `asset.denomination` on earn rows and on every
`/earn/positions` asset — and `model/desk.ts` falls back to `props.issuer` /
`issuerExposures` and `src/data/desks.json` (`node scripts/desks.mjs`, rebuilt
from token-lists) for an API without them. Rules:

- Group with `model/desk.ts` (`keyOfToken`, `usdKey`), never by symbol.
- Don't trust `props.stablecoin` / `denomination: 'USD'` alone: token-lists
  also stamps it by bare ticker. `isUsd` needs desks.json or a named desk.
- A fund share's money is `props.rwa.denomination` (token-lists sets it only
  where verified on-chain — Nest's vaults on Plume, whose accountants are
  struck in USDC / pUSD). A floating NAV in that money, not a peg; without it
  an nOPAL/pUSD loop is a `price bet`.
- `GET /v1/data/earn/desks` (facet: desk → members, deposit/loop counts,
  rates in percent) and `issuerMatch=credit` exist upstream; the app does not
  call them yet.

## Position index — endpoints used (`src/index/api.ts`)

Plain JSON, no envelope, no key, CORS `*`. Errors are `{ error }` + non-2xx
→ thrown `Error`. Comma-joined CSV for list params.

**Hard rule: never ask the index for the connected user's own positions.**
Those come from `/v1/data/earn/positions` (live). `accountPositions` is for
*other* wallets only.

| Area | Functions → endpoint | Hook(s) in `index/queries.ts` |
|---|---|---|
| Feed | `recentTxs`, `recentEvents` → `GET /events/recent` (`group=tx` folds per tx); `recentTxsIn` → `POST /events/recent` with `{ inMarkets }` (falls back to GET + client filter on 404/405) | `useFeedPage` (refetch 20 s) |
| Wallet | `accountTxs` `/accounts/:a/events`, `accountFlows` `/accounts/:a/flows`, `accountPositions` `/positions/:a` | `useAccountTxs`, `useAccountFlows`, `useIndexPositions` |
| Market | `market` `/markets/:uid`, `marketTxs` `…/events`, `marketHolders` `…/holders`, `marketFlow` `…/flow` | `useMarket`, `useMarketTxs`, `useHolders`, `useMarketFlow` |
| Discovery | `trending` `/trending`, `hot` `/hot`, `protocols` `/protocols`, `issuers` `/issuers`, `leaderboard` `/leaderboard` (may 404 → caller falls back) | `useTrending`, `useHot`, `useProtocols`, `useIssuers`; board in `ui/Board.tsx` |
| Vaults / desks | `vaultsAt` `/vaults`, `curators`, `curator`, `curatorAllocation`, `curatorTxs`, `curatorHolders` `/curators/…`, `curatorsByAccount` `/curators/by-account` | `useVaultsAt`, `useCurator*` |
| Assets | `assets` `/assets`, `asset` `/assets/:group`, `assetHistory`, `assetHolders` (group is case-significant, always `encodeURIComponent`; the book `/assets` and the three `/assets/:group…` calls ask BOTH indexes when the scope spans both VMs and add the answers per group in `index/assetMerge.ts` — a Solana 404 leaves the EVM answer) | `useAssetBook`, `useAsset`, `useAssetHistory`, `useAssetHolders` |
| Search | `find` `/find?q=&kinds=&per=` (one ranked answer per category, capped counts, `best`, `remote: 'pending'` = ask again in ~1.5 s), `findCatalog` `/find/catalog` (the browse kinds whole, ETag'd, searched in the browser with `search/rank.ts` — a copy of pos-indexer's `search.ts`, `pnpm search-rank` checks it), `findClick` `POST /find/click` `{ docId }` | in `ui/Search.tsx` (catalog cached in localStorage) |
| Risk | `stress` `/stress?markets=` | `useStress` |
| Crowns | `crowns` `/crowns?account=` (places 1–3 of the wallet APR board, `scope` `all` or a chain id; EVM index only) | `useCrowns` — the board's Reigning strip and rank; everywhere else crowns arrive as `crown.<scope>.<place>` badges on the profile |
| Health | `health` `/health` | `useIndexHealth` |
| Balances | `indexBalances` → `POST /balances/:account/query` `{ assets: { [chainId]: address[] } }` | `useBalancesPerChain` in **`sdk/queries.ts`** |

Common filters on feed/hot: `chainIds`, `protocols`, `issuers` + `issuerMatch`
(`any` = union), `curator`, `assetGroups`, `follower` + `follow` (following
nobody = **empty**, never global).

### Idle balances: index first, live second

`useBalancesPerChain` (`sdk/queries.ts`) sends one index POST for all settled
chains. A chain is taken from the index only when its `state === 'complete'`
and it is not marked live; otherwise (or for `unknownAssets` / missing
decimals) it reads `/v1/data/token/balances`. A chain is **live** while a
ticket is open on it (`useLiveBalances`) and for 3 min after one of our txs is
final (`balancesChanged`, called only by `txTrace.ts`). See
`src/sdk/liveBalances.ts`.

## Joining the two: market uids

Catalogue rows (1delta API) and index rows join on the **market uid**
`<lender>:<chainId>:<ref>` — the ref lower-cased on EVM chain ids ONLY. Base58
is case-significant: lowering a Solana ref makes a different key and orphans
the market's threads and holders, which is why every address spelling goes
through `model/address.ts` `normAddr` (hex lowered, base58 verbatim). Loops
already carry it
(`marketLongUid` / `marketShortUid`); deposits are rebuilt from
`EarnMarket.ref`, and vaults are `vault.<provider>:<chainId>:<address>`.
All of that is in `src/model/uid.ts` (`uidOf`, `uidsOf`, `parseUid`); the
feed's "Copy" button depends on it via `ui/useMenu.ts`. Social thread keys use
the same uid — except a loop's, which is its own `loop:<collateral uid>|<debt
uid>` (`threadOf` / `loopKey`, tickets/0005). Ask `threadOf` (or
`useThreadOf()`, which knows whether the service takes `strategy` yet) for a
strategy's thread; never build the key at a call site.

Social reads beyond threads and counts: `recentMessages` → `GET
/messages/recent?kinds=&chainIds=&protocols=&before=` (the feed's Talk tab,
`useRecentMessages`), `accountMessages` → `GET /accounts/:a/messages` (a
wallet's "Said", `useAccountMessages`), `latest` → `POST /latest {subjects:
[{kind, key, author}]}` (a feed card's quoted reason, `useLatest`). Thread and
message reads pass `cache: 'no-cache'`: the service sends `max-age`, and a
refetch right after a post otherwise comes back from the browser cache without
the post.

## Recipes

- **New 1delta read:** add `fetchX` to `sdk/api.ts` using `apiFetch`
  (`apiFetchLoose` if the endpoint is known to skip the envelope), its type to
  `sdk/types.ts`, a hook with a stable `queryKey` + `staleTime` to
  `sdk/queries.ts`. Multi-chain → `chainBuckets`.
- **New action:** add a builder with `apiFetchEnvelope<Data, LoopActions>`,
  name params by meaning, and run the result through `useLadder`. Decide what
  the tx `moves` (`'balances' | 'positions'`) so `txTrace` re-reads the right
  thing.
- **New index read:** add a function using `get()` in `index/api.ts`, types in
  `index/types.ts`, a hook in `index/queries.ts` (`retry: false` for
  per-entity pages that can 404).
- **After a tx:** don't invalidate by hand — `txTrace` owns re-reads and
  `balancesChanged`.

## Testing against the APIs

- Don't sweep `portal.1delta.io`; use `allocator.api.1delta.io` or a local
  worker-api (`lending-sdks/packages/worker-api`, `wrangler dev`, no rate limit).
- The index and social services can run locally on `:8090` / `:8091`
  (`pos-indexer`); set `VITE_INDEX_BASE_URL` / `VITE_SOCIAL_BASE_URL`.
- `?as=0x…` in the app URL reads any address without a wallet — a base58
  Solana address works the same (`?as=<pubkey>`).
- The Solana index can be pointed elsewhere with `VITE_SOL_INDEX_BASE_URL`.
