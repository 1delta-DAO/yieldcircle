# 0010 — Borrowing, holdings first: a front door that is not a tab

- status: **items 1, 2 and 4 built 2026-10-14**, not committed or deployed. Items 3, 5, 6 and 7 open.
- area: new `src/ui/BorrowPage.tsx` (`#/borrow`), `src/ui/BorrowTicket.tsx` (the lender line),
  `src/ui/Positions.tsx` (the money sheet), `src/ui/AssetPage.tsx` (idle pills, the ticket's
  choices), `src/ui/BorrowList.tsx`, `src/ui/Earn.tsx`, `src/model/borrow.ts` (`bestOfferFor`),
  `src/state/AppState.tsx`, `src/App.tsx`, `src/styles/app.css`
- follows: [0008](0008-borrow.md), [0009](0009-stocks.md)

## Why

After 0008 and 0009 borrowing worked but was hard to find and hard to read:

- It was three levels deep: the Earn tab, then a category, then the Borrow tab, then a row. Earn's
  "Borrow without selling" band sat below Best rates.
- The money sheet, the one place that shows what a wallet holds, only said "Put to work". Home
  never mentioned borrowing.
- An idle balance on an asset page offered borrowing only when nothing could earn on it, so an
  ETH, BTC or SOL holder never saw it.
- The list was venue-first: 212 rows for Ether, each a collateral token, a dollar and a lender. A
  borrower asks how much they can take against what they hold, and what it costs.
- The ticket started from the collateral amount, not from the dollars needed.
- A running loan read like a deposit in the sheet, with no amount owed and no zone.

## The plan

1. **`#/borrow`**, holdings first. Not a tab: the bar keeps its four.
2. **The money sheet** gets two actions, Put to work and Borrow cash, and idle balances show both.
3. **A Home card**: "Need cash without selling? You could take up to $X against your ETH", only for
   wallets holding something a market lends against.
4. **The ticket picks the lender.** It opens on an asset, on the best offer for this wallet, with the
   other places folded into one line.
5. **"How much do you need?"** A dollar-first mode in the ticket, using the range route's
   `borrowAmount → minDeposit`.
6. **Loans read as loans** in the money sheet: what is owed and the zone, feeding the alerts.
7. **Search**: "borrow" and stock tickers open `#/borrow`.

## As built (2026-10-14)

- **`#/borrow`** (`BorrowPage.tsx`):
  - **Your loans:** what each owes and its health, opening the ticket on Pay back.
  - **Against what you hold:** one card per asset the wallet holds idle that a market lends
    against. Each card shows how much it could raise, held to the Safe zone (`borrowRoom`), and
    the rate and lender of the app's pick. Balances that would raise under $10 are left out.
  - **What people borrow against:** the assets with the most collateral put up, each market
    counted once. The two biggest stocks always show. With nothing held, this section stands
    alone, with up to eight cards.
  - **Browse by category:** the category chips, Stocks highlighted.
  - The ticket opens beside the page, as on an asset page. `?u=<asset>` alone opens the app's pick
    for that asset.
- **The app's pick** (`bestOfferFor`, tested): the list's order (`byOffer`), but a market on a
  chain where the wallet already holds the asset comes first.
- **The ticket's lender line** (`WhereLine`): "From Morpho · Ethereum · 3.02 % · lends 86 % ·
  90 other places ▾". Opening it lists the other places with rate, chain, legs, how far each
  lends, what is free, and "you hold it here". Picking one moves the ticket. This shows on new
  loans, from the borrow page and from an asset page's Borrow list.
- **The money sheet**: two buttons under the total, "Put to work · $27k idle" and "Borrow cash ·
  up to $7.5k". An idle balance gets a second row, "Or borrow against it · up to $X". The borrow
  offers are asked only while the sheet is open.
- **Asset page idle pills**: earning still leads. Where a balance can also be borrowed against,
  a second pill "or borrow $7.4k ›" sits beside it and opens the ticket on the pick.
- **Category Borrow tabs** start with a chip "Against what you hold", leading to `#/borrow`. The
  Earn band links there too.
- **Fixed on the way:** Max and the default amount round down, so a 6-decimal amount never
  exceeds the balance and reads "not enough".

**Verified** in the browser at 1280 and 360 px, viewing real wallets with `?as=`: the borrow page
with and without holdings, a card opening the ticket on the holder's chain, the lender list, the
money sheet actions, the idle pills, and the category chip. Tests 61 pass. `pnpm build` passes.

## Open

- **3. Home card.** Read `borrowRoom` over the wallet's idle balances, and show the card above the
  lanes when it is $100 or more. Half a day.
- **5. Dollar-first ticket.** Add a toggle on "Take out". From a dollar amount, compute the
  collateral with the range route for a real wallet, or with `debtAtDrop` inverted for paper and
  logged-out readers. About a day.
- **6. Loans in the sheet.** Show "owes $X · Safe" on `borrow` holdings in `AssetDetail` and the
  pills. Alerts on leaving Safe need pos-indexer tickets/0077. Half a day for the display.
- **7. Search.** Map "borrow", "loan" and "cash" to `#/borrow`, and a stock ticker to
  `#/STOCKS?u=<ticker>`. This depends on how `/find` ranks app pages.
