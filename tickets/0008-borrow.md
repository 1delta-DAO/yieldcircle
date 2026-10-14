# 0008 — Borrow: cash against what you hold

- status: **built 2026-10-14** (phases 0–3; see "As built"). Not committed or deployed. Paper loans
  need the pos-indexer social redeploy first. The Stocks half is [0009](0009-stocks.md).
- area: new `src/model/borrow.ts` (pure), `src/sdk/api.ts` + `src/sdk/queries.ts` (lending action
  and range routes), new `src/ui/BorrowTicket.tsx`, `src/ui/AssetPage.tsx` (a third segment),
  `src/ui/Earn.tsx` (one fragment per "Your money" row), `src/ui/useBook.ts` + `src/model/positions.ts`
  (balances for collateral the catalogue does not list; `holdingsFrom`: a loan is not a loop),
  `src/state/AppState.tsx` (`k=borrow`), `src/model/paper.ts` (two ops, copied to pos-indexer),
  `src/ui/paperPlans.ts`
- depends on: **nothing outside this repo.** The lending action and range routes below are in
  worker-api today; confirm they answer on the deployed host before Phase 0 starts.
- reference implementation: the allocator's optimizer tab, `~/allocator/src/components/lending/tabs/
  optimizer/PairActionPanel.tsx` + `useCombinedAction.ts` (Deposit & Borrow | Withdraw & Repay |
  Loop). Read it for the API calls; do **not** port its look — it is a technical demo, this is not.

## As built (2026-10-14)

Where this differs from the plan below, this section is what the code does.

**Files.** `model/borrow.ts` (+ `borrow.test.ts`): offers off the pairs rows, zones, limits, the
liquidation line, `offerFromHolding`, `usMarket`. `sdk/api.ts`: `lendingDepositAndBorrow`,
`lendingWithdrawAndRepay`, `lendingAction`, `lendingRange`. `sdk/queries.ts`: `useBorrowOffers`.
`ui/BorrowTicket.tsx` (Borrow · Pay back), `ui/BorrowList.tsx` (the list, the category chips,
`borrowRoom`). Edits to `AssetPage`, `Earn`, `Positions`, `Ticket` (exports only), `bits`,
`positions.ts`, `desk.ts`, `uid.ts`, `paper.ts` (+ tests), `paperView.ts`, `paperPlans.ts`,
`PaperMoves.tsx`, `state/Paper.tsx`, `AppState.tsx`, `styles/app.css`, `docs/apis.md`.

**Differences from the plan.**

- **Zero legs are refused** by `deposit-and-borrow` (`ACTION_FAILED: No amount is provided`,
  measured). A one-sided action goes through the single-leg routes, as A3 allowed.
- **The venue's simulation can start from zero.** With a loan running, `deposit-and-borrow`
  simulated an Aave account at health 20.7 as 2.03, because the route could not read it. The
  ticket trusts `post.healthFactor` only when `pre` matches the running loan, else it uses the
  model's own number.
- **No comparables route.** "Cheaper elsewhere" is read off the offers already loaded: same chain,
  same collateral, same dollar, at least 0.5 points cheaper, enough free to fill the size.
- **No `next-account` call.** A new loan opens in the venue's default account. An Add on a
  running loan names its `accountId`.
- **More venues left out than planned.** Besides fixed terms, smart legs, bands and DBR, the
  Liquity family (a trove sets its own rate) and institutional markets are hidden (`needsInput`).
- **Ranking** is: can fill $10k, then the collateral market holds $100k or more, then risk, then
  rate. A headline "from x %" only quotes markets that pass both and charge something.
- **Balances for collateral the catalogue does not list (A7)** cover stock tokens only. They fill
  the slots the 60-asset EVM read leaves free, so on a chain whose catalogue fills it (BNB) a
  wallet's stock tokens may not show. Solana reads the whole wallet and always shows them.
- **"Your loans"** are the asset page's existing "Your positions" rows, with Borrow · Pay back
  buttons. There is no second list on the Borrow segment.
- **Zone words**: Safe · Watch · Spicy (decision 2, taken in code; easy to rename in `ZONES`).

**Verified.** Tests: 60 pass (10 borrow model, 4 paper loan). `pnpm build` passes. Against the
live API: deposit-and-borrow, borrow, withdraw-and-repay with `repayMax`, and the deposit-borrow
range all build for a real Aave V3 account. In the browser at 1280 and 360 px: the Earn digest,
the Stocks shelf and its lend side, the ETH Borrow segment, a new-loan ticket, and a running
Aave loan (viewed with `?as=`) on both tabs.

**Not verified.** No transaction was signed. No paper loan was placed: the social service does not
know the ops until it is redeployed.

## Why

Today yieldcircle can deposit (Earn) and loop (borrow and buy more of the same money), but it
cannot do the most ordinary thing a lending market is for: *put something up, take cash out, pay it
back, take your thing back.* Someone holding ETH, SOL, or a stock who needs dollars without selling
has no path in the app.

Borrow is built once (model, API, ticket, positions, paper). Its first, loudest storefront is the
Stocks shelf ([0009](0009-stocks.md)), which needs Phases 0–1 here and two deploys of its own. This
ticket ships on its own, before any of that lands.

## What exists to build on

| Piece | Where | Reuse |
|---|---|---|
| Deposit & borrow / withdraw & repay in one request | worker-api `GET/POST /v1/actions/lending/deposit-and-borrow`, `/withdraw-and-repay` (`lending-sdks/packages/worker-api/src/v1/actions/lending/`); **either side on Solana routes to the SVM one-shot** (`svmDispatch.test.ts:117`) | the only new action routes; both return the usual `actions.permissions` + `actions.transactions` that `stepsFrom` already orders |
| Single-leg actions | `/v1/actions/lending/{deposit,borrow,repay,withdraw}` | "borrow more" / "repay only" / "add collateral" when a combined route will not take a zero leg (verify, A3) |
| Max borrow for a deposit, max withdraw for a repay | `GET/POST /v1/data/lending/range/deposit-borrow`, `/range/withdraw-repay` — dispatched by `data/routes/range/index.ts` to `depositBorrow.ts` / `withdrawRepay.ts`; **Solana uids go through `range/svm.ts`** (same math, its own user read) | the "how far can I go" number; returns `collateralModeId` to feed back as `modeId` |
| Post-trade health | `simulate=true` on the action routes → `simulation.pre/post.{healthFactor, borrowCapacity}` | the safety meter, live (HARD RULE) |
| Rate at size | `/v1/data/lending/irm` — **already used here**: `useIrm` + `borrowAtSize` (`model/leverage.ts:13`) walk the curve | no need for the allocator's `/irm/depth` |
| "Cheaper elsewhere" | `GET /v1/data/lending/comparables?chainId&debt&collateral&side=borrow&amount…` | the allocator's `ComparableRatesPill` |
| New sub-account | `GET /v1/data/lending/next-account` (SELECT vs AUTOGEN) | Euler / Dolomite / Fluid / Init / Gearbox / TermMax |
| Pairs | `/v1/data/lending/pairs/optimize` — already paged here (`fetchOptimizerPairs`, `sdk/api.ts:124`) | the offer list |
| Signing + tx tracking | `useLadder` / `useTicketLadder` (`ui/useLadder.ts`), `Action` (`Ticket.tsx:924`), `traceTx` (`sdk/txTrace.ts`, `touches` + `watch`) | unchanged — EVM and SVM already |
| Ticket furniture | the mode tab row + `Mode` (`Ticket.tsx:76`, `AppState.tsx`), the Details disclosure (`Ticket.tsx:569`), `SubAccountPill`, `ValueCheck` / `LossAck`, `SayWhy`, `TicketSocial`, `GetAsset`, `RiskDot`, `Info` | unchanged |
| Leverage tiers as tap targets, slider behind an icon | `TIERS` + `customRange` (`model/leverage.ts`), `LoopTicket` (`Ticket.tsx:532-543`) | the zone chips (A1) are the same pattern |
| Strategy proof | the index's strategy book (`loop:<held>|<debt>` keys, `useStrategyProofs`) | "held by N wallets" on a borrow card — a plain borrow IS a `loop:` key there |

What does **not** exist and this ticket adds: any `/v1/actions/lending/*` call (the app has none
today), a model for a borrow that is not a loop, balances for collateral the catalogue does not
list, and a paper op for it.

### Three things in the app that would get in the way

1. **`classifyPair` refuses every cross-money pair** as `cross-denom` / "price bet"
   (`model/strategies.ts:574-583`). Correct for the loop catalogue, fatal for borrowing: TSLAx →
   USDC, ETH → USDC, SOL → USDC are all cross-money, and they are the whole point. Borrow therefore
   gets its own model (`BorrowOffer`, A4) built off the same pair rows; the loop catalogue is
   untouched.
2. **`holdingsFrom` calls every position with debt a `'loop'`** (`model/positions.ts:115-136`),
   `directional` when the moneys differ. A plain TSLAx / USDC borrow would show as "TSLAx / USDC
   loop", with loop actions (lever / reduce / close-by-swap) — wrong words and wrong buttons. A5.
3. **The wallet only sees what the catalogue lists.** `useBook` asks the balance route for the
   addresses the catalogue knows on each chain (`useBook.ts:23`, `cat.addresses`), and `idleFrom`
   drops any token the whitelist cannot key (`positions.ts:270`, `keyOfToken`). A stock token, or
   any collateral that is not a base asset, passes neither gate: "you hold 2.0 TSLAx" has no data
   source today. A7.

## A1 · The feeling we want

Not "Deposit & Borrow · MAX 0 · 5.60 %". The ticket reads like a sentence and moves like a toy:

> **Put up** `[ 2.0 TSLAx ▾ ]` · **take out** `[ $   400 USDC ▾ ]`
> ● Safe · costs about **$2.40 / month** (7.3 % APR)
> If **TSLA falls below $214** (−31 %), the lender sells your TSLAx to repay.
> `[ Borrow $400 ]`

**The phone's first screen is exactly those four lines and the button.** The ticket is a bottom
sheet at ≤ 1000 px (`app.css:350`, 88dvh, scrolling); on a 360 px phone the sentence, the zone
chips, the cost, the liquidation line and the button must all be visible without a scroll.
Everything else in this section sits under the ticket's existing *Details* disclosure or below the
button, in this order: comparables nudge → social proof → `SayWhy` → `TicketSocial`.

- **Three zones as tap targets, a slider behind them.** The same pattern as the Loop ticket's
  tiers (`TIERS`, the slider icon): three chips, each showing the dollar amount it stands for, and
  a plain `<input type=range>` from $0 to the range route's max for fine-tuning. A thumb never has
  to land on a border, and a native range input cannot snap softly anyway. The zones are matched
  to how far the price can fall before liquidation, not to a fraction of the range:
  **Safe** (≥ 40 % drop before liquidation), **Watch** (20–40 %), **Spicy** (< 20 %), coloured
  with the health pill's `ok / warn / bad` — *not* the Home lanes' 🌱 ☕ ⏰, which mean how much
  work a strategy asks, not how close liquidation is; one icon must not carry two meanings.
  Health factor, LTV and liquidation threshold are in an `Info` popover. The default is the middle
  of the Safe zone, never the max.
- **Cost in money, not only in percent.** "About $2.40 a month" next to "7.3 % APR" (APR, never APY —
  `docs/apis.md`), from `borrowAtSize` at the size typed, so the rate the user sees is the rate
  *at their size* and it visibly climbs if they drag far. The allocator's depth chart reduced to a
  sparkline under the slider is *Details* material, not first-screen material.
- **The liquidation line in the asset's own price.** "If TSLA falls below $214" beats "HF 1.42".
  For a dollar debt against a dollar collateral it says so instead ("both sides are dollars: only
  a depeg can liquidate this").
- **Cheaper elsewhere, as a nudge.** The comparables pill, worded "**6.1 %** at Jupiter Lend — 1.2
  points cheaper" with a tap to switch the ticket there; silent when this venue is the best.
- **Social proof where it is true.** "**37 wallets** borrow against TSLAx here" off the strategy
  book, with three faces (`Who`); `SayWhy` beside the button; `TicketSocial` as on every ticket. No
  claim the index cannot back.
- **After it lands:** the trace tray as today, then a short card: "**$400 USDC is in your wallet.**
  Your TSLAx is safe while TSLA stays above $214. → Set an alert · → Put the $400 to work (Earn)".
  The second link closes the loop the app is about: borrow cheap, earn more.

## A2 · Where it lives

Borrow is **a verb on things you hold**, not a destination. Nothing is added to the tab bar
(`Shell.tsx:1-23`: fewer destinations, not a cleverer menu) and nothing is added to the Earn
digest's structure (`Earn.tsx`: tiles → your money → best rates, one page):

1. **The asset page's toggle** (`#/USD|ETH|…`, `AssetPage.tsx:171`) grows a third segment:
   **Deposits · Loops · Borrow**. The Borrow side is the offer list (A4) for the asset the page is
   on, as *what you put up*; one chip row above it picks *what you take out* (USDC · USDT · …),
   nothing more — the page already fixes the collateral, so a second picker is not needed. This
   is docs/simplify.md rule 2: a toggle with one default side, never a parallel section. The
   `hint` line under the segment gets Borrow's sentence ("Take dollars out against the token.
   Nothing is sold; the token is sold for you only if its price falls past the line.").
2. **The Earn digest's "Your money" rows** (`Earn.tsx` `BookRow`) gain one fragment after "up to
   8.4 %": "· or borrow up to **$627**". A tap goes to the asset page's Borrow segment. Needs the
   set of collateral-able assets per chain — the same paged `pairs/optimize` call the catalogue
   already caches.
3. **The positions sheet and the wallet page** keep one tap per idle row ("Put to work ›" → the
   asset page); the idle strip there says "could earn up to 8.4 % · or borrow up to $627". No
   second button: the rows are already full-width tap targets on a phone.
4. **The Stocks shelf** ([0009](0009-stocks.md)) is the borrow shelf for stocks.

Routes (`AppState.tsx`): the ticket opens over the page it was called from, as tickets do now,
with `k=borrow` in the hash (`#/USD?u=<pairUid>&k=borrow&s=<sub>`), so a borrow ticket is a link
someone can share, exactly like a loop ticket. Two small edits: `Route.k` becomes
`'simple' | 'loop' | 'borrow' | undefined` in `parseRoute`, and `go()` (which strips `k=simple`)
must pass `borrow` through. A copied feed card (`copy=`) opens it prefilled.

## A3 · The ticket — `src/ui/BorrowTicket.tsx`

**Two tabs, on the ticket's existing mode row** (`Ticket.tsx:76`, `role="tab"`, `Mode` in
`AppState.tsx`) — not a third tab set:

| Tab | Does | API |
|---|---|---|
| **Borrow** (`add`) | put up collateral and take cash; either leg may be zero (add collateral only / borrow more) | `deposit-and-borrow` |
| **Pay back** (`reduce`) | repay some or all, take collateral back; either leg may be zero (repay only / take back only) | `withdraw-and-repay` with `repayMax` / `withdrawMax` (the allocator never sends them; a full exit must, or dust is left) |

**Verify first (Phase 0):** that the combined routes accept a zero leg on each side, on EVM and
on the SVM one-shot. The allocator's form cannot do a borrow-only build (`useCombinedAction.ts:315`),
which may be the form's limit or the route's. If a route refuses, the ticket calls the single-leg
route (`borrow` / `repay` / `deposit` / `withdraw`) for that case — same two tabs, no third.

Mechanics, all from the allocator's working flow (`useCombinedAction.ts`), re-expressed:

- Debounce 400 ms; call the **range** route for the max; when the amounts are set, call the action
  route with `simulate=true`; render `simulation.post.healthFactor` as the zone; the steps go
  through `stepsFrom` → `useTicketLadder` → `Action`, so approvals, chain switch, SVM signing, the
  paper path and the trace come for free.
- **Validation gates the button** (the allocator's are display-only: `primaryOverMax`, `isOverMax`
  "gate no button"). Over wallet balance → "You have 1.4 TSLAx" + *Get TSLAx* (`GetAsset`, which
  already swaps / bridges); over max → the slider cannot go there; a simulated health under 1.05
  → the button says why and does not send.
- **Sub-accounts** via `SubAccountPill` + `next-account`. Do not copy the allocator's auto-pick
  effect: with an AUTOGEN venue its "+ New" (`onChange(null)`) re-triggers the highest-NAV pick
  (`PairActionPanel.tsx:943-949`) and sends the old account. Here "+ New" is a state of its own.
- **Native coins**: `payAsset` / `receiveAsset` = the zero address wraps / unwraps (ETH on EVM, SOL
  on Solana), with the existing `nativeAsset` / `wrapsNative` helpers.
- **Trace**: `touches` = both market uids, `watch` = both tokens, so the wallet chip and the
  positions sheet settle without hand invalidation (`docs/apis.md`).
- **Special venues**: Fluid smart legs, Lista fixed terms, Term auctions, LlamaLend bands, Inverse
  DBR. **v1 lists only venues with no extra input** and hides the rest from Borrow (they stay in
  Earn / loops); a later pass adds them one by one, behind the same ticket.
- **Atomic batch (later)**: the allocator sends approve + deposit + borrow as one EIP-5792 call where
  the wallet supports it (`hooks/useAtomicBatch.ts`). Worth it — one signature is part of
  "playful" — but it touches `useLadder` for every ticket; Phase 4.

## A4 · The model — `src/model/borrow.ts` (pure, tested)

```ts
interface BorrowOffer {
  uid: string                 // `${chainId}:${collateralUid}|${debtUid}` — the index's loop: key shape
  chainId: string; lender: string; venue: string
  collateral: Token; debt: Token
  maxLtv: number              // borrow collateral factor
  liqLtv: number              // liquidation threshold
  borrowApr: number           // now, at 0
  liquidityUsd: number        // what can still be borrowed
  riskScore?: number; riskBand: 'low' | 'medium' | 'high' | 'compromised'
  assetClass?: AssetClass; underlyingTicker?: string   // from the row once worker-api stamps both (0009)
  needsInput?: 'smart' | 'term' | 'bands' | 'dbr'      // v1 hides these
}
```

Pure functions: `offersFromPairs(rows)` (no `classifyPair` — cross-money is the point; still drops
`visibility.ts` hides like `implausible` and dust), `zoneOf(drop, borders)` → safe / watch / spicy
(borders are a parameter: 0009 wants wider ones for equities), `liquidationPrice(collateralPrice,
debtUsd, collateralAmount, liqLtv)`, `dropToLiquidation`, `monthlyCost(debtUsd, aprAtSize)`,
`defaultBorrow(maxBorrow, borders)` (the middle of Safe), `zoneAmounts(maxBorrow, borders)` (the
three chips' dollar values). Unit tests next to `assetClass.test.ts` (vitest runs today).

## A5 · Positions: a loan is not a loop

`holdingsFrom` gains `kind: 'borrow'`:

- **Same money** on both sides (USDC / USDT, wstETH / ETH) stays `'loop'` — that is what a loop is.
- **Different money** becomes `'borrow'`. That is the honest reading of "collateral + debt in
  different moneys": you owe dollars against a thing that moves. A position opened by the Loop
  ticket keeps its `'loop'` label through a local memo (`sticky`), so the user who built it sees
  the words and buttons they chose.
- **No index check.** Asking the index whether the connected account's open transaction bundled a
  swap (`/accounts/:account/events?group=tx`) would read the connected user's own account from the
  index, which `docs/apis.md` forbids ("never ask the index for the connected user's own
  positions"). The local memo plus the default is v1; if a server-side hint is ever wanted it goes
  through the wallet page's sync path, in its own ticket.
- Display: "**TSLAx → $400 USDC loan**" with the zone dot and the liquidation price; actions **Pay
  back · Add collateral · Borrow more**, never lever / reduce.
- **Alerts** (`#/alerts`): the zone is a natural alert — "tell me when this leaves Safe". The
  client half exists; the server delivery job is pos-indexer's open item.

## A6 · Paper

Paper has `open` (simple or loop), `withdraw`, `lever`, `reduce` (`model/paper.ts:228-250`); none
puts borrowed tokens **in the bank**. Add two ops:

- `borrow { marketUid, debtUid, collateralAmount, debtUnits }` — collateral leaves the bank into a
  position, the borrowed tokens land in the bank; refused past liquidation like `open` (:531).
- `repay { positionKey, debtUnits | 'max', withdrawCollateral? }` — bank pays the debt, optional
  collateral back.

`paperPlans.ts` gets `borrowPlan` / `repayPlan`. The model is copied verbatim to pos-indexer
(`packages/social/src/paperModel.ts`, `pnpm paper-check`), so this is a coordinated change: social
redeploy before the client ships the ops (docs/paper.md there). Paper is how most testers will
try Borrow — the beta is paper-first — so this is **in v1, not later**.

A paper position is valued off the catalogue's prices (`model/paper.ts` header). **Paper borrow is
offered only for collateral with a trusted price** — crypto and the base assets — until the xStock
price skew is fixed upstream (0009, risk 3); a stock as paper collateral would be marked to a wrong
number.

## A7 · Balances for collateral the catalogue does not list

Phase 0, because every entry point above reads it:

- `useBook` adds the collateral addresses of the borrow offers on each chain to the balance read
  (`useBalancesPerChain`'s `addresses`), next to the catalogue's.
- `idleFrom` keeps a priced balance whose address is a known borrow collateral even when
  `keyOfToken` has no key for it: group `MORE`, `asset` = the token's own symbol, as the gas coin
  is kept today. Such an `Idle` can be put up; it is not offered to Earn (no strategy lists it).
- The Earn digest and the positions sheet already read `b.books`; a `MORE` book with only a
  borrow-able idle row shows the "or borrow up to" fragment and nothing else.

## Risks

1. **Liquidation is the product's sharp edge.** A borrow can lose the collateral; the ticket must
   make the line unmissable (the price, the % drop, the zone) and default to Safe. The button
   refuses below health 1.05; the Spicy zone asks for the existing `LossAck`-style acknowledgement.
2. **A loan the app did not open.** A cross-money position opened elsewhere (or by the Loop
   ticket on another device, where the sticky memo is not) shows as a loan. Pay back / add
   collateral are correct actions for it either way; only the word differs.
3. **The ticket's weight on a phone.** A1 fixes the first screen; the acceptance list checks it
   on a 360 px phone, not after.

## Phases and effort

| Phase | What | Effort |
|---|---|---|
| 0 | `sdk/api.ts` + `queries.ts`: deposit-and-borrow, withdraw-and-repay, borrow / repay / deposit / withdraw, range ×2, comparables, next-account; **zero-leg check** on the combined routes (A3); `model/borrow.ts` + tests; `k=borrow` in `parseRoute` / `go`; balances for borrow collateral (A7) | 2 d |
| 1 | `BorrowTicket` on EVM (Borrow · Pay back on the mode row), zone chips + slider, cost, liquidation line, validation, sub-accounts, Details; entry points: asset-page segment, Earn digest fragment, idle-strip words; the comparables nudge | 4 d |
| 2 | Positions: `kind: 'borrow'`, loan card + actions, zone alert hook; Solana borrow (Kamino, Jupiter Lend) — verify comparables and next-account answer for SVM uids (range does, `range/svm.ts`) | 2–3 d |
| 3 | Paper `borrow` / `repay` ops + plans; pos-indexer copy + social deploy | 2 d |
| 4 | EIP-5792 one-signature batches; special venues (Fluid smart, Lista terms, LlamaLend bands) | later |

## What a reviewer does (acceptance)

1. On Base with 1 ETH, on a **360 px phone**: ETH page → *Borrow* segment → a USDC offer → the
   sheet shows the sentence, the three chips, the cost, the liquidation line and the button without
   scrolling → the default chip is Safe → $500 USDC → one approval + one transaction → the tray
   settles → "$500 USDC is in your wallet" card → the position shows as an **ETH → $500 USDC
   loan**, not a loop, with its liquidation price.
2. Pay back all with *take my ETH back*: `repayMax` + `withdrawMax`, no dust left on either side.
3. The Earn digest's ETH row says "or borrow up to $X"; the positions sheet's idle strip says the
   same; neither has grown a second button.
4. On paper (no wallet): flows 1 and 2 end with the borrowed USDC in the paper bank and the paper
   board counting it.
5. Typing more than the wallet holds, or dragging past the max, cannot send; a simulated health under
   1.05 cannot send; both say why in words.
6. A wallet holding a token no Earn strategy lists but some market takes as collateral sees it in
   the sheet with "or borrow up to", and can put it up.

## Decisions needed

1. **Zone borders for crypto**: 40 % / 20 % drop-to-liquidation? (Equities: 0009.)
2. **Zone words**: Safe · Watch · Spicy, or calmer (Safe · Careful · Tight)? They must not be the
   Home lanes' words.
