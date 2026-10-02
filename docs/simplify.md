# Simplifying the asset page

The asset page (what opens when you tap USDC, ETH, …) had five stacked blocks:
positions per asset with idle rows, six curated cards, an eight-column deposit
table, a nine-column loop table, and the ticket. Each block was defensible on
its own; together they read like a trading terminal. This note looks at how the
front ends people call "simple" handle the same screen, and what we take.

## What the simple ones do

| Product | The list row | What is *not* on the list | Where the rest lives |
|---|---|---|---|
| **Lido, Ethena, Sky savings** | one asset, one rate, one button | everything | a small "details" disclosure under the button |
| **Coinbase / Robinhood earn** | asset · your balance · "earn up to x%" | venue, mechanism, liquidity, history | the confirmation screen |
| **Aave** (supply table) | asset · wallet balance · APY · [Supply] | risk, size, utilisation, oracle | the asset detail page and the supply modal |
| **Yearn, Morpho Earn, Instadapp Lite** | vault name · APY · TVL · your deposit | strategy internals, leverage, sub-strategies | vault page; leverage is hidden inside "automated strategy" |
| **Summer.fi (Lazy Summer)** | asset · one risk-adjusted yield · balance | which protocols, weights, rebalancing | a "how it works" panel |
| **Pendle** | simple / pro toggle; simple shows asset · fixed APY · maturity | implied vs underlying, YT, order book | pro mode |
| **Contango, Gearbox, Instadapp** (leverage) | pair · "up to x%" at max leverage · [Open] | leverage picker, liquidation, borrow rate | the ticket, where leverage is a slider |

Three rules fall out of that:

1. **One number per row.** The list decides *which*; the ticket decides *how
   much* and *how levered*. Size, exit mode, liquidity and buffer are ticket
   material, not list material. **Exception (2026-10-02, owner's call):** the
   30-day line and its mean sit beside the rate — they are not a second number
   to pick by but the rate's own credibility: a list sorted by rate otherwise
   ranks a one-night spike above a month of steady yield. A loop's line is the
   position's yield on equity at the Balanced tier, netted per day from its
   two legs (`model/rateHistory.ts`), never either leg's rate. Lists and the
   Earn digest RANK by `steadyRate` — today's rate, or the 30-day mean when
   today's is a spike — while still showing today's number.
2. **Progressive disclosure, not parallel sections.** No one shows two tables
   at once. The split (deposit vs loop, simple vs pro) is a toggle, and one
   side is the default.
3. **Balance and yield on the same line.** "You have $52,400 idle, it could
   earn 8.42%" is the whole pitch of a simple mode. The position detail
   (per-strategy equity, health) belongs on the portfolio screen, which for
   us is the explorer's "Your positions" block.

## What we cut, and why

| Was | Now | Why |
|---|---|---|
| "Your US dollar" block on the asset page (asset header rows, idle rows, strategy rows) | one **idle strip**: "USDC · $52,400 idle · could earn up to 8.42% · Put to work" | the explorer already has the full breakdown; the asset page only needs the one fact that drives action |
| six curated cards | an **"our pick"** tag on the curated rows, which sort first | the cards repeated the list with more words; a tag keeps the editorial signal at zero cost |
| two tables, Simple and Advanced, always both visible | one list with a **Deposits / Loops** toggle; Deposits is the default | rule 2; the split stays explicit and the loop side is one tap away |
| 8 / 9 columns | **4 columns**: strategy (name + one plain line), rate, risk, yours | rule 1; every removed column is already in the ticket (exit, size, liquidity, buffer, sensitivity, health) |
| sparkline + 30-day average per row | dropped from the list, then **back** (2026-10-02) as one quiet line + `30d x%` in the rate cell, amber when today's rate is a spike against it | a sorted rate with no history rewards spikes; the line costs one request per list (`/v1/data/earn/rate-history`) and no column |
| "n strategies" copy in the header | count on the toggle | one place |

The ticket does not change: it was already the place where the size, exit,
liquidity, liquidation buffer and rate sensitivity live.

## What we deliberately keep

- **The loop side is a toggle, not a hidden "pro" mode.** Loops are the
  product; the simple mode changes the order of reading, not the menu.
- **Risk dot on the row.** It is the one thing a plain APY hides.
- **"Yours" on the row.** A running strategy should be recognisable in the
  list without opening it.
- **Asset chips.** With six dollar assets, filtering by what you own is the
  first move most people make.
- **Which market, on the row.** `Lend on Morpho` is the same sentence for three
  hundred Morpho markets, and the ticket deposits into exactly one of them —
  the one whose collateral and LLTV decide what the money is lent against. The
  row says `Lend on Morpho Blue · wstETH 86`, from the listing's own market name
  (`src/model/market.ts`), and it names the venue by BRAND, because `Aave V3`
  and `Aave V4` are both "Aave" upstream and an isolated V4 market is not the V3
  pool. Venues the listing cannot name past a `0x481d` vault tail (Euler, Venus'
  isolated pools) stay on the family alone: four hex digits are not a choice.

## Alternatives considered

- **Single mixed list, deposits and loops together, sorted by rate.** Cleaner
  still, but a 16% loop above a 4% deposit with nothing between them is how
  people end up levered without noticing. The toggle keeps the two kinds in
  separate frames.
- **Cards instead of rows.** Cards spend a lot of pixels on one number; rows
  compare better. Cards make sense on a phone, where the row already
  collapses to name + rate.
- **Hide loops entirely behind a "show advanced" switch.** Too far. Loops
  with a suggested leverage and a plain-words liquidation line are the reason
  to use this instead of the venue's own front end.
- **Keep the positions block but collapsed.** A collapsed block is a header
  that says nothing. The idle strip says the one thing that matters.
