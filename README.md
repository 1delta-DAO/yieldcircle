<p align="center"><img src="docs/banner.png" alt="YieldCircle — everything you hold, earning" width="100%"></p>

# YieldCircle

A yield front end on the 1delta API: plain deposits build through
`/v1/actions/earn/deposit`, loops through `/v1/actions/loop/leverage`, and every
call goes through one vendored HTTP boundary. The order of reading is **what do
you want to hold?** first, yield second.

```
cp .env.example .env     # VITE_BACKEND_BASE_URL — the credited backend for development
pnpm install
pnpm dev                 # http://localhost:3200
pnpm build               # tsc + vite → dist/
```

Append `?as=0x…` to the URL to read an address's positions without a wallet
(or type it in the wallet dialog). Connect an injected wallet to sign;
set `VITE_WC_PROJECT_ID` for WalletConnect on a phone.

## The idea

Three layers, and the middle one is the unit of account:

| Layer | What it is | Where it comes from |
|---|---|---|
| **Group** | collateral exposure: USD · ETH · BTC · More | `model/assets.ts` |
| **Asset** | the thing you own: USDC, USDT, USDe, USDS, DAI, USDG … ETH · WBTC, cbBTC … EURC, XAUt | a whitelist in `model/assets.ts`; wrappers never appear as assets |
| **Strategy** | anything on top of an asset | a **deposit** = one `/v1/data/earn` row (lending market, savings module, LST, PT, curated vault); a **loop** = one `/v1/data/lending/pairs/optimize` row whose collateral resolves to a base asset and whose debt is the same denomination |

So sUSDe is a USDe strategy, syrupUSDC a USDC strategy, wstETH an ETH strategy,
and sUSDe / USDT on Aave is a USDe loop. The resolution is in
`baseOfSymbol` / `baseOfCollateral`: `savings.underlying`, `lst.asset`, the
parenthesised underlying of a PT's name, then the symbol itself.

**Positions follow the same layers.** Group → asset → idle (the wallet balance,
from `/v1/data/token/balances`) + strategies (from `/v1/data/earn/positions`:
vault rows are standalone; a lending account with debt is a loop, one without
is a plain deposit per leg).

## Screens

```
 EXPLORER  #/                      a balance overview
   Your positions: group → asset → idle / strategies (when an address is set)
   One slim block per group: asset rows with balance and "up to x%"
        │ tap an asset
 ASSET PAGE  #/USD?u=USDe&k=loop
   asset chips · idle strip ("$543 USDT idle · could earn up to 6.93%")
   Your positions: value · earning · health · Add / Withdraw or Manage
   Deposits | Loops toggle · one list: strategy · rate · risk
        │ tap a row
 TICKET  (aside on a desk, bottom sheet on a phone)
   ⓘ explanations · amount (+ pay-with and a leverage tier for loops) · the numbers
   what can go wrong · one button → the API's calls, signed one by one
```

Every state is a URL, so back and deep links work. The list stays visible
while the ticket is open. Screenshots against the live API are in
[`docs/shots/`](docs/shots/).

## What is curated, and how

A simple mode shows a short menu. `model/strategies.ts` decides, in code:

- **Deposits**: base asset only, depositable now, rate between 0.01 % and 25 %,
  at least $2 m in the strategy, API risk score ≤ 4 (only the critical tier is
  hidden). Duplicate (asset, token, venue) rows keep the best one; then the
  top 30 per asset.
- **Loops**: float debt only — a *brokered* market (Lista broker, Midnight
  book, Term repo: `variableBorrowDisabledShort`) needs a term picker the
  simple ticket does not have, but a `fixedTerm` block alone is fine (Lista's
  float-first markets carry one). Collateral that yields on its own (staking,
  savings, PT, fund — never one plain stable against another), debt in the
  same group, ≥ $100 k borrowable, worst risk ≤ 4, net at the suggested
  leverage between 0 and 25 %. Legs are the optimizer's at-size figures
  (quoted at $10 k) when the venue has a depth grid. Top 30 per asset.
- **Leverage as tiers, not a slider.** Defensive, Balanced, Aggressive sit
  at 50 %, 75 % and 90 % of the way up each venue's own range, from 1× to the
  pair's `maxLeverage` as the API reports it: `L = 1 + frac · (max − 1)`. A
  28× venue and a 5× venue therefore get different tiers, and every tier card
  shows the drop-to-liquidation it leaves. Lists quote the Balanced tier. What
  the API offers for this and what it could add is in
  [`docs/leverage-tiers.md`](docs/leverage-tiers.md).
- **"Our pick"**: the best row of its kind on its asset among risk ≤ 2 with
  real size. Data, not editorial.
- **Risk words**: the API's 1–5 score → Low / Medium / High; the listing's
  colour labels are ignored so both listings speak one vocabulary.

The query parameters that do this (`maxRiskScore`, `minTvlUsd`,
`minBorrowLiquidityUsd`, `collateralAmountUsd`, the tag archetypes) live in
`sdk/queries.ts`.

## The ticket

- **Deposit**: amount in the asset; the API builds `approve → deposit` (or one
  call with value for native ETH into an LST). No `payAsset` is sent, so you
  always deposit the row's own asset.
- **Loop**: pay with the collateral or the debt token, whichever the venue
  accepts (`/loop/leverage/pay-assets`) and the wallet holds more of; amount
  in that token; one of three leverage tiers, each showing its net yield,
  leverage and drop-to-liquidation before it is picked. Net yield,
  yearly, hold / owe, the liquidation buffer in words, rate sensitivity, and
  the API's projected entry cost and simulated health from a live quote.
- **Get the asset from anywhere.** Under the amount, one line: "Don't have
  enough USDe? Get it from anything you hold, on any chain". It opens an
  inline panel (`ui/GetAsset.tsx`): pick one of your balances across
  Ethereum, Base, Arbitrum and BNB (biggest first), the amount is prefilled
  with the shortfall, the API quotes the best route (spot swap on the same
  chain, bridge aggregation across chains: `/v1/actions/swap/spot`,
  `/v1/actions/swap/x-chain`) and one button approves and sends. Bridges
  are polled on `/v1/data/bridge/status`; on arrival the balance refreshes
  and the ticket carries on. The quote line itself ("You get ~993 USDe ·
  via Fly · ~3 min · best of 5 ▾") is the only route control: tapping it
  unfolds the other routes as a quiet list (name, output bar, output, bp
  behind the best, time) and picking one folds it back. The same endpoints
  as a full swap terminal, with the choices made for you.
- **Execution** (`ui/useLadder.ts`): permissions → setup → exactly one route,
  each mined before the next, mirrored to `sessionStorage` so a phone's wallet
  hand-off survives. The wallet is switched to the row's chain first.

## Layout

```
src/
  config/backend.ts        base URL + apiHeaders() — the fork's auth hook
  vendor/allocator/http.ts the one place that talks to the backend — attach a key or a proxy here
  sdk/                     api.ts (one function per endpoint), types.ts, queries.ts (React Query hooks)
  model/                   assets.ts (groups, base-asset whitelist, wrapper resolution), strategies.ts
                           (earn row → deposit, optimizer row → loop, curation), positions.ts
                           (positions → group / asset / idle / strategies), leverage.ts (pure math)
  state/AppState.tsx       chain selection, hash routing, account / view-as
  ui/                      Shell, Explorer, AssetPage, Ticket, useLadder, useBook (all data for a screen), bits
  wallet/                  wagmi config (injected + optional WalletConnect), ConnectButton
  styles/app.css           the mockup's stylesheet, plus a few app classes
brand/gen.py               the mark (an open turn of yield), the YIELD·CIRCLE lockup, og card and README
                           banner, all as paths; `pnpm brand` regenerates public/ icons and docs/banner.*
                           (needs python3 + fontTools; resvg for the PNGs)
docs/simplify.md           why the asset page is one list with a toggle
```

## Deploy (Cloudflare Pages)

Static Vite build, no server, no secrets in the bundle (the API base URL is
public). Hash routing, so no `_redirects` rule is needed.

**From your machine (wrangler)**
```bash
npx wrangler login                                                   # once
npx wrangler pages project create yieldcircle --production-branch main   # once
VITE_BACKEND_BASE_URL=https://allocator.api.1delta.io pnpm deploy    # build + upload
pnpm deploy:preview                                                  # a preview-branch URL
```

**Git integration (Pages builds on push)**: Cloudflare dashboard → Workers &
Pages → Create → Pages → connect `1delta-DAO/yieldcircle`, then:

| Setting | Value |
|---|---|
| Production branch | `main` |
| Framework preset | None (or Vite) |
| Build command | `pnpm build` |
| Build output directory | `dist` |
| Root directory | `/` |
| Environment variable | `VITE_BACKEND_BASE_URL=https://allocator.api.1delta.io` |
| Environment variable | `VITE_SITE_URL=https://yieldcircle.pages.dev` (or the custom domain) |
| Environment variable | `NODE_VERSION=22` |

Pages installs with pnpm when it sees `pnpm-lock.yaml`. Optional:
`VITE_WC_PROJECT_ID` for WalletConnect on phones.

**`VITE_*` variables are baked in at build time.** Set them under *both*
Production and Preview before the first build; a variable added afterwards
only takes effect on the next deployment (Deployments → ⋯ → Retry deployment,
or push a commit). If the app shows "The listing could not be loaded from
portal.1delta.io: Too many requests", the build ran without the variable and
is on the public, per-IP rate-limited endpoint.

## Known gaps

- **Manage a loop with one slider** (`ManageLoop`): the target leverage,
  from "close" (1×) to the venue maximum, with Close / tier / Now snaps.
  Left of the current leverage is a deleverage: collateral is sold into the
  debt token and that much debt repaid (`/v1/actions/loop/close`, `isAll`
  at 1× — everything sold, the rest returned as the debt token). Right of
  it borrows more and buys more collateral with no new margin
  (`/v1/actions/loop/leverage` as a pure leverage step). The cells show net
  yield, hold, owe, health and buffer *after*, against *now*. Withdraw on a
  deposit builds `/v1/actions/earn/withdraw`. Positions the catalogue has no
  row for (an old Aave V2 deposit) are listed but not actionable here. A loop
  is matched to its catalogue row by both legs.
- Deposits with a different pay asset (USDT into a USDC market) are supported
  by the API but not offered here; the idle strip only ever points at the
  asset's own strategies.
- Some lenders (LlamaLend) refuse a quote without an account, so the entry
  cost cell reads "no quote" until an address is set.
- With "All" selected the app reads Ethereum, Base, Arbitrum and BNB Chain;
  other chains the API knows are not offered. BNB and its staking wrappers
  (slisBNB, BNBx, ankrBNB) sit in the "More" group.
- Brokered fixed-term markets (Lista broker, Midnight, Term) are not listed:
  the ticket has no term picker yet.
