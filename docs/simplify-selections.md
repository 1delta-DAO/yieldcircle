# Simplifying selections and the loop ticket

The menu is now wider than any other front end's. Each new desk, venue, ticker
and curator is a win on its own, but on screen it becomes one more chip.
The USD page can show 20–40 asset chips, and Stocks 30–80. The Feed stacks
four chip rows. The loop ticket shows about 30 numbers before you open
Details. This note says how we keep the breadth and lose the clutter. It
follows on from [`simplify.md`](simplify.md), which simplified the list and
explicitly left the ticket alone.

## What the research says

**Choice overload is real only under certain conditions, and we meet most of
them.** The jam study (Iyengar & Lepper 2000) did not replicate cleanly.
Scheibehenne et al. 2010 found a mean effect near zero across 50 experiments.
Chernev et al. 2015 showed the effect *is* reliable when four things hold: the
task is hard, the options are complex, the person has no clear preference, and
the person wants to spend little effort. "Which of 40 dollar desks should I
park in" meets all four. "I hold sUSDe, show me sUSDe" meets none. So we
design for two users:

- the **browser**, who needs defaults and a short list;
- the **seeker**, who needs search.

A chip row serves neither of them well once it passes about ten chips.

**The numbers from faceted search:**

| Guidance | Source |
|---|---|
| Show at least 6 values before truncating, up to about 10; problems start at 15 or more | Baymard, *Truncation design* |
| Never fold away only 1 value: show "+N" only when N ≥ 2 | Baymard |
| 10 visible, then "show more"; add search inside the facet for the long tail; keep selected values pinned | Algolia InstantSearch defaults |
| Order by what users care about (size, popularity), alphabetical only for names people already know; group general → specific | NN/g, *Filter categories and values* |
| About 28 % of sites give no summary of the filters that are on; users then can't tell why the list is short | Baymard, *Applied filters* |
| Hick's law only helps for ordered, subdividable lists; grouping and stable order matter more than the raw count. Miller's 7±2 is about memory, not visible menus | NN/g; Cowan 2001 (≈4 chunks) |
| Presets with sensible floors (stablecoins, majors, LSTs; minimum TVL) do most of the filtering before anyone touches a control | DeFiLlama Yields |

**Loop tickets elsewhere** (Jupiter Multiply, DeFi Saver, Contango, Kamino,
Gearbox, Summer.fi) converge on the same pattern:

1. One leverage control, capped at the max.
2. **Always visible:** net APY as one number, the liquidation price or buffer,
   a health label in words (Safe … Risky), and position size.
3. **On hover or expand:** the APY breakdown (supply, borrow, rewards).
4. **Behind "Advanced":** route, slippage, swap rate, fees.
5. A before/after preview, shown at review only.

Contango shows the breakdown only when a row is expanded. DeFi Saver shows one
Net APY and puts the formula on hover.

**What we already do well:** fiat chips pinned at the end, the selected chip
never folded, floors in Settings with `HiddenBar` admitting what they hold
back, the Details fold in the ticket, and tiers instead of a raw slider.

## Principles

1. **Two ways in: a short ranked row, and search.** The row serves the browser
   and the search serves the seeker. Nothing in between scrolls sideways or
   wraps onto a third line.
2. **At most about 8 options visible per control** (6 on a phone). The tail
   lives in a searchable picker grouped by kind, with counts.
3. **Rank by what money cares about:** TVL that passes the floors, not
   strategy count. A count rewards assets with many tiny markets.
4. **"Yours" first.** Whatever the wallet holds leads, as `BorrowCats` already
   does with "Against what you hold".
5. **In the ticket, three things always show:** what you earn, how far you are
   from liquidation, and what it costs to get in. Everything else is a reason
   to believe one of those three, so it goes into Details, grouped by which one
   it explains.

## 1. One `FacetPicker` for every long list

Today four near-identical chip components each fold at a different cap:
`ProtocolChips` 10, `IssuerChips` 8, `AssetClassChips` 6 and `CuratorChips` 6.
Next to them sit `AssetChips` (6 plus fiat), the Borrow "Take out" `<select>`
with up to 36 options, and `ChainPicker`'s popover list. The proposal is to
replace them with one component.

```
[ All 214 ]  [ ● USDC 41 ]  [ USDT 33 ]  [ sUSDe 18 ]  [ USDS 12 ]  [ PYUSD 9 ]  [ More (31) ▾ ]
   ↑ yours first (dot), then top by TVL                                 ↓
                                                     ┌─────────────────────────────┐
                                                     │ 🔍 Search 37 dollars        │
                                                     │ YOURS                       │
                                                     │   USDC          41   $1.2B  │
                                                     │ ISSUED DOLLARS              │
                                                     │   USDT 33 · PYUSD 9 · …     │
                                                     │ YIELD DOLLARS               │
                                                     │   sUSDe 18 · syrupUSDC 7 …  │
                                                     │ CURRENCIES                  │
                                                     │   EUR 4 · CHF 2 · GBP 1     │
                                                     └─────────────────────────────┘
```

**The row:**
- "All", then the wallet's holdings in this group, then the top N by
  floor-passing TVL.
- N = 6 on desktop and 4 on a phone, *including* the held ones.
- The selected value always shows: if it was picked from the picker, it takes
  the last slot.
- Then **More (n)**, only when n ≥ 2. With n = 1, that chip is simply shown.
- One line, never wrapping. That fixes the "eighteen chips, twelve invisible"
  problem noted at `AssetPage.tsx:378` without bringing back the hidden
  scroller.

**The picker:**
- The existing `Popover`, used as a sheet on phones.
- Search sits on top and is focused on open. It matches symbol, name and
  issuer, the same matcher as `TokenBook`.
- Sections come from groupings we already compute:

| Page | Sections |
|---|---|
| USD / ETH / BTC | Yours · `DeskKind` bands (issued / yield / plain) · currencies (`isFiat`) |
| Stocks | Yours · `StockInfo.cls` (Stocks / ETFs / pre-IPO) · issuer as a secondary line (xStocks, Ondo, Robinhood …) |
| More | Yours · chain family (BNB, SOL, HYPE …) · currencies · gold |
| Feed protocol / curator | Yours (positions on it) · by family (`ProtocolFilter` `fold`) |
| Borrow "Take out" | the `OUTS` families, already the `optgroup`s |

- Each row shows its count and, for assets, its TVL.
- Options with zero rows after the floors are not offered. Today's code already
  does this for facets; `AssetChips` should do the same against floor-passing
  rows.

**Ranking change:** `AssetChips.sizeOf` uses strategy count everywhere except
Stocks. It should use the summed TVL of the rows that pass the floors, and on
Stocks keep the summed `collateralUsd`.

**Where it lands:**

| Control | Today | After |
|---|---|---|
| `AssetChips` (USD/ETH/BTC/STOCKS/MORE) | 6 chips + fiat + `+N` that expands in place to 30–80 wrapped chips | 6 chips + **More** picker with search and bands |
| Borrow "Take out" | native `<select>`, 4 optgroups × 8 (so up to 36), the symbol is lost on remount | same picker, with the symbol in the URL |
| Feed: protocol, issuer, class, curator | four stacked chip rows, each with its own `+N` | see §2 |
| Hot | three chip rows with 6–7 visible | same as Feed |
| Chain chip | already a popover; 17 chains | add search at more than 10 entries; otherwise unchanged |

## 2. The Feed's filter stack

Four chip rows (protocol, issuer, class, curator), plus match segments that
appear after a pick, cost the Feed's first screen. On Feed the job is to
*read*, not to pick. So the proposal is:

- **One `Filter` button** in the Feed header. It opens a sheet with the four
  facets as `FacetPicker` sections and the "any / issued by / exposed to"
  match segments inside them.
- **An applied-filter summary** under the header, shown only when something is
  on: `Morpho ×  Ethena (exposed) ×  Clear`. This is the Baymard 28 % fix, and
  it is what makes a single button safe: you always see what is narrowing the
  feed.
- **One quick row stays visible:** the class chips, at most six (Dollar · ETH ·
  BTC · Stocks · …). They are the coarse cut people actually make, and they
  match the Board's "Held in" chips.

That turns about 4 rows into 1 row plus a button, with the same filtering
power.

## 3. The category page's control bar

Above the list today:
- the asset chips;
- the Kind segment (Deposits / Fixed / Loops / Borrow);
- the Nature segment (All / Savings / Market exposure);
- the +rewards toggle in the table header.

That is four controls, before the floors in Settings.

- **Keep Kind.** It is the one split `simplify.md` decided on.
- **Fold Nature into the asset picker's bands where it lines up**, and
  otherwise show it only on ETH and BTC, where "savings vs exposure" is a real
  distinction (staking vs market). Check first how many USD rows it actually
  splits; if it is a handful, the floors already cover them.
- **+rewards:** leave it as it is. It is small, it sits next to the rate it
  changes, and it protects the honesty rule in `pair-row-rewards`.

## 4. The loop ticket

### Today (wallet connected, quote in, Details closed)

About 30–33 numbers, 20–25 labels and 5–6 ⓘ popovers. The most expensive
pieces:

| Block | Numbers | Problem |
|---|---|---|
| Tier cards | 9 (net, ×, drop for each of 3) | You compare three tiers on three axes before you have picked one |
| Hero sub-line | 4–6 ("earn 5.1 % on 3.2× · pay 3.4 % on 2.2× · incl. rewards") | The breakdown is shown before the result is trusted |
| ValueRow + Route | about 6 | Two blocks for one question: what does it cost to get in? |
| 30-day history panel | about 4 + a sparkline | The list row already carries the 30-day line |
| Pay chips + equity/idle line | about 4 | Balances shown twice |

### Proposal: three answers up, three groups folded

```
┌ wstETH / WETH loop · Aave · Base ─────────── ✕ ┐
│ Pay with  [ WETH 2.1 ▾ ]   [ 1.0         Max ] │   ← pay chip only if there is a choice; idle shown once
│                                                │
│ How hard to push it                            │
│ [ Defensive 4.1% ][ Balanced 6.8% ][ Aggr. 8.9% ]   ← name + net only
│   3.2× · liquidated after a 12% drop  (Comfortable) │ ← one line, for the selected tier
│                                                │
│  Net yield   6.8 %                Comfortable  │   ← hero: net + safety word
│  Entry  $4.20 · even in 6 days                 │   ← ValueRow + route in one line
│                                                │
│ ▸ Where the yield comes from                   │
│ ▸ Risk and liquidation                         │
│ ▸ How it's executed                            │
│                                                │
│ What can go wrong  (2 bullets, as today)       │
│ [ Open balanced loop · 3.2× · 1.0 WETH ]       │
└────────────────────────────────────────────────┘
```

That comes to **about 14 numbers** by default, against 30–33 today.

**What moves where:**

| Today | After |
|---|---|
| Tier card shows net, ×, drop | Card shows **net** only. ×, drop and the safety word appear once, for the selected tier. The colour rule (amber under 10 %, red under 5 %) moves to that line and tints the card's edge. |
| Hero: net, health number, 4–6 breakdown numbers | **Net yield + safety word** (Comfortable / Tight / Very tight). The word comes from the same buffer bands as today's caption. The health-factor number moves to *Risk*. |
| ValueRow (in → equity after, break-even) + RoutePick row | **One "Entry" line:** cost and break-even. The best route is used silently, and alternatives move to *Execution*. When the route is not "best" or the loss is ≥ 3 %, the line turns amber, and `LossAck` stays exactly as it is. |
| 30-day history panel | Into *Where the yield comes from*. The list row already showed it, which is why the row was picked. |
| Pay chips with balances, plus the "≈ $X equity · Idle N" line | A single pay chip that is a picker only when there are two or more options. "Idle" is shown once, in the amount line. Equity moves into the Entry line ("$1,000 in → $995.80"). |

**The three folds** replace today's single Details block, and are sorted by
the question each one answers:

- **Where the yield comes from:**
  - "earn x % on L× · pay y % on (L−1)× · rewards z %"
  - per year in $ and vs unlevered
  - "if borrow +2 %"
  - the 30-day line
  - links to the supply and borrow curves
- **Risk and liquidation:**
  - the liquidation sentence and gradient bar
  - the health-factor number
  - LTV vs liquidation threshold (shown nowhere today)
  - borrow liquidity "$X to borrow"
  - venue max ×
- **How it's executed:**
  - the route and its alternatives
  - max slippage (today only in Settings, so it should at least be shown here)
  - fees and gas, as visible text (today they are only in a `title` tooltip)
  - the "API builds the exact calls" foot

Each fold remembers its open state, as `t:details` does now. Someone who always
opens Risk keeps it open.

**Unchanged on purpose:**
- **Three tiers, not a slider.** Jupiter, Kamino and DeFi Saver use sliders,
  but tiers are our simplification and the custom slider stays one tap away.
- **"What can go wrong" stays visible.** It is two lines, and it is the one
  block a regulator, or a burned user, would ask about.
- **The button keeps repeating the tier, the × and the size.**
- **Term, due-date and tenor chips stay where they are.** On those venues they
  *are* the choice.

**What to check:**
- On a 390 × 844 phone, the bottom sheet shows the hero and the button
  without scrolling.
- No number that is on screen today disappears. Each one is either still
  visible or one fold away. The tests over `model/leverage.ts` are untouched,
  because this is a view change only.

## Order of work

1. **`FacetPicker` and `AssetChips` moved onto it, with ranking by TVL.**
   Biggest visible win, smallest risk, one component.
2. **Loop ticket: the three answers up, and the three folds.** View-only, in
   `Ticket.tsx` (`LoopTicket` and `ValueRow`); the model and quotes are
   untouched.
3. **Feed and Hot: the Filter button and the applied summary.** The four chip
   components become thin `FacetPicker` configs.
4. **Borrow "Take out" onto the picker, with the symbol in the URL.**
5. **The Nature segment, limited to ETH and BTC.** Small, but check first how
   often it is used.

## Decisions (owner, 2026-10-22)

- **Hero: the safety word AND the health factor**, the number quieter. The
  hero's right side reads `Safety · Narrow` with `−8.2 % to liq. · HF 1.12`
  under it. The word comes from the same bands as the tier cards' colours
  (Tight under 5 %, Narrow under 10 %, Comfortable under 20 %, else Wide), so
  the hero and the card it came from never disagree (`safetyOf` in `Ticket.tsx`).
- **Tier cards stay fully comparable.** Each keeps net, × and the drop to
  liquidation. The × and the drop now sit on separate lines, because on one
  line a 16.92× venue cut the drop off at 400 px.
- **The asset row's order is the reader's**, and the default is the existing
  ranking (most strategies; most put up on Stocks). The picker's *Order* switch
  offers Largest (deposited TVL), Yours first and A–Z. The choice is kept per
  shelf in localStorage (`yieldcircle.order.assets:<group>`). Held assets get a
  dot in the row and a "Yours" section in the picker, whatever the order.

## What shipped

- `ui/FacetPicker.tsx`: the row (6 chips on desktop, 4 on a phone, the selected
  always shown, More only when 2 or more are folded) and the searchable,
  sectioned list behind it. Used by the asset chips on every category page and
  by Borrow's "Take out", which was a native `<select>` and now keeps the token
  in the URL (`debt=`).
- `ui/FilterSheet.tsx`: the Feed and Hot get a single **Filters** button
  (Protocol · Issuer · Curator tabs) and a removable summary of what is on. The
  four chip-row components are gone; the asset-class chips stay out in the open.
- Loop ticket:
  - net yield and safety stay up;
  - the entry is one line (cost → equity after, break-even), naming the route
    only when it is not the best;
  - three folds replace Details: *Where the yield comes from*, *Risk and
    liquidation* and *How it's executed*. Risk adds LTV against the liquidation
    threshold, free borrow liquidity and the venue max. Execution shows the fee
    breakdown and max slippage as text, where before they were only in a
    tooltip.
  - The pay chips no longer repeat the balance; the idle line says it once.
- **Not done:** limiting the Nature segment to ETH and BTC (step 5). It waits
  on usage data.
- **Not met:** on a 390 px phone the hero still sits below the first screen of
  the sheet, under the pay chips, amount and three tiers.

## Alternatives considered

- **A "Pro mode" switch** (Pendle). Two UIs to maintain, and the earlier note
  already rejected hiding loops behind a mode. Folds give the same
  progressive disclosure without a fork.
- **Search only, no chips.** It serves the seeker but leaves the browser
  facing a blank box. The top six are what most people pick.
- **Two-level chips (family row, then a sub-row).** Two rows stay on screen at
  all times, and the family is already the page (USD / ETH / …). Families
  belong *inside* the picker.
- **Cutting the menu.** Breadth is the product, and the floors already prune.
  The goal is fewer things on screen at once, not fewer things in the menu.
