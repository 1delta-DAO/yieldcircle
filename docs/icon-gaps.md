# Icon gaps — earn catalogue (2026-11-07)

How it was measured: all 2,699 earn rows (16 chains plus the fixed-rate shelf) went through `classifyEarn` and
the app's own icon resolution: `Tok` (`s.logo`, then `assetLogo(holds)`) for the token mark and
`venueIconUrls` for the corner badge. Each candidate URL was checked against the local protocol-icons and
asset-icons checkouts, or fetched.

| | before | after |
|---|---|---|
| rows with no picture of their own (initials disc) | 494 | 161 |
| …of those, still blank after the deposit-coin fallback | 494 | 4 |
| rows with no venue badge (letters) | 235 | 50 (17 are `Native`, by design) |

## What was missing, and why

| class | rows | cause | fix |
|---|---|---|---|
| A. token-lists had the share logo | 27 | `scripts/logos.mjs`, `desks.mjs` and `rpcs.mjs` still read `packages/web/src/sdk/queries.ts`, which moved to `packages/app`. Their CHAINS list came back empty, so `strategy-tokens.json` stopped refreshing on 2026-10-25 | path fixed; the earn read now asks `maxRiskScore=6`, the API ceiling (it asked 5); re-run: 97 new strategy tokens |
| B/C. the icon set had the brand mark, the app didn't ask for it | 56 | `vaultDesk` only knew a hand-kept list of 20 desks | `brandMark()` in `model/vaultDesk.ts`: any curator or issuer whose slug is in `data/brand-icons.json` (built by `pnpm brand-icons` from protocol-icons `lender/`, instance files left out) |
| D. only the index had the curator's logo (Yearn, Clearstar, KPK, 9Summits…) | 176 | not in the icon set | mirrored into protocol-icons `lender/<slug>.webp`; `vault.yearn` and `vault.termmax` added to `HOUSES` and to the badge `FAMILY` |
| E. in token-lists with no icon anywhere (Mezzanine's msHastra/mjHastra, Concrete, Superform, Liminal…) | 25 | issuer had never been given a mark | issuer mark in asset-icons `curators/`, `logoURI` in token-lists (plus `logoOverrides.json`) |
| F. share token not in token-lists (uncurated Euler Earn and Morpho vaults, kvaults, `Native`) | 210 | no token record, no curator | `StratMark` now falls back to the deposit coin (`fallback={s.tokenLogo}`), with the venue badge on it. That is what Lite already shows first |

## Changes by repo (nothing committed)

- **protocol-icons**: 84 new `lender/*.webp` (150 px, circular, cropped with the repo's own `circularCropIcon`).
  Sources: the index's curator `logoUri` (mostly cdn.morpho.org) and DefiLlama protocol icons. Mezzanine is
  DefiLlama's, the gold pillar. Not added because the match was doubtful: Phantom (DefiLlama's "Phantom
  Finance" is another project), Alpha, Everything, Phase, STKE, Nest (DefiLlama's "nest" is a DEX, not Plume's Nest).
- **asset-icons**: 11 issuer marks in `curators/` (128 px): mezzanine, concrete, superform, liminal, perena,
  jarvis, ember, syntropia, ipor-fusion, jusd-finance, makina.
- **token-lists**: `logoURI` on 22 tokens across chains 1, 8453, 42161, 999 and solana, each mirrored in
  `scripts/logos/logoOverrides.json` so a regenerate keeps it. Mezzanine: msHastra, mjHastra, msPRIME, mjPRIME, and both
  MZUSD tokens.
- **yieldcircle**: the script paths, `scripts/brand-icons.mjs` + `data/brand-icons.json`, `brandMark`,
  `HOUSES`/`FAMILY`, the `Tok`/`StratMark` `fallback`, refreshed `strategy-tokens.json` / `logos.json` /
  `token-icons.json`.

The icons load from `raw.githubusercontent.com/1delta-DAO/*/main`, so nothing new appears until protocol-icons
and asset-icons are pushed. Rows that take `shareToken.logoURI` from the API need token-lists deployed
to the backend as well. `strategy-tokens.json` already covers them in the meantime.

## Still open

- **No badge (33 rows, excluding `Native`)**: Nest (18), Bitway (5), Tokemak (3), and USD.AI, YieldPoint and a few
  Solana LSTs (DeFi Development, SolBlaze, STKE, Phantom, Phase). None of them has a usable icon on DefiLlama or
  the index; they need one sourced by hand.
- **Deposit-coin fallback only (161 rows)**: uncurated Euler Earn (45, 19 of them branded "My"), uncurated
  Morpho (17), Kamino kvaults whose name places no curator (13), `Native` savings (17), plus
  curators without a mark: Murmurr, TelosC, CurveYield, σ-Labs, MS, Utorg, Aerie, Hackarrot, VOLTA90, Warren,
  Parity High, Chaos Labs. Clearstar Labs could reuse `clearstar.webp` through an alias.
- yvFlexUSDC / yvFlexWETH: nothing at all (no share token, and the listing sends no asset logo).
- The CoinGecko contract lookup for class E returned 404 for every token it tried before the rate limit hit,
  so it is not a source for these vault shares.
