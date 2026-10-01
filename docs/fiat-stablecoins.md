# Multi-fiat stablecoin support (CHF · EUR · JPY · TRY · more)

**Status:** plan — authored 2026-10-01. Crosses three repos: `risk-data` (source of
truth), `token-lists` (the flag the app/backend consume), `yieldcircle` (the app).

## Objective

1. Surface fiat stablecoins — CHF, EUR, JPY, TRY, and the long tail (GBP, AUD, CAD,
   BRL, SEK, …) — as first-class currencies in the yieldcircle app.
2. Close the classification gap: assets recorded as stablecoins in **risk-data** but
   not flagged `props.stablecoin` in **token-lists**, so every consumer gets one
   consistent "is a stablecoin, in what currency" answer.

## The three layers (and where currency is decided)

| Layer | File | What it holds |
|---|---|---|
| **risk-data** (truth) | `data/defillama/stablecoin-quality.json` | 523 stablecoins from DeFiLlama: `symbol`, `pegType` (`peggedUSD`/`peggedEUR`/`peggedCHF`/`peggedJPY`/`peggedTRY`/…), `pegMechanism`, `assetGroup` (only 340 of 523) |
| **risk-data** (own classifier) | `data/asset-risks.json` | per-asset `source: 'stablecoin'` (772 entries / 331 assetGroups) |
| **token-lists** (the flag) | `scripts/stablecoin/stablecoin.ts` → `stablecoin.json` | snapshot keyed by `assetGroup` → `{ base }` (346 groups); `base` is the fiat currency |
| **token-lists** (stamping) | `scripts/generateTokenMap.script.ts:354-357` | `lookupStablecoin(assetGroup)` → `props.stablecoin = { base }` |
| **token-lists** (crypto money) | `scripts/denomination/denominationMap.ts` | `props.denomination` for canonical ETH/BTC/XRP/gas-token bases |
| **yieldcircle** (presentation) | `src/model/assets.ts` | `BASE` (whitelist), `WRAPPER` (wrapper→base), `DENOM`/`denomOf`/`sameMoney` (carry vs price-bet), `GROUPS` (tabs) |

Two facts drive the plan:

- `props.stablecoin.base` **is the fiat currency** (`base: 'CHF'`), and `props.denomination`
  **is the crypto money** (`'ETH'`/`'BTC'`). The app re-derives the same concept in
  `assets.ts` `denomOf`, hand-maintained. These three must agree.
- The app's `AssetRef` already types `props.stablecoin?: { base?: string }`
  (`yieldcircle/src/sdk/types.ts:85`), and the loop optimizer already filters on a
  `stablecoin` debt tag (`yieldcircle/src/sdk/queries.ts`). The plumbing exists; the
  **data is incomplete**.

## The gap (quantified)

**Currency spread in the feed** — 523 stablecoins: `peggedUSD` 434, then 28 other
fiat pegs: EUR 27, VAR 10 (floating, no base), GBP 5, JPY 5, CHF 4, AUD 4, CAD 4,
REAL 4, and 12 more × 1–2 each (CNY, ARS, RUB, MXN, PHP, COP, KRW, SGD, UAH, TRY,
KES, ZAR, NGN, XOF, GHS, CLP, PEN, MYR, HKD).

**Three distinct gaps** between risk-data and the token-lists flag:

1. **No `assetGroup` in the feed** — 183 of 523 rows carry none, so they can never be
   looked up by group. Non-USD offenders include `HCHF` (CHF), `haEUR`/`EURD`/`QEURO`
   (EUR), `RUBT`, `BRTH`, `MYRT`, `KRWQ`, `HKDAP`.
2. **`assetGroup` string fragmentation** — the flag is keyed by the feed's exact
   group string, but the lists generate several group strings per stablecoin
   (name collisions `::chain::N`, PoS bridge variants `(PoS)`, casing, renames,
   `[OLD]`/`previously`, bare-symbol groups). Only the canonical one is flagged.
   Measured flag coverage for the non-USD set:
   - **CHF**: `ZCHF` ×2 variants + `svZCHF` unflagged
   - **EUR**: 17 variants unflagged (`EURC::EURC`, `EURA::EURA`,
     `EURA (previously agEUR)::EURA`, `agEUR::EURA`, `Synth sEUR::sEUR`,
     `STASIS EURS Token::EURS`, `Monerium …::EURe` ×3, `PAR` ×3, `EUROe …::EUROe`,
     `ARYZE eEUR::eEUR`, `AGEUR`, `Test EURS::EURS`)
   - **JPY**: `Celo Japanese Yen::cJPY`, `Prepaid JPY Coin::JPYC`, bare `JPYC`
   - **GBP**: `TrueGBP::TGBP`, `ARYZE eGBP::eGBP`
   - **AUD/CAD/REAL**: one variant each (`Australian Digital Dollar::AUDD`,
     `CAD Coin (PoS)::CADC`, `Brazilian real::wBRL`)
   - **TRY/SEK**: fully flagged (`TRYB`, `SEKAU`)
3. **risk-data's own `source: 'stablecoin'` misses** — 7 assetGroups in
   `asset-risks.json` not in the flag, notably `JPY Coin::JPYC::137::0` (JPY on
   Polygon, a collision suffix), plus test tokens (`MetaMask USD (Test)::mUSD`)
   that should be excluded, not flagged.

The root cause is architectural: the flag is matched by **exact `assetGroup`
string**, which fragments under the lists' collision/rename resolution. The
`STABLECOIN_MANUAL` overlay already patches this one casing at a time (the TGBP
`::chain::0` entries, CHFAU, SEKAU, BRLA) — the plan generalizes it.

## Candidate inventory (all already in the lists)

| Currency | Stablecoins present in token-lists | Flag today |
|---|---|---|
| CHF | ZCHF, VCHF, DCHF, CHFm, CHFAU, svZCHF | partial (ZCHF variants + svZCHF missing) |
| EUR | 24 (EURC, EURCV, EURA, sEUR, EURS, EURE, EURAU, EURI, EURW, EUROP, PAR, EURm, EUROe, EURO3, EURT, IBEUR, eEUR, AEUR, VEUR, EURR, EURQ, REUR, dEURO, agEUR) | partial (17 variants missing) |
| JPY | GYEN, CJPY, JPYC, JPYm, JPYSC | partial (3 variants missing) |
| TRY | TRYB | complete |
| GBP | TGBP, VGBP, GBPA, GBPm, eGBP | partial (2 missing) |
| AUD | AUDD, AUDF, AUDM, cAUD | partial (1 missing) |
| CAD | CADD, QCAD, CADC, cCAD | partial (1 missing) |
| BRL/REAL | BRLA, cREAL, WBRL | partial (1 missing) |
| SEK | SEKAU | complete |

Absent entirely from the lists (would need on-chain discovery, not just a flag):
`HCHF` (CHF), `haEUR`/`EURD`/`QEURO` (EUR), `CADm`, `BRLm`, `BRTH`.

## Workstreams

### Phase 1 — token-lists: make `props.stablecoin.base` complete (source: risk-data)

1. **Fix the matching, don't add entries one at a time.** Stamp by **symbol**, not
   exact `assetGroup`: build the snapshot's symbol→`{base}` from the feed's
   `symbol` field (plus the manual overlay), and have `lookupStablecoin` fall back
   to symbol when the group string misses. This collapses the entire
   fragment/rename/collision class in one move instead of hand-patching every
   variant (the current `STABLECOIN_MANUAL` approach).
   - Symbol is not perfectly unique (`EURR` = StablR *and* Revolut Euro; `PAR` =
     Parallel). Resolve by **feed `assetGroup` first, symbol as fallback**, with a
     small curated disambiguation table for the two–three collisions.
2. **Backfill feed rows with no `assetGroup`** as manual overlays keyed by symbol
   (`HCHF`→CHF, `haEUR`/`EURD`/`QEURO`→EUR, and the USD-less long tail), so they
   flag if/when the tokens enter the lists.
3. **Exclude test/prepaid tokens** (`MetaMask USD (Test)::mUSD`, `Test EURS::EURS`,
   `Prepaid JPY Coin::JPYC`) so the flag is never stamped on a testnet asset.
4. **Reconciliation gate (test, not manual):** a CI check asserting every
   risk-data fiat stablecoin whose tokens exist in the lists is flagged with the
   correct `base`, and every flagged group has a non-empty `base`. This is the
   permanent guard against re-drift; the `stablecoin.json` snapshot stays a build
   artifact.

### Phase 2 — backend: price + tag (the hard dependency)

The app prices everything in USD (`netUsd`, health factor). A stablecoin with no
USD price renders zero, not "approximately right". Verify per surfaced currency:

- **CHF** — already priced end-to-end (`svZCHF` shows a USD net in the app today;
  Frankencoin ZCHF has a full data-layer integration in `abis`/`margin-fetcher`).
- **EUR** — EURC/EURCV already priced; confirm the rest (EURA, EURI, EURT, …).
- **JPY / TRY / AUD / CAD / BRL / SEK** — check each token has a USD price and a
  tracked earn/lending market; these are the ones most likely to need a price
  source. The `stablecoin` debt tag must flow into the loop optimizer (already
  wired via `debtTags=stablecoin`; the tag comes from `props.stablecoin`).
- Yield-bearing wrappers (`svZCHF`, `sEUR`, `sDAI`-style) must resolve to their
  stablecoin base via `props.savings.base` / `props.stablecoin.base` so a loop on
  `svZCHF` is classified as CHF, not "unknown".

### Phase 3 — yieldcircle app: currency dimension in `src/model/assets.ts`

1. **Extend the denomination vocabulary.** Add `DENOM` entries
   (`ZCHF:'chf'`, `JPYC:'jpy'`, `GYEN:'jpy'`, `TRYB:'try'`, `TGBP:'gbp'`, …) and,
   for any currency getting a tab, a new `GroupId` + `GROUPS` entry. Otherwise
   fold into `MORE` (the current euro/gold pattern) — `Denomination` already ends
   in `| string`, so this is type-safe.
2. **Whitelist the base assets** in `BASE` (symbol → group/`what`/color) and the
   yield-bearing forms in `WRAPPER` (`SVZCHF→ZCHF`, `SEUR→EUR`, …) so positions
   stop rendering raw/unmapped (today `svZCHF` shows as the bare ticker).
3. **Decide tabs vs. drawer.** Recommendation: keep the `MORE` drawer for the long
   tail; add a dedicated tab only for a currency with real volume (EUR and CHF are
   the candidates). The `DENOM` entries are what matter for carry classification,
   not the tab.
4. **Regenerate icons** via `scripts/logos.mjs` (icons are derived from
   `BASE`+`WRAPPER`, so no hand-curation).

### Phase 4 — acceptance / verification

Per currency, prove:

- a position/loop denominated in that currency renders with the right `denomOf`
  and a correct USD net (not zero);
- a same-currency loop (`svZCHF`/ZCHF) classifies as **carry**; a cross-currency
  pair (`sAVAX`/EURC) classifies as a **price bet** (`sameMoney` false);
- the reconciliation gate (Phase 1.4) passes and stays green on the next feed
  refresh.

## Open decisions to confirm before implementation

1. **Which currencies get a tab** vs. live in `MORE` (recommend EUR+CHF tabs, rest
   in the drawer).
2. **Whether to key the flag on symbol** (recommended) or keep the assetGroup-only
   approach with an expanded manual table.
3. **JPY/TRY price sourcing** — if no USD feed exists for a token, do we exclude it
   (recommended) or carry an unpriced row?

## Suggested sequencing

1. Phase 1.1–1.4 (flag completeness) — unblocks everything downstream and is pure
   token-lists.
2. Phase 2 price audit for CHF/EUR (unblocks the two highest-volume currencies).
3. Phase 3 for CHF + EUR (ship first).
4. Phase 2 price audit for JPY/TRY/AUD/CAD/BRL/SEK, then Phase 3 for the long tail.
