# Board by strategy — rank what is run, not who runs it twice

**Status:** built 2026-10-14 — all three phases (see *Where it lives*). The
app ships the fold for older indexes; the grouped endpoint needs the
pos-indexer deploy. Crosses `yieldcircle` (Board) and
`pos-indexer` (`/earners`, both indexes). Builds on the strategy book
([pos-indexer docs/strategy-book.md](../../pos-indexer/docs/strategy-book.md))
and its keys (`src/model/uid.ts::bookKeyOf`).

## The problem

The Positions board ranks single positions by 24 h APR. When one strategy pays
the best, every wallet that runs it lines up behind each other: on Solana
the top 9 rows are all the same nOPAL/USDC loop on Kamino Nest at ~4×, ten
different faces, one idea. A board that should say *what earns* says the same
thing nine times and pushes everything else off the first screen.

Measured on prod, 2026-10-14 (`/earners?sort=apr&people=1&limit=200`, default
preset, each index), grouping positions by their book key:

| board                    | top 25                      | top 50                       | top 200                       |
| ------------------------ | --------------------------- | ---------------------------- | ----------------------------- |
| Solana                   | **7** strategies, 25 wallets | **8** strategies, 48 wallets  | 28 strategies, 153 wallets     |
| EVM + Solana (merged)    | **8** strategies, 24 wallets | 14 strategies, 45 wallets    | 29 strategies, 170 wallets     |

Biggest runs: Solana top 50 holds **29× the AUTO/wYLDS loop** (Kamino AUTO
market) and 10× nOPAL/USDC; the merged top 25 holds **12× USDG supply** on
chain 4663 (a debt-free deposit, 63.4 %) and 5× the PT-apyUSD/apxUSD loop.

Two consequences:

1. **The first screen is ~8 ideas.** Positions 10–50 are mostly the same
   ideas again at slightly lower APR.
2. **The long tail never shows.** Each index answers its top 50 positions; a
   strategy whose best holder ranks 51st is invisible, even if it is the only
   one of its kind. Grouping the top 50 on the client fixes (1) and makes (2)
   worse — 50 rows collapse to 8.

## The idea

**The ranked unit is the strategy; the face is its best holder.** One row per
strategy (`loop:<held uid>|<debt uid>` or `dep:<uid>` — the strategy book's
keys, so the row links to the same ticket, thread and Start card), showing:

```
 1  [face][face][face]  nOPAL / USDC loop · Kamino Nest Market        27.60%   $941k · 12 wallets   [Copy]
                        best: Dapper Quarry 4.0× · 3.9–4.0× · since …  avg 27.4%   $350 a day
     ▸ 11 more wallets run this
```

- **APR sort → the strategy's best clean stake.** Rank = the highest 24 h APR
  among its exact positions ≥ $10k (the population the APR board already
  ranks). That is exactly today's board with duplicates folded under their
  best, so the number at the top is still a real position someone holds.
  Caption: equity-weighted APR across holders and the leverage range — the
  best is often just the highest leverage.
- **$/day sort → Σ $/day of the strategy.** What the strategy pays all its
  holders a day: "where the money is". Today's $/day board is a size ranking
  of single wallets; summed per strategy it becomes the useful one. (The two
  sorts then answer *best rate* and *most money*, which the segment already
  says.)
- **Leverage is a parameter, not a key** (as in the book): a 2× and a 4×
  nOPAL loop are one row with `2.0–4.0×`. Splitting by leverage tier
  ([leverage-tiers.md](leverage-tiers.md)) is possible later; it would bring
  back the duplicates.
- **One primary key per position.** The book files a multi-collateral Aave
  account under every (held, debt) pair; the board must count it once. Rule:
  the largest held leg by USD × the largest debt leg by USD
  (`loop:<held>|<debt>`); no debt → the largest held leg (`dep:<uid>`),
  skipping foreign collateral as the book does. The row keeps `+N` for the
  other legs, as today.
- **Expanding a row** shows its holders (the flat position rows we have now,
  same cells, same Follow); "all N" goes to the strategy's ticket, whose list
  already shows who is in it (`socialInList`).
- **The row's action is Copy**, not Follow — a strategy is something you open,
  a wallet is something you follow. Copy reuses the wallet page's path
  (`Wallet.tsx::CopyPositionButton` / `CopyOffMenuButton`, `copy=<best holder>`),
  and Follow stays on each holder row.
- Flags, crowns, the exposure/asset-class chips, chain scope and the
  people/contracts and show-hidden toggles keep their meaning: they filter the
  positions *before* they are grouped. Crowns stay on the Wallets board.

### Where it goes in the nav

Few tabs is a standing rule, so no fourth segment. **Recommended:** the `Positions` segment
becomes `Strategies` and is grouped; the flat list stays one tap away
("every position", `?flat=1`) and inside every expanded row. `Wallets` and
`Paper` are unchanged — Wallets answers *who*, Strategies answers *what*.

## Plan

### Phase 0 — app only (no index change)

Ships the grouped view on today's API, with an honest ceiling.

1. `src/model/boardGroups.ts` (pure, + `boardGroups.test.ts`):
   `primaryBookKey(row: EarnerRow)` with the rule above, and
   `groupByStrategy(rows, sort)` → `{ key, best, holders[], wallets, equityUsd,
   annualUsd, aprWeighted, levMin, levMax }[]`, ranked as above. Its key must
   equal `bookKeyOf` for the same catalogue strategy — a test pins one loop,
   one deposit, one Jupiter Lend same-uid loop, one multi-leg account.
2. Board asks `limit=200` for the grouped view (both halves), groups the
   **union before the slice** in `bothBoards`' caller, shows the top 50 groups.
3. Holder counts beyond those 200 rows from `useStrategyProofs(keys)` (exists:
   `/strategies/proof` on both indexes) — `held by N+ · $X` like the Start
   cards. Within-200 counts are the fallback.
4. `StrategyRow` in `Board.tsx`: face stack (best + 2), name from the legs
   (`<held> / <debt> loop · <market>` or `<held> · <market>`), APR / $/day
   cells, expand, Copy. Mobile: name, `N wallets · $X`, one value (`MobileV`).
5. Prefetch: the grouped default URLs are `limit=200` and **not pre-warmed** —
   add the four (`sort=apr|perDay` × default/`exposure` chips the app warms)
   to pos-indexer `EARNERS_PREWARM_URLS`, or the first open is a cold query.

Ceiling: only strategies with a position in the top 200 of an index show —
~29 on All/APR today. Enough to fix the screenshot; not the long tail.

### Phase 1 — the index groups (`pos-indexer` ticket)

`GET /earners?group=strategy` on both indexes, same envelope, rows grouped.

- **Carry job** writes `strategy_key` (the primary key, same rule) on
  `idx.position_carry`; migration adds it plus an index on
  `(strategy_key, apr_24h_pct DESC)` — partial `WHERE is_person`, like its
  siblings. Solana: computed in the 5-min snapshot.
- **Query:** the existing `where` + exclusion, then per key
  `row_number() OVER (PARTITION BY strategy_key ORDER BY <sort> DESC)` for the
  best, and `count(DISTINCT account)`, `count(*)`, Σ equity, Σ annual,
  weighted APR, min/max APR and leverage, top 3 accounts. Rank groups by the
  best (`apr`) or Σ annual (`perDay`); `limit` counts **groups**.
- **Row shape:** today's `EarnerRow` of the best position, plus
  `strategy: { key, wallets, positions, equityUsd, annualUsd, aprPct,
  aprMin, aprMax, leverageMin, leverageMax, faces: account[] }`. The envelope
  echoes `group: 'strategy'`; `hidden` is unchanged (positions hidden).
- **Holders of one strategy:** `strategyKey=<key>` on the flat board, served
  off the same index — the expand and `#/board?s=<key>` read it.
- **Pre-warm** the grouped default URLs; drop phase 0's `limit=200` ones.
- **Measure first:** the APR sort's floor (exact, ≥ $10k) keeps the window
  small; the `perDay` one ranks every earning person row (~64k). If it is over
  the board's budget, precompute the two presets' group tables in the carry
  tick instead (chain and exposure filters do not change a group's members —
  a key is one chain, and its held leg names the exposure).

App side: send `group=strategy`; an index that does not echo `group` gets the
phase-0 path, the same detection `cutAsAsked` uses for exposure.

### Phase 2 — make the strategy the thing

- Start cards' "held by N+" links to `#/board?s=<key>` (its holders, ranked).
- A strategy row shows its thread's comment count (`threadOf`) next to Copy.
- A wallet row on the Wallets board already says `best <market> <apr>`; make
  that a link to the strategy row.
- Optional: a "new" mark for strategies whose first holder ≥ $10k is < 7 days
  old — the board then also surfaces what is starting, not just what is big.

## Open decisions

1. **Replace `Positions` with `Strategies`, or add grouping as a toggle?**
   Recommended: replace; the flat list stays as "every position".
2. **APR rank on the best stake or the weighted average?** Recommended: best
   (it is a real, held figure, and matches today), weighted shown beside it.
   The average resists one 8× outlier, but punishes strategies run carefully
   by most and hard by one.
3. **$/day rank on the sum (popularity × size) or the best?** Recommended: sum.
4. **Phase 0 at all, or straight to the index?** Phase 0 is ~a day and fixes
   the first screen now; phase 1 is what makes the long tail visible.

## Decisions taken (2026-10-14)

All four as recommended: `Strategies` replaces `Positions` (the flat list is
`?by=position`, "every position"); APR ranks on the best stake, the holders'
average beside it; $/day ranks on the strategy's Σ; phase 0 ships as the
fallback for an index that does not group.

## Where it lives

- `src/model/boardGroups.ts` (+ test): `primaryStrategyKey` (a copy of
  pos-indexer `strategyBook.ts::primaryStrategyKey`), `groupByStrategy`,
  `groupRank`, `isNewStrategy`.
- `src/index/api.ts`: `strategyBoard` (`group=strategy`, falls back to the
  fold, `partial`), `strategyHolders` (`strategyKey=`, falls back to the flat
  top 200 filtered). Support is learned per index from the echo
  (`groupSupport`). URL order: by, sort, preset, people, chainIds, exposure,
  assetClasses, group, strategyKey, limit — the index pre-warms
  `…&group=strategy&limit=50` and the fold's `…&limit=200`.
- `src/ui/BoardStrategies.tsx`: the strategy row (protocol mark, name, venue,
  chain, leverage range, wallets · equity, best holder + two faces, flags,
  best APR / avg, $/day, 💬 via `threadOfBookKey`, Copy for menu strategies,
  Open → the best holder's page otherwise), the inline holders (top 10, the
  board's own filters carried in), `strategyTitle`.
- `src/ui/Board.tsx`: `by` = `strategy` (default) | `position` | `wallet`;
  `?s=<key>` = who runs one strategy; `PositionRow` shared by the flat list and
  the holders; the Wallets board's "best <market>" opens its strategy.
- `src/ui/Start.tsx`: a card's "held by N+" opens `#/board?s=<key>`.
