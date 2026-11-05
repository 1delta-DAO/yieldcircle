# You: one row per position

A concept for the You screen on the phone (`mobile/app/you.tsx`) and its web twin (`LiteYou`).
Status (2026-11-05): built, except the sort control and the "reading…" row states.

| Part | Phone | Web |
|---|---|---|
| No position rows in the card | done | done (paper card; the real one already had none) |
| One row: token on line 2, risk on its own line, made coloured, a day grey | done | done |
| "You have" and "Earning" merged into the card, stats down to Streak and Rank | done | not done, the four stat cards stay (a desktop has the room) |
| Closed fold (`useClosedRecord`, EVM only) | done | done |
| Paper rows carry what each made (off the paper ledger) | done | done |
| Sort control, "reading…" states | not built | not built |
| Closed positions on paper | not built | not built |
| "Every number" as one list: each position once, live name and value (`madeRows`) | done | not needed, the drawer has only its strategy table |
| The position record keeps the row's name | done | not done |

Where it differs from the text below: older closed positions open in Pro, as on the board, not in
"Every number"; and the fold's count comes from the keys, corrected once the records load.

## The problem

Today the screen lists the same positions twice, under two names and with two different numbers.

| | "What you made" card | "Your money" list |
|---|---|---|
| Source | the index's PnL book (`boardPositions`) | the live book (`b.holdings`) |
| Name | the token: **USDY**, **sUSDai** | the money: **Dollars via Ondo**, **Dollars via USDai** |
| Sub-line | Levered · borrows USDC · $2k in it | Levered ×8.7 · 6.8% from liquidation |
| Value | "$2k in it", rounded | $1,955, exact |
| Made | +$7.58 | +$7.58 made, again |
| Tap | nothing | opens the ticket |

A reader sees four rows for two positions. They have to work out that USDY *is* Dollars via Ondo,
that "$2k in it" *is* $1,955, and that +$7.58 appears twice because it is the same figure. The
card's rows are also the only ones that do nothing when tapped.

Two smaller repeats sit above it: the balance chip in the bar already says "$2k · +$1.6 a day",
and the first two stat cards ("You have", "Earning") say it again.

Closed positions are not on the screen at all. A reader who closed a loop last week has no way to
see what it made short of opening "Every number".

## Principles

1. **One position, one row, one name.** The live holding is the row. The index's figure is a
   field on it, not a second row.
2. **The card summarises, the list itemises.** The card answers "how am I doing overall". The
   list answers "which one did it". Neither repeats the other.
3. **Every row opens something.** Open rows open their ticket. Closed rows open their record.
4. **Sums reconcile on screen.** Any total the reader sees is the sum of rows they can see or
   unfold, and says what it covers.

## The layout

```
‹  (face)                              [ $2k  +$1.6 a day › ]

You                                          [ All chains ⌄ ]

┌ Streak ────────────┐ ┌ Rank › ───────────┐
│ 🔥 12              │ │ #41               │
│ days in a row      │ │ on the board      │
└────────────────────┘ └───────────────────┘

┌────────────────────────────────────────────────────────┐
│ You have                               Made so far     │
│ $1,964.50                              +$7.62          │
│ +$1.55 a day · $566 a year             26.3% a year    │
│                                                        │
│ ████████████████████████████████████████████████████   │
│ ● Farming +$7.62     ● Price $0                        │
│                                         ╱╲  ╱╲╱        │
│ ───────────────────────────────────────╱  ╲╱           │
│ Every number ›                                         │
└────────────────────────────────────────────────────────┘

Positions                               [ Value ⌄ ]

┌────────────────────────────────────────────────────────┐
│ (USDY) Dollars via Ondo                      $1,955  › │
│        USDY · ×8.7                     +$7.58 made     │
│        6.8% from liquidation           +$1.55 a day    │
└────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────┐
│ (sUSDai) Dollars via USDai                    $9.50  › │
│        sUSDai · ×6.8                   +$0.04 made     │
│        5.2% from liquidation                           │
└────────────────────────────────────────────────────────┘

Closed · 3                               +$41.20 made  ⌄
┌────────────────────────────────────────────────────────┐
│ (USDe) Dollars via Ethena                 +$38.10    › │
│        Closed 12 Oct · $1.2k at work on average        │
└────────────────────────────────────────────────────────┘

What the people you follow did
```

### The summary card

One card holds both headline numbers side by side: what you have now, and what you have made.
Under it, the farming and price bar, the legend, the day-by-day line and "Every number".

- The per-position rows leave the card. This is the whole fix for the duplication.
- The sentence ("Almost all of it is farming…") goes when the split is 80% or more one way,
  because the bar and legend already say it. It stays for a mixed or losing split, where the
  words carry something the bar does not.
- "Not in this figure: 1 drawing now" stays, since it explains a gap between the two numbers.
- "You have" and "Earning" leave the stat grid and live here. The grid keeps Streak and Rank.
- The header line "since each position opened · from the index's records" shrinks to a caption
  under "Made so far": "on your open positions".

### The row

One component for open and closed, built on today's `Position` row.

| Slot | Open position | Closed position |
|---|---|---|
| Face | token mark, loop pair for a loop | same, at 60% opacity |
| Title | the money in Lite's words: "Dollars via Ondo" | same |
| Line 2, left | token and lever: "USDY · ×8.7", or "USDC · Deposit" | "Closed 12 Oct · $1.2k at work on average" |
| Line 3, left | the risk line, amber or red, only for a loop or loan | none |
| Right, top | value now, bold | what it made, coloured by sign |
| Right, 2 | "+$7.58 made", coloured by sign | "4.1% a year" when the index gives one |
| Right, 3 | "+$1.55 a day", grey, hidden under a cent | none |
| Tap | the ticket (manage, share) | the record (`/position`) |

Three changes from today's row:

- **The token joins the money name.** "USDY · ×8.7" under "Dollars via Ondo" kills the
  two-name problem. A reader who thinks in tokens and one who thinks in dollars both find it.
- **"Made" takes the colour.** It is a fact about the past and the figure the card totals.
  "A day" is a forecast, so it goes grey. Today the colours are the other way round.
- **The risk line gets its own line.** It no longer competes with the description for one
  truncated line.

Row states the index creates:

| State | Right, 2 shows |
|---|---|
| Figure drawn | "+$7.58 made" |
| Index is reading the position | "reading…" in grey, no figure |
| Index has not seen it yet | "made: within a few hours" in grey |
| Index does not support the venue | nothing, and the card's "Not in this figure" names it |

A missing figure must never render as "+$0.00". That reads as "made nothing".

### Sorting

A single quiet control on the list header, default **Value**. The other choices are **Made** and
**Risk** (closest to liquidation first). Three positions do not need it, so it shows from four
rows up.

### Closed positions

A folded section under the open rows. The fold header carries the count and the subtotal, so
the reader gets the answer without opening it.

- Folded by default. It remembers being opened for the session.
- Newest first, five shown, then "Show all" which opens "Every number".
- Data is what the board already uses for an opened wallet: `useClosedPositions` and
  `closedPosition`. Each row costs one series request, so they are fetched only when the fold
  opens. The header's count comes from the keys alone. Its subtotal appears once the rows load.
- Paper mode: the paper ledger's closed positions, same rows.

### What the totals mean

The index's book total covers open positions only (`pnlSummary`: "since you opened these
positions"). Closed positions are separate records. So the screen states three things and they
add up:

- The card: **made on open positions**, equal to the sum of the "made" figures on open rows.
- The fold header: **made on closed positions**, equal to the sum of the closed rows.
- "Every number": the lifetime total of both.

If the index later serves a lifetime total in one call, the card can lead with it and show
"open +$7.62 · closed +$41.20" beneath. Until then the card must not claim more than it sums.

## What moves, what goes

| Today | After |
|---|---|
| Stat grid: You have, Earning, Streak, Rank | Streak, Rank |
| "What you made" card with four position rows | Summary card, no rows |
| "Your money" list | "Positions" list with the made figure promoted |
| No closed positions | "Closed" fold |
| Card rows not tappable | Every row opens something |
| `/made` "Every number" | Unchanged, also the home of "Show all" closed |

## Build order

1. **Remove the rows from the card and relabel the row.** Phone and web. Token on line 2,
   made coloured, a day grey, risk on its own line. This alone removes the confusion and touches
   no data code.
2. **Merge "You have" and "Earning" into the card.** Stat grid drops to two.
3. **Closed fold.** A hook in `packages/app` that wraps `useClosedPositions` and the lazy series
   reads for the signed-in owner across both wallets, then the fold on both apps.
4. **Sort control and the reading states.**

Steps 1 and 2 are a day. Step 3 is the only one with new data plumbing.

## Open questions

- **Loans.** A loan row shows what is owed, not a value. Does "made" belong on it at all, given
  its figure is mostly the collateral's price? Suggestion: show it, without a yearly rate, as the
  ticket head already does.
- **Several positions in one strategy.** Two sub-accounts in the same loop are two rows today.
  Keep them as two rows and add the venue to line 2 only when a title repeats.
- **Pro.** Pro's You can adopt the same row. Its extra columns belong in the ticket, not the row.
- **Closed and the chain chip.** Closed rows should follow the chain scope like open ones, and
  the fold header should count only what is in scope.
