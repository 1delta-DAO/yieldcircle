# 0007 — Paper: start on Solana, bridge to get anywhere, count every dollar of friction

- status: **A done 2026-10-11** (Solana-only start, Solana top-ups, Solana-origin paper bridges
  quoted without a sender, the re-bank script — pos-indexer `scripts/paper-rebank.ts`); **B, C, D
  done 2026-10-12** (network fees in the gas coin, destination gas — asked only when the receiving
  wallet lacks gas, paper and real wallets alike — and friction in the sheet, wallet page, moves and
  board; pos-indexer migration 0068); E (telemetry) not started
- area: `src/model/paper.ts` (starter bank, network fees, friction; copied to pos-indexer),
  `src/ui/GetAsset.tsx` (destination gas, the gas leg), `src/ui/PaperPanel.tsx` / `PaperMoves.tsx` /
  `Board.tsx` (friction), pos-indexer `packages/social/src/paper.ts` (books, re-bank script, events)
- depends on: tickets/0006 (paper trading), pos-indexer tickets/0076 (the ledger server); **lending-sdks
  worker-api** for Solana-source destination gas (see "The API gap")

## Why

Paper trading today hands everyone 10,000 of each chain's dollar on all sixteen chains. Nobody ever
has to move money, so the part of the product real users struggle with most — getting funds to the
chain a strategy lives on, with gas to act there — is never exercised, and testers give feedback on
a smoother app than the real one.

**The goal is a realistic environment for UX feedback**: start everyone with $10k on Solana only;
every position elsewhere starts with a bridge (and often a swap); bridges are quoted **with
destination gas**, because a wallet that arrives on Base without ETH cannot do anything; and the
ledger books **every dollar lost to conversion, bridging and network fees** as friction, shown to
the user and kept for us.

## What changes for a paper user

1. **Genesis**: 10,000 USDC + a little SOL (decision 1) on Solana. Nothing anywhere else.
2. **Wanting a Base vault**: the ticket says "0 USDC on Base"; *Get USDC* offers the Solana USDC; the
   route list shows each bridge **with the ETH it will deliver for gas** and what that costs; after
   the quoted wait, USDC and ETH land on Base; the deposit then pays its network fee in ETH.
3. **No gas on the destination** (bridged without it, or spent): the action is refused — "You need
   about $0.01 of ETH on Base for network fees" — with a one-tap *Get ETH on Base*. As on chain.
4. **The sheet and the wallet page** show *Friction so far* — trades, bridges, network fees, loop
   entries and exits — beside *Earned by strategies*; every move in the history carries its cost.
5. **The board** shows friction per account; the return already nets it (it is realized loss).

## Measured on the live API (2026-10-11) — the facts this plan stands on

| question | answer |
|---|---|
| does `/v1/actions/swap/x-chain` take `destinationGas`? | **yes** (`destinationGas=<native units>` or `auto` for Solana); each route reports `destinationGas: { amount, decimals, mode, paidFrom, bridge, cost: { amount, usd } }` |
| EVM → EVM with gas (Ethereum USDC → Base, 0.0005 ETH) | 10 routes; gas leg via NEAR Intents, **$1.29** |
| EVM → Solana with gas (`auto` = 0.005 SOL) | 3 routes (NEAR Intents, Relay, Mayan drop); **$0.58** |
| Solana → EVM, quoted **for the paper Solana wallet** (empty on chain) | only LI.FI, and nothing to Base, Arbitrum or Avalanche; with destination gas, nothing at all |
| Solana → EVM, quoted for a **funded** Solana wallet | Arbitrum, Base, Avalanche: NEAR Intents, Mayan, Relay, ~$0.20–0.25 on $1,000, 1–23 s; with gas: Relay drops it (~$1.4), NEAR Intents adds a gas leg ($1.29) |
| Solana → EVM, quoted **with no sender** (quote-only) | NEAR Intents + Mayan; **with gas too** ($1.29 NEAR leg / Mayan drop) |
| CCTP, CCTP Fast, Across from Solana | **not served by the API** from a Solana origin, funded wallet or not (both protocols support Solana) |
| network fee in quotes | loop quotes carry `economics.entryCostUsd.gas` (sometimes null); spot and bridge quotes carry none |

**Why the paper wallet saw almost nothing**: Solana-origin bridges (Mayan, NEAR Intents, Relay)
build the deposit by *reading the sending wallet on chain* — its token accounts and balance — and a
route that cannot be built for that wallet is dropped. The paper wallet holds nothing on chain, so
those routes vanished. **Paper only needs the quote**, so Solana-origin paper quotes go out
**without `account`** (quote-only); everything then answers as for a real user, gas included.

## The design

### A · The starter bank (`model/paper.ts`)

`STARTER` becomes Solana only: 10,000 USDC + SOL (decision 1). The table of every chain's dollar
and gas coin (symbols, decimals, `refUsd`) stays as `KNOWN_TOKENS` — it names bank rows and values
them when the feed blinks; it no longer funds anything. Top-ups (decision 3) add Solana USDC only.

### B · Network fees, computed by the ledger (not by the caller)

Every chain action (`open`, `withdraw`, `lever`, `reduce`, `swap`, and a bridge's source leg)
debits a **network fee in the chain's gas coin**, computed inside `apply()` from one table:
`GAS_USD[chainId][kind]` (e.g. Ethereum $2–6, Solana $0.001–0.01, L2s $0.01–0.05; calibrated
from real transactions, decision 2), converted at the feed's gas-coin price. Because the model
computes it, client and server agree and no caller can skip it. Not enough gas coin → `PaperError`
("You need about $X of ETH on Base for network fees"). Arc, Stable and Tempo, whose gas is their
dollar, pay in it. Loop quotes that price gas (`entryCostUsd.gas`) keep using it — the table is the
floor, never double-charged (the ticket passes the quoted gas, `apply()` takes `max(quoted, table)`).

### C · Bridges with destination gas

- **EVM-source routes**: `GetAsset` asks every cross-chain quote with `destinationGas` sized to
  the destination's table (a few actions' worth, decision 2), shows the gas line per route
  ("+0.0005 ETH for gas · $1.29"), and the paper `bridge` op carries `gas: { units, costUnits,
  costToken }`. `apply()` debits the source token **and** the gas leg's cost (in the source gas
  coin, `paidFrom: 'gas-leg' | 'value'`, or out of the output for `'output'`), and lands token +
  gas together at `arrivesAt`.
- **Solana-source routes**: quoted **without `account`** on paper (a Solana-origin build reads the
  wallet on chain and drops routes for an empty one; a quote-only request answers NEAR Intents and
  Mayan, destination gas included). Where nothing answers for a chain at all, the drawer says so
  and offers the hop real users take: Solana → Ethereum, then onward (decision 6).
- **Value bound** as today, over everything that leaves vs everything that arrives (token + gas).

### D · Friction, booked by the ledger

`PaperLedger.friction = { tradeUsd, bridgeUsd, gasUsd, entryUsd, exitUsd }`, added by `apply()`:

| from | how |
|---|---|
| `swap` | value in − value out, at the feed |
| `bridge` | value in (+ gas leg cost) − value out (+ gas delivered) |
| network fees (B) | the fee's USD |
| loop open / lever | the quote's entry cost (already `entryCostUsd`) |
| loop reduce / close, a withdrawal fee | the quote's exit cost; `exitFeeBps` |

`bookOf()` adds `frictionUsd` (the sum); `realizedUsd` already contains it, so the return is net of
friction. Server: `paper.books.friction_usd` (+ the breakdown as jsonb), `/paper/board` and
`/paper/book/:a` carry it, each `paper.ops` row records its own friction.

### E · Telemetry for the feedback (the point of the exercise)

A paper action that **could not** happen is the most useful signal: no route, no gas, too little
liquidity, a refused build. `POST /paper/events` (signed like an op, rate-limited, no ledger change)
stores `{ kind: 'refused' | 'no-route' | 'no-gas' | 'quote-failed', chainIds, route?, message }`;
`GET /paper/stats` (team-only behind a token, decision 4) answers: friction per route and bridge
(mean, p90), time from genesis to first position per chain, refusals by reason. Small, and it turns
paper accounts into a UX study.

### F · The existing account (`firsttesterever`, and any other by then)

A one-off script in pos-indexer (`scripts/paper-rebank.mjs`), run on the server, per account in one
locked transaction: drop every bank row and in-flight transfer **not on Solana** (positions are all
on Solana today — the script refuses an account holding a non-Solana position and lists it),
recompute `putInUsd` from the genesis op's recorded prices for the Solana starter only (+ top-ups),
set `friction` to zeros, bump `seq`, and append a `paper.ops` row `kind: 'rebank'` (admin, the old
and new bank in `op`) so the history says what happened. The app adopts the server's book on its
next sync (seq is higher). Dry-run first, printing before/after per account.

For `firsttesterever` that keeps 8,990 USDC + 20 SOL on Solana and both loops, and drops ~$180k on
the other fifteen chains: put-in becomes ~$12.2k (10,000 USDC + 20 SOL at its genesis price), so the
return finally reads as a percentage of something real.

### G · Upstream (lending-sdks worker-api)

Filed with the 1delta API's tasks on 2026-10-11 (items 1–3 below). Paper does not wait on them.

1. **CCTP, CCTP Fast and Across from a Solana origin**: both protocols support Solana, the API
   serves neither from it (checked 2026-10-11 with a funded wallet) — the cheapest USDC routes
   real users would expect are missing.
2. **Quote-only Solana-origin routes for Relay** (it answers only for a funded sender), so a user
   who has not funded yet still sees every option.
3. A `gas` estimate on spot and bridge quotes (`economics.gasUsd`), so B can use quoted fees and the
   table becomes the fallback.

Paper ships without them (C's workaround, B's table); each one, when it lands, makes paper more real
without a change to the ledger.

## Plan and effort

| step | what | days |
|---|---|---|
| 1 · model | Solana-only `STARTER` + `KNOWN_TOKENS`, `GAS_USD` + fee in `apply()`, bridge `gas` leg, `friction`, Solana-only top-ups; tests | 1 |
| 2 · server | books/ops friction columns (migration 0068), `/paper/events` + `/paper/stats`, the re-bank script + dry run; tests | 1 |
| 3 · app | `destinationGas` on every paper bridge quote and the gas line per route; Solana-origin paper quotes without `account`; "no gas" refusals with *Get ETH on X*; friction in the sheet, wallet page, moves and board; events posted on refusals | 2 |
| 4 · roll out | deploy social (migration) → run the re-bank on prod (dry run, then real) → push the app; walk §"What changes" end to end on Base, Arbitrum (the gap) and HyperEVM | 0.5 |
| upstream | §G 1–3, by the API's owners | 1–2 |

About **4.5 days** here, plus the API work in parallel. Step 1 changes the shared model, so steps 1–2
deploy together and the app follows the same day (an older app would compute a different book than
the server and see its ops refused).

## Decisions

1. **Starter**: 10,000 USDC + how much SOL? Proposed **0.5 SOL** (~$55): Solana fees for months and
   a gas leg or two, not a stake that moves the return.
2. **Network fees on paper**: charge them (proposed yes — without fees, destination gas is
   decoration). The `GAS_USD` table by chain and action, calibrated from real transactions; the
   destination gas a bridge asks for = ~5 actions' worth on that chain.
3. **Top-ups**: Solana USDC only (proposed), so a top-up never skips a bridge.
4. **Telemetry**: `/paper/stats` behind a token for the team (proposed), not public.
5. **The existing account**: keep its Solana balances as they are (8,990 USDC + 20 SOL) as asked,
   or reset Solana to the new starter too (proposed: as asked — keep them).
6. **When the gap bites** (no route from Solana to a chain at all): show it plainly and suggest
   the hop via Ethereum (proposed), or hide that chain's rows on paper until a route exists.
