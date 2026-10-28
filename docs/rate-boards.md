# Rate boards: rank people by what their money earns, and by what it earned

**Status:** phase 0 built 2026-10-28 (see the end); phases 1–4 are a plan. Touches the app (`yieldcircle`) and the index
(`pos-indexer`). Builds on [`board-strategies.md`](board-strategies.md) and
[`lite-social-search.md`](lite-social-search.md).

## 1. The problem

Lite's social surfaces show "top earners" ranked by **dollars a day**: the
search page's *Top earners this week*, Home's *Everyone* moves, the phone app's
search, and the dollars-a-day rank on a profile. Dollars a day is size times
rate, so the list is a list of the biggest wallets. On 2026-10-28 the top 8 of
that board held **$30M–$209M each and earned 1.1–6.8 %**. Following them teaches
a $500 user nothing: anyone can get 4 % on USDC.

The heading also misleads. *This week* is wrong: the figure is today's rate
times today's balance, not anything earned this week.

What a follower wants to know is: **whose money earns the highest rate, and who
actually earned it, steadily, over a week or a month?**

## 2. What exists

| Ranking | Served by | What it measures | Floors today | Speed |
|---|---|---|---|---|
| Dollars a day | `/earners?by=wallet&sort=perDay` | Σ annual carry ÷ 365, at today's rates | people; earning | pre-warmed, 0.2 s |
| **Rate now** | `/earners?by=wallet&sort=apr` | Σ annual ÷ Σ equity, on each market's **24 h mean** rate | people, NAV ≥ **$10k**, `exact`, plain preset (phantom, rate-capped, illiquid-exit … dropped) | `limit=50` pre-warmed: **0.13 s**; `limit=100` cold: **1.2 s** |
| Lifetime PnL / Yield | `/earners?sort=pnl\|yield` | since the position opened (tickets/0084), open positions only | as rate | pre-warmed |
| **Realized, 7 d / 30 d** | `/leaderboard?window=7d\|30d` | units × Δpool index, flows removed, per wallet (`idx.account_yield`, every 30 min) | **none**: contracts, no person filter, sorted by **dollars** | 0.15–1.3 s |

Facts from `pos-indexer` that shape the plan:

- **The realized ledger exists.** `idx.account_yield_daily(day, account,
  realized_usd, n_legs, exact)` is refreshed by the `account-yield` job every
  30 min. A day becomes final 3 h after it ends. Windows are summed from a
  cache of the final days plus today's partial day (`accountYieldDays.ts`,
  tickets/0079). **Retention is 31 days, and the table is UNLOGGED**: a crash
  empties it.
- **Its rate has the wrong denominator.** `rate_pct = realized ÷ capital held
  now`. A wallet that harvested all week and withdrew yesterday reads
  enormous; one that deposited yesterday reads near zero.
- **It counts pool-index yield only.** Lending and borrow interest are in; a
  token's own growth is not (wstETH against ETH, sUSDe, savings tokens, PTs
  pulling to par). Many of Lite's rows earn exactly that way, so they would
  read 0 %.
- **Lifetime records split price from yield properly** (`yield = pnl −
  directional`, `docs/lifetime-pnl.md`), with daily cumulative lines
  (`yield_days[]`, `nav_days[]` per position). But they cover open positions
  only, and the arrays are not indexed for ranking.
- **The pattern that is fast**: a job writes a small ranked snapshot table,
  `server.ts` serves it from the in-process SWR cache, and the URL is in
  `EARNERS_PREWARM_URLS`. Reads are then 4–10 ms uncached (tickets/0057).
  Crowns already do this for "the best right now", with a 2-hour hold before a
  place changes hands (`crowns.ts`).

## 3. Decisions

1. **People are ranked by rate, never by dollars**, on every Lite surface that
   suggests someone to follow. Dollars a day stays where it is about *you*
   (your chip on You) and as one sort on the board.
2. **Two kinds of rate, said in words:**
   - *Rate now*: what the money earns at today's rates. Exists today.
   - *Earned over 7 days / 30 days*: what it actually earned, as an APR on the
     capital that was there. New.
3. **Rolling windows for the live lists; closed cycles for the record.** "Best
   7 days" moves every 30 minutes. "Week 43's best" is written once, when the
   week is final, and never changes.
4. **Same floors everywhere**, one definition in the index: a person, plain
   preset, `exact`, average capital ≥ $10k over the window, there most of the
   window, and an APR cap with a flag above it.

## 4. The windowed rate

### Metric

```
earned APR (window) = Σ realized yield − Σ borrow cost      × 365
                      ───────────────────────────────────
                      Σ capital-days (equity × days held)
```

This uses the same capital-days denominator as the lifetime records (`carry.ts`
`Σpnl / Σcapital_days × 365`), so a wallet's 30-day figure and its lifetime
figure mean the same thing. It is also the Yield Cup Series 1 score, except
that the denominator there is the fixed bank.

### What the index adds

| Change | Where | Why |
|---|---|---|
| `capital_usd` per day: the day's time-weighted equity | `account_yield_daily`, written by the same job | the denominator; costs one column, no new pass |
| Intrinsic yield per day: units × Δ(token ÷ underlying) for LSTs, savings tokens and PTs | the same job, from the prices the lifetime split already uses | without it every wstETH, sUSDe or PT row reads 0 % |
| `days_present`, `liquidated` per window | the window step | the floors below |
| A **logged** daily table, or a rebuild-on-boot path | migration | today a crash empties every window board for up to a month |
| `idx.rate_board(win, exposure, rank, account, apr_pct, realized_usd, capital_avg_usd, days, flags)`: top 100 per window × exposure, built and swapped each run | new, beside `account_yield` | the read becomes one indexed `SELECT … LIMIT` |

Borrow cost: the ledger values debt legs with their index too. Whether that
already enters `realized_usd` as a negative is **to verify first**; a loop must
score its carry, not its gross supply yield.

### Floors

| Floor | Value | Why |
|---|---|---|
| Person | `is_person` | no contracts, routers or vaults on a people list |
| Plain preset | `EARNERS_DEFAULT_EXCLUDE` | phantom rates, rate-capped and illiquid exits do not lead |
| Average capital | ≥ $10k over the window | the existing rate floor; noise below it |
| Presence | ≥ 5 of 7 days, ≥ 21 of 30 | a one-day wallet cannot top a weekly list |
| Liquidated in window | out of the list | the Yield Cup rule: yield that ended in a liquidation is not a strategy to copy |
| APR | over 100 % is flagged, not ranked | the Series 1 cap; a thin market spiking for a day |

### Cycles

When the last day of an ISO week or a calendar month turns final, the job
writes that period's top 100 per exposure into **`idx.rate_cycles(kind,
period, exposure, rank, account, apr_pct, realized_usd, capital_avg_usd)`**.
The table is logged, written once and kept for good. It outlives the 31-day
daily retention, so "best week of October" and later badges ("Week 43's best
on dollars", alongside crowns) read from it. Served at
`/rate-board/cycles?kind=week&period=2026-W43&exposure=usd`.

## 5. Performance

The goal is that no read computes anything.

- **Reads:** every board is a snapshot row set. The target is uncached p95 under 20 ms,
  where the earners board is at 4–10 ms today. Every URL the app uses is in
  `EARNERS_PREWARM_URLS`, so a reader hits the SWR cache.
- **Writes:** the window step already sums cached final days plus today. The
  new columns ride the same rows. Ranking about 70k wallets × 4 exposures × 2
  windows and keeping 100 each is one `ROW_NUMBER()` pass; the budget is under 5 s
  added to the 30-minute job. A cycle close runs once a week or month.
- **Size:** 31 days × the wallets with legs ≥ $25 in daily rows, which is the
  current table plus two numeric columns. Snapshots are 800 rows. Cycles add
  400 rows a week.
- **The app:**
  - One request per screen, under shared query keys, so search, Home and the
    profile read one answer.
  - No per-row fetch.
  - `staleTime` follows the job's cadence (30 min) and `computedAt`.
  - Use `limit=50`, the pre-warmed size, or pre-warm `limit=100`. Today Lite's
    board asks for 100 and pays the cold 1.2 s.
- **What not to do:**
  - No live `/accounts/:a/series` for ranking (p95 18 s).
  - No summing `yield_days[]` across 80k positions at read time.
  - No client-side aggregation of the board.

## 6. Phases

| # | What | Where | Size |
|---|---|---|---|
| **0** | Lite's people lists read **rate now**: search's top earners, Home's *Everyone*, the phone's search and the profile's rank use `sort=apr&limit=50` (pre-warmed). Rows show the rate first and dollars a day second. The heading becomes "Earning the most right now". The Lite board asks for 50, or the index pre-warms 100. | app (+1 prewarm URL) | S, today |
| 1 | Verify the ledger: borrow cost sign, intrinsic coverage, and what a $10k sUSDe holder and a wstETH loop read over 7 days against their lifetime record | pos-indexer | S |
| 2 | `capital_usd`, intrinsic, presence and liquidation in the daily job; logged table or rebuild; `idx.rate_board`; `/rate-board?window=7d\|30d&exposure=`; prewarm | pos-indexer | M |
| 3 | The board gets **Now · 7 days · 30 days**. Search's list becomes "Best 7 days" (and the heading is then true). The profile shows "earned 6.1 % over the last 30 days" beside the rate now. The phone app gets the same on the same hooks. | app | S–M |
| 4 | Cycles: `idx.rate_cycles`, the close step, `/rate-board/cycles`; a "Last week's best" strip on Home and Board; week and month badges beside crowns | both | M |

Phase 0 needs no index work and fixes what the screenshot shows. Phases 1–2
decide whether the realized figure can be trusted for LSTs and loops, so that
is where the risk sits.

## 7. Questions for the owner

1. **The header rank and You's rank**: switch them to rate too, or keep dollars
   a day there, since that one is about you? I suggest rate, so "#12" means the
   same thing everywhere.
2. **Window for Lite's default list**: rate now (it moves with markets and
   exists today) or the 7-day realized rate once phase 2 ships (honest, and lags
   by up to 30 minutes)? I suggest 7 days once it exists.
3. **Cap**: 100 % (the Series 1 value), or lower for Lite, e.g. 40 %, since a
   Lite list is a list of things to copy?
4. **Exposure lists**: should the weekly records be per money (dollars, ether,
   bitcoin), as the board's chips are? Rates differ a lot between them. I
   suggest yes.

## Phase 0, as built (2026-10-28)

- `useRateLeaders()` (`packages/app/src/index/queries.ts`) reads
  `/earners?by=wallet&sort=apr&people=1&limit=50`, the pre-warmed URL
  (`RATE_BOARD_LIMIT`). Its query key `earners-lite / apr / all` is shared with
  Lite's board, so the board, search, Home and a profile make one request.
- Search's list is **Best rates right now**: the board's own order
  (`boardWallets`), each wallet with its rate, its positions and dollars a day
  under the name. Home's *Everyone* is **Moves by the best rates**. The
  phone's search and board use the same request.
- A profile ranks a wallet on the rate board first (in the board's order),
  then on the dollars-a-day top 100.
- The rate board asks for 50 on the web and the phone. A money chip (Dollars,
  ETH, BTC) on the wallet board is still a cold URL: the index pre-warms those
  for positions, not for `by=wallet`. Adding the three is the one-line index
  follow-up.
- Unchanged: the header's rank and You still read dollars a day (question 1).
- Seen once in the browser: *Everyone*'s EVM feed half (`/events/recent?accounts=`,
  40 wallets) took 31 s. The same query cold by curl takes 0.6–1.3 s. Tracked in
  [`tickets/0019`](../tickets/0019-everyone-feed-latency.md).

