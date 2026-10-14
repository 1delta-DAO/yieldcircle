# 0011 — Borrow as its own tab, any asset out, by amount, on collateral already in

- status: **built 2026-10-14**, all four parts (see "As built"). Not committed or deployed.
  Follows [0008](0008-borrow.md), [0009](0009-stocks.md), [0010](0010-borrow-front-door.md).
- area: `src/ui/Shell.tsx` (tabs), `src/ui/Earn.tsx` (the digest), `src/ui/BorrowPage.tsx`,
  `src/ui/BorrowList.tsx`, `src/ui/BorrowTicket.tsx`, `src/ui/AssetPage.tsx`, `src/model/borrow.ts`,
  `src/model/positions.ts`, `src/sdk/queries.ts`
- depends on: nothing outside this repo. Every API capability below is already on worker-api
  (checked in `~/lending-sdks/packages/worker-api/src` on 2026-10-14).

## As built (2026-10-14)

Where this differs from the assessment below, this section is what the code does.

**§1 The tab.** Borrow is the fourth of five tabs (`Shell.tsx`), icon a vault with an arrow out.
`onBorrow(route)` lights it on `#/borrow`, on any category page with `k=borrow`, and on the
Stocks shelf unless a deposit row is picked; Earn lights everywhere else on the catalogue. Earn's
subtitle is "deposit, and earn on it"; Borrow's is "put up what you hold and take liquidity out,
without selling". Earn's "Borrow without selling" band is gone, and its Stocks tile shows the lend
side ("lend up to 6.33 % · 7 markets to lend to", `#/STOCKS?k=simple`). The "or borrow up to"
fragment on Earn's "Your money" rows stays as the cross-link. A category page on its Borrow
segment has the crumb "‹ Borrow". The phone bar is five columns.

**§2 Any asset out.** `BorrowOffer.out` is `USD | ETH | BTC | MORE` (`outOf`). A same-money pair
(WETH against WETH, cbBTC against WBTC, JitoSOL against SOL) is left to the loops. The route
carries `out=`; `useBorrowOffers(…, { out })` asks the four collateral families against that
family's debt tags (`eth,lst,lrt` · `btc` · `wnative`), 2 pages each, only once picked. The "Take
out" chips are one grouped `<select>`. Headlines, `borrowRoom` and `bestOfferFor` stay dollar
figures. A coin loan's liquidation line is a ratio ("If NVDA falls below 0.03391 ETH (−63 % from
0.09042) … ETH rising counts as much as NVDA falling"). Positions: a cross-money debt in ether,
bitcoin or a native coin is a `borrow` holding with Pay back, not a "price bet" loop. Verified:
15 ether loans against stocks (Venus on BNB, Layerbank on Robinhood), 64 bitcoin loans against
ether.

**§3 By amount.** The slider row holds an amount box, in the token by default (500 USDC sends
exactly 500 USDC) with a `$` ⇄ switch. On a phone the box takes the slider's row. Over the cap the
box turns red, says "most here: $557" and the button says the same. Typed with the Put up box
untouched, the box fills with `collateralFor` (the Safe chip's depth), never under the venue's
`minDeposit`; once the reader sets Put up it stays, and a link offers "put up 2.184 SPYx to start
Safe ›".

**§4 Collateral already in.** Lending deposits carry `marketUid`; `depositsAsLoans` reads one in
an offer's collateral market as a $0 loan (`putUp`). The ticket then shows "50,018 WETH already
put up at Aave V3 · nothing owed" instead of tabs, an optional Add collateral box at 0, and a real
Safe chip; the build is a single `borrow` with the account id (built for a real wallet: one
transaction). `#/borrow` gives such a deposit its own card, and list rows say "already put up".
`owedOf` / `collateralOf` count every leg, and Pay back keeps an account's other debt
("the GHO the account also owes stays"; no "take all collateral" while it is owed).

**Differences from the assessment.**

- **The range route cannot read an account** (measured: two very different Aave wallets got the
  same answer, and 0 for a deposit of 0). So it is asked only for a fresh loan; an account that
  holds something uses the model over every leg. This also fixed an older bug: adding collateral
  to a running loan was capped by a range that could not see the loan. Upstream fix needed in
  worker-api before the venue's own number can be used there (docs/apis.md).
- **The simulation** on the action routes comes back `null` on GET builds; the ticket falls back
  to its own health, as before.
- **The cheaper-elsewhere nudge** is off on collateral already in: moving is a new loan, not a switch.
- **Fixed on the way:** `offerFromHolding` guessed 6 debt decimals (wrong for BNB's USDT and every
  coin); holdings now carry `debtDecimals`. The Stocks shelf's "Lend to them" bounced back to
  Borrow (the router dropped `k=simple`); it sticks now.

**Verified.** Tests 71 pass (11 new). `pnpm build` passes. In the browser at 1280 and 360 px:
the tab and its highlight on ten routes, Earn without borrow rates, the dropdown on Stocks
(ether) and Ether (bitcoin), a coin-loan ticket with a typed 0.25 ETH filling the collateral, an
over-cap dollar ticket, a $121m WETH deposit on Aave (card, ticket, list pills, viewed with
`?as=`), and a two-debt Aave loan's Pay back.

**Not verified.** Nothing was signed. A coin loan on paper was not placed.

## Why

Borrowing works (0008–0010) but is filed under a tab called Earn, only lends dollars, sizes the
loan from the collateral side only, and does not see collateral a wallet has already supplied.
Four changes, assessed one by one below, with what the code does today and what it would take.

## 1 · A Borrow tab

**Today.** The bar has four tabs (`Shell.tsx:47-50`: Home · Feed · Earn · Board). `#/borrow`
exists (`BorrowPage`, holdings first) but is reached only through the Earn digest's "Borrow without
selling" band, the money sheet's "Borrow cash" button and the category chips. The Earn digest's
Stocks tile reads "borrow 79 % · from 0.76 %" under a heading that says *Earn · what you can hold,
and what it can earn*. The tab highlight is by view only (`on: ['earn', 'group', 'token']`), so an
asset page on its Borrow segment (`#/ETH?k=borrow`) lights up Earn.

**Proposal.** A fifth tab, **Borrow**, pointing at `#/borrow`, between Earn and Board. Two
sentences, one per tab, as the page subtitles:

- Earn: *deposit, and earn on it.*
- Borrow: *put up what you hold and take liquidity out, without selling.*

What moves:

| From | To |
|---|---|
| Earn's "Borrow without selling" band (`Earn.tsx` `BorrowBand`) | the Borrow tab's top band (it is `BorrowCats` + room already) |
| Earn's Stocks tile (borrow numbers) | Borrow. In Earn the tile shows the *lend* side ("Lend to them", 13 rows) or is dropped: Earn must not quote a borrow rate |
| "or borrow up to $X" fragments on Earn's "Your money" rows | keep: they are the cross-link from Earn to Borrow, one tap |
| the category pages' Borrow segment (`#/ETH?k=borrow`, `#/STOCKS`) | stays where it is, but highlights the Borrow tab: `Shell` matches `route.k === 'borrow'` (and `STOCKS` with no `k`, since its default is borrow) to the Borrow tab, else Earn |

The Borrow tab's page is `BorrowPage` as built, plus the category list (image 2) reachable from
it, so a reader who holds nothing can still browse by shelf and by take-out asset.

**Phone.** The bar sits along the bottom under 768 px. Five tabs at 360 px is 72 px each, enough
for icon + label; the failure the Shell comment records was eight destinations plus six controls.
Five is what a banking app has. Still, this is the memory rule "few tabs" being bent once, on
purpose; nothing else gets a tab after this.

**Effort.** Half a day: the tab, the highlight rule, moving the band and the tile, the two
subtitles.

## 2 · Take out: any asset, from a dropdown

**Today.** Only dollars come out. `offerFromRow` returns null unless the debt is money `USD`
(`model/borrow.ts` ≈ line 55), and every offer request asks `debtTags=stablecoin`
(`sdk/queries.ts:252-256`, `STOCK_BORROW`). The "Take out" chips on a list (`BorrowList.tsx`) are
the dollar symbols among the offers.

**The API already lends anything.** `pairs/optimize` takes `debtTags` (`eth`, `btc`, `wnative`,
`lst`, `lrt`, `savings`, `pendle`, `rwa`…), `debts` and `debtGroups`
(`worker-api/src/v1/openapi/data/lending-pairs-optimize.ts`), so ETH-out, BTC-out and LRT-out
offers are one filter away. No upstream work.

**What it takes here.**

1. **Requests.** Three more families next to the dollar ones, each 3 pages:
   `debtTags=wnative,eth`, `debtTags=btc`, `debtTags=lst,lrt`. Or, lazier and cheaper, one
   request on demand when the dropdown picks an asset: `collateralTags=<family>&debtGroups=<picked>`.
   Recommended: the three families, cached 10 min like the rest, so the dropdown's counts are
   known before it opens.
2. **Model.** Drop the `USD` gate; keep a `debtMoney` on the offer. `pegged` becomes "same money
   both sides" (ETH against wstETH is pegged-ish the way USDC against USDe is). The liquidation
   line is a **ratio**, not a price: "If ETH falls below 0.031 BTC (−38 %)". `liquidationPrice`
   already returns the debt-unit price; it only needs the sentence to say the debt's unit instead
   of `$` when the debt is not a dollar. Zones: crypto borders, applied to the ratio's drop; both
   legs move, so the ratio is at least as volatile as the collateral alone, and the Safe border
   should not get narrower for these pairs.
3. **Positions.** `holdingsFrom` files a non-dollar cross-money debt as a `directional` loop,
   "a price bet the app has no ticket for" (`model/positions.ts` ≈ line 140). An ETH loan taken
   against TSLAx would land there, with loop buttons and no Pay back. Rule: cross-money debt is
   `kind: 'borrow'` whenever the debt is a base asset or an LST/LRT (anything the Borrow
   catalogue lends), `directional` only for the rest.
4. **Exclusions.** Same group both sides (ETH against WETH, wstETH against ETH) is a loop, not a
   loan: keep those out of Borrow so the two catalogues do not overlap.
5. **UI.** The "Take out" chips become a dropdown with groups: Dollars (USDC, USDT, PYUSD, …) ·
   Ether (WETH, wstETH, weETH) · Bitcoin (WBTC, cbBTC) · More, default *Any dollar*. The ticket's
   header reads "Borrow ETH against TSLAx"; the monthly cost stays in dollars (the debt's price is
   on the offer). The headline numbers ("from 0.76 %", "borrow up to $X") stay dollar-based; a
   non-dollar pick re-reads them for that asset.

**Effort.** About 2 days: requests and model with tests (half), positions rule (half), the ratio
sentence and the dropdown (one).

## 3 · By amount in the ticket

**Today.** "Take out" is three chips and a slider, in dollars (`BorrowTicket.tsx` ≈ lines
243-260); there is no typed box, so "exactly 500 USDC" means dragging to 500. A typed amount over
the cap is clamped silently (`take = min(take0, cap)`). The Pay back pane already types
(`AmountBox`).

**The API already answers the other direction.** `range/deposit-borrow` takes `borrowAmount` and
returns `minDeposit`, the least collateral for that loan **given the account's existing
headroom** (`worker-api/src/data/routes/range/depositBorrow.ts:182-194`). That is 0010 item 5,
still open.

**What it takes here.**

1. An `AmountBox` beside the slider with a unit toggle `$` | `USDC` (`AmountBox` already renders
   `$` as a unit). Typing sets `take` in dollars; the chips light up when they match.
2. Over the cap: say it ("the most you can take here is $1,240") and hold the box red, instead of
   clamping.
3. **Dollar first.** When the reader types an amount with nothing put up: a real wallet asks the
   range with `borrowAmount` → `minDeposit`; paper and logged-out readers get the model's inverse,
   `collUsd = take / (liqLtv · (1 − borders.safe))`, so the suggested collateral lands in Safe, not
   at the floor. The "Put up" box fills with that number and stays editable.

**Effort.** One day (0010's estimate holds).

## 4 · Collateral already in, and not typing a value

Checked against the code; three cases.

| Case | Works? | Why |
|---|---|---|
| **A running loan on the same pair** (collateral + debt in one account) | **Yes.** | `AssetPage` / `BorrowPage` pass the `kind: 'borrow'` holdings with matching legs; `heldUsd` / `owedUsd` feed `collUsd`, `put` defaults to 0 (`BorrowTicket.tsx` ≈ line 157), the chips size the *extra* debt, and the build goes to `lendingAction('borrow')` with the `accountId`. Nothing needs typing. |
| **Collateral supplied, no debt yet** (5 ETH on Aave, 0 ETH in the wallet) | **No.** | A deposit-only account is `kind: 'simple'` (`positions.ts` ≈ line 153), with no `collateralUid`; `heldLoans` only collects `kind: 'borrow'` (`AssetPage.tsx:71`). The ticket opens on a fresh loan: `put` defaults to the wallet balance (0) or 1000 / price, `collUsd = putUsd`, so it reads "You have 0 ETH · not enough" and the cap is 0 when `put` is 0. The deposit is invisible. `#/borrow` has the same blind spot: "Against what you hold" reads `idlePerChain` only, so this wallet sees "nothing you hold here is lent against yet". |
| **A running loan with several collaterals** (ETH + wstETH up, USDC owed) | **Partly.** | `collateralUsd` is the biggest supply leg only; the rest sit in `others`. The model's cap is understated. The venue's own cap would be right, but the range is asked only while `dPut > 0` (`enabled: … dPut > 0`), so with nothing new put up it is never read. |

**Fix.**

1. **See deposit-only collateral.** Give simple lending holdings their `marketUid` (it is in the
   key already) and match them to an offer by collateral market + chain, as `heldLoans` matches
   loans. Hand such a holding to the ticket as `h` with `debtAmount: 0`, `collateralUsd:
   valueUsd`; the mode row then reads "5.0 ETH in already · owes $0".
2. **Ask the venue with nothing new.** The range route accepts `depositAmount=0`: `depositRaw !=
   null` → capacity after a zero deposit = the account's existing headroom
   (`depositBorrow.ts:148-160`). Enable the range whenever a real wallet and an account exist, not
   only when `dPut > 0`. That also fixes the several-collaterals cap and honours e-mode.
3. **The box.** "Put up" becomes "Add collateral · optional" when anything is in; the empty box is
   valid. The blocking rule stays "Put something up or take something out".
4. **`#/borrow` cards.** Add supplied-but-unborrowed deposits to "Against what you hold":
   "5.0 ETH already at Aave · borrow up to $X" (room from the model until the range answers).
5. Off-menu: `offerFromHolding` for a deposit-only account on a market the list does not carry,
   so "borrow against what is already in" works there too (Pay back already does).

**Effort.** One day. Items 1–3 together are the fix; 4 and 5 are the same change on the other
surfaces.

## Order

1. Collateral already in (§4): a correctness gap on a flow the acceptance list in 0008 implies
   (a reviewer with ETH on Aave today cannot borrow).
2. By amount (§3): small, and 0010's open item 5.
3. The tab (§1): half a day, do it with §3 so the narrative and the ticket change together.
4. Any asset out (§2): largest, and the only one that touches positions and the catalogue's edges.

## What a reviewer does (acceptance)

1. With 5 ETH supplied on Aave Base and 0 ETH in the wallet: Borrow tab → ETH card says "already
   at Aave · borrow up to $X" → the ticket opens with "Add collateral · optional" empty → the Safe
   chip is a real number → Borrow $500 builds and sends with no collateral typed.
2. Type 500 in the Take out box with nothing put up: the Put up box fills with the collateral that
   keeps it Safe; the range's `minDeposit` is the floor it will not go under.
3. Type more than the cap: the box says the most, and the button does not send.
4. On the Stocks list, Take out ▾ → Ether → an SPYx → WETH row opens a ticket that reads "Borrow
   WETH against SPYx" with the line "if SPY falls below 0.19 ETH".
5. The Earn digest no longer quotes a borrow rate anywhere; the Borrow tab does; `#/ETH?k=borrow`
   highlights Borrow in the bar, `#/ETH` highlights Earn.
