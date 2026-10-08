# Asset pages: one source for what a token is, and the right strategies under it

As of 2026-10-08. Triggered by nOPAL, Hastra AUTO / PRIME and Hylo's tokens:
pages with no description, the Solana half missing, the hold option hidden,
and loops not listed.

## What is wrong today

### Descriptions live in three places, and the page read the wrong one

| Where | What | Who reads it |
|---|---|---|
| token-lists `asset-notes.json` (built from `scripts/notes/notes.json` + derived lines) | 6,235 groups; 110 curated with body, backing, yield source, redemption, links, date, confidence | **nobody** until today |
| yieldcircle `src/model/assets.ts` `BASE` / `DESK` | ~100 one-line `what` strings | menu, desks |
| yieldcircle `src/model/assetNotes.ts` | the nOPAL note written on 2026-10-08 | asset page |

Hastra PRIME already had a curated note in token-lists; the page never showed it.

### An asset page lists only what the menu happened to fetch

"Earn with X" filters the Earn catalogue (`useCatalog`) by group. The catalogue
is built for the Earn menu, not for one asset, so a row is missing whenever:

1. **The loop's collateral carries no archetype tag.** Loops are fetched by tag
   (`LOOP_ARCHETYPES`); a token with no `lst` / `stablecoin` / `savings` /
   `pendle` / `rwa` / `btc` tag is in no request. JLP and Exponent PTs already
   needed one-off requests for this.
2. **The optimizer has no pair at all.** Hastra AUTO (tagged `savings`, so it is not a tag problem): Kamino's AUTO Market has
   $69m of AUTO plus USDC and PYUSD reserves, but `pairs/optimize` answers
   **0 pairs** for AUTO collateral and 0 for the whole lender
   (`KAMINO_Btu8835…`). The app cannot show what the API does not build. PRIME's
   loops (Kamino Figure Market, three Loopscale pairs) do exist and are fetched.
3. **The deposit pays only the token's own yield** (`rate.passthrough`). The
   default earn request leaves these out; only exposure assets ask with
   `passthrough=include`.
4. **The row is filed under the token you put in, not the one you hold.**
   A savings vault that mints nOPAL from USDC is a USDC row. `shareToken` is
   null on every vault row, so the app guesses the share from a build-time map.
5. **The row is unscored, so hidden by default.** `risk-data`'s
   `vault-risks.json` had not been regenerated since the Nest scores were added.
6. **The chain picker scopes it.** The menu only holds the chains in scope; the
   page then says "Nothing in the menu holds X on the chains in scope."

## Target

**Part 1: one source for what a token is.** token-lists `asset-notes.json`,
keyed by asset group, valid on every chain the group lives on. Every surface
reads that file. A note is written in token-lists `scripts/notes/notes.json`
and nowhere else.

**Part 2: an asset page asks for its own strategies.** It does not filter the
menu. It asks the API about this asset across every chain the asset lives on,
and lists:

- the asset's lending and collateral deposits, passthrough included;
- the vaults that **mint** it (savings and LST vaults, matched by share token);
- every loop with it as collateral, untagged collaterals included.

The menu and the page then answer different questions on purpose. The menu
asks "what should I do with my dollars". The page asks "what can I do with
this token".

## Plan

### Part 1: descriptions

| # | Step | Repo | State |
|---|---|---|---|
| 1.1 | yieldcircle reads token-lists `asset-notes.json`: `pnpm notes` copies it to `src/data/asset-notes.json`, and `TokenPage` lazy-loads it (~110 kB gzipped, asset pages only). `model/assetNotes.ts` holds only the type and loader. | yieldcircle | done 2026-10-08 |
| 1.2 | Move the nOPAL note into `notes.json`; add Hastra AUTO and wYLDS, and Hylo hyUSD, eHYUSD (formerly sHYUSD), xSOL, hyloSOL and hyloSOL+. The generator now accepts Solana-only groups (`…::solana`, which only `solana.json` carries); before, it rejected every Hylo group. | token-lists | done 2026-10-08, not committed |
| 1.3 | Fold `BASE.what` / `DESK.what` into curated notes (most are already there, from the same source), and keep `assets.ts` for menu identity only. | yieldcircle + token-lists | next |
| 1.4 | pos-indexer `/assets/:group` (both indexes) and the API earn rows carry `note` from the same file. The bundle copy can then go, and other clients (the 1delta frontend, search) get the same text. | pos-indexer, yield-tracer | later |
| 1.5 | Work the research backlog (`asset-research-backlog.md`) by size, as curated notes. | token-lists | ongoing |

### Part 2: strategies under an asset

| # | Step | Repo | Notes |
|---|---|---|---|
| 2.1 | Name vault shares across all chains, with their group (`strategy-tokens.json` from every chain in `CHAINS`, `shareGroup` = the token-list group). The page lists vaults that mint the token. | yieldcircle | done 2026-10-08 |
| 2.2 | Regenerate `vault-risks.json` so Nest, Hastra, Sanctum and Jupiter savings vaults are scored. Add a CI job for it; there is none, and that is why the scores went stale. | risk-data | regenerated locally; push pending |
| 2.3 | **Per-asset queries on the page** (`useAssetStrategies(group, members)`). One `GET /v1/data/earn?assetGroup=<g>&passthrough=include` (the filter exists and answers for AUTO), plus one `pairs/optimize?collaterals=<member addresses>` per chain from `AssetDetail.members`. Rows go through `classifyEarn` / `classifyPair` as everywhere else, deduped against the catalogue. They are not cut by the menu's floors; a held-back row shows its reason. | yieldcircle | replaces the catalogue filter in `EarnWith` |
| 2.4 | **The API names the share.** `shareToken` (address, symbol, assetGroup) on every vault row, plus a `shareGroup=` filter, so 2.3 asks for "vaults that mint X" too and the build-time map retires. | yield-tracer / worker-api | upstream |
| 2.5 | **Missing pairs.** The optimizer builds no pair for Kamino's AUTO Market (`KAMINO_Btu8835…`, AUTO → USDC / PYUSD). Find why: market config not ingested, the reserve not flagged as collateral, or a liquidity cut. Check every Kamino market with an earn row but no pair. | yield-tracer | upstream bug |
| 2.6 | **Tags.** A token with no archetype prop is in no menu request: Hylo's xSOL (`Hylo Leveraged SOL::xSOL::solana`) carries only `issuer`. Audit groups that have earn rows or pairs but no `lst` / `stablecoin` / `savings` / `pendle` / `rwa` / `btc` prop. (AUTO is tagged `savings`, so its missing loops are 2.5, not this.) | token-lists | upstream |

### Order

2.2 push → 1.2 regenerate → 2.3 (biggest user-visible fix, app only) → 2.5 / 2.4
upstream → 1.3 / 1.4 cleanup.

## Seen on 2026-10-08, after 1.1, 1.2 and 2.1

- AUTO shows its note, the Ethereum Morpho AUTO/USDC loop and the Solana
  savings vault (wYLDS → AUTO). The Kamino AUTO loop is missing because the
  API has no pair for it (2.5).
- hyUSD shows its note, but "Nothing in the menu holds hyUSD". Its rows exist
  in the API (Loopscale, Project 0, Exponent), but none is in the menu's
  requests at the default floors. 2.3 fixes this.

## Check after each step

- nOPAL, AUTO, PRIME, hyUSD and xSOL pages each show a description.
- Each of those pages lists its hold option and every loop the API can build,
  with "All chains" and with Solana alone.
- Each listed row opens its ticket.
