# Icon + metadata housekeeping: one pipeline over token-lists

As of 2026-11-25. Scope: the "secondary" icon mappings and asset metadata that live
in yieldcircle around token-lists (which is the primary source). Not in scope: the
earn catalogue itself, the API layer, or `docs/asset-info-plan.md`'s Part 2 (per-asset
strategies) — this plan is the icon + metadata half.

## What is set up today

Three layers, in order of trust:

1. **Upstream sources of truth** (sibling repos, not committed here).
2. **yieldcircle scripts** that project those into `packages/core/src/data/*.json`.
3. **Hand-curated whitelists** in `packages/core/src/model/*.ts` and two one-off data files.

### Upstream sources

| Repo / API | Files | Holds |
|---|---|---|
| `token-lists` (`~/token-lists`) | per-chain `1.json`, `8453.json`, … | one token entry per chain: `address`, `symbol`, `name`, `assetGroup`, `logoURI`, `props.{issuer,stablecoin,savings,lst,rwa,pendle,…}` |
| `token-lists` (derived, already built there) | `omni-list.json` | **every** token across chains, group-keyed, with the same `props` — the consolidated index |
| | `logos-by-symbol.json` | ticker → one ranked winner `logoURI` over every group |
| | `logos.json` | group → logo |
| | `asset-notes.json` | group → note ("what is this token") |
| | `main-tokens.json` | chainId → the whitelisted "main" addresses |
| | `native-currencies.json` | gas coin per chain |
| | `scripts/stablecoin/stablecoin.json` | assetGroup → `{ base }` |
| | `scripts/logos/logoOverrides.json` | address → `logoURI`; **embeds base64 webp data-URIs** |
| `protocol-icons` (`~/protocol-icons`) | `lender/<slug>.webp` | venue / curator brand marks (corner badge) |
| `asset-icons` (`1delta-DAO/asset-icons`) | `curators/<slug>.webp`, `MIX*.webp`, `stocks/*.webp` | issuer marks, per-pool mixes, stock logos |
| `risk-data` | `vault-risks.json`, `asset-risks.json`, `stablecoin-quality.json` | risk scores, stablecoin classification |
| 1delta earn API | `/v1/data/earn`, `/v1/data/lending/pools` | live strategy tokens (for `strategy-tokens.json`, `fluid-smart.json`) |
| lagoon.finance (undocumented Next routes) | `/api/vaults`, `/api/vault` | Lagoon vault descriptions |
| chainlist.org | — | public RPCs |

### yieldcircle scripts → derived data

| Script (`pnpm …`) | Writes | Source | Consumer |
|---|---|---|---|
| `logos` (`scripts/logos.mjs`) | `logos.json` (14 KB, eager) | `logos-by-symbol.json` + whitelists in `model/assets.ts` | `model/assets.ts` `assetLogo` |
| | `desk-logos.json` (33 KB) | per-chain lists | `model/assets.ts` `deskLogo` |
| | `token-icons.json` (530 KB, lazy) | `logos-by-symbol.json` + `desks.json` | `model/assets.ts` `wideLogo` |
| | `strategy-tokens.json` (123 KB) | 1delta earn API | `model/strategies.ts` |
| `desks` (`scripts/desks.mjs` — **no `pnpm` alias**) | `desks.json` (160 KB) | per-chain lists + `stablecoin.json` | `model/desk.ts` |
| `brand-icons` (`scripts/brand-icons.mjs`) | `brand-icons.json` (5 KB) | `protocol-icons/lender/` | `model/vaultDesk.ts` `brandMark` |
| `notes` (`scripts/notes.mjs`) | `asset-notes.json` (1 MB), `mechanisms.json` (11 KB), `mechanism-of.json` (0.5 KB) | `asset-notes.json` in token-lists | `model/assetNotes.ts`, `model/mechanism.ts` |
| `rpcs` (`scripts/rpcs.mjs`) | `rpcs.json` (6 KB) | chainlist.org + viem | `wallet/evmRpc.ts` |
| `fluid-smart` | `fluid-smart.json` (31 KB) | 1delta pools API | `model/fluidLp.ts` |
| `lagoon` | `lagoon.json` (73 KB) | lagoon.finance API | `model/lagoon.ts` |
| `menu-seed` | `menu-seed.json` (22 KB) | the app's own catalogue | `ui/useMenu.ts` |

### Hand-curated (not generated)

- `model/assets.ts`: `BASE` (~51 entries), `WRAPPER` (~24), `DESK` (~54 rows across USD/ETH/BTC),
  `SYMBOL_DESK` (~21), `DENOM`, `FIAT`, `FIAT_ISSUERS`, `FIAT_REQUESTS`, `EXPOSURE`.
- `model/vaultDesk.ts`: `DESKS` regex→slug table (~22), `HOUSES` (4).
- `model/assetClass.ts`: a verbatim copy of pos-indexer's classifier, checked by `scripts/asset-class.mjs`.
- `data/issuers.json` (823 B): hand-written legal profiles (1 entry: Hastra).
- `data/showcase.json` (3 KB): hand-curated social-proof rows with inline logos.

## What is wrong

1. **The generators re-derive what token-lists already builds.** `omni-list.json` already
   carries every token with `logoURI` and `props.issuer`/`stablecoin`/`savings`/`lst`, yet
   `logos.mjs` and `desks.mjs` walk the raw per-chain lists and re-pick/re-attribute. That is
   where the four icon tables (`logos.json`, `desk-logos.json`, `token-icons.json`,
   `strategy-tokens.json`) and `desks.json` each reimplement a slice of the same walk.

2. **Generators parse TS source.** `literalBody()` in `logos.mjs` parses `model/assets.ts`
   for `const BASE/DESK/WRAPPER/EXPOSURE`, and `positions.ts` for `NATIVE`; `desks.mjs` and
   `logos.mjs` both re-extract `CHAINS` from `packages/app/src/sdk/queries.ts`. The
   `icon-gaps.md` class-A bug (CHAINS came back empty after `queries.ts` moved from
   `packages/web` to `packages/app`) is exactly this coupling biting.

3. **Hand-curated whitelists duplicate token-lists `props`.** `WRAPPER`, `SYMBOL_DESK`,
   `DESK`, and the `what` strings in `BASE`/`DESK` overlap with `props.savings.underlying`,
   `props.lst.asset`, `props.stablecoin.base`, `props.issuer` and the notes.
   `asset-info-plan.md` 1.3 already targets the `what` half; the icon/identity half is the same
   problem.

4. **No CI, and the regen is not one entrypoint.** Each `pnpm …` is run by hand; `desks.mjs`
   is not even aliased (run as `node scripts/desks.mjs`). A stale `desks.json` / `logos.json`
   / `token-icons.json` is invisible until a row shows initials. `docs/asset-info-plan.md` 2.2
   notes the same gap cost stale risk scores in `risk-data`.

5. **`token-icons.json` is 530 KB of client payload** kept out of the main bundle by the
   lazy-load machinery in `model/assets.ts` (`subscribeWideLogos`, `loadWideLogos`, the `cg:`
   prefix fold). It is a full-width table shipped to every client for the long tail; a single
   consolidated index with one code path would be smaller and simpler.

6. **`logoOverrides.json` in token-lists embeds base64 webp data-URIs.** "Which icon" (curation)
   and "the bytes" (an asset to host) are mixed; the file is large and the bytes don't belong in
   JSON.

7. **Two icon homes for the same thing.** `protocol-icons/lender/*` (venue/curator badge) and
   `asset-icons/curators/*` (issuer mark) both answer "whose credit is this", split across two
   repos and two runtime resolvers (`vaultDesk`/`brandMark`/`houseDesk` vs token `logoURI`).

8. **`strategy-tokens.json` still exists** though the API now can stamp `shareToken.logoURI`
   (`asset-info-plan.md` 2.4, deploy pending). It is the one generated file that needs the live
   API rather than token-lists.

## Target

> token-lists is the single source for *what a token is* — identity, logo, issuer, tags.
> yieldcircle ships a thin projection of token-lists' **already-built** indexes; it neither
> re-derives them from raw lists nor keeps a parallel hand-curated whitelist, and it catches
> drift in CI.

Concretely:

- One sync step (`pnpm sync`) that runs logos → desks → brand-icons → notes in order, each reading
  token-lists' emitted indexes, none parsing yieldcircle's own source.
- One icon table (or two: eager subset + lazy wide) with a single resolution path, emitted from
  `logos-by-symbol.json` + `omni-list.json`.
- The hand-curated whitelists shrink to the genuinely-curated residue; everything else derives
  from `props`.
- CI fails when a committed data file is stale (regenerate to temp, diff).

## Plan

### Phase 1 — stop re-deriving; read the index token-lists already builds

| # | Step | Repo | Acceptance |
|---|---|---|---|
| 1.1 | `logos.mjs`: read `logos-by-symbol.json` for the wide table and `omni-list.json` for desk flagships / gas coins / exposure homes, instead of walking per-chain lists. Keep only the projection the app needs (BASE/DESK/WRAPPER subset + desk flagship + wide ticker table). | yieldcircle | `logos.json`, `desk-logos.json`, `token-icons.json` byte-identical to today's (or the diff is only stale rows that come back); no `literalBody` reads of `assets.ts` for logos. |
| 1.2 | `desks.mjs`: read `omni-list.json` (which carries `props.issuer`/`issuerExposures`/`stablecoin`/`savings`/`lst` per currency) instead of re-walking per-chain lists. Keep the same credit-desk resolution (`INSTRUMENT`, fewest-hops, never `savings.underlying`). | yieldcircle | `desks.json` identical; `CHAINS` still taken from `queries.ts` (that is the one list with no upstream home — see 1.3). |
| 1.3 | Stop reading `CHAINS` out of `queries.ts` source in two scripts: export `CHAINS` from `packages/app` as a value both the app and the scripts import (no source-text regex). | yieldcircle | `desks.mjs`/`logos.mjs` import the array; removing/renaming a chain can't silently empty it. |

### Phase 2 — collapse the icon tables

| # | Step | Repo | Acceptance |
|---|---|---|---|
| 2.1 | Merge `logos.json` + `desk-logos.json` + `token-icons.json` into one `icons.json` with shape `{ bySymbol, byDesk }`, still emitted by `logos.mjs`. Keep the eager/lazy split if the wide half stays large, but make it one code path in `model/assets.ts`. | yieldcircle | one generator, one loader; `assetLogo`/`deskLogo`/`wideLogo` collapse into `iconOf`. |
| 2.2 | Drop the `cg:` prefix fold: have token-lists emit the full CoinGecko URL in `logos-by-symbol.json`, and delete `CG`/the fold in `model/assets.ts`. | token-lists, yieldcircle | `token-icons` chunk has no `cg:` keys; `wideLogo` is a direct lookup. |
| 2.3 | Retire `strategy-tokens.json` once the deployed API stamps `shareToken.logoURI` on every vault row (`asset-info-plan.md` 2.4). The build-time map stays only until that deploy is confirmed live. | yieldcircle | `model/strategies.ts` prefers `shareToken.logoURI`; no `chain:ref` map shipped. |

### Phase 3 — make the whitelists data, not source

| # | Step | Repo | Acceptance |
|---|---|---|---|
| 3.1 | `logos.mjs`/`desks.mjs` read the whitelists from a JSON file (a small `assets-whitelist.json` emitted by token-lists, or committed in yieldcircle), never from `literalBody` parsing of `assets.ts`. | yieldcircle | no `literalBody`/`recordKeys` left; the whitelist is editable without touching generator parsing. |
| 3.2 | Fold `BASE.what` / `DESK.what` into token-lists notes (already planned, `asset-info-plan.md` 1.3). | token-lists, yieldcircle | `what` strings removed from `assets.ts`; `whatIs` reads the note. |
| 3.3 | Derive `WRAPPER`, `SYMBOL_DESK`, `EXPOSURE` from `props` (`savings.underlying`, `lst.asset`, `stablecoin.base`, `rwa`, `receipt.underlying`) where token-lists has them; keep only the genuinely-curated residue as an explicit overlay table. | token-lists, yieldcircle | whitelists shrink to a small overlay; the rest comes from `props`. |

### Phase 4 — one home for "whose credit" icons

| # | Step | Repo | Acceptance |
|---|---|---|---|
| 4.1 | Move the `logoOverrides.json` base64 data-URIs into `asset-icons` files and reference them by URL in the override (the same way the curators already do). | token-lists | `logoOverrides.json` holds URLs only; file shrinks to the non-embedded rows. |
| 4.2 | Decide one home for issuer/curator marks — recommend `protocol-icons/lender/` (already the runtime venue-badge source), with `asset-icons/curators/` folded in or kept only as the token-`logoURI` source. Update `brand-icons.mjs`/`vaultDesk.ts` to the one source. | protocol-icons / asset-icons, yieldcircle | one resolver, one badge repo; `brandMark` and the token `logoURI` stop disagreeing on the same issuer. |

### Phase 5 — wire it and gate it

| # | Step | Repo | Acceptance |
|---|---|---|---|
| 5.1 | Add `pnpm desks` and a `pnpm sync` that runs logos → desks → brand-icons → notes in dependency order (logos needs desks.json for the wide table; notes is independent). | yieldcircle | one command refreshes every derived table. |
| 5.2 | Add a CI drift gate: regenerate each derived file to a temp dir and diff against the committed copy; fail on mismatch. Needs the sibling repos checked out (skip when absent, like `scripts/asset-class.mjs`). | yieldcircle | a PR that edits `desks.json`/`logos.json` by hand (not via the script) fails CI; a token-lists change that isn't re-synced fails CI. |
| 5.3 | Move `issuers.json` (legal profiles) and `showcase.json` (social proof) into token-lists' notes/editorial if they are token metadata; otherwise mark them explicitly as editorial content owned by yieldcircle, not derived. Decide per file. | token-lists or yieldcircle | each file has a single clear owner; neither masquerades as generated. |

## Order

1.1–1.3 and 5.1–5.2 are the highest leverage (they remove the re-derivation, the source
parsing, and the invisible-staleness gap in one move). 2.x and 3.x are cleanup that shrinks
payload and code; 4.x and 5.3 are the long tail. Do 1.x and 5.x first; 2.3 rides on the API
deploy in `asset-info-plan.md` 2.4.

## Check after each phase

- `pnpm sync` from a clean token-lists checkout produces `desks.json`, `logos.json`,
  `desk-logos.json`, `token-icons.json`, `brand-icons.json`, `asset-notes.json` that diff clean
  against the committed files.
- CI fails on a hand-edited data file.
- `pnpm build` still green; a spot-check page (a dollar row, an LST, a PT, a Solana token, a
  stock) shows the same mark it does today.
