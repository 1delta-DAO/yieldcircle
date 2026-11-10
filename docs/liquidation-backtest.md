# Liquidation backtest for loops: plan

**Question:** would a loop opened at leverage L on pair P at any point in the last N days
have been liquidated?

**Answer this doc proposes:** compute it once per pair on the server (yield-tracer), from the
oracle prices the lender liquidates on. Publish one number per pair and window that works for
any leverage. The app, the phone app and other 1delta clients then check a leverage against it
with arithmetic they already have (`liqBuffer` in `model/leverage.ts`).

Status: plan, 2026-11-10. Nothing built. The server side is yield-tracer
`tickets/0008-pair-drawdowns-liquidation-backtest.md`.

## 1. The model

A loop at leverage L on a pair with liquidation threshold `lt` (`collateralFactorLong`, divided
by the debt's `liquidationBorrowFactor` / `borrowFactorShort` where one exists) opens at

    HF0 = L · lt / (L − 1)             (healthAt)

Health then moves with two things. Neither depends on L:

    HF(t) = HF0 · ρ(t)/ρ(t0) · G(t0,t)

- `ρ(t)` is the **ratio of the collateral price to the debt price, as the lender's oracle
  reports it** (more on this choice below).
- `G` is carry: the collateral's supply rate against the debt's borrow rate,
  `exp(∫ (r_supply − r_borrow) dt)`. Reward APRs do not count, because rewards are not added
  to the position. Intrinsic yield is already inside `ρ` when the oracle is an exchange-rate
  oracle, so it must not be added a second time (`depositAprLong` already includes rewards,
  so take the base rate only).

So define one series per pair, `X(t) = ρ(t) · G(t0, t)`. The position is liquidated when
`X` falls by more than the buffer the position opened with:

    liquidated  ⇔  min over t ≥ t0 of X(t)/X(t0)  <  1 − liqBuffer(lt, L)
                   (liqBuffer = 1 − ((L−1)/L)/lt, already in model/leverage.ts)

The worst entry point in a window is the **maximum drawdown of X** over that window. This
yields three things:

| Output | Formula | Use |
|---|---|---|
| `maxDrawdown` (per window) | max peak-to-trough fall of X | a leverage L survived the whole window iff `liqBuffer(lt, L) > maxDrawdown` |
| `maxSafeLeverage` | `1 / (1 − lt · (1 − maxDrawdown))` | "the highest leverage that would have survived every entry in the last 90 d" |
| `liqShare(L)` (optional) | share of entry hours from which X fell by the buffer within horizon H | "liquidated from 3 % of start dates" |

The first two are independent of leverage, so the server stores a few numbers per pair and
the client never calls the server once per leverage. `liqShare` depends on L and H. Store it
as a small curve: the drawdown quantiles within H (p50/p90/p99/max) at H = 7, 30 and 90 days.
The client reads a leverage off that curve.

Use the **open LTV the quote returns** when there is one (`liqBufferAtLtv`), not `(L−1)/L`.
The entry cost puts a quoted open above what its leverage implies (see the comment at
`liqBufferAtLtv`).

## 2. Which price series

The liquidation is triggered by the lender's oracle, not by the market, and the difference
decides the answer for the pairs that matter most:

- wstETH/WETH on Morpho, or Aave e-mode with an exchange-rate or CAPO oracle: the market
  depegs (June 2022, the Aug 2024 unwinds), but the oracle never moves, so the position was
  never liquidated. A backtest on USD market prices would report liquidations that did not
  happen.
- A pair with a market feed on both legs: the oracle tracks the market, so the two agree.

**Primary series: `market_oracle_price_snapshots`** (yield-tracer, hourly, one row per
`market_uid × config_id`, present since migration 0001).
- Aave-likes: `ρ = priceUsd(collateral market) / priceUsd(debt market)`, both from the same
  lender, so both come from the same oracle. Aave V4 joins on `config_id` (the spoke).
- Morpho / Lista: the market oracle already quotes collateral in loan units (`price`). Check
  this per family before relying on it.

**Secondary series: `asset_price_snapshots`** (USD per asset group, hourly), as a labelled
**market stress** figure: "if the oracle had followed the market". It is useful for
exchange-rate-oracle pairs, where depeg risk goes to whoever exits, not to the liquidator. It
is never the headline "would have been liquidated".

## 3. Known traps (each one changes the answer)

1. **Flipping snapshots.** `PRICE_SNAPSHOT_INTEGRITY.md` documents about 150 groups whose
   hourly price alternates between two unrelated values (sUSDai at 1.78 against 1.087;
   YFI/SUSHI/ibBTC divided by the ETH price). A single bad hour creates a −40 % drawdown out of
   nothing. Before computing, reject any hour where both legs' ratio moves more than k% and
   reverts within 1–2 hours. Report how many hours were rejected. Check whether the oracle
   snapshots have the same problem. They should be cleaner, because they are direct reads,
   but the `derivation: 'derived'` rows are a market ratio times another feed and need the
   same filter.
2. **Hourly sampling hides wicks.** A crash that lasts 20 minutes (10 Oct 2025) can be
   missing from hourly rows, so the result **understates** the risk. Show it as
   "≥ x % drawdown (hourly data)" and leave a margin on top (for example, report
   `maxSafeLeverage` at buffer = maxDD + 2 pp). Chainlink's heartbeat and deviation steps
   make the oracle coarse too, but it is the oracle's own view.
3. **Gaps.** Missing hours must not be interpolated across a crash. Compute per contiguous
   segment and return `coverageFrom`, `hours`, `gapHours`. A window with less than about 90 %
   coverage returns "not enough history", never a number.
4. **Thresholds change.** There is no history table for `market_config`, only flags and caps
   history. v1 uses today's `lt` and says so. If governance lowered `lt`, today's number is
   the stricter one, so the error points the safe way. The other direction (an `lt` raised
   since) is rarer.
5. **Lenders without a single threshold.** LlamaLend/Curve (soft liquidation, bands),
   Liquity-style user-set rates, and fixed-term books (Midnight, Term, which liquidate at
   maturity whatever the health) are **out of scope for v1**: return `unsupported` with a
   reason. Kamino's elevation groups and Project 0's maintenance weights fit the model once
   `lt / liquidationBorrowFactor` is used.
6. **Carry needs rate history.** `lending_snapshots` holds the hourly supply and borrow rates
   per market. v1 can ship with `G = 1` and add carry in v2, because over 7 to 30 days carry
   is small next to price moves. Over 365 days a negative-carry loop at 10× can drift into
   liquidation with no price move at all, so v2 matters for long windows.
7. **Partial liquidation and bonus.** "Liquidated" here means HF < 1 is reached. What is lost
   (close factor, `liquidationPenalty`) is a separate figure. v1 does not compute it.

## 4. Where it lives

**yield-tracer** owns the computation. It has both series and the rate history in one
Postgres database, and every consumer already reads pairs through it.

- A new job `jobs/pairDrawdowns.ts`, run hourly or nightly over the **loop-eligible pairs**:
  the rows of `v_lending_pair_structure` with `maxLeverage > 1`, a TVL floor, and the
  supported families. That is about 12k pairs × 8,760 hours for 365 d, which is fine streamed
  one lender at a time. Most Aave-family pairs share their legs' series, so load each
  market's series once per lender.
- Store the result in a new table `pair_drawdowns` keyed by
  `(collateral_market_uid, debt_market_uid, config_id, source[oracle|market], window)` with
  the columns `max_drawdown, peak_ts, trough_ts, q50/q90/q99_{7d,30d,90d}, hours, gap_hours,
  rejected_hours, coverage_from, computed_at, lt_used`. Remember to update
  `migrations/meta/_journal.json`. CLAUDE.md there says an unjournalled migration silently
  does nothing.
- Add a read route `GET /pairs/drawdowns?pairs=…&window=30d,90d,365d`, and add the 90d
  oracle `maxDrawdown` / `maxSafeLeverage` as optional fields on `/pairs/optimize` rows, so
  the leverage-tier cards get it with no extra call.
- Keep the math pure (drawdown, quantiles, outlier filter, `maxSafeLeverage`) in a small
  module with unit tests, separate from the SQL.

**lending-sdks** (`worker-api`) passes it through: `GET /v1/data/lending/pairs/drawdowns`
with a KV cache (the data changes hourly at most), plus the fields on
`/v1/data/lending/pairs/optimize`. This puts it on the public 1delta API, so it is not
client-only and other front ends get the same answer. Optionally the action quote
(`/v1/actions/loop/leverage`) can echo `historicalLiq: { window, survived, maxDrawdown }`
for the leverage being quoted.

**yieldcircle** only reads it, following the usual layering (docs/apis.md):
`sdk/api.ts` → `sdk/queries` (packages/app) → UI. It adds a single pure function in
`model/leverage.ts`:

```ts
/** Would leverage L (or a quoted open LTV) have survived this pair's worst drawdown? */
survived(lt, ltvOrL, maxDrawdown) → { survived: boolean; margin: number }
```

The UI then has:

- Ticket and tier cards: "Survived every entry in the last 90 d" / "Would have been
  liquidated on 2026-…" (`trough_ts`), plus "max historically safe ≈ 6.2×".
- Lite: one line under the tier, with the wording rules in `model/lite.ts`.
- "Not enough history" or "unsupported venue" when the server says so. The app never
  computes a fallback on its own.

## 5. Validation before showing it to users

1. **Hand-checked cases.** Each gets a unit test on fixed series:
   - wstETH/WETH Morpho (exchange-rate oracle): expect a drawdown of about 0 on the oracle
     series and a visible one on the market series.
   - ETH/USDC Aave: expect about the market drawdown.
   - One stable/stable pair with a known depeg (USDe in Oct 2025, for example).
2. **Real liquidations.** Take liquidation events from the lenders' subgraphs or from the
   position index's ledger (pos-indexer). For each one, check whether the model with that
   position's open LTV flags it, and whether it flags liquidations that never happened at
   comparable LTVs. This is the step that shows whether hourly oracle data is good enough.
3. **Compare with the market series** on all pairs. Large gaps between the two series should
   come only from exchange-rate-oracle pairs. Anywhere else, a large gap points to a data bug.

## 6. Phases

| Phase | Scope | Where |
|---|---|---|
| 0 | Probe (no code shipped): pull 365 d of oracle snapshots for about 20 loop pairs, measure coverage and gaps and flips, compute maxDD in a script, and compare with the market series. This decides whether the oracle table can carry it. | scratch script against yield-tracer |
| 1 | `pair_drawdowns` job + table + `/pairs/drawdowns`, oracle series, G = 1, windows 30/90/365 d, `maxDrawdown` + `maxSafeLeverage`, outlier filter, coverage. | yield-tracer |
| 2 | Pass-through + fields on `/pairs/optimize` in worker-api. | lending-sdks |
| 3 | `survived()` in core, the ticket/tier line, Lite line. | yieldcircle |
| 4 | Carry (G from `lending_snapshots`), `liqShare` quantiles at 7/30/90 d horizons, market-stress series. | yield-tracer |
| 5 | Backtest against real liquidations; tune the margin from it. | script + pos-indexer |

## 7. Open questions

- How deep and how complete is `market_oracle_price_snapshots` per lender? Phase 0 answers
  this. If it is thin for some families, do they fall back to the market series with a label,
  or return `unsupported`?
- Is the Morpho/Lista `price` the full oracle price (collateral in loan units, scaled), or
  already USD-normalised? Check this in `integst/oraclePrices.ts` per family.
- Which windows does the product want as the headline: 90 d, or 365 d (which includes
  Oct 2025)?
- Is the `/v1/actions/loop/leverage` echo worth it, or are the `/pairs/optimize` fields
  enough?
