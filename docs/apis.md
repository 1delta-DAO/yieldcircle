# APIs — where each call lives and the rules around it

A map for anyone (human or agent) editing code that talks to a backend. The app
has **no backend of its own**; it reads three services:

| Service | Base URL (env) | Default | What for | Client code |
|---|---|---|---|---|
| **1delta API** (worker-api / "allocator") | `VITE_BACKEND_BASE_URL` | `https://portal.1delta.io` | catalogue, the connected user's positions + balances, every transaction built | `src/vendor/allocator/http.ts` → `src/sdk/api.ts` → `src/sdk/queries.ts` |
| **Position index** (`pos-indexer`) | `VITE_INDEX_BASE_URL` | `https://positions.1delta.io` | other wallets, feed, markets, hot/trending, board, curators, assets, idle-balance snapshots | `src/index/api.ts` → `src/index/queries.ts` |
| **Social service** (`pos-indexer/packages/social`) | `VITE_SOCIAL_BASE_URL` | `https://social.1delta.io` | threads, profiles, follows, ratings (EIP-712 signed writes) | `src/social/api.ts` → `src/social/queries.ts` (see [`social.md`](social.md)) |

All base URLs are resolved in `src/config/backend.ts`. Vite bakes them in at
**build** time.

## The layering (keep it)

```
config/backend.ts          base URLs, apiHeaders()  (the only auth hook)
vendor/allocator/http.ts   apiFetch / apiFetchEnvelope / apiFetchLoose — envelope, errors, 429 gate
sdk/api.ts                 one function per 1delta endpoint; wire names translated HERE only
index/api.ts               one function per index endpoint (own tiny `get`, no envelope)
sdk/queries.ts             React Query hooks for the 1delta API (+ the index balance POST)
index/queries.ts           React Query hooks for the index
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
- **Every 1delta request goes through `vendor/allocator/http.ts`.** It owns the
  envelope, `ApiError`, and the shared rate-limit gate (one 429 pauses *all*
  requests until `retryAfter`). Never add a key there or in `apiHeaders()` —
  it ships in the bundle; production points `VITE_BACKEND_BASE_URL` at a proxy.
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
| `fetchEarn` | `GET /v1/data/earn` | `useCatalog` → deposit rows | `chainIds` CSV; `terms: 'digest'` (not `none`, not `full`); pages only while a page is full; worker-api's cron pre-warms these exact params — don't change them casually |
| `fetchVaults` | `GET /v1/data/vaults` | `vaultQuery` / `useVaultIndex` | one chain per call, `count: 1000`, `includeExpired`; a decoration — failure must not break the listing |
| `fetchOptimizerPairs` | `GET /v1/data/lending/pairs/optimize` | `useCatalog` → loop rows (`optimizerPages`) | `chainId` for one chain, `chainIds` for several; archetypes = tag filters; asked with no risk cap / liquidity floor (floors are applied client-side in `model/visibility.ts`) |
| `fetchIrm` | `GET /v1/data/lending/irm` | `useIrm` | **max 8 uids** per call (`IRM_MAX_BATCH`) — 10 returns 500 |
| `fetchChains` | `GET /v1/data/chains` | `chainsQuery`, `ChainMark` | names + logos |
| `fetchTokenBalances` | `GET /v1/data/token/balances` | `useBalances`, `useBalancesPerChain` (live fallback), `txTrace`, `GetAsset` | single chain only; route answers `max-age=15` → pass `fresh` after a tx |
| `fetchEarnPositions` | `GET /v1/data/earn/positions` | `useEarnPositions`, `txTrace` | **the only source for the connected user's positions**; `lenders` / `vaults` narrow a post-tx re-read |
| `fetchLoopPayAssets` | `GET /v1/actions/loop/leverage/pay-assets` | `useLoopPayAssets` | |
| `bridgeStatus` | `GET /v1/data/bridge/status` | `txTrace` | |

### Action builders (return `actions`, signed by `ui/useLadder.ts`)

| Function | Endpoint | Param mapping |
|---|---|---|
| `earnDeposit` | `/v1/actions/earn/deposit` | `earnUid`, `amount`, `operator`, optional `payAsset` (+`slippage` only then) |
| `earnWithdraw` | `/v1/actions/earn/withdraw` | `receiveAsset = ZERO` unwraps to native; always pass `amount` (`isAll` not honoured everywhere) |
| `loopOpen` | `/v1/actions/loop/leverage` | **`marketUidIn` = DEBT, `marketUidOut` = COLLATERAL** on open; `termId` for Lista broker debt |
| `loopClose` | `/v1/actions/loop/close` | **`marketUidIn` = COLLATERAL, `marketUidOut` = DEBT** on close; `loanId` for Lista broker debt |
| `spotSwapQuote` | `/v1/actions/swap/spot` | one tx per route in `actions.alternatives`, matched by index to `data.quotes` |
| `xchainSwapQuote` | `/v1/actions/swap/x-chain` | approvals per bridge (`permissions[].spender`) |

Quotes that the UI shows before signing are hooks: `useLoopQuote`,
`useCloseQuote` (`sdk/queries.ts`, `staleTime` 20 s). Execution order is
permissions → transactions → one route (`useLadder.ts`); every sent tx is
followed by `sdk/txTrace.ts`, which re-reads positions/balances only once the
tx is final and the answer has *changed*.

`ZERO` (`0x000…0`) is the native coin everywhere (`payAsset`, `receiveAsset`,
`tokenIn`, balance reads).

### Rate limits and request budget

- `portal.1delta.io` (public default) is ~10 requests / 15 min per IP.
  `allocator.api.1delta.io` (what `.env` uses) carries credits. The Earn page
  shows a hint when a build is on the public endpoint.
- `chainBuckets()` groups chains: `1, 8453, 42161, 56, 43114` alone, every
  other chain in one bundled request. New multi-chain queries should use it.
- Filters that are cheap to apply client-side stay out of the request (so they
  are not in the query key). Only `minTvlUsd` and `wideNet` change requests.

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
| Assets | `assets` `/assets`, `asset` `/assets/:group`, `assetHistory`, `assetHolders` (group is case-significant, always `encodeURIComponent`) | `useAssetBook`, `useAsset`, `useAssetHistory`, `useAssetHolders` |
| Risk | `stress` `/stress?markets=` | `useStress` |
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
`<lender>:<chainId>:<ref>` (ref lower-cased). Loops already carry it
(`marketLongUid` / `marketShortUid`); deposits are rebuilt from
`EarnMarket.ref`, and vaults are `vault.<provider>:<chainId>:<address>`.
All of that is in `src/model/uid.ts` (`uidOf`, `uidsOf`, `parseUid`); the
feed's "Copy" button depends on it via `ui/useMenu.ts`. Social thread keys use
the same uid.

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
- `?as=0x…` in the app URL reads any address without a wallet.
