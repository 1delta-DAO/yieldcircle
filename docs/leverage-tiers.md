# Leverage tiers: what the API gives us, and what it could add

YieldCircle replaces a raw leverage slider with three fixed tiers,
Defensive / Balanced / Aggressive, at 50 %, 75 % and 90 % of each venue's own
range. This note records what the 1delta API already provides for that, why
the first version looked the same on every venue, and what the API could add
so every client computes the tiers the same way.

## What the API has today (checked 2026-09-19)

| Need | Endpoint | What it gives |
|---|---|---|
| The venue's range per pair | `GET /v1/data/lending/pairs/optimize` | `maxLeverage` on every row, derived from the venue's borrow collateral factor and borrow factor: `1 / (1 − cf / bf)` (`data/routes/range/leverage.ts`). Also `ltv`, `collateralFactorLong` (liquidation threshold), `borrowCollateralFactorLong`, `borrowFactorShort`, `eMode`. |
| The range at size, for an account | `GET /v1/data/loop/range/leverage` | The same `maxLeverage`, plus `amountIn` / `amountInUSD`: the largest debt the account can actually open on that pair once liquidity, caps, the wallet's pay-asset balance and the existing position are counted. `payAmount` + `payPriceUSD` add a planned deposit ("zap mode"). E-mode analysis (`modeAnalysis`) says whether a mode switch is needed and what the range is in each mode. GET needs `account`; POST takes a simulation body instead. |
| Opening at a chosen leverage | `GET/POST /v1/actions/loop/leverage` | Takes `leverage` (a multiplier) or `debtAmount`. There is **no percentage, tier or target-LTV parameter**: the client resolves the tier to a multiplier and sends that. |
| The numbers a tier implies | the same quote | `data.economics` per route (carry, entry cost, break-even) and `simulation.post.healthFactor`, so a card can show what each tier costs and where its health lands. |

So the "full range per venue" exists server-side and is consistent between
the two endpoints. The mapping from a fraction to a multiplier is the client's:
`L = 1 + frac · (maxLeverage − 1)`, which is what the simple app does now.

## Why the first version looked the same everywhere

The first tiers were fractions of the **liquidation threshold**, not of the
range: 50 % / 75 % / 90 % of `collateralFactorLong`, i.e. `1 / (1 − util · liqLtv)`.
That was deliberate (the same tier meant the same drop-to-liquidation on every
venue), but ETH staking markets cluster at thresholds of 0.90–0.965, so
Balanced came out at 3.2×–3.8× on Aave, Compound, Dolomite and Lista alike,
and a 28× venue looked no different from a 10× one. Fractions of the range
make the venues differ, at the price of a different risk per venue, which the
cards now say explicitly ("−0.4 % to liq." on the top of Lista's range).

## What the API could add

None of this is required for the simple mode to work; each item removes a
piece of arithmetic from clients so that every front end agrees.

1. **`leverageFraction` on `/v1/actions/loop/leverage` and `/v1/data/loop/range/leverage`.**
   `0..1`, resolved server-side against the pair's range, and, when an
   `account` (or a simulation body) is given, against the account's *binding*
   max at size rather than the theoretical one. Response echoes the resolved
   `leverage`, the LTV it lands at, the drop-to-liquidation and the health
   factor. The quote is then honest for a wallet that could not reach 90 % of
   the theoretical range because the pool is thin.
2. **Published tiers on `/pairs/optimize` rows.** A `leverageTiers` block per
   row, e.g. `{ defensive: { leverage, netApr, ltv, liqBufferPct, healthFactor }, balanced: …, aggressive: … }`,
   computed with the same at-size legs the row already carries
   (`depositAprAtAmount`, `borrowAprAtAmount`). The list view then sorts and
   labels on server numbers, and the tier definitions (50 / 75 / 90, or a
   risk-anchored alternative) live in one place. The fractions could be query
   parameters with those defaults.
3. **A range without an account.** `/v1/data/loop/range/leverage` today needs
   `account` or a simulation body. A mode that answers from liquidity and caps
   alone (the max debt the pool can serve at the requested `payAmount`) would
   let the ticket cap a tier before the wallet is connected.
4. **Optional: a risk-anchored tier set.** The threshold-based definition the
   first version used (a fixed drop-to-liquidation per tier) is the safer one
   for a retail surface. If the API publishes tiers, offering both definitions
   (`basis=range` | `basis=threshold`) lets a product choose without another
   client-side formula.

## Client plan meanwhile

- Tiers are fractions of `maxLeverage` (done). Each card shows leverage, net
  yield at that leverage and drop-to-liquidation, coloured amber under 10 %
  and red under 5 %.
- When an account is set, call `/v1/data/loop/range/leverage` for the selected
  pair with the chosen pay asset and amount, and cap the tier's debt at
  `amountInUSD`; show "capped by liquidity / your balance" when it binds.
- Keep the quote's `simulation.post.healthFactor` as the health shown once it
  arrives, and the threshold-based figure only until then.
