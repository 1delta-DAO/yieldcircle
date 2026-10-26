# 0017 — One position list: the PnL book folded into Positions

- status: **built 2026-10-26.** Differences from the plan below:
  - The types were not moved. `model/bookJoin.ts` takes a structural `BookRecord` (as `PnlRecord` in
    `holdingPnl.ts` does), and the app's `PnlBookPosition` fits it.
  - There is no `unsupported` card state. A leg on a venue the index does not follow has no card
    either, so the state could never show.
  - The orphan line is text only (no link that clears the chain filter).
  - The Lite "Every number" drawer (`LitePnl`) keeps the strategy table, since there are no cards
    beside it. The table is off only where `WalletPnl` gets `cards`.
  - Checked on the live EVM index: 114 of 114 book positions across 40 top wallets joined a card, 0
    orphans. Solana is not checked yet.
- area: `src/ui/Wallet.tsx` (`Book`, `PosCard`, the Positions section), `src/ui/WalletPnl.tsx`
  (`Strategies` goes, `Book`/`Chart`/`Coverage` stay), a new pure join in core
  (`model/bookJoin.ts` + test), `@yieldcircle/app/index/pnl` (types only), `styles/app.css`
  (`.wpnl-strats` / `.wpnl-srow` go, `.posc` gains a PnL column).
- depends on: nothing upstream. Both halves are already on the page: `useAccountPnlBook`
  (`/accounts/:a/pnl`) and `useIndexPositions` (`/positions/:a`).

## What happened

A wallet's profile (e.g. "Steady Nimbus", 20 positions, $2.4m) shows its open positions **twice**:

1. **What it made** has the four totals, the chart, and then a strategy table: `WETH ↺ RLUSD · loop ·
   Spark · Ethereum · $219k now · −$98k · −$485 · −624 %`, and so on for 9 rows.
2. **Positions**, directly under it, has the same positions again as cards: `WETH / RLUSD loop ·
   Spark · $224,083 equity · −3.63 %`, with its legs, Copy and PnL.

These are the same objects under two names (`WETH ↺ RLUSD` vs `WETH / RLUSD loop`), in two orders
(|PnL| vs equity), with two sets of numbers (lifetime PnL vs current rate). A reader has to match
rows by eye to see that the loop earning −3.63 % now has lost $98k since it opened. That pairing
is the most useful thing on the page, and the page leaves it to the reader.

## Goal

One list. Each position card shows **what it is, what it's worth, what it earns now, and what it
has made since it opened**. "What it made" keeps the account-level story (totals + chart) and
loses its table.

## Why it can be one list: the keys already join

- `PositionGroup.key` (positions route) and `PnlBookPosition.key` (pnl book) are both the index's
  **netting key**: `chainId|account|posId|<risk set>`, where the risk set is the uid's first
  segment, or the whole uid on a `vault.*` (pos-indexer `docs/net-positions.md`).
- Both are already passed to the same `openPnl(who, key)` → `PnlDrawer` → `positionSeries`. The
  strategy row opens "its biggest position" by `p.key`; the card opens by `g.key`. Same key space.
- A book **strategy** is just `positions.filter(p => p.strategyKey === s.key)`. On the screenshot
  that's 9 strategies over 9 positions, so it's 1:1. Where a strategy has several positions (the
  same loop on two chains or two sub-accounts), each card shows its own figure, and the strategy
  sum is no longer shown as a row (see "Open questions").

So the join is `book.positions` by `key` onto `groups` by `key`. No new route.

## Design

### 1. The join (core, pure, tested)

`packages/core/src/model/bookJoin.ts`:

```ts
export interface CardPnl {
  status: 'ok' | 'pending' | 'drawing' | 'unranked' | 'unsupported' | 'none'
  pnlUsd: number | null; yieldUsd: number | null
  pnlAprPct: number | null; yieldAprPct: number | null
  since: string | null; strategyKey: string | null
  /** the strategy's chart hue, when "By strategy" draws it */
  queuePosition?: number | null
}
export function joinBook(groups: PositionGroup[], book: AccountPnlBook | null | undefined): {
  byKey: Map<string, CardPnl>
  /** book positions with no card (the chain filter cut them, or the positions route lacks them) */
  orphans: PnlBookPosition[]
}
```

- Match on `key`, lower-cased **only for EVM** (a Solana key is case-significant, as in
  `useAccountPnlBook`).
- `groupsOrLegs`' fallback keys (`marketUid|side|posId`, an older index with no `groups`) never
  match. Those cards get `status: 'none'`, which is fine: that index has no book either.
- `status`: `ok` with a figure; `pending` + `queuePosition != null` → `drawing`; `pending` →
  `pending`; any other book status → `unranked` (its words come from `coverage.unranked`); a card
  whose lender/chain is in `book.unsupported` → `unsupported`; not in the book at all → `none`
  (below `PNL_REQUEST_MIN_USD`, or not on the board yet).
- Types: the core can't import `@yieldcircle/app`, so `PnlBookPosition` / `AccountPnlBook` move
  to core (`index/types.ts`) and `app/index/pnl.ts` re-exports them. `model/holdingPnl.ts`'s
  `PnlRecord` already lives there, so this follows the existing direction.
- Test: the screenshot's wallet as a fixture (9 book positions, 20 legs). Every `ok` book position
  lands on a card, orphans are empty with all chains selected, and a single-chain cut produces
  orphans that are exactly the other chains' positions.

### 2. The card gains a "since opened" column

`PosCard` today: `[token] name · venue · pills / meta | value / sub | rate | Copy PnL`.

```
 [◎] USDe / RLUSD loop  Morpho 92  7.81×                 $1,061,960   −26.71%    −$28k    [Copy]
     Ethereum · $8.3m collateral over $7.2m debt · 44%      equity     now        −41% a yr
     ▾ Holds Collateral USDe …   Owes Loan RLUSD …                                since Jul 31
```

- New cell `posc-p`: lifetime PnL (big, signed, red/green) over `{pnlAprPct} a yr` or `since
  {date}`. Tooltip: `yield −$28k · price move −$0.4k`. That's the strategy row's Yield column,
  moved into the tooltip so the card stays at 4 numbers.
- Same caps as `pnlLine` (`model/holdingPnl.ts`): no yearly rate past ±100 % or on a loan. The
  screenshot's `−624.07 %` and `−698.52 %` are exactly the blown-up short-span figures that rule
  hides. Today the table shows them raw.
- Non-`ok` states, in words and small: `drawing…`, `waiting`, `no record` (title: why),
  `not followed` (unsupported venue). Never `$0`.
- The **PnL button goes**. The figure itself is the button (it opens the drawer, as the card's
  head already does). Copy stays.
- `rate` is labelled `now` under the figure so the two percentages can't be confused (−26.71 %
  now vs −41 % a year since opened).
- Mobile width: the PnL cell drops under the value (the `.posc` grid already wraps the rate).

### 3. "What it made" loses its table

- `Strategies` and `.wpnl-strats*` are deleted. `Book` keeps `wpnl-top` (Total PnL · Yield · Price
  move · Capital), the chart, and the Total / By strategy toggle.
- **By strategy** still draws the top 8 strategies' lines. Their legend moves onto the cards: a
  card whose `strategyKey` is charted gets the hue swatch (`wpnl-sw`) before its name while the
  toggle is on. `Book`'s `hues` map is lifted to `Wallet` (or passed down via the join).
- The coverage sub-line stays on "What it made" (it's about the totals).

### 4. One order

Positions are ordered by equity today, the strategies by |PnL|. Add a small segmented control on
the Positions header: **Value · PnL** (default Value, per-viewer in `localStorage`, wrapped in
try/catch). With PnL, `none`/`pending` cards go last.

### 5. Orphans

A book position with no card (another chain selected, or the positions route dropped it) is not
silently lost. The Positions sub-line says `+ 2 on other chains · −$3.1k` (a link that clears the
chain filter). Single-chain view: the totals above are still all-chain (the book has no `chainId`
param), so the sub-line says so: `PnL totals are across all chains`.

## Not in scope

- **Own page.** Same code path: `WalletPnl` is shown after the sync, and the Positions list there
  is the index after the sync. Nothing changes about which source is read. The You/Lite holdings
  (`useHoldingPnl`) already show a per-position figure and are untouched.
- **Closed positions** (`WalletClosed`) stay their own section.
- **Paper** accounts have no book. Cards render as today.
- Mobile (`mobile/`) has no wallet profile yet. When it gets one, `joinBook` is in core for it.

## Open questions

1. **A strategy held more than once.** The table summed it (`· 2 positions`). The cards will show
   each figure on its own. Is a per-strategy sum still wanted anywhere? Proposal: no. If it's
   needed, a "By strategy" grouping of the cards is a later ticket.
2. **Book APR vs card netting.** The book's `pnlAprPct` is over capital-days and the card's rate is
   over equity. Both are correct, but on a 7.81× loop they'll look unrelated. The `now` / `a yr`
   labels are meant to cover this. Check with a real reader.
3. Does `positions[].key` match `groups[].key` on **every** lender shape? Verify on a live wallet
   per family (Aave cross-margin, Morpho pair, Euler sub-account, MetaMorpho vault, Fluid NFT,
   Solana). The acceptance bar is **0 orphans with all chains selected**. Any mismatch is a
   pos-indexer bug, not something to patch around here.

## Done when

- The profile shows one list. Every card with a drawn record shows its lifetime PnL, and every
  other card says why it has none.
- "What it made" = totals + chart, no table, and By strategy still works with swatches on the
  cards.
- `joinBook` has a test, and `pnpm build` passes.
- The screenshot's wallet: 9 of 9 figures on cards, 0 orphans, no `−600 %` on screen.
