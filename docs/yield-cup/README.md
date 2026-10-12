# The Yield Cup — teaser plan

A paper farming tournament: play money, real rates, **cash prizes** for the best
farmers in several categories, across every chain we follow. This doc covers the
teaser (what we say now) and a draft of the format (what we decide before the
reveal).

## What we say, and what we don't

**Say:** paper farming tournament · cash prizes · every chain · categories for
different kinds of farmer · Season 0 · "more in the coming days" · warm up on
paper now.

**Don't say (yet):** airdrop, points, token, rewards multipliers, allocation,
prize-pool size, start date, exact rules. Every post ends with *"Rules, dates
and prizes in the coming days."*

## Graphics

Rendered by `node docs/yield-cup/render.mjs` from the brand paths in
`brand.json` and the design tokens (black ground, paper amber `#f4b740` for the
cup, brand cyan for the logo). Sources live in `graphics.html`; edit `render.mjs`
and re-run.

| file | size | use |
|---|---|---|
| `x-header.png` | 1500×500 | X profile header for the teaser week |
| `teaser.png` / `@2x` | 1600×900 | Post 1: the announcement |
| `categories.png` / `@2x` | 1600×900 | Post 2: the categories |
| `warm-up.png` / `@2x` | 1080×1080 | Post 3 / Telegram / IG: "warm up on paper" |

## Rollout

| when | post | graphic |
|---|---|---|
| Day 0 | Announcement + header swap | `teaser`, `x-header` |
| Day 1–2 | Categories | `categories` |
| Day 3–4 | Warm-up / practise call | `warm-up` |
| Day 5–7 | Reveal: rules, dates, prize pool (and later anything else) | new |

### Copy

**Post 1: announcement**
> The Yield Cup is coming 🏆
>
> A paper farming tournament on YieldCircle. Play money, real rates, real
> **cash prizes**.
>
> Every chain. Several categories. Farm your way.
>
> Rules, dates and prizes in the coming days.

**Post 2: categories**
> There's more than one way to win the Yield Cup.
>
> Overall · Dollar · ETH · BTC · SOL · HYPE · Chain champions … and more to come.
>
> Stables maxi, ETH looper, SOL degen: there's a category for you.

**Post 3: warm up**
> Paper accounts are live. $10k of play money, real rates on every chain we
> follow, and a board that ranks you net of every fee, swap and bridge.
>
> Warm up now. The Yield Cup is coming. 🏆

Short variants for replies and Telegram:
- "Paper farming tournament. Cash prizes. Every chain. Soon."
- "Think you can out-farm the timeline? Prove it on paper."

## Format (draft, to decide before the reveal)

This builds on what the paper board already does (`src/ui/Board.tsx`,
tickets/0006 §G), so most of the scoring already exists.

- **Book.** Every entrant starts from the same paper bank: $10,000 USDC + 1 SOL
  on Solana (`STARTER` in `src/model/paper.ts`). Everything off Solana starts
  with a bridge, so getting across chains cheaply counts.
- **Score.** *Return*: what the strategies earned over what was put in, net of
  every fee, swap and bridge, valued hourly by the server at real time. This is
  the paper board's "Return" sort already.
- **Window.** A fixed season (e.g. 3–4 weeks). Return counted from the start
  date, not from account creation.
- **No top-ups** during the window (a top-up changes `putInUsd` and lets people
  reset).
- **Eligibility.** The board's own rule: a book shows once it is a day old with
  $1,000 at work. Raise the minimum for prize eligibility (e.g. ≥ 80% of the
  bank at work on average) so nobody wins by parking $1k in a single hot vault.
- **Liquidation.** A book whose `worstHealth` went below 1 ("would have been
  liquidated") is out of the overall prize, or takes the loss. It must not keep
  its pre-liquidation return.

### Categories

They map onto filters the board already has (the exposure chips and the
one-chain view):

| category | ranked on | source |
|---|---|---|
| Overall | return, whole book | paper board, Return |
| Dollar / ETH / BTC / SOL / HYPE farmers | return on positions of that exposure | exposure chips (`usd`/`eth`/`btc`/`sol`/`hype`) |
| Chain champions | return on positions on that chain alone | one-chain board (pos-indexer 0059) |
| *Later reveals* | e.g. best net APR at the close, lowest friction, best loop, most chains | see below |

Ideas held back for "more categories" reveals: **Efficient farmer** (best
return per dollar of friction), **Looper** (best leveraged position that never
dropped below a health floor), **Explorer** (most chains with ≥ $1k at work and
a positive return), **Rookie** (best book from a wallet new to YieldCircle).

### Prizes (sketch)

Pool size is TBD. Shape: top 3 overall (largest share), a winner per exposure
category, and a smaller fixed prize per chain champion, only on chains with
at least N entrants so a quiet chain can't be won by a single wallet. One wallet
can win at most one category prize plus overall.

## Risks to settle before the reveal

1. **Sybils.** Paper accounts are free, and cash prizes make farming accounts
   worth it. Options: entry gated by a linked X account (we already have X
   linking) plus a minimum account age, or entry via the waitlist; payout to a
   wallet with some on-chain history; a light check on winners only.
2. **Rate gaming.** A rate that spikes for an hour on a thin market can win a
   short window. Exclude positions the board flags (`rate-spike`,
   `rate-unverified`, `thin`, `phantom`, `rate-capped`) from the score, or
   accrue at a capped or averaged rate.
3. **Mixed books** in exposure categories: score each category only on that
   exposure's positions (the chips already split this way), not the whole book.
4. **Payout logistics.** Prize currency (USDC on which chain), jurisdiction and
   terms text, tax wording.
5. **Name.** "Yield Cup" with "Season 0", so later seasons fit.

## Product work implied

- Contest window on the paper board: return from a start timestamp, top-ups
  frozen, entrants only.
- Category boards: exposure and chain filters on the paper board (the real board
  already has them).
- Entry flow: "Join the Yield Cup" on the paper panel, with the gating from
  Risk 1.
- Winner snapshot export for payouts.
