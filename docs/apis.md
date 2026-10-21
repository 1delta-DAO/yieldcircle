# APIs — where each call lives and the rules around it

A map for anyone (human or agent) editing code that talks to a backend. The app
has **no backend of its own**; it reads three services:

| Service | Base URL (env) | Default | What for | Client code |
|---|---|---|---|---|
| **1delta API** (worker-api / "allocator") | `VITE_BACKEND_BASE_URL` | `https://allocator.api.1delta.io` | catalogue, the connected user's positions + balances, every transaction built | `src/vendor/allocator/http.ts` → `src/sdk/api.ts` → `src/sdk/queries.ts` |
| **Position index** (`pos-indexer`) | `VITE_INDEX_BASE_URL` | `https://positions.1delta.io` | other wallets, feed, markets, hot/trending, board, curators, assets, idle-balance snapshots — the EVM chains | `src/index/api.ts` → `src/index/queries.ts` |
| **Solana position index** (`pos-indexer/apps/sol-indexer`) | `VITE_SOL_INDEX_BASE_URL` | `https://sol-positions.1delta.io` | the same ledger questions for `solana`, a separate service until the merge ([`solana.md`](solana.md)) | `src/index/api.ts` routes to it by chain / address shape / uid; it must answer the EVM index's shapes — no adapter here |
| **Social service** (`pos-indexer/packages/social`) | `VITE_SOCIAL_BASE_URL` | `https://social.1delta.io` | threads, profiles, follows, ratings (EIP-712 signed writes); the **paper ledger** under `/paper/*` | `src/social/api.ts` → `src/social/queries.ts` (see [`social.md`](social.md)); paper: `src/social/paperApi.ts` (tickets/0006) |

All base URLs are resolved in `src/config/backend.ts`. Vite bakes them in at
**build** time.

**Rates are APR, and the UI says APR.** Every backend rate (`depositApr*`,
`borrowApr*`, `rewardApr*`, `aprTotal`, `intrinsicYield`, the index's `apr*`)
is a nominal, simple APR in percent, so legs add: base + rewards + intrinsic,
and a loop's net is `dep·L − bor·(L−1)`. APYs would not add. Label every rate
"APR" (or "net yield"); never "APY", and never compound one for display.

**A pair row's legs are already whole.** `depositAprLong` = `depositRateLongLeg` +
`intrinsicYieldLong` + `rewardAprLong`, and `borrowAprShort` has `rewardAprShort`
netted off; the origin's `aprTotal` is exactly `depositAprLong·maxLev −
borrowAprShort·(maxLev−1)` and `aprBase` strips the two reward fields (measured over
every venue 2026-10-21). Never add `rewardAprLong` to `depositAprLong` — that quoted a
Resupply loop at 101 % whose holders earn 46 %. The reward fields only say how much of
the headline is incentives. The convention is shared by credx, allocator, the frontend
and worker-api's own `loopEconomics`, so it is not the backend's to change. A held
position's share comes from the positions route's `aprBreakdown`, at its own leverage.

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
| `fetchEarn` | `GET /v1/data/earn` | `useCatalog` → deposit rows (lending markets + vaults); `useAssetStrategies` → one token's rows for its asset page (`assetGroup=<g>&passthrough=include`, with `pairs/optimize?collaterals=<its addresses>&includeIlliquid=true` per chain) | `chainIds` CSV; `terms: 'digest'` (not `none`, not `full`); pages only while a page is full; worker-api's cron pre-warms these exact params — don't change them casually. The one source for vaults and lending — there is no separate `/v1/data/vaults` fetch. A vault is named from the row's `curator`/`brand`/`name` (unnamed vaults arrive as `USDC · 0x5b8b`; the tail is stripped); `shareToken` (with its `assetGroup` / `logoURI`) is stamped on vault rows by the origin since 2026-10-08 (yield-tracer `stampShareTokens`, deploy pending); where it is absent the share symbol, logo and index group fall back to the build-time token map (`src/data/strategy-tokens.json`, `node scripts/logos.mjs`, every chain in `CHAINS`; a savings vault like Nest's is then filed by its share — `holds: nOPAL`, `shareGroup` = nOPAL's group, listed on that asset page). Missing identity is fixed in the earn row, not with a second fetch. One narrow extra request per **exposure asset** (`EXPOSURE` in `model/assets.ts`, JLP today) on its home chain: `assetSymbol=<sym>&passthrough=include`, because its deposits pay only the token's own yield and are excluded by default. The catalogue asks for those passthrough rows on every chain only behind `Settings.showCollateral` (the `+ collateral only` chip; off by default, not pre-warmed). |
| `fetchEarn` (fixed rate) | `GET /v1/data/earn?includeFixedTerm=true&protocol=MORPHO_MIDNIGHT,TERM_FINANCE` | `useFixedRateCatalog` → the Fixed rate shelf (tickets/0013): Earn's section, a group page's `k=fixed` list, and the maturity of a held book loan (`Holding.bookLoan`, joined by earn uid in `useBook`) | its OWN request, EVM chains in one CSV, `minTvlUsd=0`: the origin lists book loans only when asked, and the pre-warmed default must not change — so `includeFixedTerm` / `protocol` are sent only when set. Not pre-warmed yet. The rows' `termSheet` says "Variable … floating with utilization" and `liquidity` is the borrow side's depth: both are ignored for a book row (`SimpleStrategy.book`); the ticket reads the lend book instead. Empty (rate 0) and matured books stay classified for holders but are not listed (`bookOpen`). |
| `fetchRateHistory` | `POST /v1/data/earn/rate-history` | `useRateHistory` (over `sdk/rateHistoryStore.ts`) → the 30-day line in AssetPage's rate and Earning cells, the ticket's "Last 30 days" block, `30d x%` on the Earn digest, Hot cards, the market header and search; and `steadyRate`, which those lists RANK by | body `{ uids }` (≤ 1000 per request, chunked; a deposit's `earnUid`, a loop's `marketLongUid` + `marketShortUid`). A per-UID cache shared by every surface: only uids not held (or older than 30 min) are queued, and everything asked in one tick goes out as ONE request — a page with list + ticket + header costs one call (origin rebuilds hourly, worker caches 10 min). A failed read backs off 5 min and leaves rows without a line. Points are bps, one time-weighted mean per UTC day; base and rewards apart so the line can be drawn with or without them; a loop nets its legs per day in `model/rateHistory.ts`. |
| `fetchOptimizerPairs` | `GET /v1/data/lending/pairs/optimize` | `useCatalog` → loop rows (`optimizerPages`) | `chainId` for one chain, `chainIds` for several — the catalogue asks **every selected chain in one query per archetype** (not per `chainBuckets()` bucket); a page is at most 100 whatever `count` says, so `optimizerPages` reads page 1, then the rest in parallel from `total` (cap `MAX_PAGES` = 10); archetypes = tag filters; asked with no risk cap / liquidity floor (floors are applied client-side in `model/visibility.ts`); plus one `collaterals=<address>&debtTags=stablecoin` request per exposure asset (JLP carries no tag an archetype matches); each page is retried once on its own (not the whole book), and a page that fails twice is left out — the book is shown `partial` and asked again in 30 s. Every page is its own cached query (`pageQuery`, keyed by the exact request, 10 min), so that re-ask sends only the missing pages — re-reading the whole book every 30 s while one page kept failing is what ran the 500 / 15 min budget into 429s |
| `fetchIrm` | `GET /v1/data/lending/irm` | `useIrm` | **max 8 uids** per call (`IRM_MAX_BATCH`) — 10 returns 500 |
| `fetchLendingBook` | `GET /v1/data/lending/book` | `useLendingBooks` → the dated-loan ticket (Morpho Midnight); `side=lend` → the fixed-rate deposit ticket's rate at size and max (`FixedTicket`); `side=borrow` again → a book loan's early-sale quote (`ManageFixed`) | `marketUid` = the loan token's market; `side=borrow` = the lenders' offers (what a borrower — or a lender selling early — fills), `side=lend` = the borrowers' offers (what a fixed-rate deposit fills); `pricing: 'marginal'` = each level its own lot, so a size pays the assets-weighted mean of the levels it walks (`bookAprAt`). The pairs feed gives a Midnight row only its top of book as `borrowAprShort` (and 0 % + `debtTerms.canOpen: false` on an empty book, which `classifyPair` hides). Each maturity is its own `MORPHO_MIDNIGHT_<id>` market; `foldDates` folds a pair's maturities into one row with `dates` for the ticket's picker. Zero-coupon: the face owed is fixed at the open, repaid 1:1 early (no penalty), liquidatable once past due. |
| `fetchChains` | `GET /v1/data/chains` | `chainsQuery`, `ChainMark` | names + logos |
| `fetchTokenBalances` | `GET /v1/data/token/balances` | `useBalances`, `useBalancesPerChain` (live fallback), `txTrace`, `GetAsset` | single chain only; route answers `max-age=15` → pass `fresh` after a tx |
| `fetchEarnPositions` | `GET /v1/data/earn/positions` | `useEarnPositions`, `txTrace`, `useLiveHintReads` | **the only source for the connected user's positions**; `lenders` / `vaults` narrow a post-tx re-read; always read past the browser cache (`max-age=15`). Another wallet's page reads it too (`useLiveHintReads`), never to show — its legs go to the index as sync hints (`useAccountSync`), so a position the ledger never saw (a Fluid vault NFT) gets read; one read per bucket per wallet per 5 min |
| `fetchOptimizerPairs` (borrow) | `GET /v1/data/lending/pairs/optimize` | `useBorrowOffers` → dollar loans (tickets/0008), read by `model/borrow.ts` (`offersFrom`), never `classifyPair` | one request per collateral family over every chain: `collateralAssetClasses=stocks` (also the catalogue's — it notes every stock token, `noteStock`, and adds their addresses to the balance read), `collateralTags=wnative` / `btc` / `lst,lrt`, all `debtTags=stablecoin`, `sortBy=totalDepositsUsdLong` (a loop's `aprTotal` says nothing about a loan); stocks 5 pages, crypto 3 each. Each family's page 1 is its own query (`borrowBook`), shown while the later pages load; the whole book reads that page through the cache, so the request set is unchanged. A non-dollar take-out (`out=ETH|BTC|MORE` in the route, tickets/0011) adds the same four collateral families against `debtTags=eth,lst,lrt` / `btc` / `wnative`, 2 pages each, asked only once a "Take out" picker names it; a pair with the same money on both legs (wstETH / WETH) is left to the loop catalogue, and every headline, room and pick stays a dollar figure (`out === 'USD'`). `maxLtv` = `ltv` (borrow factor in), liquidation = `collateralFactorLong / borrowFactorShort`; rows on a fixed term, a smart leg, bands, DBR, a Liquity trove or an institutional market are left out (`needsInput`) |
| `lendingRange` | `GET /v1/data/lending/range/deposit-borrow` · `/withdraw-repay` | the borrow ticket's "most you can take" (`depositAmount` → `maxBorrow`) and "by amount"'s floor (`borrowAmount` → `minDeposit`), **for a fresh loan only** | **`marketUidOut` = COLLATERAL, `marketUidIn` = DEBT**; GET needs `account` — never asked for paper; raw in, human + USD out, a one-element array; `collateralModeId` goes back as `modeId`. **GET does not read the account it is given** (measured 2026-10-14 on Aave V3 Ethereum): a wallet with $121m of WETH supplied and one with $36m against $17m owed got the identical answer — the new deposit's alone — and `maxBorrow: 0` for `depositAmount=0`. So the ticket does not ask it for an account that already holds something; the model over every leg the positions route reports is used there instead. Upstream, not yet traced: worker-api `data/routes/range/depositBorrow.ts` sizes off `body.balanceData`, which a GET may never fill |
| `fetchLoopPayAssets` | `GET /v1/actions/loop/leverage/pay-assets` | `useLoopPayAssets` | |
| `bridgeStatus` | `GET /v1/data/bridge/status` | `txTrace` | |

### Action builders (return `actions`, signed by `ui/useLadder.ts`)

| Function | Endpoint | Param mapping |
|---|---|---|
| `earnDeposit` | `/v1/actions/earn/deposit` | `earnUid`, `amount`, `operator`, optional `payAsset`; `slippage` on a booked row (Pendle PT, `SimpleStrategy.booked`, from the capability's `requires`) or with a `payAsset` |
| `midnightSell` | `/v1/actions/midnight/sell` | a Midnight lend position sold BEFORE its date: `lender` = `MORPHO_MIDNIGHT_<id>`, `amount` = FACE units raw (the positions route's `deposits`), `account`. `/earn/withdraw` on a Midnight market only redeems settled units, i.e. after maturity. Term Finance has no early exit (its withdraw is `redeemTermRepoTokens`, after the repurchase window) |
| `earnWithdraw` | `/v1/actions/earn/withdraw` | `receiveAsset = ZERO` unwraps to native; always pass `amount` (`isAll` not honoured everywhere, refused on a booked row); `slippage` on a booked row |
| `loopOpen` | `/v1/actions/loop/leverage` | **`marketUidIn` = DEBT, `marketUidOut` = COLLATERAL** on open; no `payAmount` = a pure leverage step on what the account already holds (a running loop's step up, or a deposit levered in place — `depositsAsLoops`, tickets/0015; `leverage` is ignored on the EVM composer path, `debtAmount` sizes it); `simulate=true` on every build into an account that holds something, or an Aave-type build assumes eMode 0 (`leverage/open.ts:1465`); `termId` for Lista broker debt; `duration` + `durationType` (0 days · 1 weeks · 2 months) **required** on a Loopscale pair (`LoopStrategy.tenors`) — the feed carries no per-tenor rate, so `useTenorQuotes` quotes each tenor and reads `data.offer` (`apy` / `lqt` in CBPS); a size bigger than the tenor's deepest lender answers 400 `INSUFFICIENT_DEPTH` (one loan = one lender) with a readable message and `error.details` (amounts in tokens, `fit.margin` / `fit.leverage` that fit) — `loopDepthShort` passes them through, `ApiError.details` carries them |
| `enableCollateral` | `/v1/actions/lending/enable-collateral` | `marketUid`, `enabled=true`, `operator` (`accountId` = a Gearbox credit account); the first step of a lever or a borrow on a deposit whose `collateralEnabled` is false on an Aave-type pool (`needsCollateralOn`, tickets/0015) — an Aave supply with the flag off stays off through later supplies, and neither the loop nor the borrow build switches it. Euler / Venus / Aave V4 builds do it themselves; Morpho / Lista flags are fixed (the route refuses) |
| `loopClose` | `/v1/actions/loop/close` | **`marketUidIn` = COLLATERAL, `marketUidOut` = DEBT** on close; `loanId` for Lista broker debt |
| `lendingDepositAndBorrow` | `/v1/actions/lending/deposit-and-borrow` | **`marketUid` = COLLATERAL, `debtMarketUid` = DEBT**; `collateralAmount` + `borrowAmount` raw, **neither may be 0** (`ACTION_FAILED: No amount is provided`, measured 2026-10-14) — a one-sided action goes through `lendingAction`; `payAsset` = `nativeAsset` wraps the gas coin into its wrapper's market; `modeId` from the range; `simulate=true` → `data.simulation.pre/post.healthFactor`. **The simulation starts from ZERO when the route cannot read the account** (an Aave loan at health 20.7 simulated as 2.03 for a $244 top-up): with a loan running, trust `post` only when `pre` matches it |
| `lendingWithdrawAndRepay` | `/v1/actions/lending/withdraw-and-repay` | **`marketUid` = DEBT, `collateralMarketUid` = COLLATERAL** — the flip of deposit-and-borrow; a full exit sends `repayMax` (and `withdrawMax` with it), never an amount read off the screen, or interest dust is left; `receiveAsset` = `nativeAsset` unwraps |
| `lendingAction` | `/v1/actions/lending/{deposit,borrow,repay,withdraw}` | one leg: `marketUid` (the collateral market for deposit / withdraw, the debt market for borrow / repay), `amount` raw, `isAll`, `payAsset` / `receiveAsset`, `accountId` |
| `spotSwapQuote` | `/v1/actions/swap/spot` | one tx per route in `actions.alternatives`, matched by index to `data.quotes` |
| `xchainSwapQuote` | `/v1/actions/swap/x-chain` | approvals per bridge (`permissions[].spender`); `destinationGas` (a decimal of the destination gas coin, `auto` on Solana) only when the receiver lacks gas there (`model/destGas.ts`) — each route then carries `destinationGas`, and a `gas-leg` one a second `transaction` sent after the bridge; a Solana origin quoted without `account` for paper (the builders read the sender on chain) |

Quotes that the UI shows before signing are hooks: `useLoopQuote`,
`useCloseQuote` (`sdk/queries.ts`, `staleTime` 20 s). Execution order is
permissions → transactions → one route (`useLadder.ts`); every sent tx is
followed by `sdk/txTrace.ts`, which re-reads positions/balances only once the
tx is final and the answer has *changed*. A ticket passes the wallet tokens it
moves (`useLadder`'s `watch`: pay asset, both loop legs, the withdrawn token);
after the positions show the change those are read fresh until they move too —
the Solana balance read answers at `finalized`, behind the positions — and what
went up is said under the step (`to your wallet: +0.001484 nOPAL`, a swap's dust).

**Sub-accounts.** Every action on a held position sends its `accountId`
(`Holding.accountId`, `'0'` left unsent) — `earnDeposit` on an Add,
`earnWithdraw`, `loopOpen` on an Add or a leverage step, `loopClose`. Without it
Euler acts on sub-account 0, Fluid / Jupiter Lend refuse a withdraw (or mint a
new position on a deposit), Kamino uses the vanilla obligation. A lending row's
`subAccounts[]` are isolated positions: never summed in a ticket — it picks one
(`Ticket`'s "Which position"). `subAccounts[].unsupported` (a Kamino Multiply
obligation) means the builders refuse it: show it, send the user to the venue.
A plain deposit in a loop's collateral market is offered as a 1× loop in its
own sub-account (`depositsAsLoops`, tickets/0015): the lever sends that
deposit's `accountId`, so Euler's EVC batch enables controller and collateral on
the right sub-account and Fluid acts on that NFT. Dolomite account 0, Solana and
Gearbox are not levered in place (`cannotLeverInPlace`).

`ZERO` (`0x000…0`) is the native coin everywhere (`payAsset`, `receiveAsset`,
`tokenIn`, balance reads).

### Rate limits and request budget

- `allocator.api.1delta.io` (the default) carries credits.
  `portal.1delta.io` (public) is ~10 requests / 15 min per IP; the Earn page
  shows a hint when a build is pointed at it.
- `chainBuckets()` groups chains: `1, 8453, 42161, 56, 43114` alone, every
  other chain in one bundled request. The earn listing and the balance reads
  use it; the optimizer does not (one multi-chain query per archetype, paged).
- **worker-api's cron pre-warms the opening requests** (lending-sdks
  `packages/worker-api/src/scheduled/prewarmListings.ts`): the earn buckets and
  every pair book a first visit asks for (`prewarmBooks` in `sdk/queries.ts`),
  page 1 and the pages its `total` calls for. The cache keys on the exact
  query, so a request that drifts from that list is a cold origin read on every
  visit — the optimizer's entry lives only 6 minutes. After changing a default
  request, run `pnpm prewarm-check` (diffs against a sibling lending-sdks
  checkout) and change the cron with it.
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
| Board | `earners` / `walletEarners` `/earners` (both indexes, merged); `strategyBoard` `/earners?group=strategy` (one row per strategy; an index that does not echo `group` is asked its flat top 200 and folded in `model/boardGroups.ts`, `partial`); `strategyHolders` `/earners?strategyKey=` (one strategy's positions, from its chain's index) — [board-strategies.md](board-strategies.md) | `earnersQuery` (`by: 'strategy' \| 'position' \| 'wallet'`, `strategyKey`), `useEarners` |
| Risk | `stress` `/stress?markets=` | `useStress` |
| Crowns | `crowns` `/crowns?account=` (places 1–3 of the wallet APR board, `scope` `all` or a chain id; EVM index only) | `useCrowns` — the board's Reigning strip and rank; everywhere else crowns arrive as `crown.<scope>.<place>` badges on the profile |
| Health | `health` `/health` | `useIndexHealth` |
| Balances | `indexBalances` → `POST /balances/:account/query` `{ assets: { [chainId]: address[] } }` | `useBalancesPerChain` in **`sdk/queries.ts`**: a first look at once with `[]` per chain (every token held there, no `unknownAssets`), then the settled read with the catalogue's list per chain |

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

## Paper accounts (tickets/0006, pos-indexer tickets/0076)

The whole system, server and app, for agents: pos-indexer `docs/paper.md`.

A paper account is a key pair derived from a name and a password (`wallet/paperKey.ts`) and
connected like a wallet (`wallet/paper.ts`): it signs, it never sends. Its money is a ledger
(`model/paper.ts`) the social service keeps and values; the app holds a cache (`state/Paper.tsx`).

Rules:

- **A paper account never calls an action builder to act, is never read live, and is never sent
  to the index.** `useBook` reads its holdings and idle balances from the ledger
  (`model/paperView.ts`); `useTicketLadder` swaps the signing ladder for `usePaperLadder`; the
  wallet page skips the index sync and the account reads for it.
- **Quotes and every other read stay real**: the catalogue, rate history, `useLoopQuote`,
  `useCloseQuote`, the spot and cross-chain swap quotes (a paper swap or bridge takes the quote's
  output and, for a bridge, its ETA). A paper leverage step asks `/v1/actions/loop/leverage` for
  its entry cost only.
- **Loans on paper** (tickets/0008): ops `borrow` (collateral out of the bank into a `kind: 'borrow'`
  position, the borrowed dollars into the bank; refused past the snap's `maxLtv` and past
  liquidation) and `repay` (the bank pays back, collateral comes home; the collateral only once
  the debt is gone). A loan's basis is collateral less debt, so opening one is no gain or loss.
  Not against a stock: the app's stock prices are not to be trusted yet (tickets/0009 risk 3).
  The server needs the matching `opTokens` / re-rate / liquidity cases (pos-indexer
  `social/src/paper.ts`) — a social deploy before the client sends either op.
- **`model/paper.ts` is the one ledger**, applied by the app and by the server alike; pos-indexer's
  `packages/social/src/paperModel.ts` is a verbatim copy (`pnpm paper-check`, `--write` to copy).
  Change it here, copy it, redeploy social.
- **The server is the truth**: it prices every op with its own feed, re-rates every open from the
  index, refuses value created by any op, and its book replaces the app's after each op.

| Function (`social/paperApi.ts`) | Endpoint | Hook |
|---|---|---|
| `postPaperOp` | `POST /paper/ops` — a `PaperOp` envelope `{author, op: JSON, nonce, signedAt}` signed EIP-712 by the paper EVM key | `usePaper().act` |
| `paperBook` | `GET /paper/book/:account` | `usePaper` (sync), `usePaperBook` (anyone's, the wallet page) |
| `paperDaily` | `GET /paper/book/:account/daily?days=` | `usePaperDaily` |
| `paperBoard` | `GET /paper/board?sort=return\|apr` | `usePaperBoard` (Board → Paper) |
| `paperPrices` | `GET /paper/prices?t=<chain>:<token>,…` — the service's shared price cache | `usePaperPrices` |

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
