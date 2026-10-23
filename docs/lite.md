# YieldCircle Lite — simplification scope

**Status:** built 2026-10-23 ([`lite-plan.md`](lite-plan.md), "As built" lists
where the build differs from this scope). Lite is the default for every visitor
who has not chosen. Follows
[`simplify.md`](simplify.md) (the asset page) and
[`simplify-selections.md`](simplify-selections.md) (the chip rows and the loop
ticket), and goes further than both: those kept the full menu and tidied it;
this one defines a second product on top of the same catalogue.

## The feedback, and what it means

Testers asked for a version that feels like the FOMO app: one balance, one
number per thing, open in two taps, nothing that needs explaining. The
current app is a yield *terminal* with a social layer; what they want is a
*consumer* yield app with a terminal behind it. fomo itself has no yield
product (§8), so the thing to copy is its money layer and its social surface,
not an earn screen.

The seven starting suggestions, restated as decisions:

| # | Suggestion | Decision in this scope |
|---|---|---|
| 1 | `/lite` and `/pro` paths | **One build, two modes.** Mode is a URL prefix (`#/lite/…`, `#/pro/…`) and a persisted setting; `#/` resolves to the last mode, Lite for a first visit. §2 |
| 2 | Only the mid tier or the copied leverage | **Lite picks leverage for you.** Balanced tier by default, the copied holder's leverage on a copy, nothing else to choose. §5 |
| 3 | Action panel reduced to performance | **A three-line ticket:** what you earn, what you can lose, what it costs to enter. Everything else is one "Details" link into the pro ticket. §5 |
| 4 | One list per category, no subgroups | **Dollars are dollars.** No desks, no "whose credit" bands, no asset chips. A row says *USDC* or *dollars via Ethena*, in words. §4 |
| 5 | Loops and plain earns mixed | **One mixed list**, with the risk word doing the work the Deposits/Loops toggle did. The explicit "levered" badge is the guard. §4 |
| 6 | Gamification | **One points ledger, one streak, one board** — the pieces already exist (paper, Yield Cup series, strategy proofs, follows); Lite surfaces them as the home. §6 |
| 7 | No venue names | **Venues become a trust line, not a name.** "Audited lending market · $1.2B · live 3 years" instead of "Morpho Blue wstETH 86". The brand stays one tap away. §4 |

The constraint from the ask: **do not lose the high-yield opportunities.**
The reason this app beats a venue's own front end is loops with a chosen
leverage and a liquidation line in plain words. Lite keeps every loop that
passes the floors; it just stops asking the user to configure one.

## 1. What Lite is, in one screen each

Four screens, three tabs. Everything else is Pro.

```
  Home            Earn            You
  ┌──────────┐    ┌──────────┐    ┌──────────┐
  │ $ 1,240  │    │ Dollars  │    │ Streak 🔥│
  │ +$3.20/d │    │ Ether    │    │ Points   │
  │ ──────── │    │ Bitcoin  │    │ Rank     │
  │ feed:    │    │ Stocks   │    │ positions│
  │ who did  │    │ More     │    │ (3 rows) │
  │ what,    │    │          │    │          │
  │ [Copy]   │    │ → a list │    │ Pro mode │
  └──────────┘    └──────────┘    └──────────┘
                        ↓
               ┌────────────────┐
               │ USDC  8.4%  ●  │  ← row: asset-in-words · rate · risk dot
               │ dollars 12.1% ●│    (loops carry a small "×3 levered" tag)
               │ …              │
               └────────────────┘
                        ↓ tap
               ┌────────────────┐
               │ Earn  12.1%    │  ← the three lines
               │ Can lose  if dollars via Ethena trade 7% under $1 │
               │ Costs  $0.80 to enter · back in 2 days │
               │ [ Amount ] [ Put $500 to work ] │
               │ Details ›      │
               └────────────────┘
```

- **Home** is the balance and a feed of copyable moves. It merges today's
  Start (recommendations) and Feed (what people did) into one column of
  cards, each with a Copy button and three lenses: proven · trending · most
  held (fomo's verified · trending · most held). No Hot rail, no Pulse, no
  filter sheet.
- **Earn** is the four categories, then one list per category.
- **You** is positions, points, streak, rank, and the Pro switch.
- **Borrow and Stocks are not in Lite** (owner's call, 2026-10-23). Borrow is
  the tab with the most concepts (collateral, LTV, what comes out), and Stocks
  is mostly a borrow shelf. Lite's Earn has four categories: Dollars, Ether,
  Bitcoin, More.
- **Board is Lite's fourth tab** (changed 2026-10-23 at the owner's request): wallets
  by one number, each position's PnL on a tap. See `lite-plan.md`, As built, item 14.

## 2. Routing and modes

- `#/lite/...` and `#/pro/...` prefixes; the existing routes keep working
  unprefixed and resolve to Pro, so every link in the wild still opens. The
  mode is saved in Settings (`mode: 'lite' | 'pro'`); `#/` opens the saved
  mode, Lite for a first visit.
- The shell is per mode: Lite has three tabs, Pro keeps its five. The header
  balance chip, the paper chip and the wallet drawer are shared.
- One catalogue, one set of hooks, one ticket engine. Lite is a different
  *presentation* of `useBook()` and the same `Ticket` ladders; it must not
  grow its own data path (see `docs/apis.md` layering).
- Every Lite screen has exactly one way into Pro: "Details" on a ticket opens
  the full ticket for the same strategy; "Pro mode" in You switches for good.
  Pro has a "Lite mode" entry in the profile sheet. Switching never loses the
  current strategy or amount.

## 3. The catalogue Lite shows

Lite reads the same `Strategy[]` and applies a stricter, fixed filter. No
settings for it; Pro's floors are Pro's.

| Rule | Why |
|---|---|
| **Savings nature only** (`nature === 'savings'`). Perp LP, managed funds and marked-to-market rows are out. | Their "rate" is a past result and the price is the yield. In a list with one number per row they would win on the number and lose the user's money. |
| **TVL floor $2M**, the top of Pro's settings. | The strict floor; the simple user does not know what a thin pool is. |
| **Risk cap: the API's 1–4**, never unrated. | Lite has no "unrated" word. |
| **Loops only when the collateral and debt are the same money** (already how `strategies.ts` builds a loop). Fixed-term debt loops (Term, Loopscale, TermMax) are out. | A term, a due date and a roll are three concepts the three-line ticket cannot hold. |
| **A loop leaves at least 3 % to liquidation at its Balanced tier.** | An e-mode venue's Balanced tier can sit about 1 % from the line. |
| **One row per (asset-in-words, kind)**, the best by `steadyRate`. | "USDC on Aave" and "USDC on Morpho" are not two choices for this user; the better one is the row and the other is in Details. |
| **Chains: the user's wallet chains, else the default set.** No chain picker in Lite. | A chain is a Pro concept. The ticket says "on Base" in the Costs line only when the user has to bridge. |

The result on today's menu is roughly 10–15 rows per category rather than
40–70, and the top rates survive: a Balanced-tier sUSDe/USDC or PT/USDC loop
is a savings-nature, same-money, high-TVL loop and stays in.

## 4. Lists: one per category, mixed, in words

**Row anatomy:** `face · what-in-words · rate · risk dot · [×3] · yours`.

| Today | Lite |
|---|---|
| `syrupUSDC` desk, `Lend on Morpho Blue · wstETH 86`, `Ethena · yield dollar` bands | `Dollars via Maple` · `USDC` · `Dollars via Ethena` — one phrase from `nameOf(asset)` + the desk's name, never a venue |
| Deposits / Loops toggle | one list; loops carry a `×3 levered` tag and never sort above an unlevered row with a higher risk dot |
| rate · 30-day line · 30d mean | rate, amber dot when today is a spike vs the 30-day mean; the line itself goes to Details |
| "our pick" tag, `Yours` column | `Yours` stays (the one thing the user owns); the pick tag is replaced by **"n people run this"** from the strategy proofs, which is the social proof the FOMO pattern runs on |
| venue badge, chain mark | neither on the row. Both on the ticket's trust line |

**Sorting:** by `steadyRate` within a risk tier, low-risk tier first; a loop
shows in the position its *Balanced* net rate earns. The mixed list is safe
because the risk word and the tag are on every row and the rate shown is a
steady one, which answers the objection recorded in `simplify.md` against a
mixed list ("a 16% loop above a 4% deposit").

**Venue naming (suggestion 7):** the row never says Morpho, Aave, Kamino. The
ticket's trust line says what kind of thing it is and how big and old it is:

> Lent on an audited market · $1.2B deposited · live since 2023 · [Morpho ›]

The brand is a link at the end, for the person who wants it. For vault rows
the curator stays a name only when it IS the product (Maple, Ethena, Sky):
that is the issuer of the money, which the user must know; the venue it sits
on is not.

## 5. The three-line ticket

The Pro ticket shows ~30 numbers before Details (counted in
`simplify-selections.md`). Lite shows three, each a sentence:

| Line | Deposit | Loop (Balanced tier, or the copied leverage) |
|---|---|---|
| **Earn** | `8.4% a year · $3.50 a month on $500` | `12.1% a year · $5.00 a month on $500 · ×3 levered` |
| **Can lose** | `Your money is lent out; the exit is instant / takes 2 days` (from `exitTerms`) | `Liquidated if dollars via Ethena trade 7% under $1` (from `liqBuffer` at L) — plain words, no health factor |
| **Costs** | `Free to enter` or `$0.40 network fee` | `$0.80 to enter · earned back in 2 days` (the economics quote's entry cost and break-even) |

Then the amount as dollar presets (25 / 50 / 100 % of idle, and a field),
the one button, and `Details ›` opening the Pro ticket in place with the same
amount and leverage carried over. The ticket is a bottom sheet on a phone.

**Leverage (suggestion 2):** Lite never shows a tier picker. The loop opens at
`s.tiers.balanced`; a copy opens at the copied holder's leverage clamped to the
venue's range (what `copyLev` already does). The line under Earn says `×3` so
the number is never a surprise. The Defensive and Aggressive tiers and the
custom slider are reached only through Details.

**Managing a position** in Lite is two buttons: *Add* and *Withdraw all*
(close the loop, receive the debt coin). Partial deleverage, receive-in-
collateral, and sub-account picking are Pro.

**Guard rails that stay even in Lite:** the >3 % entry-loss confirmation
(`ValueCheck`), the paper-mode refusal notes, the "no route at this size"
state, and the native-coin wrap note when it applies. They are one sentence
each and they stop money being lost.

## 6. Gamification: use what is already built

Lite does not need a new system; it needs the existing pieces on the home
screen with a score attached.

| Piece | Exists as | In Lite |
|---|---|---|
| Points | the waitlist's "early rewards" signals (`waitlist-launch.md` §1: positions held, days held, X linked, follows, comments) | one **Points** number in You and in the header next to the balance; earned for days-at-work and dollars-at-work, with a copy bonus when the copied wallet is followed |
| Streak | nothing yet; the paper ledger has `book_daily` | **days with money at work** — breaks on a day with zero at work; shown as a flame on Home |
| Board | Yield Cup Series 1 scoring (yield only, APR on the whole bank) and the strategy board | Lite's rank is your Series-1 score among the people you follow and overall; the Yield Cup becomes Lite's season mechanic, not a separate event |
| Proof | strategy proofs (wallets ≥ $1k in a strategy) | "n people run this" on every row and card |
| Copy | `copy=` links, `CopyBanner`, `copyLev` | the Home card's only action |
| Alerts | the alerts bell | one job in Lite: **a wallet you follow opened or closed a position**, with Copy on the alert (fomo's follow alert, with a real copy behind it) |
| Share | the showcase PnL renderer (`src/data/showcase.json`, X posts) | a **share card** for any of your positions: rate, days, earned; the one growth loop fomo's win cards proved |
| Paper | the amber paper account | Lite's **onboarding**: a first visit without a wallet gets a paper bank and plays the full loop; "make it real" is the conversion |

Levels, badges and quests are deliberately not in this cut: they are the
part of gamification that ages fastest and they need design and copy of
their own. If one more is added, it should be **"first loop"** as a one-off
badge, because it marks the moment the user understands the product.

## 7. What Pro keeps that Lite drops

For the record, so nothing is cut by accident:

- Borrow tab, the Stocks borrow shelf, "or borrow up to" lines
- desks and whose-credit bands, asset chips, the `FacetPicker`, Feed filter
  sheet, Hot, Pulse, Talk, threads under rows, curator pages, market pages
  (`#/m/…`), token pages, IRM curves, the alerts bell
- Defensive / Aggressive tiers, the custom slider, fixed-term and fixed-date
  loops, sub-accounts, partial deleverage, receive-in-collateral
- settings floors, chain picker, show-hidden, view-as
- venue and chain names on rows

All of it stays one tap away through Details or the Pro switch.

## 8. Research notes

### Design patterns we are borrowing

From `simplify.md`'s survey, the rows that count: Coinbase/Robinhood earn
(asset · balance · "earn up to"), Summer.fi (one risk-adjusted yield, "how it
works" panel), Pendle's simple/pro toggle. Lite is the Pendle move applied to
the whole app rather than one page.

### The FOMO app (fomo.family, FOMO Labs; checked 2026-10-23)

The first thing the research turned up changes the brief: **fomo has no Earn
or yield product.** Nothing on the site, the App Store listing, eight release
notes through 2026-10-16, the ~80-question FAQ or a dozen reviews mentions
yield. USDC is only its cash balance; the closest things are a Solana trading
rebate and referral fee-share. So "feel like fomo" cannot mean copying a yield
screen. It means copying how fomo makes a crypto app feel like a consumer app.

What fomo is: a self-custodial, gasless, multichain memecoin and perps trading
app (iOS, Android, web). Privy embedded wallets, Apple/Google/email login, no
seed phrase. Solana, Base, BNB, Monad, Robinhood Chain, Ethereum; perps via
Hyperliquid. Ex-dYdX founders, about $94M raised (Series B led by Index at a
$550M valuation, June 2026), 1M+ users, App Store 4.8.

What makes it feel simple, and what each means for Lite:

| fomo | Lite |
|---|---|
| **One USD balance** across every chain. Everything priced in USDC, never in SOL or ETH. | The header chip is already one number; Lite's lists and tickets quote dollars (`$3.50 a month on $500`), and ETH/BTC rows show the dollar value beside the coin amount. |
| **No chain, gas or bridge concepts** on screen. Gas is absorbed into the fee. | No chain picker, no chain marks. A chain surfaces only as "on Base" in the Costs line when bridging is needed. |
| **Buy in a bottom sheet** with dollar presets ($20 / $50 / $100 / custom); Apple Pay in. | The Lite ticket is a sheet with presets at 25 / 50 / 100 % of idle and a dollar field. Card on-ramp is out of scope but the slot for it is the "Add money" button in You. |
| **Home = discovery with three filters**: verified · trending · most held. | Lite Home cards get the same three lenses: proven (strategy proofs) · trending (positions opened this week, from the index) · most held. "Most held" is `n people run this`. |
| **Feed of real trades with computed PnL**, theses attached, comments, shareable win/fumble cards, daily summaries. | Our feed already shows real moves; Lite adds the PnL figure on the card and a share card for a position (the showcase renderer exists for X posts). |
| **Follow → push alert when they open a position.** Copying is manual; press calling it "one-tap copy" is wrong per reviewers. | We can beat it: our Copy really opens the same strategy. Keep follow alerts as the Lite alerts bell's only job. |
| **Leaderboard** by returns over 24h / 7d / 30d, top 10 in big green numbers. | Lite's board is the Series-1 yield score at 7d / 30d / series, among followed and overall. |
| **Referral**: 10 % off fees for the referee, 25 % of fees to the referrer. | Points for a referred wallet that puts money to work; no fee share, we charge no fee. |
| **Five tabs:** Home · Search · Feed · Friends & Leaderboard · Profile. | Lite's three (Home · Earn · You). fomo's Search tab exists because memecoins are a search problem; a 15-row list per category is not. |
| Tone: lowercase brand, "zero complexity", "become a legend", space imagery, playful but with risk disclaimers. | Lite copy stays plain-words; the playful refit in `app.css` is the right register. |

What fomo gets wrong, which Lite must not copy:

- **Fee opacity.** The spot fee is not on the site; sub-$10 buys paid a median
  22 % in fees before August 2026 (Bitquery). Users say it "feels like you get
  taxed for pressing buy". Lite's Costs line stays on the ticket for this
  reason, and the entry-loss confirmation stays.
- **Outcomes.** Bitquery (Jan–Oct 2026): about 90 % of 829K Solana wallets
  lost money after fees; the top 1 % took 94 % of the winnings. A yield app's
  pitch is the opposite distribution, which is why Lite's list is savings-only
  and the risk word stays on every row.
- **Failing sells / stuck small positions**, Trustpilot at 2.0. "Withdraw all"
  in Lite must work for dust, and the exit word (instant / 2 days) stays on the
  Can-lose line.

Sources: fomo.family and its "Navigating your fomo app" guide; Bankless
"Trading in public with fomo"; Datawallet and Kliment Dukovski reviews;
Privy case study; The Block and Decrypt funding reports; Solana Compass
revenue note; Bitquery investigation; fomoappguide.com fee page; Trustpilot.

## 9. Open questions for the owner

1. **Is Lite the default for a first visit?** This scope says yes; it changes
   what the landing page links to. Implementation plan: [`lite-plan.md`](lite-plan.md).
2. ~~Does Lite show Stocks at all?~~ Decided 2026-10-23: no Stocks, no Borrow.
3. **Points: client-computed from the index, or a server ledger?** A ledger
   is a social-service change (`pos-indexer/packages/social`); a client
   number is gameable but ships without a backend.
4. **The venue link on the trust line:** always present, or only on vault
   rows? The feedback said "no need to say morpho"; this scope keeps the
   brand as a link because a user asked "where is my money" must be able to
   answer it.

5. **Card on-ramp.** fomo's 30-second onboarding is Apple Pay to USDC. Lite
   leaves an "Add money" slot in You; whether to wire an on-ramp (Coinbase
   Onramp, Privy funding) is a product and compliance call, not this scope's.

## 10. Rough size

Not an implementation plan; an order of magnitude for planning.

| Piece | Size | Notes |
|---|---|---|
| Mode routing + two shells | S | `AppState` route head, `Shell` tab sets, a Settings key |
| Lite catalogue filter + rows-in-words | M | pure functions over `Strategy[]`; the naming helper is the work |
| Three-line ticket | M | a wrapper over the existing `SimpleTicket` / `LoopTicket` ladders; the plain-words lines reuse `exitTerms`, `liqBuffer`, economics |
| Lite Home (cards + copy) | M | merge of Start's `recommend` and the strategy board's rows |
| You (positions, points, streak, rank) | M–L | L if points need a server ledger |
| Landing and copy | S | once the default is decided |
