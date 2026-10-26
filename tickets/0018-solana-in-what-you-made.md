# 0018 — Solana in "What you made"

- status: **phase 1 built 2026-10-26.** Phase 2 is pos-indexer tickets/0095. Phase 3 is not started.
  Built as planned: the book types moved to core `index/types.ts`, `mergeBooks` + `sumSeries`
  (`core/model/pnlBookMerge.ts`, 5 tests), `accountsOf` (`app/book.ts`, which `useBook` now uses and
  returns as `accounts`), `useAccountsPnlBook`, `useHoldingPnl` per VM, `LitePnl` over both wallets, and
  `WalletPnl`'s `book` prop for the drawer. A failed book is named in "Not in this figure". The merged
  book drops fields only one index sends (`coverage.belowBoard`). Not checked with two live wallets
  connected; the Solana route's shape and CORS were checked against prod.
- area: `packages/app/src/index/pnl.ts` (`useAccountPnlBook`, `useHoldingPnl`), `packages/app/src/book.ts`
  (the `accounts` rule), a new merge in core (`model/pnlBookMerge.ts` + test), the book types (to
  core `index/types.ts`), `src/ui/lite/LitePnl.tsx`, `src/ui/lite/LiteYou.tsx`, `src/ui/WalletPnl.tsx`
  (takes a book, not only an address). Read only: `src/ui/Ticket.tsx` and `src/ui/BorrowTicket.tsx`
  (they call `useHoldingPnl`).
- depends on: nothing upstream for phase 1. Phase 2 may become pos-indexer tickets.

## What happened

With an EVM wallet and a Solana wallet both connected, You lists 20 positions in "Your money",
including **Dollars via Ondo** (USDY ↺ USDC on Kamino, ×9.3, $21). Two things are wrong:

- "What you made" says **on 15 of 20 positions**, and the "Every number" drawer has no Kamino
  strategy.
- The Ondo row shows `33.78%` with no PnL figure, while the EVM rows show `−$42 · 19.76%`.

## Why

**You asks one index about one address.** `useBook` reads the live positions for both wallets
(`accounts = { evm, sol }`, `packages/app/src/book.ts`). Everything PnL reads only `account`, which is
the EVM wallet when both are connected:

| caller | reads | result on a Solana position |
|---|---|---|
| `LitePnl` → `useAccountPnlBook(b.account, { own: true })` | `positions.1delta.io/accounts/<evm>/pnl` | not in the figure, counted in "of 20" only |
| "Every number" → `<WalletPnl addr={account} own />` | the same EVM book | no strategy row, no line |
| `useHoldingPnl(h)` (You's rows, the Lite ticket head, the loan ticket) | `useSession().account`'s book | `pnlOfHolding` filters on `chainId`, never finds it, so no figure |

The Solana index already answers the same book (`sol-positions.1delta.io/accounts/<sol>/pnl`,
pos-indexer `docs/sol-lifetime-pnl.md`), and `indexForAddr` already routes a base58 address there.
Nobody asks it from You.

There is a second effect. On Solana, `?request=1` on the book is **the only way** to put a wallet's
records ahead of the board, because that index has no sync route. You never sends it for the
Solana wallet, so its records are drawn only when the board gets to them.

## Plan

### Phase 1: two books, one figure (app only)

1. **Types to core.** Move `PnlBookPoint`, `PnlBookFigure`, `PnlBookStrategy`, `PnlBookPosition`,
   `UnsupportedLeg` and `AccountPnlBook` to core `index/types.ts`. `app/index/pnl.ts` re-exports
   them, so callers don't change.
2. **`mergeBooks(books)` in core** (`model/pnlBookMerge.ts`, pure, tested). Use the index's own
   rules (pos-indexer `docs/lifetime-pnl.md` "The wallet book") so the merged figure is what one
   index would have answered:
   - `total`: Σ pnl / yield / directional / capitalDays / positions / equity. APR =
     Σ PnL ÷ Σ capital-days × 365 (`figureOf`). `openDays` = max.
   - `coverage`: counts summed. `equityShare` weighted by equity. `unranked` merged per status.
   - `series`: summed on one UTC calendar. A line is 0 before its first day and holds its last
     value after its cut, so the merged line still ends on the headline.
   - `strategies` and `positions`: concatenated (the keys can't collide across VMs), strategies
     re-ranked by |PnL|. Only the first 8 keep a `series`, as each index does.
   - `unsupported` concatenated. `requestedAt` = the earliest.
   - One book in → that book out, unchanged.
   - Test: an EVM book and a Solana book with different calendars. Check that totals add, the APR
     is the capital-weighted one (not the mean), and the series ends on the summed total.
3. **`useAccountsPnlBook({ evm, sol }, { own })`** in `app/index/pnl.ts`: one `useAccountPnlBook`
   per address (same query keys, so the existing cache and the 20 s polling still apply), merged.
   It is loading while any book loads. If one book fails, the other is still shown and the page
   says which wallet is missing, never a silent partial.
4. **One rule for "whose book".** Export `accountsOf(session)` from `book.ts` (the line that builds
   `accounts` today: EVM `account`, Solana `account` or `solSigner` unless `viewAs`) and use it
   in `useBook` and in the PnL hooks, so positions and PnL can't disagree about which wallets are
   "you".
5. **`useHoldingPnl(h)`** reads the book of the holding's own VM: `h.chainId === 'solana'` → the
   Solana account, else the EVM one. That fixes the Ondo row, the Lite ticket head and the loan
   ticket together.
6. **You:** `LitePnl` takes `accounts` and calls `useAccountsPnlBook`. The "Every number" drawer
   gets the merged book. `WalletPnl` gets a `book` prop next to `addr`, or a thin `WalletPnlBook`
   that renders a given book. The drawer's Pro link stays on the EVM wallet's page until Pro has
   a cluster page (phase 3).
7. `own: true` for both addresses, so the Solana wallet's records are requested (the tier above).
   No `useAccountSync` for Solana: that index takes no hints.

**Done when** the screenshot's account reads "on 16 of 20" or better (all 20 once drawn). The Ondo
row and its ticket head show their figure. "Every number" lists the Kamino strategy and its line.
`pnpm build` passes and `mergeBooks` has its test.

### Phase 2: check the Solana record itself (index side, needs the wallet's address)

Phase 1 only helps if the Solana index has the position and draws it well. For the Solana address:

- `GET sol-positions.1delta.io/positions/<sol>`: is the Kamino USDY/USDC obligation there as one
  group? If it isn't, the ledger missed it. File a pos-indexer ticket with the obligation account.
- `GET …/accounts/<sol>/pnl?request=1`, then again after a lane tick: its `status`, then its
  figure. `pending` with a `queuePosition` is fine. A non-`ok` status after drawing is an index bug.
- **USDY yield: check it is counted as yield.** Since 2026-10-20 the Solana index takes a leg's money
  from token-lists' props (`asset_groups.exposure`), and USDY has `savings.base: USD`. So its accrual
  should count as yield, not price. Check it on the drawn record (pos-indexer 0095 item 3).
- Line depth: Solana lines mostly start 2026-10-03 on prod. A position older than that will read as
  "lifetime" over a few weeks. Say so on the row (`since` already carries the date).

### Phase 3: Pro wallet page for linked wallets (later)

Pro's `#/w/<addr>` is one address. With wallet links (`docs/wallet-links.md`), the owner's page
could show the cluster's books merged with the same `mergeBooks`, and the cards from both indexes.
That's a separate ticket. It touches the "never the index for your own positions" rule and the
sync path.

## Not in scope

- Paper (one ledger, already has both VMs).
- Mobile: no "What you made" yet. When it gets one, `useAccountsPnlBook` is in `@yieldcircle/app`.
- Closed positions on Solana (the index has none yet).
