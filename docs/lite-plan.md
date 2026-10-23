# YieldCircle Lite — implementation plan

**Status:** built 2026-10-23, all phases. Implements [`lite.md`](lite.md). No
Stocks, no Borrow in Lite (owner's call). Pro is untouched except where a shared
piece grows a `lite` switch. **Lite is the default for every visitor who has not
chosen** (owner's call, 2026-10-23). What the build changed against this plan is
in [As built](#as-built) at the end.

Principles that shape every step:

- **One build, one catalogue, one ticket engine.** Lite is a presentation of
  `useBook()` and the existing ladders. Nothing in Lite fetches on its own
  (`docs/apis.md` layering).
- **Pure first.** Every Lite rule (which rows, what they are called, what the
  three lines say) is a function in `src/model/lite.ts` with a vitest file,
  before any component uses it.
- **Switch-in-place.** Details on a Lite ticket opens the Pro ticket for the
  same strategy with the same amount and leverage. The mechanism is already
  there: both tickets read the same `useSticky` keys (`t:<id>:amount`,
  `t:<id>:tier`, `t:<id>:lev`).
- **Small PRs, one phase each**, every one shippable behind the mode so Pro
  users never see half a Lite.

## Phase 0 — mode, routes, shell (S, ~1 day)

Goal: `#/lite/…` and `#/pro/…` exist, the saved mode decides where `#/` goes,
Lite shows an empty three-tab shell. Nothing else changes.

1. **Settings** (`src/state/Settings.tsx`): add `mode: 'lite' | 'pro'` to
   `Settings`, default `'lite'`, read/written with the others. It is a
   preference, not a filter: leave it out of `FILTER_KEYS` and `WIDE_OPEN`
   like `slippageBp`.
2. **Route** (`src/state/AppState.tsx`):
   - `Route.mode: 'lite' | 'pro'`. `parseRoute` strips a leading `lite` /
     `pro` segment into `mode`; with no prefix, `mode` is the saved setting
     for a bare `#/` and `'pro'` for any other head (every link in the wild
     stays a Pro link).
   - Views Lite does not have (`borrow`, `board`, `market`, `curator`,
     `token`, `me`, group `STOCKS`, `k=borrow|fixed`) under `#/lite/` resolve
     to `mode: 'pro'`: the prefix is dropped, the page opens in Pro.
   - `go(path, params)` prefixes with the current route's mode; a new
     `goMode(mode)` rewrites the current hash and saves the setting.
     `walletHref`, `marketHref`, `tokenHref` stay Pro.
   - `GROUP_IDS` is shared; Lite's exclusion of STOCKS is done in the
     resolution above, not by a second set.
3. **Shell** (`src/ui/Shell.tsx`): `TABS` becomes `TABS_PRO` and `TABS_LITE`
   (Home `#/lite/`, Earn `#/lite/earn`, You `#/lite/you`); `ROOTS` likewise.
   The header keeps `Me`, the logo, `Yours` (balance chip), `TxTray` and
   `Waitlist`; Lite drops `Search` and the alerts bell from the bar (alerts
   move into You in phase 4). Lite's logo links to `#/lite/`.
4. **App** (`src/App.tsx`): branch on `r.mode`; Lite renders `LiteHome`,
   `LiteEarn`, `LiteList` (group), `LiteYou` placeholders.
5. **Profile sheet** (`src/ui/ProfileSheet.tsx`): a "Lite mode / Pro mode"
   row at the top, calling `goMode`. The same row is the "Pro mode" entry on
   Lite's You page later.
6. **CSS:** `src/styles/lite.css`, imported after `app.css` in `main.tsx`;
   `body[data-mode=lite]` set by `Shell`, so Lite overrides scope under it
   and Pro's 2.5k lines are not touched. First rule: a three-slot `.tabbar`.

Acceptance: `#/` on a fresh profile opens Lite; `#/earn` opens Pro; the
sheet switches both ways and the hash shows the prefix; `pnpm build` passes.

## Phase 1 — the Lite catalogue and the Earn list (M, ~2–3 days)

Goal: Earn in Lite shows four categories and a single mixed list per
category, rows in words, no venues, no chips.

1. **`src/model/lite.ts`** (pure, with `lite.test.ts`):
   - `liteEligible(s: Strategy): boolean` — `isSavings(s.nature)`, `s.rated
     && s.riskScore <= 4`, `s.tvlUsd >= 2_000_000`, `s.group !== 'STOCKS'`,
     and for a loop `!isFixedDebt(s) && !s.dates`. **Decision baked in:**
     rows with a maturity (PTs, fixed books, `booked` rows) are out of the
     first cut; a date is a fourth line the ticket does not have. Revisit
     once the ticket exists.
   - `liteMenu(all: Strategy[], rank: (s) => number): LiteRow[]` — filter,
     then one row per `(plainKey, kind)` keeping the best by `rank` (the
     caller passes `steadyRate`), the rest attached as `alsoOn: Strategy[]`
     for the ticket's Details. Sorted by Pro's risk word (`risk` 1 → 3) then
     rank; a loop never sorts above an unlevered row with a lower risk.
   - `plainName(s): { title: string; sub?: string }` — the asset in words:
     an issued dollar is its symbol (`USDC`); a yield dollar is `Dollars via
     <desk name>` (`DESK` tables in `model/assets.ts`, `deskByKey`); ETH rows
     are `Ether` or `Staked ether · <issuer>` for an LST; BTC rows `Bitcoin` /
     `<wrapper> bitcoin`; More keeps `nameOf(asset)`. Never a venue, never a
     chain. `plainKey` is the title lower-cased.
   - `leverTag(s)` — `×3` from `s.tiers.balanced`, rounded to one decimal.
   - `trustLine(s): { kind: string; size: string; since?: string; brand:
     string; brandHref: string }` — "Lent on an audited lending market",
     "A savings vault", from `source` / `protocolKey`; size from `tvlUsd`;
     brand from `s.brand` / `s.venue` with `marketHref(uid)` as the link.
     `since` is left `undefined` until the index exposes a market's first
     block (it does not today; do not fake it).
2. **`src/ui/lite/LiteEarn.tsx`**: four tiles (USD, ETH, BTC, MORE) built
   from `GROUPS` minus STOCKS, each with your money there (`AssetBook`
   totals from `useBook`) and the best Lite rate. Reuse `GroupIcon`.
3. **`src/ui/lite/LiteList.tsx`** (route `#/lite/<GROUP>`): `useBook()`,
   `useRateHistory(b.all, !b.isFetching)` as `Earn.tsx` does, `liteMenu`,
   then rows: face (`StratMark` / `Toks` with logos, no venue badge),
   `plainName`, rate (amber when `isSpike`), `RiskDot`, `leverTag`, `Yours`
   (held `usdShort`), and `n people run this` from `useStrategyProofs` of the
   rows' `bookKeyOf` keys (the Start page already does this; lift its
   `proofs.held` pattern). Tap → `go(group, { s: s.id, k: s.kind })` opens the
   Lite ticket (phase 2) in the same place `AssetPage` opens Pro's.
4. **Chains:** Lite never shows the chain picker. `useApp().chainIds` stays
   whatever the user (or default) set; nothing to build here, only nothing
   to render.

Acceptance: USD list shows ~10–15 rows; no "Morpho", "Aave", "Kamino" or a
chain name anywhere on the page; a Balanced sUSDe/USDC loop still appears.
Tests pin `liteEligible` on a fixture of real rows (take six from a saved
catalogue response: issued deposit, yield-desk deposit, PT, fixed-term loop,
perp-LP, same-money loop) and `plainName` on each desk kind.

## Phase 2 — the three-line ticket (M–L, ~3–4 days)

Goal: tapping a row opens a sheet with Earn / Can lose / Costs, presets, one
button, Details. Pro's ticket is reached in place with the same inputs.

Approach: **a `lite` prop on `Ticket`, not a second ticket.** `LoopTicket`
and `SimpleTicket` already compute everything the three lines need (`dep`,
`bor`, `L`, `E`, `econ`, `cost`, `payback`, `drop`, `exitTerms`, `ladder`,
`vc`, `noRoute`, `short`). Extracting a `useLoopPlan` hook would be cleaner
but moves ~150 lines of state with sticky keys and quote wiring; do it only
if the prop version fights back. Steps:

1. **`Ticket({ …, lite })`** passes `lite` down. In `LoopTicket` and
   `SimpleTicket`, after the derived values and before the JSX, `if (lite)
   return <LiteLoopBody … />` / `<LiteDepositBody … />` with the values
   handed over as props. The ticket head (`th`), `CopyBanner`, `KindPill`
   and the close button stay shared.
2. **Leverage in Lite:** `L` is `copyL` when a copy, else
   `s.tiers.balanced`; the tier/custom sticky keys are *written* to match
   (`setTier('balanced')`, `setCustom(null)`) so Details opens on the same
   number. No tier UI is rendered.
3. **`src/ui/lite/LiteTicketBody.tsx`**, the three lines from
   `src/model/lite.ts::liteLines(...)` (pure, tested):
   - Earn: `pct(rate)` + `usd(E * rate / 12)` a month at the typed amount;
     loop adds `leverTag`.
   - Can lose: loop → `Liquidated if <holds in words> trades <pct(drop)>
     under <debt in words>` (`liqBuffer(liqLtv, L)`; "under $1" when the
     debt is a dollar). Deposit → `exitTerms(s).when` in a sentence plus the
     `utilization >= 0.9` "exit is tight right now" warning that
     `SimpleTicket` already has.
   - Costs: loop → `usd(cost)` to enter, `daysWord(payback)` to earn it back
     (amber past 30 days, the existing `>1 %` / `>3 %` `ValueCheck` rules
     stay); deposit → `Only the network fee` (there is no economics quote
     for a deposit; do not invent a number).
   - Presets: 25 / 50 / 100 % of the chosen pay asset's idle balance, plus
     the existing `AmountBox`. Max uses `payRaw` exactly as today.
   - `Action` unchanged (ladder, paper, gated). Label: `Put $500 to work` /
     `Open ×3 loop · $500`.
   - `Details ›` → `go(group, { …route, pro: '1' })`? No: it calls
     `goMode('pro')` with the same hash, so the Pro ticket opens for the same
     `s=` with the sticky amount and leverage. Back returns to Lite.
4. **Managing in Lite** (`ManageTicket` / `ManageLoop` with `lite`): two
   buttons, *Add* (reopens the open body) and *Withdraw all* (deposit:
   `isAll` withdraw; loop: close to the debt coin at 1×). Partial reduce,
   receive-in-collateral and sub-account picking are not rendered; a position
   that needs them (`CannotManage`, multi-leg `LegsNote`) shows its note and a
   "Manage in Pro" link.
5. **Sheet on a phone:** `.ticket` under `body[data-mode=lite]` renders as a
   bottom sheet (`useModalChrome` and `Drawer` exist; reuse the drawer's
   motion). Desktop keeps the aside.

Acceptance: a loop ticket in Lite shows exactly three figures before the
amount; `Details` lands on the Pro ticket at the same leverage and amount;
the paper refusal and no-route states still read; `pnpm build` passes.
Tests: `liteLines` on a dollar loop, an ETH loop (buffer against ETH, not
$1), an instant-exit deposit, a cooldown deposit.

## Phase 3 — Lite Home: cards, lenses, copy (M, ~2–3 days)

Goal: Home is the balance, then one column of copyable cards.

1. **Header:** the balance (`totalsOf` from `Positions`) and `+$x a day`
   (`yearlyUsd / 365` summed over books) above the column.
2. **Cards** (`src/ui/lite/LiteHome.tsx`), three lenses as a `seg`:
   - **Proven** — `recommendAll` from `model/activity.ts` over the Lite menu,
     the three bands flattened, each card with its proof (`n wallets · $x`).
   - **Trending** — `useTrending('7d', chainIds)` markets mapped back to Lite
     rows by `uid` (`canonUid`); rows without a Lite strategy are dropped.
   - **Most held** — the strategy board (`useEarners` grouped by strategy as
     `BoardStrategies` does, `sort=usd`), mapped to Lite rows; the card's
     face is its best holder (`Who`), its action is Copy with `copy=<account>`
     and `lev=` via `levParam`, exactly `BoardStrategies.tsx::CopyOrOpen`.
   - Below the cards, the following feed (`useFeedPage` with `follower`) for
     a wallet that follows someone — the same `Feed` component with
     `tab='following'` and its filter stack hidden under `data-mode=lite`.
3. **No wallet / empty wallet:** `PaperOffer` from `PaperPanel.tsx` at the
   top of the column (the paper bank is the onboarding), then the Proven
   cards.
4. Card anatomy: face · `plainName` · rate · risk dot · lever tag · proof
   line · [Copy]. Tap elsewhere opens the Lite ticket.

Acceptance: a fresh visitor sees the paper offer and six proven cards within
`START_DEADLINE_MS`; Copy opens the Lite ticket with the copy banner and the
copied leverage.

## Phase 4 — You: positions, streak, points, rank, alerts (M–L, ~3–4 days)

Goal: the third tab holds everything about the user. Honest first versions,
client-computed, clearly marked where a server ledger would make them real.

1. **Positions:** `Positions` from `ui/Positions.tsx` with `lite` (plain
   names, no venue column, tap → Lite manage ticket).
2. **Streak — days with money at work.** v1 from the index:
   `useIndexPositions(account)` gives open positions with their open time;
   streak = days since the earliest still-open position with ≥ $10 at work.
   Paper accounts use `book_daily`. A real daily ledger is a
   `pos-indexer` job (not here); the doc says so on the tile ("counted from
   your oldest open position").
3. **Points.** v1 client formula over the same data: `Σ days_held ×
   dollars_at_work / 1000`, plus a flat bonus per followed wallet copied
   (positions whose `copy=` link was used — tracked in localStorage until the
   social service has a ledger). Gameable; labelled "preview" in the UI.
   **Server ledger** is a separate ticket in `pos-indexer/packages/social`
   and is the real phase-4 cost if the owner wants it before launch.
4. **Rank.** v1: the wallet's place by 30-day APR among the wallets it follows
   and overall, from `useEarners` (`by=wallet`, window 30d). The Yield Cup
   Series-1 score (`docs/yield-cup/series-1.md`) is **not implemented
   anywhere yet** (no `series` in `model/paper.ts` or the paper API); wiring
   it is its own ticket and lands here when it exists.
5. **Alerts** in You: the existing `Alerts` page body with a Copy button on
   each "opened a position" card (same `go(...copy, lev)` as the board).
   `useUnseen` drives a dot on the You tab.
6. **Pro mode** row (phase 0's `goMode`) and the paper tools
   (`PaperSettings`) at the bottom.

Acceptance: a connected wallet with two positions sees them in words, a
streak, a points number and a rank, each with its one-line "how counted".

## Phase 5 — share, landing default, QA (S–M, ~2 days)

1. **Share card:** v1 is `navigator.share` / clipboard with text (`Earning
   8.4% on dollars · 41 days · +$312 — yieldcircle`) and the strategy link.
   An image card needs a renderer; `showcase.json` is data for the video
   script, not a component. Ticket it separately.
2. **Landing** (`landing/Landing.tsx`): CTAs point at `#/` (opens the saved
   mode, Lite first). The `#/board` link stays Pro.
3. **QA pass** on a phone: tabbar, sheet, presets, back behaviour
   (`useBack` with the prefix), paper flow end to end, a real deposit and a
   real loop on one chain each.
4. **Docs:** `docs/lite.md` status → built; a line in `CLAUDE.md` pointing at
   `model/lite.ts` as the only place Lite rules live.

## Sequencing and size

| Phase | Depends on | Size | PR |
|---|---|---|---|
| 0 mode + shell | — | S | 1 |
| 1 catalogue + list | 0 | M | 1 (model + tests), 1 (UI) |
| 2 ticket | 1 | M–L | 1 (loop), 1 (deposit + manage) |
| 3 home | 1, 2 | M | 1 |
| 4 you | 2 | M–L | 1 (positions + alerts), 1 (streak/points/rank) |
| 5 share, landing, QA | all | S–M | 1 |

About **three weeks** of focused work for one person; phases 3 and 4 can run
in parallel after 2. The server-side items (points ledger, Series-1 scoring,
market "live since", daily at-work ledger) are listed, not counted.

## Risks and how the plan handles them

- **`Ticket.tsx` is 1.3k lines and the `lite` prop adds branches.** Keep the
  Lite bodies in their own files; the branch in `LoopTicket` is one line. If
  a third variant ever appears, extract `useLoopPlan` then.
- **Sticky-key coupling** between Lite and Pro tickets is the carry-over
  mechanism *and* a hidden contract. Name the keys once in `Ticket.tsx`
  (`stickyKeys(s)`) and use them from both bodies.
- **Mixed list ranking** is the one place Lite could mislead. The rule
  (risk tier first, then steady rate) is pure and tested; the lever tag is
  on every loop row.
- **Points without a ledger** invite gaming. Label "preview"; no rewards are
  paid on it until the ledger exists.
- **Shared working tree:** the owner commits concurrently; each phase is its
  own branch and PR, rebased before merge.

## Decisions taken here (flag if wrong)

1. ~~Lite drops rows with a maturity (PTs, fixed books) in the first cut.~~ As
   built, PTs stay and fixed books are out (see As built, item 4).
2. `#/lite/<unsupported>` opens the Pro page rather than Lite's home.
3. Default mode for a first visit is Lite. ~~Existing unprefixed links are Pro.~~
   As built, they follow the saved mode where Lite has the page (item 2).
4. Streak, points and rank ship as client-computed previews; the ledger is a
   separate backend ticket.
5. The venue brand is always present on the trust line, as a link at the end.

## As built

Where the code lives:

| Piece | File |
|---|---|
| Lite's rules (eligibility, names in words, the merged list, the three lines, streak, points) | `src/model/lite.ts` + `lite.test.ts` |
| Saved mode | `src/state/mode.ts` (`yieldcircle.mode` in localStorage) |
| Prefix, `liteHas`, `hrefIn`, `liteHref`, `proHref`, `goMode` | `src/state/AppState.tsx` |
| Three-tab shell, Lite balance chip | `src/ui/Shell.tsx` |
| Pages | `src/ui/lite/LiteHome.tsx`, `LiteEarn.tsx`, `LiteList.tsx`, `LiteYou.tsx` |
| Shared hook, rows, cards, followed moves | `src/ui/lite/useLite.ts`, `LiteBits.tsx` |
| Ticket | `LiteTicket` and the `lite` branches in `src/ui/Ticket.tsx`; `src/ui/lite/LiteTicketBits.tsx` |
| Switch | `src/ui/lite/ModeSwitch.tsx`, in the profile sheet and on You |
| Styles | `src/styles/lite.css` |

Changes against the plan above, and why:

1. **The saved mode is its own store, not a `Settings` key.** The route is parsed
   outside React on every hash change and has to read it synchronously.
2. **An unprefixed link follows the saved mode when Lite has that page.** The plan
   sent every unprefixed link to Pro. With Lite as the default, that would have
   put a first visitor who follows a shared ticket link into Pro.
3. **The frame and the page have separate modes.** `Route.shell` is the mode asked
   for, else the saved one. `Route.lite` is whether the page itself is Lite's. A
   Lite reader on a page only Pro has (a wallet, the board) keeps Lite's tabs,
   and a Copy there opens Lite's ticket. Only an address that asks for Pro
   (`#/pro/…`, as Details does) keeps navigation in Pro.
4. **PTs and PT loops stay in Lite.** The plan dropped every dated row. A PT's
   date is one fact the ticket states, not a choice it asks for, and those rows
   carry many of the steady high rates. Fixed-rate books, maturity pickers,
   fixed-term and dated debt are still out.
5. **A Lite loop must leave at least 3 % to liquidation at its Balanced tier**
   (`LITE_MIN_BUFFER`). The first browser run showed a ×22 loop about 1 % from
   the line. Pro keeps those rows.
6. **A list shows 12 rows, then "Show all".** One row per thing in words still
   left 98 dollar rows, because there are that many distinct dollar issuers.
7. **The ticket's Lite bodies are branches inside the existing tickets**, after
   all their hooks, rather than separate components. They read the values those
   tickets already compute (rate at size, liquidation buffer, entry cost,
   break-even, loss check, ladder). A Lite loop pays in the debt coin by default
   when the wallet holds nothing, never in a PT's or share's name.
8. **Streak and points are counted on the device from the live book.** The index
   must never serve the connected wallet's own positions (`docs/apis.md`), so
   nothing is read back from it. Both are labelled as previews.
9. **Rank is the board standing the header already shows** (`useMyStats`).
10. **Most held uses the strategy proofs**, not the earners board: they are
    already fetched for every Lite row.
11. **Alerts are the followed-moves list, with Copy**, on Home and on You. Lite's
    frame has no bell.
12. **Share is a link plus text**, and the link is a Copy link: it opens the
    strategy with the sharer as the wallet copied. An image card is not built.
13. **Every position is managed in Lite** (2026-10-23, after the first review).
    The first build sent any position outside Lite's menu to Pro, which was most
    real ones: a ×21 loop under the buffer floor, loans, a deposit below a floor.
    You now opens each on its own Lite ticket (`#/lite/you?h=…`,
    `LiteHoldingTicket`, `LiteLoanTicket`). A loop gets Add (only when Lite offers
    it, at the position's own leverage capped at Balanced), Lower risk (the
    leverage that leaves 5 %, 10 % or 20 % to liquidation, `saferTargets`) and
    Close. A deposit gets Add and Withdraw (25 %, 50 %, all). A loan gets Pay back
    all, which returns the collateral, and Pay back some. A position within 10 %
    of liquidation opens on Lower risk, and its row says how far it is. Only a
    price bet still opens in Pro.
14. **The landing needed no change.** Its CTAs open the app root, which opens the
    saved mode, so Lite for a first visit.

Not built, and why:

- **A server points ledger, Series-1 scoring, and a market's "live since" date.**
  Each needs a backend change in `pos-indexer`.
- **The image share card.** The showcase data feeds a video script, not a
  component.
- **The paper sign-in in the browser check.** Exercising it creates an account on
  the production social service, so it was not run.
