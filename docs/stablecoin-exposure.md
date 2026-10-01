# Stablecoin exposure — group by whose credit, not by ticker

**Status:** implemented 2026-10-01 (app; token-lists and worker-api changes in their working trees, not yet merged — see *Implementation status* at the end). Authored 2026-10-01. Crosses `token-lists` (issuer data),
`lending-sdks/worker-api` (the 1delta API), `yieldcircle` (the app). Sibling of
[`fiat-stablecoins.md`](fiat-stablecoins.md), which handles the *money* axis
(USD / EUR / CHF); this one handles the *credit* axis inside one money.

## The problem

The Earn page's US Dollar block has one row per stablecoin **ticker** (USDC,
USDT, USDe, DOLA, …). A loop lands on the row of whatever its collateral
*resolves to*, and when the collateral is not on the whitelist it resolves to
**the debt**:

- `baseOfCollateral` (`src/model/assets.ts`) falls back to `baseOfSymbol(debtSymbol)`
  — before the uncommitted diff unconditionally, after it whenever the
  collateral's `savings.base`/`stablecoin.base` is the debt's money. So
  `sUSDf/USDC`, `savUSD/USDC`, `sUSD3/USDC`, `strUSD/USDC` are all **USDC rows**.
- `WRAPPER` maps `SYRUPUSDC → USDC`, `SYRUPUSDT → USDT`, `SUSDC → USDC`: Maple's
  credit is filed under Circle and Tether.
- The PT parse (`"PT reUSD (USDC) …"` → `USDC`) files Re's credit under Circle.
- `positions.ts` does the same for holdings: `baseOfSymbol(coll) ?? baseOfSymbol(debt)`.

Measured on Ethereum (`/pairs/optimize`, `collateralTags=stablecoin,savings,pendle&debtTags=stablecoin`,
100 rows, 2026-10-01): **64 of 100 borrow USDC**. That is why "USDC · 60
strategies · up to 56.69 % · 5.61× loop" — almost none of it is Circle risk.

### Why the debt is not the exposure

A USD stablecoin cannot usefully depeg **upward**, and lending oracles price
stable debt at or below $1 (hard-coded or capped). A loop that borrows USDC
against sUSDe loses money if **Ethena** fails; if Circle fails, the debt gets
cheaper. The debt leg is a **rate** (and liquidity) exposure, not a credit one.
So:

> **A strategy's exposure is its collateral's credit desk. The debt is a detail.**

Plain USDC / USDT / … deposits (lending, curated vaults) stay — they are the
Circle / Tether rows.

## The unit: a desk

A **desk** = the issuer whose solvency, admin and redemption you hold. The
target rows of the US Dollar block are desks, e.g.

| desk (issuer id) | members (any of: base, savings, PT, wrapper) | kind |
|---|---|---|
| Ethena `ethena` | USDe, sUSDe, USDtb, PT-sUSDe, PT-USDe | protocol |
| Sky `sky` | USDS, sUSDS, DAI, sDAI | protocol |
| Frax `frax` | frxUSD, sfrxUSD, FRAX, sFRAX | protocol |
| Inverse `inverse` | DOLA, sDOLA | protocol |
| Maple `maple` | syrupUSDC, syrupUSDT | protocol |
| 3Jane `3jane` | USD3, sUSD3 | protocol |
| Strata (new) | srUSDe, jrUSDe, strUSD | protocol |
| Curve `curve`, Aave `aave`, Avant `avant`, Re `re`, Reservoir, Resolv, infiniFi, Falcon, Usual, … | | protocol |
| Circle `circle`, Tether `tether`, Paxos, PayPal, Ripple, Agora, World Liberty, … | the plain coin | institution |

A row's key is **`denomination:desk`** (`usd:circle`), so Circle's EURC and
Paxos' PAXG never join a dollar row.

### The data already exists

Nothing here needs a new concept upstream — `props.issuer` /
`props.issuerExposures` (token-lists `scripts/issuer/`, 95 desks, see its
README and pos-indexer `docs/issuer-exposure.md`) is exactly this axis:

| surface | carries today (checked 2026-10-01) |
|---|---|
| `/pairs/optimize` | `underlyingInfoLong/Short.asset.props.issuer` + `issuerExposures`; `issuers=` + `issuerMatch=` filter on the collateral |
| `/v1/data/earn` | `asset.issuer` (no exposures seen), and a per-row `exposure` block (the market's / vault's position exposure, often `unavailable`); `issuers=` filter **origin-only** (503 when the origin is down) |
| `/assets/available` | `issuers=` / `issuerMatch=` |
| position index | `/issuers` facet, `issuers=` on feed/hot, `AssetDetail.issuer{,Exposures}` |
| `/earn/positions` | **nothing** — `EarnPositionAsset` is address/symbol/decimals only |

### The resolution rule (one function, used everywhere)

```
creditDesk(token) =
    issuer, unless it is only the wrapper's instrument   // sUSDe → ethena, USDC → circle, srUSDe → strata
 ?? issuerExposures (lowest hops)                       // PT-sUSDe (issuer pendle) → ethena
 ?? unattributed(root symbol)                           // see below — NEVER the debt
```

"Only the instrument" = issuer id in `{pendle, spectra, exponent}`, or the
token carries `props.pendle/spectra/exponent/receipt`. The issuer wins over an
exposure on purpose: Strata's srUSDe is exposed to Ethena, but a tranche is
Strata's product and belongs on Strata's row.

`issuerMatch=any` is the wrong semantics for a list of rows: a PT-sUSDe matches
both `pendle` and `ethena`, so the rows would not partition and counts would
double. The desk view needs **`credit`**: exactly the desk above. The
instrument (`pendle`) is shown as "via Pendle" on the strategy, not as a row.

**Unattributed** collateral gets a pseudo-desk `sym:<ROOT>` (root =
`savings.underlying` ?? `pendle.underlyingAsset` symbol ?? symbol), rendered
under its own ticker with an "issuer unknown" mark. It stays visible and never
silently becomes the debt. Coverage is a data bug to fix (phase 1), not a
reason to hide the row.

## Coverage gaps (measured)

From the 100-row Ethereum sample above, **20 % of loop collateral has no desk**:
`sUSDf` ×5 (Falcon), `savUSD` ×4 (Avant — the `avant` desk exists, these
groups are not mapped), `STRUSD` ×4, `USD3` ×3 (a third group variant; only
`3Jane USD3::USD3` is mapped), `SDOLA` ×2, `SUSDAT` ×2. Earn sample adds
`sUSD3`, `REUSDE` (pos-indexer has a manual override; token-lists does not),
`STRCX`, `SUSDX`. Also unmapped: `avUSD`, `pUSD`, `sGHO`, `jrUSDe`/`srUSDe`.

Same root cause as `fiat-stablecoins.md`'s gap 2: issuer stamping is keyed by
exact `assetGroup` string, which fragments.

## Phases

### Phase 1 — token-lists: complete the desk data

1. Add missing desks/members: `strata` (srUSDe, jrUSDe, strUSD …), `falcon`
   (USDf, sUSDf), `saturn` (USDat, sUSDat), Plume `nest` for pUSD; map
   `avUSD`/`savUSD` → `avant`, `sDOLA` → `inverse`, every `USD3`/`sUSD3`
   group → `3jane`, `sGHO` → `aave`, `REUSDE` → `re` (move pos-indexer's
   override upstream so both consumers agree).
2. Savings wrappers resolve through `props.savings.underlying` the same way PTs
   resolve through `pendle.underlyingAsset` — an `sX` with no explicit entry
   inherits X's desk (`issuer` of the savings token is usually the same desk;
   set it, don't leave it to consumers).
3. Fallback key by **address-resolved group**, then symbol with a
   disambiguation table (`USD3` = 3Jane *and* Reserve's "Web 3 Dollar"; `reUSD`
   = Re *and* Resupply — a ticker is not an identity).
4. **CI gate:** every token that has `stablecoin.base` or `savings.base` and
   appears as a collateral or earn asset in `/meta/lending/complete` must carry a
   desk, or be on an explicit `unattributed-ok` list with a note.

### Phase 2 — 1delta API: serve the desk, not just the raw props

Clients should not re-derive the rule; it belongs where the token map is.

1. **Resolved field on every row** (additive, non-breaking):
   - optimizer row: `collateralDesk` and `debtDesk` →
     `{ id, name, kind, via?: string /* instrument, e.g. pendle */, hops }`;
   - earn row: `asset.desk` (same shape) + `asset.issuerExposures` and
     `asset.denomination` (`USD`/`EUR`/`ETH`/…, from `props.stablecoin.base` /
     `savings.base` / `denomination`) — the app currently cannot tell a USD
     earn asset from its props because the digest row carries none;
   - `/earn/positions`: `issuer`, `desk`, `denomination` on `EarnPositionAsset`.
2. **`issuerMatch=credit`** on `/pairs/optimize`, `/v1/data/earn`,
   `/assets/available`: matches exactly `creditDesk`. This makes `issuers=` a
   partition, which `any` is not.
3. **Desk facet:** `GET /v1/data/earn/desks?denomination=USD&chainIds=…` →
   ```jsonc
   [{ "desk": { "id": "ethena", "name": "Ethena", "kind": "protocol" },
      "denomination": "USD",
      "members": [{ "assetGroup": "USDe", "symbol": "USDe", "role": "base" },
                  { "assetGroup": "…::sUSDe", "symbol": "sUSDe", "role": "savings" }],
      "deposit": { "count": 19, "maxApr": 0.11, "tvlUsd": 4.1e9 },
      "loop":    { "count": 55, "maxNetApr": 0.33, "maxLeverage": 17.6 } }]
   ```
   Same pre-warm treatment as `/v1/data/earn`. This is the "structured" API
   offering: money → desk → strategies, with the debt only inside a loop.
4. **Make `issuers=` work on the edge merge**: stamp `asset.issuer` /
   `desk` on `/pools/latest` + `/vaults` rows from the token map by address, so
   the filter stops being origin-only.
5. Document in the OpenAPI that a stable debt is not an exposure, and that a
   vault's `exposure` block (position exposure) is a disclosure, not its desk.

### Phase 3 — app model (`src/model/`)

The app ships phase 3 against today's props (`creditDesk` computed
client-side from `props.issuer{,Exposures}`); when phase 2 lands, it reads
`collateralDesk` / `asset.desk` instead and the client rule is deleted.

1. **`model/desk.ts` (new):** `creditDesk(assetRef)`, `deskKey(denom, desk)`,
   and a small display registry `DESK` (`id → { name, what, color, flagship
   symbol for the logo }`) — the role `BASE` plays today, keyed by desk.
   Unknown desks render from the API's `name`.
2. **Separate the two questions `baseOfCollateral` mixes:**
   - *what money* (cross-denom carry gate) → `denomOfCollateral`, keeps the
     `savings.base`/`stablecoin.base` logic from the current diff;
   - *whose credit* (the row) → `creditDesk(collateral)`. The debt never enters it.
3. **`strategies.ts`:** add `desk: string` (key) and `deskName` to `Base`.
   - `classifyEarn`: desk from `m.asset`; the `unmapped` gate becomes "no known
     denomination" instead of "not in the whitelist", which lets the Pendle /
     savings rows on `sUSD3`, `REUSDE`, … in under their desk.
   - `classifyPair`: desk from the collateral; keep `asset` as the **funding
     token** (what the ticket pays in), add `debt` desk only for display.
   - `rowKey`, `markPicks`, `capPerAsset`: per `desk`, not per `asset`.
4. **`WRAPPER` shrinks to funding/spelling aliases** (`USDT0`, `USDC.e`, WETH
   …). Remove `SYRUPUSDC/T`, `SUSDC` and the PT `(USDC)` parse as grouping
   inputs — they were the misattributions.
5. **`positions.ts`:** `Holding.desk` from the collateral leg (loops) or the
   asset (deposits); idle balances → the token's own desk (idle USDC → Circle).
   Until `/earn/positions` carries the desk, resolve by `chainId:address` from
   a build-time `src/data/desks.json` emitted by `scripts/logos.mjs` (it already
   walks the token lists), with the catalogue's rows as a runtime fill.
   `AssetBook` → `DeskBook`.

### Phase 4 — UI

1. **Earn, US Dollar block:** one row per desk — `Ethena · USDe, sUSDe,
   PT-sUSDe · 19 venues`, holdings and "up to" per desk. Order: holdings, then
   max rate. Light split by `kind`: **Issued dollars** (institution desks:
   plain deposits — Circle, Tether, Paxos, …) above **Yield desks** (protocol
   desks). Unattributed pseudo-desks last, marked.
2. Strategy lines inside a desk say the debt in words: `sUSDe / USDC loop ·
   borrows USDC`, and a PT says `via Pendle`.
3. **Idle → elsewhere:** idle USDC sits on the Circle row with Circle's
   deposits. Loops on other desks that can be *funded* with USDC (pay-assets)
   are offered as a separate "use your USDC on another desk" line, not counted
   into the Circle row's strategies or rate.
4. `AssetPage` → a desk page (members, strategies, the token page's existing
   `DeskChips` / exposure panel); `Search`, `Positions`, `Ticket`, `useBook`
   switch from `asset` to `desk` for grouping (16 call sites,
   `src/ui/{Earn,Positions,Search,Ticket,AssetPage,useBook}`).

### Phase 5 — same axis for ETH / BTC (done 2026-10-01)

Identical problem: every LST folds into "ETH" today. With the same code: plain
ETH/WETH rows (no issuer — nobody's liability) vs Lido, ether.fi, Renzo, … and
WBTC (BitGo), cbBTC (Coinbase), LBTC (Lombard). Ship USD first; turn on per
group once phase 1 coverage for LST/LRT is checked.

## Risks and edge cases

- **Debt that is not a top-tier fiat stable** (`REUSD`, `USDF`, `crvUSD` debt)
  can be market-priced by the oracle and squeeze upward in a thin market. Keep
  it out of the desk, but show a "debt peg" note when the debt's desk is a
  protocol desk rather than an institution.
- **Multi-desk collateral** (a basket, an LP): `issuerExposures` is a list. The
  row goes to the desk with the lowest hops; ties → pseudo-desk
  `multi:<a+b>`. Rare today (no basket passes `isBasketLong`).
- **Curated vaults**: a USDC MetaMorpho vault is a Circle row by the rule
  (the user deposits USDC and the vault holds Circle-denominated claims), but its
  money sits behind the vault's collateral. Show the row's `exposure` block
  (already in the earn response) as a disclosure on the strategy; do not
  re-file the vault under its collateral desks.
- **Same desk on both legs** (`sUSDe/USDe`): one desk, no ambiguity.

## Acceptance

- Every USD strategy is in exactly one desk row; the sum of per-desk strategy
  counts equals the current USD total (a partition, not a filter).
- No loop with a non-Circle collateral appears under Circle (same for Tether).
- Unattributed share of USD loop collateral reported on the Earn hint and
  driven below 5 % on chains 1 / 8453 / 42161 by phase 1.
- `?as=0x…` with a known sUSDe/USDC loop shows it under Ethena, its idle USDC
  under Circle.
- `pnpm build` passes.

## Order of work

1. App phase 3 + 4 on today's props (fixes the screenshot, no backend wait).
2. token-lists phase 1 in parallel (shrinks the unattributed rows).
3. API phase 2; then delete the client-side rule and the `desks.json` fallback.
4. Phase 5.

## Implementation status (2026-10-01)

**yieldcircle (done, `pnpm build` passes):**

- `src/model/assets.ts` — `DESK` registry (row key = flagship ticker, name,
  kind `issued`/`yield`/`unknown`), `learnDesk` / `learnUnattributed` for
  desks it does not register, `nameOf`; BASE dollars carry their `desk`;
  `syrupUSDC/T` and `sUSDC` removed from `WRAPPER`.
- `src/model/desk.ts` — `creditDesk`, `isUsd`, `usdKey`, `keyOfToken`,
  `noteToken` (the catalogue's keys, for positions read by address).
- `scripts/desks.mjs` → `src/data/desks.json` — `chain:address` → desk id
  (`~ROOT` / `''` when unattributed) for every USD token on an offered chain.
  Re-run after a token-lists regenerate. `scripts/logos.mjs` now also draws
  each desk's icon from its own token (`USD3` is three different coins).
- `strategies.ts` / `positions.ts` — dollar rows key on the collateral's desk;
  any USD debt is accepted (the debt is a rate); an unplaceable collateral
  against a dollar debt is a price bet, never filed under the debt.
- UI — Earn's US Dollar block is banded *Issued dollars · Yield desks · Issuer
  not named*, rows named by desk with the tokens actually offered; desk names
  in the asset page, chips, positions, search and ticket; loops say "via
  Pendle" and, in the explainer, why the debt is not the exposure.

Measured on the chain 1 + Base listings: Maple now holds 17 loops that were
USDC/USDT rows; the Circle row is 306 deposits + 6 loops whose collateral IS
USDC.

**`props.stablecoin` is not trusted alone.** token-lists 100ace1 stamps it by
bare ticker as a fallback (`stablecoin-symbols.json`), which tags ~600
non-dollars (Ethernity ERN, Hacken HAI, a DefiAi `DAI` …). `desks.mjs` only
takes it when the group/address is in the group-keyed `stablecoin.json` or a
desk is named; `isUsd` takes it from a row only with an issuer. Fix upstream:
restrict the symbol fallback (e.g. require the feed row's name to match).

**token-lists (working tree):** desks `falcon`, `saturn`, `strata`, `tori`,
`stables-labs`, `axis`, `openeden`, `overnight`, `synthetix`, `angle`; avUSD /
savUSD, sDOLA, sGho, sYUSD, 3Jane USD3/sUSD3, REUSDE / stUSR / sreUSD (moved
from pos-indexer's overrides), pUSD → `nest`; generic savings inheritance
(never through an institution's dollar); `npm run issuer:check` with an
allowlist that can only shrink.

**worker-api (working tree, branch `solana`; tsc clean, desk tests pass):**
`CreditDesk { id, name, kind?, via?, hops }` on optimizer rows
(`collateralDesk`/`debtDesk`), earn `asset` (`desk`, `denomination`,
`issuer`, `issuerExposures`, stamped on origin and merge paths), every
`/earn/positions` asset, and `/token/available`; `issuerMatch=credit` on
optimize / earn / token-available; `GET /v1/data/earn/desks` (rates in
percent, not fractions; `partial` when a source failed or a cap hit).
Round 2: `credit` (and `collateralDesk`/`debtDesk`, pool `desk`) on
`/lending/pairs`, `/pairs/leverage`, `/lending/pools` via a bounded page walk
(`truncated`, `total: null`); `/earn/desks?denomination=ETH|BTC` (plain
ETH/WETH under `plain:ETH`; a loop counts only when both legs are the same
money); `props.stablecoin` trusted only with an issuer or when token-lists'
group-keyed `stablecoin.json` names the token; shared types in margin-fetcher
(`CreditDesk`, `AssetIssuerAttribution`); no `/earn/desks` pre-warm.

**Phase 5 (app, 2026-10-01):** the Ether and Bitcoin groups read by desk too.
`DESK` is per money (`USD` / `ETH` / `BTC` — Coinbase is cbETH in one and cbBTC
in the other); `moneyOf` / `deskKey` in `model/desk.ts` replace the dollar-only
`isUsd` / `usdKey`; `desks.json` carries `eth` and `btc` tables. Plain ETH/WETH
are the `Ether` row (kind `plain`, nobody's liability); wstETH/WETH loops sit on
Lido, LBTC/WBTC on Lombard. A staking or savings vault (`vault.lst`,
`vault.savings`) sits on its SHARE token's desk — staking ETH with Ankr is
Ankr's credit, syrupUSDC deposits are Maple's — while a curated vault keeps its
deposit token's desk. Earn bands: *Ether · Staking & restaking ·
Exchange-staked* and *Custodied bitcoin · Protocol bitcoin*, each with *Issuer
not named*. `More` (BNB, AVAX, HYPE, …) is unchanged.

**token-lists round 2 (working tree, 2026-10-01):** the ticker fallback now
needs identity evidence (an address the feed lists for that ticker, or a name
the real coin is known under), and the generator drops stale `stablecoin` /
`issuer` / `issuerExposures` from the reused published lists before the
overlays run — so a wrong tag can now go away. Tagged stablecoins 2187 → 1738
(ERN, HAI, GAI, MOD, MUST, DefiAi DAI … gone; EURC/EURA/JPYC/TGBP variants
kept). ~280 dollar groups attributed (Apyx, Neutrl, Noon, Pareto, Parallel,
Metronome, USDD, Origin, K3 sBOLD, Maple syrupUSDG, USDbC → circle, …) and
the ETH/BTC wrappers (Threshold, Function FBTC, Ava Labs BTC.b, Solv, Origin
OETH, YieldNest, Dinero, …), each with a money (`denomination` / `lst.asset`).
Checks: `issuer:check` (350 dollar tokens without a desk, all allowlisted with a
reason) and `issuer:check:eth-btc` (only plain ETH/WETH and the mixed `BTC`
group lack one), both in `.github/workflows/issuer-check.yml`, outside the
auto-generate job. After it lands, re-run `node scripts/desks.mjs` and
`node scripts/logos.mjs` here.

**token-lists round 3 (working tree, 2026-10-01):** the not-yet-curated dollar
allowlist is gone (222 → 71 entries, each with a specific reason); mixed groups
split by address through `ISSUER_BY_ADDRESS` (BUSD paxos/binance, TUSD
techteryx, eUSD lybra/telcoin, USDV, USDA, USDB, bridged PYUSD/USD1 on
Arbitrum), the mixed `BTC` group split (Ava Labs BTC.b, Symbiosis syBTC).
Open: dead-bridge and fork copies, unverifiable bridge routes, a handful of
unidentified tickers, and a few NON-stablecoins the stablecoin overlay still
tags (`HOME`, `NECT` on Berachain, `NEX`, Starbase `STAR`). pos-indexer
migration `0047_issuer_overrides_upstreamed.sql` removes the three seeded
overrides. In the app's live sample no dollar row is left under *Issuer not
named*.
