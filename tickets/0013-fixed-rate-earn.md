# 0013 — Fixed-rate deposits: lend on Morpho Midnight and Jupiter Offerbook

- status: **Midnight + Term Finance built, 2026-10-20** (phases 0–4 below, uncommitted). Offerbook (phases 5–6)
  waits for B1/B3/B4 upstream. Social needs a redeploy for the paper change (`paperModel.ts` copied to pos-indexer).
- area: `src/sdk/api.ts`, `src/sdk/types.ts`, `src/sdk/queries.ts`, `src/model/strategies.ts`,
  `src/model/visibility.ts`, `src/model/positions.ts`, `src/model/paper.ts`, `src/ui/paperPlans.ts`,
  `src/ui/Ticket.tsx`, `src/ui/bits.tsx`, `src/model/uid.ts`; upstream: yield-tracer, lending-sdks
  (margin-fetcher, worker-api, calldata-sdk-sol), pos-indexer (`social/src/paperRates.ts`)
- depends on: yield-tracer `/earn/latest` `includeFixedTerm` (live in prod, checked 2026-10-20:
  `excluded.fixedTerm` = 269 on Solana Offerbook); worker-api forwards it (`data/routes/earn.ts:1106-1142`,
  commit `eeebcf0f`). Offerbook lending needs upstream builders that **do not exist yet** (§B4).

## The idea in one paragraph

The origin now lists fixed-yield rows (Morpho Midnight, Term Finance, TermMax, Loopscale, Jupiter Offerbook)
only on request (`includeFixedTerm=true`), labels them `rate.kind: "fixed-term"` and gives each dated row a
top-level `maturity` (`fixed-date`, `maturityIso`). The app never asks for them: `fetchEarn` builds a fixed
param list (`api.ts:51-65`). This ticket adds a **Fixed rate** shelf: a lender locks a rate to a date by
filling a borrower's offer. Midnight first (EVM, builders exist: deposit = *take* the ask side, withdraw =
*sell*); Jupiter Offerbook second (Solana, data only today); Term / TermMax / Loopscale lending rows out of
scope (§7).

## What the API gives us today (measured 2026-10-20)

| | Morpho Midnight (1, 8453) | Jupiter Offerbook (solana) |
|---|---|---|
| Rows on `/v1/data/earn?includeFixedTerm=true` | Base 20 (origin 49; worker drops 29 as `unrealizable`); chain 1: 99 at the origin | 200+ (origin 233) |
| Rows with a rate > 0 | **1 on Base, 0 on chain 1** — empty ask sides (see yield-tracer memory "Midnight supply_ladder gap") | **1 of 233** |
| `maturity` | `fixed-date` on every row | none — the book is **tenors** (1d / 2d / 3d / 7d), not dates |
| Collateral legs | hidden (`excluded.collateralLeg`: Base 103, chain 1 211) | **not hidden** — ~half the rows are `KLED / USDC` with asset KLED, rate 0 (§B1) |
| Matured rows | **still listed** (`cbBTC-USDC 92 2026-07-31`, `secondsToMaturity: 0`) (§B2) | n/a |
| `capabilities` | `deposit` + `withdraw` | `[]` → `canDeposit=false` → `classifyEarn` says `closed` |
| Deposit builder | `/v1/actions/earn/deposit` → `/lending/deposit` → `buildMidnightDeposit` (takes `lendOffers` best-first; slippage param exists) | none — `loopActionSupport.ts:453-460` "Data only"; `svmBuildable.ts:383-403` unbuildable |
| Exit before maturity | `withdraw` = `buildMidnightSell` | none |
| Lend-side book | `/v1/data/lending/book?side=lend` | same route, `side=lend` = borrowers' offers net ×0.9; levels carry `termId`, `ltv`, `minFill`, `expiresAt` |
| Make (own limit offer) | `/v1/actions/midnight/make` + `/finalize` (EIP-712) | none |

## Done (2026-10-20) — what changed against the plan

- **§0 answers.** (1) Base: 6 Midnight books with a live offer (not 1; four are unnamed markets, `USDC · 0x6CB9`),
  chain 1: none. (2) The deposit builds unsigned with no `slippage`. (3) `/earn/positions` returns the Midnight supply
  leg with its earn uid (`0x7016…dfce7`, $302 face) — B5 is not a blocker. **But `/earn/withdraw` is NOT the sale**: it
  routes to `buildMidnightWithdraw` (redeem settled units, after maturity). The early exit is
  `/v1/actions/midnight/sell` (`lender`, `amount` = face units, `account`) — now `midnightSell` in `api.ts`.
  (4) `side=lend` answers; Dec-25 cbBTC book: one $300 offer at 3.62 %.
- **Term Finance is in** (the plan had it out as "an auction bid"): its deposit builds instantly
  (`swapExactPurchaseForRepo`), its lend book has ~$95k at 6.5–9 %, positions read the repo token. No early exit —
  withdraw is `redeemTermRepoTokens`, after the repurchase window — so the ticket says "locked" and Manage is disabled
  before the date.
- **Shelf** = a `Fixed rate` segment on a group page (`k=fixed`) + a `Fixed rate` section on Earn; `useFixedRateCatalog`
  (own request, EVM only). No `no-offer` HideCode: empty/matured books stay classified (a holder needs the row) and
  `bookOpen` filters them; the shelf counts them as `idle`.
- **Tickets:** `FixedTicket` (date picker, rate at size off the lend book, cap at book depth, face back on the date),
  `ManageFixed` (sale quote off the borrow book before maturity, redeem after, Term locked).
- **Paper:** `rateKind: 'fixed'` snaps keep their rate and stop accruing at maturity (`paper.ts`, copied to pos-indexer).
- **Leverage:** Midnight debt was already in loops (`dueAt`). Term-debt loops stay `brokered`: open builds natively but
  failed on every try (`Pendle markets lookup failed (HTTP 429)`, PT-reUSD: "No Blue Sheets strategy holds repo token"),
  and close is not a loop (withdraw-and-repay, i.e. USDC from the wallet). Offerbook: no builders.
- Open: pre-warm the shelf's URL in `prewarmListings.ts`; unnamed Midnight markets need their collateral in the earn
  row's `name`; the earn digest's "Variable … floating with utilization" for book rows is wrong upstream.

## B. Upstream prerequisites (not in this repo)

Each is a silent wrong row if skipped, so the app phase that needs it waits for it.

1. **Offerbook collateral legs (yield-tracer + margin-fetcher).** `ORDERBOOK_COLLATERAL_LEG` (yield-tracer
   `src/utils/getLenders.ts`) and `isOrderBookCollateralLeg` (margin-fetcher `earn/fromPool.ts:179-189`) know only
   Midnight's `-c<i>` suffix. An Offerbook row whose asset is not the principal mint (the first mint in
   `JUPITER_OFFERBOOK_<principal>_<collateral>`) is a collateral leg. Extend both, keep the yield-tracer drift
   test (`test/earn-fixed-term.test.ts`) green. Needed by phase 4.
2. **Matured fixed-term lending rows (yield-tracer).** `MATURED` filters on `v_earn_latest.expiry`, which is
   `NULL` on every lending arm, so a Midnight book past its date stays listed. Fill `expiry` on the lending arm
   from `morpho_markets.fixed_term->>'maturity'` (`CREATE OR REPLACE VIEW`: same column, same type; regenerate the
   body from `pg_get_viewdef`, never by hand — yield-tracer CLAUDE.md). Needed by phase 2 (the app guards
   client-side meanwhile, §3.4).
3. **Offerbook rate and tenor on the earn row (yield-tracer / margin-fetcher-sol).** The earn rate is the row's
   `depositRate`, 0 on 232 of 233 rows, while `/pools/latest` carries per-tenor `terms` (`[{termId:'7d', apr:50}]`).
   Decide one shape: one earn row per (pair, tenor) with `maturity: { kind: 'tenor', days }`, or one row per pair
   with the best lend quote and `terms` for a picker. Needed by phase 4.
4. **Offerbook builders (calldata-sdk-sol + worker-api).** Fill a borrower's offer (lend), claim repayment,
   and positions on `/v1/data/earn/positions`; then flip `svmBuildable` so capabilities appear. Needed by phase 5.
5. **Midnight lend positions (worker-api) — verify, may already work.** After a take, does
   `/v1/data/earn/positions` return the supply leg with its market uid (and so its maturity)? §0.3.

## 0. Verify before building (half a day)

1. `GET /v1/data/earn?chainIds=8453&includeFixedTerm=true&terms=digest&minTvlUsd=0` — the row count, `rate.kind`,
   `maturity`, `capabilities` match the table above.
2. Unsigned build of `/v1/actions/earn/deposit` for the one live Base Midnight row (`cbBTC-USDC 86 2026-12-25`):
   it fills `lendOffers`; note whether it needs `slippage` (the capability does not say `requires` today).
3. On a test wallet (or a paper read of a known lender): `/v1/data/earn/positions` shows the Midnight supply leg;
   `withdraw` builds the sell. If not, B5 becomes a blocker for phase 3.
4. `GET /v1/data/lending/book?marketUid=<Midnight debt market>&side=lend` returns the depth the ticket will show.

## 1. SDK layer (follow docs/apis.md "New action")

- `fetchEarn` gains `includeFixedTerm?: boolean` (sent only when true — the default request must stay
  byte-identical, or the prewarm cron misses; `pnpm prewarm-check`).
- `fetchLendingBook` takes `side: 'borrow' | 'lend'` (today hard-coded `'borrow'`, `api.ts:87-89`);
  `useLendingBooks` keys on it.
- `types.ts`:
  - `EarnRate.kind: 'variable-curve' | 'fixed-term' | 'user-set' | (string & {})`.
  - `EarnMarket.maturity`: add `maturityIso?: string`, `secondsToMaturity?: number` (a snapshot — never tick it
    down; derive from `maturity` and `Date.now()`).
  - `EarnResponse.excluded`: `fixedTerm?`, `collateralLeg?`; `appliedDefaults.excludeFixedTerm?`.
- One new hook, `useFixedRateCatalog` (`queries.ts`): `fetchEarn({ chainIds, includeFixedTerm: true,
  protocol: 'MORPHO_MIDNIGHT,JUPITER_OFFERBOOK', minTvlUsd: 0, maxRiskScore: 5 })`, its own query key, 10 min stale.
  A separate request rather than a flag on `useCatalog`: the catalogue's request is pre-warmed and must not change.
  Add the same URL to `prewarmListings.ts` in lending-sdks so the shelf is warm too.

## 2. Model (pure, tested) — `src/model/strategies.ts`

1. **A new source, `fixed-book`.** `classifyEarn` today turns a dated lending row into `source: 'lending'` with
   PT wording ("par on <date> · or sell any time", `exitTerms` 379-385) and the risk line "Rate floats with
   utilisation" (`Ticket.tsx:169, 273`). Both are wrong for a book loan. Rule: `venueKind === 'lending'` and
   `rate.kind === 'fixed-term'` → `source: 'fixed-book'`, `via: 'Fixed on <brand> · <date>'`,
   `exitWord: 'At maturity'`, exit text "repaid on <date>; before that, sell to the book (price moves with rates)".
   `rate.kind` alone is not enough — Pendle/Spectra vault rows carry `'fixed-term'` too; keep the `venueKind` test.
2. **Fold maturities.** One Midnight market per date; fold rows with the same (chain, loan asset, collateral set)
   into one strategy with `dates[]`, as `foldDates` (726) does for loops. The ticket picks the date.
3. **Hide what cannot be filled.** New soft code `no-offer` in `visibility.ts`: `rate.total <= 0` or no depth.
   Today that is every chain-1 row; the shelf must say "No live offers" rather than list 0 % rows.
4. **Client guards until B1 / B2 ship** (remove when they do): drop `maturity.maturity <= now`; drop an Offerbook
   row whose asset address is not the key's principal mint.
5. Tests next to source (`fixedBook.test.ts`), fixture rows copied from the live responses in §0.1, run through
   `classifyEarn`: source, wording, folding, `no-offer`, matured guard, collateral-leg guard, and a Pendle PT row
   that must stay `fixed`.

## 3. UI

1. **Shelf.** A "Fixed rate" chip/tab on the Earn page backed by `useFixedRateCatalog`; empty state names why
   ("Fixed-rate books are thin right now — N books, none with a live offer"), using `excluded.fixedTerm` only as a
   count, never as rows.
2. **Ticket (`SimpleTicket`, `source === 'fixed-book'`).** Date picker (from §2.2); the lend-side book
   (`useLendingBooks(side: 'lend')`) drives the rate for the typed size (`bookAprAt`) and the max size (book depth);
   "You get back <face> on <date>" computed from rate and days; slippage sent as for booked rows if §0.2 says so.
3. **Icons and keys.** `bits.tsx` `FAMILY`: add `JUPITER_OFFERBOOK`, `TERM_FINANCE`, `TERMMAX`. `uid.ts`
   `SOL_PROTOCOLS`: add `JUPITER_OFFERBOOK` (and `ZODIAL`, `DEFITUNA`) — the hex tail-strip leaves base58 keys
   whole, so match the family prefix explicitly.
4. **Positions.** `positions.ts` sets `Holding.maturity` only for vault PTs (108). Set it for a lending supply leg
   whose market is a fixed-book row (join the leg's market uid to the catalogue's maturity); `MaturityNote` then
   shows the clock. Manage ticket: before maturity "Sell to the book" (`earnWithdraw`, a sell), after maturity
   "Redeem".

## 4. Jupiter Offerbook, read-only (after B1 + B3)

List Offerbook books on the shelf with their tenor rates, marked "View on Jupiter" (no deposit button) while
`capabilities` is empty — the `closed` structural hide is relaxed for `fixed-book` rows to a visible, disabled
state. Tenors, not dates: the ticket shows "7 days at 50 %", and `maturity` is computed at fill time.

## 5. Jupiter Offerbook, lend (after B4)

Same ticket as Midnight with a tenor picker (`termId` 1d/2d/3d/7d from the book), `minFill` enforced on the
amount, `ltv` shown per level (the borrower's collateral is the risk). Solana signing via `solSigner`; positions
from `/v1/data/earn/positions` (B4); "Claim" after the tenor ends.

## 6. Paper

- The paper ledger re-rates every open from the index (`pos-indexer social/src/paperRates.ts`, supply uid =
  `snap.marketUid ?? snap.earnUid`) and accrues with no end date (`paper.ts` 327-329, 398-411; `maturity` is
  "said, not enforced", 179-180). A fixed-book paper lend would float and run past its date.
- Change both copies (`src/model/paper.ts` and pos-indexer `social/src/paperModel.ts`; `pnpm paper-check`):
  a snap with `rateKind: 'fixed'` keeps its opening rate and stops accruing at `maturity`. pos-indexer's
  re-rate skips such snaps.
- `paperPlans.ts` `simpleSnap`: pass `rateKind` and `maturity` for `fixed-book`.

## 7. Order of work

| step | what | done when |
|---|---|---|
| 0 | verify (§0) | the four checks answered in this file |
| 1 | B2 matured filter (yield-tracer) | a past-date Midnight book is absent from `/earn` and counted in `excluded.matured` |
| 2 | SDK + model + tests (§1, §2) | `pnpm test`, `pnpm build`, `pnpm prewarm-check` green |
| 3 | Midnight shelf + ticket + positions (§3) | a reviewer lends on the live Base book (scenario 1 below) |
| 4 | paper (§6) | a paper fixed lend holds its rate and stops at maturity |
| 5 | B1 + B3 upstream, then Offerbook read-only (§4) | Offerbook books listed with tenor rates, no collateral rows |
| 6 | B4 upstream, then Offerbook lend (§5) | a reviewer fills a 7-day offer on Solana |

Out of scope (later tickets): Term Finance (an auction bid, not an instant fill), TermMax lend side (check its
capability first), Loopscale lending rows (lend through `vault.loopscale`, already on the catalogue), Midnight MAKE
(own limit offers — `/v1/actions/midnight/make` exists, but a resting order needs an orders view and cancel flow).

## What a reviewer does (acceptance)

1. Earn → Fixed rate on Base: the cbBTC-USDC 2026-12-25 book shows its rate and depth; typing more than the depth
   caps the amount; lending $50 lands a position with a "repaid on 25 Dec" clock.
2. The same position: "Sell to the book" builds and, after signing, the position is gone and USDC is back.
3. Chain 1 with no live offers: the shelf says so and lists no 0 % rows.
4. No row on the shelf has a past maturity or a non-USDC Offerbook collateral asset.
5. Paper: a fixed lend shows the opening rate a week later, and stops accruing after maturity.
6. The default Earn catalogue request is unchanged (`pnpm prewarm-check`).

## Risks

- **Thin books.** Midnight and Offerbook supply sides are almost empty (2 of ~380 rows quote today). Mitigation:
  the shelf is opt-in and says so; do not mix these rows into the default ranking.
- **Rate shown ≠ rate filled.** A book moves between quote and fill. Mitigation: price the typed size off the
  live book (`bookAprAt`), send slippage, re-quote on sign.
- **Exit is a sale, not a withdrawal.** Selling before maturity can lose principal when rates rise. Mitigation:
  say so in the ticket and in the manage step; show the sell quote before signing.
- **Two sources of maturity.** The origin's `maturity` and the position's market can disagree after a roll.
  Mitigation: positions read maturity by market uid from the catalogue, not from the symbol.
- **Offerbook counterparty risk is per loan** (borrower collateral, `ltv`). Mitigation: show `ltv` and the
  collateral per level; default to the lowest-LTV levels.

## Decisions needed

1. A separate "Fixed rate" shelf (proposed) or the rows mixed into the main Earn list with a badge?
2. Offerbook earn shape (B3): one row per tenor, or one row per pair with a tenor picker?
3. Paper: should fixed-book paper positions be allowed before real execution exists for Offerbook (phase 4)?
