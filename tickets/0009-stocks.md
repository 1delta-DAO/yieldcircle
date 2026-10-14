# 0009 — Stocks: borrow against tokenized stocks, lend to the people who do

- status: **built 2026-10-14** as a fifth Earn category (see "As built"). Not committed or deployed.
- area: new `src/ui/Stocks.tsx` (the shelf, `#/stocks`, and the ticker page), `src/ui/Earn.tsx` (a
  fifth group tile), `src/ui/Start.tsx` + `src/model/activity.ts` (a lane), `src/ui/Search.tsx`
  (tickers), `src/state/AppState.tsx` (the route), `src/sdk/types.ts` (`props.rwa` typing),
  `src/sdk/api.ts` (`collateralAssetClasses=` on the pairs call)
- depends on:
  - **[0008](0008-borrow.md) Phases 0–1** (the offers model, the ticket, balances for collateral
    the catalogue does not list);
  - **lending-sdks worker-api** deployed with the asset-class params (built 2026-10-14:
    `collateralAssetClasses=` / `collateralUnderlyingTickers=` on `/v1/data/lending/pairs*`,
    `assetClass` / `underlyingTicker` stamped on every row);
  - **pos-indexer** deployed with migration 0071 (`/asset-classes`, `assetClasses=` on the index
    routes; the client half — the Board's Stocks chip, the feed / Hot class filter — was built here
    2026-10-14 and hides itself until then);
  - token-lists regen with `rwa.underlying` (done locally 2026-10-14, to be committed);
  - **yield-tracer's xStock prices** (risk 3) before any number this page computes is shown.

## As built (2026-10-14)

**Decision (owner, 2026-10-14): Stocks is one of the overall categories, not a tab or a separate
shelf.** It is a fifth group beside US Dollar, Ether, Bitcoin and More (`GroupId 'STOCKS'`,
`#/STOCKS`). On the Borrow side it is its own category, emphasized. B2 and B3 below describe the
earlier shelf plan and are superseded where they differ.

- **The group.** One row per real-world ticker (`noteStock` in `model/assets.ts`, from
  `props.rwa` via `underlyingTickerOf`, never a symbol). Once noted, a stock token's address
  resolves to its ticker everywhere (`keyOfToken`), and `moneyOf` never calls a stock a dollar.
  The chips rank tickers by the collateral put up against them.
- **The page opens on Borrow.** Its segments are Borrow · Lend to them. "Lend to them" lists the
  dollar markets the stock loans borrow from, read from every deposit row before the one-per-venue
  cut (`earnAll`), since Kamino's xStocks USDC market lost to another Kamino USDC market there.
- **Emphasis on Borrow.** Every group's Borrow segment starts with category chips (`BorrowCats`),
  Stocks lit and marked new. The Earn digest has a Stocks tile (full width on a phone) and a
  "Borrow without selling" band with Stocks as its own line.
- **Equity zones** are 50 % / 25 % (decision 2 taken). The ticket adds a market-hours line when
  New York is shut.
- **Data.** The API already stamps `collateralAssetClass` / `collateralUnderlyingTicker` and
  answers `collateralAssetClasses=stocks` (measured 2026-10-14: 254 pairs over all chains).
- **Paper.** Loans against stocks are refused on paper until the price skew (risk 3) is fixed.

**Not built from the plan below:** a Home lane, search by ticker into `#/STOCKS?u=…`, today's
move on a ticker, issuer terms links and the one-time notice (decision 3 is still open), and
leveraged stock buys (decision 4).

## Why

Tokenized stocks are the narrative of the moment, and the money is already there: **$51.4m of
stock tokens sit as collateral** across five chains (measured 2026-10-14, B1), 77 % of it on
Solana. The Stocks shelf is "borrow against your stocks" + "be the bank for stock traders" + "who's
doing it": 0008's Borrow with a ticker-first front door and the social layer on top.

## What exists to build on

| Piece | Where | Reuse |
|---|---|---|
| Borrow: offers, ticket, loan positions, paper | [0008](0008-borrow.md) | the whole action side; this ticket adds no action code |
| Pairs by asset class | `/v1/data/lending/pairs/optimize` + `collateralAssetClasses=stocks` (`fetchOptimizerPairs`, `sdk/api.ts:124`) | the offer list per chain |
| Asset classes | `model/assetClass.ts` (`assetClassOf`, `underlyingTickerOf`, alias `stocks`), `ui/AssetClassFilter.tsx` (`ClassChip`), Board `x=stocks`, Hot / Feed class filter, `underlyingTickers=` on the index routes (`index/api.ts:48-60`) | the social half, already wired |
| The Earn group tiles | `Earn.tsx` `GroupTile`, `.tiles` (two abreast under 1000 px) | the shelf's front door |
| The Home lanes | `Start.tsx`, bands in `model/activity.ts` | a lane for stock borrowers |
| Deposit ticket | `SimpleTicket` (Earn deposit) | "be the bank" rows open it — no new action code |

## B1 · The market, measured (2026-10-14)

Stock set = token-lists `props.rwa` equity / pre-ipo / fund-etf (9,447 + 13 + 1,052 tokens, 18
chains + Solana); every pool from yield-tracer on those chains. `assetClasses=` is already live on
yield-tracer `/pools/latest` and `/pairs/leverage` and matched the address method exactly.

| Chain | Venue | Stock collateral | Borrow | LTV | Borrow APR | Stock $ |
|---|---|---|---|---|---|---|
| Solana | Kamino xStocks | SPYx, MSTRx, GOOGLx, QQQx, TSLAx, NVDAx, CRCLx, HOODx… | USDC, USDG | 0.30–0.73 | 7.3 % | $22.2m |
| Solana | Jupiter Lend vaults | SPYx $9.2m, NVDAx, TSLAx, QQQx | USDC, JupUSD | 0.65–0.75 | 7.9 % / 5.7 % | $13.5m |
| Base | Aave V4 Coinbase Stocks hub | META, NVDA, GOOGL, TSLA, AAPL, AMZN, MSFT (Coinbase `…c`) | USDC | 0.65–0.79 | 1.9 % | $6.0m |
| Robinhood (4663) | Morpho Blue, 82 pairs | Robinhood NVDA, SPCX, GOOGL, AAPL… | USDG | ~0.625 | 42 % debt-weighted | $4.0m |
| Solana | Kamino Sentora xStocks | SPYx, NVDAx, QQQx | PYUSD | 0.62–0.72 | 0.8 % | $3.2m |
| Solana | Kamino STRCx | STRCx | USDC | 0.50 | 8.2 % | $0.7m |
| Ethereum | Morpho Blue | wSPYx, SPYx, SPYon | AUSD, USDC | 0.63–0.86 | 4–35 % | $0.6m |
| BNB | Venus core | bStocks NVDAB, SPCXB… | any core asset | 0.50–0.60 | ~3 % | $0.5m |
| BNB | Euler V2 (69 vaults) | Ondo `…on` | USDT | 0.35–0.75 | 0–22 % | $0.1m |

Top tickers by collateral: SPY $16.5m, NVDA $7.9m, GOOGL $5.7m, TSLA $5.0m, QQQ $4.8m, MSTR $3.9m,
AAPL $1.6m, META $1.6m, SPCX $1.5m, CRCL $0.9m. **Lending side** (be the bank): Kamino xStocks USDC
6.1 %, Kamino STRCx USDC 6.8 %, Aave V4 Coinbase USDC 0.7 % (+~3 % Merkl to stock suppliers),
Robinhood Morpho USDG **27–55 % but 100 % utilized** (cannot withdraw). All venues have action
support in the SDKs (Kamino / Jupiter Lend via `calldata-sdk-sol`; Aave V4, Morpho, Venus, Euler
EVM). Raw pulls: pos-indexer session scratchpad 2026-10-14 (`pools_*.json`, `pairs.json`,
`stocks.json`) — re-measure when building, these move daily.

## B2 · Where it lives — a shelf, not a tab

**Decision taken (2026-10-14 review): no fifth tab.** `Shell.tsx:1-23` says the bar's fix was
fewer destinations, and the product rule is to ask which existing tab a job belongs in before
adding one. Stocks is a collateral class with a story, not a job: Home says where to start, Feed
what people do, Earn what pays, Board who wins. The shelf is **`#/stocks`** — a linkable, marketable
address — and it lights the **Earn** tab in the bar (`on: ['earn', 'group', 'token', 'stocks']`).
It is reached from:

1. **A fifth Earn tile** beside USD · ETH · BTC · More (`GroupTile`): "Stocks · $51m lent against
   · borrow from 1.9 %". The tiles already go two abreast on a phone; five tiles is two rows and a
   half, which is fine for a digest. The tile is the class's door, not a `GROUPS` entry — the
   asset model stays as it is.
2. **A Home lane** (`Start.tsx`, `activity.ts`): "Borrow against your stocks" with two or three
   ticker cards, proof from the strategy book like every other lane. Shown to everyone; first to a
   wallet that holds a stock token.
3. **Search**: a real-world ticker (`TSLA`) and every issuer's spelling of it resolve to the ticker
   page.

If a tab is ever wanted for marketing, it is a decision to re-open here, with these two costs
named: the bottom bar hard-codes four columns (`app.css:913`, `repeat(4,1fr)`), and the Shell's
own rule would need rewriting.

## B3 · The shelf — `#/stocks`

Four bands, top to bottom. On a phone each is one screen's worth, and the first band is the only
one above the fold:

1. **The ticker wall.** One tile per real-world ticker, not per token: `underlyingTickerOf` folds
   TSLAx (xStocks), TSLAon (Ondo), Dinari TSLA, Coinbase TSLAc and Robinhood TSLA into **TSLA**.
   Each tile: logo, ticker, today's move (which price series to read is open — risk 3),
   **"borrow up to 73 %" · "from 1.9 %"**, the venues as tiny marks, and **N wallets** (index).
   Sorted by collateral USD — SPY, NVDA, GOOGL, TSLA, QQQ, MSTR first, which is also what people
   search. A row of chips above: *All · Stocks · ETFs* (`assetClassOf`: `stock` vs `etf`), and the
   chain filter (`ChainChip`).
2. **Borrow against your stocks** (if the wallet holds any stock token — `assetClassOf` on the
   wallet's balances, which 0008 A7 makes visible): "You hold **2.0 TSLAx** ($860) — **take out up
   to $627**" → BorrowTicket. No stocks held → the tile tap opens the ticker page with *Get TSLAx*
   (GetAsset's swap: USDC → TSLAx on Jupiter / a DEX) and then Borrow — "buy and borrow" in two
   clear steps, never one hidden leveraged step (B5).
3. **Be the bank for stock traders.** The stablecoin side of the same markets: every debt market of
   a stock pair is a dollar market whose borrowers post stocks. Rows: "Lend USDC to stock borrowers
   on Kamino — **6.1 %**", with utilization in words ("92 % lent out — withdrawals can wait") and a
   hard warning at 100 % ("**fully lent out right now: you could not withdraw today**"). Opens the
   existing `SimpleTicket` (Earn deposit) — no new action code.
4. **Who's doing it.** The social layer, already wired to asset classes: the Board's Stocks chip
   (`/earners?assetClasses=stocks`) as "top stock borrowers / lenders", a feed strip
   (`/events/recent?assetClasses=stocks`) — "Amber Otter borrowed $12k against NVDAx · 4m" — and
   ratings on each venue (`RatingBar`). Every claim comes off the index; nothing invented.

**Ticker page** `#/stocks/<TICKER>`: the token variants by issuer ("xStocks on Solana · Coinbase on
Base · Robinhood on Robinhood Chain"), every borrow offer for any of them ranked by rate at the
user's size, the lend-side rows, holders and the feed for that ticker (`underlyingTickers=TSLA`
on the index routes — wired in `index/api.ts` already). Opening a ticket from here is BorrowTicket
with the collateral pre-set. The ticket's zone borders are the equity ones (decision 2), passed
to 0008's `zoneOf(drop, borders)`.

## B4 · Data plumbing

- Offers: `fetchOptimizerPairs(chain, { collateralAssetClasses: 'stocks' })` per chain where B1 found
  venues (Solana, 8453, 4663, 1, 56); rows carry `collateralAssetClass` + `collateralUnderlyingTicker`
  after the worker-api deploy. Until then, fall back to classing rows client-side from token props.
- `sdk/types.ts:100`: the catalogue's `props.rwa` type lacks `subType` / `underlying` — add them, and
  route every class decision through `assetClassOf` / `underlyingTickerOf` (verbatim copy, drift
  test already in place). **Never class by ticker** (a memecoin called TSLA exists on Ethereum).
- Balances: 0008 A7 adds the borrow offers' collateral addresses to the balance read, so a wallet's
  stock tokens show up; band 2 reads them through `assetClassOf`.
- Prices for "today's move" and the liquidation line: risk 3 before trusting them. **Paper**: a
  stock is not offered as paper collateral until the same fix (0008 A6).

## B5 · What the shelf deliberately does not do (v1)

- **No one-tap leveraged stock buy.** Borrowing USDC to buy more TSLAx is a cross-money loop; the
  loop machinery could do it, but a directional, weekend-gapping position deserves its own ticket
  and its own warnings. Later at the earliest, behind decision 4.
- **No borrowing stocks** (shorting). Only Kamino xStocks has real stock borrow ($0.2m); not v1.
- **No venue whose numbers are broken.** Edel (Ethereum) is excluded: its stock markets report
  $46.5m where ~$0.5m exists, 133 % utilization and 300 % rates (frozen oracles,
  pos-indexer `docs/sol-price-audit.md` §A). TermMax's stock "markets" on BNB / 4663 are option
  series, not loans (lending-sdks `TERMMAX.md:449`) — excluded.

## Risks

1. **Stocks gap on weekends and overnight.** Oracles hold the Friday close; Monday's open can jump
   past a liquidation line with no chance to act. The ticket says it in one line when US markets
   are closed ("TSLA trades again Monday 15:30 CET — a gap can skip your safety line") and counts
   a bigger buffer as Safe for equities (zone borders 50 % / 25 % instead of 40 % / 20 %). Not
   measured here how each venue's oracle behaves out of hours — check per venue before launch.
2. **The wall's numbers depend on three deploys** (depends on). Band 1 without the asset-class
   params is a client-side guess; band 4 without migration 0071 is empty. The shelf must not ship
   half-lit: gate the route on the same `/asset-classes` probe the filter chips use.
3. **Our own xStock prices are currently skewed.** yield-tracer's xStock prices equal Edel's frozen
   oracle (MSTRx ~8 % high, NVDAx / QQQx ~7–8 % low, 2026-10-14). Health and max come from the live
   simulation and are right; any number we compute (liquidation price, "today's move", the wall's
   USD, a paper position's value) is not until that is fixed upstream (yield-tracer ticket). Gate
   the wall's USD on it.
4. **Who may hold these tokens.** xStocks, Robinhood and Coinbase stock tokens come with issuer
   terms and geographic limits (not documented in our repos; **legal to confirm**). The page shows
   the issuer's terms link per token and a one-time notice; whether to geo-hide is decision 3.
5. **Thin and hot markets.** Robinhood Morpho USDG is 100 % utilized at 27–55 %: borrowers there pay a
   lot and lenders cannot leave. Show utilization in words on both sides; never rank a lend row by
   APR alone.
6. **Robinhood-chain oracles** are unknown on ~25 of 82 Morpho markets and DEX-based on ~13; the
   `RiskDot` must reflect it (risk score from the pairs row), and unknown-oracle markets stay out of
   the wall's "best rate".

## Phases and effort

| Phase | What | Effort |
|---|---|---|
| 1 | `props.rwa` typing; offers per chain with `collateralAssetClasses`; the route, the Earn tile, the Home lane, search; the ticker wall and the ticker page; "borrow against your stocks" (BorrowTicket, equity borders); market-hours note; issuer terms | 3 d |
| 2 | "Be the bank" rows with utilization words; "who's doing it" (board chip, feed strip, ratings); Solana end to end (Kamino, Jupiter Lend) | 2 d |
| 3 | Leveraged stock buy, if decision 4 says so | later |

Needs 0008 Phases 0–1 and the deploys in "depends on"; Phase 2's Solana leg needs 0008 Phase 2.

## What a reviewer does (acceptance)

1. On a **360 px phone**: Earn → the Stocks tile → the ticker wall is the first screen, SPY first;
   the Earn tab is lit in the bar; the address is `#/stocks` and pasting it lands on the wall.
2. On Solana with SPYx: SPY tile → Kamino and Jupiter Lend offers ranked at the typed size → borrow
   USDC → the ticket's Safe zone uses the equity borders → signed with Phantom → position appears
   as a **SPYx → USDC loan**.
3. *Be the bank* → the Robinhood USDG row says "fully lent out right now" and is not the top row
   despite the highest APR.
4. With a deploy that lacks `/asset-classes`, `#/stocks` says the shelf is not open yet rather than
   rendering guesses; the Earn tile is hidden.
5. On a weekend, the ticket carries the market-hours line.

## Decisions needed

1. **Navigation** — taken 2026-10-14: Stocks is the fifth Earn category (`#/STOCKS`), emphasized
   on Borrow. No tab, no separate shelf.
2. **Zone borders for equities** — built as 50 % / 25 % drop-to-liquidation (crypto 40 % / 20 %).
3. **Geography**: show stock tokens to everyone with the issuer's terms, or hide by region?
4. **Leveraged stock buys** (cross-money loops on stocks): never, later behind a warning, or v1?
5. **Lend-side yields at 100 % utilization**: hide, or show with the warning (recommended: show)?
