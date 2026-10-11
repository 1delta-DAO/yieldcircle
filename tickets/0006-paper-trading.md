# 0006 — Paper trading: a generated paper account, so the app works with an empty wallet or none

- status: **built 2026-10-11** — phases 1, 2, QA and 3a (server ledger + paper board), see
  "As built" below. Server: pos-indexer tickets/0076, not deployed yet (`pnpm run deploy social`).
  App: not committed or deployed.
- area: `src/model/paper.ts` (new), `src/state/Paper.tsx` (new), `src/wallet/paper.ts` (new
  connector), `src/ui/useBook.ts`, `src/ui/useLadder.ts` (+ `usePaperLadder`), `src/ui/Ticket.tsx`,
  `src/ui/GetAsset.tsx`, `src/ui/Positions.tsx`, `src/ui/Shell.tsx`, `src/ui/SettingsPanel.tsx`,
  `src/ui/Start.tsx`, `src/ui/Wallet.tsx`, `src/ui/Profile.tsx`, `src/ui/PnlDrawer.tsx`,
  `src/sdk/txTrace.ts`, `src/wallet/ConnectSheet.tsx`, `design/tokens.css`
- depends on: pos-indexer tickets/0076 (the `paper` schema and `/paper/*` on the social service).

## As built (2026-10-11)

Everything below the plan's line still describes the intent; where it and this section differ,
this section is what the code does.

**Files.** `model/paper.ts` (the ledger; pos-indexer keeps a verbatim copy, `pnpm paper-check`),
`model/paperView.ts` (ledger → `Holding` / `Idle`), `wallet/paperKey.ts` (name + password → an EVM
and a Solana key), `wallet/paper.ts` (the wagmi connector and the wallet-standard object: both
sign, both refuse to send), `state/Paper.tsx` (session, book cache, `act`, sync, sign-in/out),
`social/paperApi.ts` + hooks in `social/queries.ts`, `ui/useLadder.ts` (`usePaperLadder`,
`useTicketLadder`), `ui/paperPlans.ts` (each ticket's op), `ui/PaperSignIn.tsx`,
`ui/PaperPanel.tsx` (strip, sheet panel, home offer, settings, wallet-page book), plus edits to
`Ticket`, `GetAsset`, `Positions`, `Shell`, `Start`, `SettingsPanel`, `Wallet`, `Board`,
`AssetPage`, `social-bits`, `txTrace`, `TxTray`, `ChainMark`, `useBook`, `design/tokens.css`,
`styles/app.css`, `docs/apis.md`. Tests: `src/model/paper.test.ts`, `src/wallet/paperKey.test.ts`
(`pnpm test`, vitest — 26).

**Differences from the plan.**

- **The server ledger shipped with phase 1** (§G option A, §I): the app applies an op locally,
  posts it signed, and takes the server's ledger as the truth; offline, ops queue and are sent
  later. Storage is one jsonb ledger per account (`paper.accounts`) plus the op log, the books and
  a daily row — not the normalized tables of §I.
- **Ops**: `genesis`, `topup`, `swap`, `bridge`, `open` (a deposit or a loop; `into` adds to one),
  `withdraw` (deposits), `lever` (a loop up), `reduce` (a loop down; `all` closes it).
- **Valuation** (`model/paper.ts` header): a saving (`mode: 'peg'`) is priced at its open price,
  moved only by its money's price (a loop's money is its debt; an ETH deposit's is the chain's
  ether), and earns its full rate; a directional position (`'live'`) is marked to market and earns
  without its token's own yield — the API's rates include that yield (`intrinsic`), which the price
  already carries. **PnL is what the strategies earned** (realized + open positions over their
  basis), so a gas coin's price never moves the board.
- **Accrual** is at each position's stored rate, re-based at every op; the server's hourly tick
  re-rates every position from the index (`idx.market_latest`, the Solana index). Not the 30-day
  history of §A. **Every open is re-rated by the server**; a market the index lacks keeps the app's
  rate capped at 25 %; any rate is clamped to ±100 %.
  A saving's own yield (`rate.intrinsic`, recorded at every open) comes from the index, else from
  the 1delta API, else the recorded figure capped at 25 % — the Solana index has none (first live
  bug: an apyUSD/USDC loop on Kamino read −7 % at 0 % supply).
- **No value is created by any op** (±1 % for two feeds; the plan said 0.5 %), and a trade with an
  unpriced side is refused (review finding: unpriced tokens could otherwise be minted).
- **The paper clock is a preview**: +7 / +30 / +90 days in the sheet; trading waits until it is
  back at today, and the board always values at real time.
- **Prices** for the bank come from the paper service's shared cache (`GET /paper/prices`), one
  request per page, not the 1delta API per chain (its per-IP budget is 100 requests per window).
- **Solana** (§J): the second key is connected into the Solana slot and linked to the EVM primary
  at creation (both halves signed in the browser); Solana rows are quoted for it. Ops are signed by
  the EVM key only.
- **Bridging** (§K): as planned — the real route list and ETA; the tray shows "Bridging on paper"
  until the quoted time is up.

- **Paper may do only what the real path would** (2026-10-11): a loop opens only on a quote with a
  route, within the market's free liquidity and the book's depth; deposits and loop opens run their
  own build unsigned first (deposits on EVM only — Solana's builders simulate against an empty
  wallet); lever-up and deleverage need real quotes; an instant withdrawal is capped by what can leave,
  and a queued exit lands after the venue's wait (a week where none is published). Exits are never
  dry-run, so a paper account is never locked in. The server re-checks liquidity on lending markets
  and keeps a loop's at-size borrow premium over spot (pos-indexer `docs/paper.md`).

**Not done.** A forced close below health 1 (decision 4: a warning only); seasons; the Talk-tab
filter for paper authors; `pnpm shots` paper screens. A closed loop's ticket falls back to the
open view at once (the tray says "Done on paper").

**To ship.** 1 · `cd ../pos-indexer && pnpm run deploy social` — applies `0067_paper.sql` at start
and **also ships `08fea7c` (strategy threads, tickets/0005), which the live service predates**.
2 · Commit and push this repo (Pages builds `main`). The app degrades gracefully before step 1:
the paper account works from its local cache and queues its ops.

## The feedback

A review with a throwaway wallet ended at the ticket: a wallet with nothing in it
can browse everything but cannot *do* anything, and "connect to see your balance"
followed by "0 USDC · more than idle" is where the walkthrough stops. The app must
be usable with a throwaway wallet at least — connect, pick a strategy, put money
in, watch it earn, take it out.

## Why paper trading, and not something else

| option | why not |
|---|---|
| Read-only showcase (`?as=0x…`, exists) | shows a book, never a ticket; the reviewer wants to act |
| Faucet of real dust | real gas on fifteen chains, custody of a faucet key, and $0.50 positions still read as nothing |
| Testnets / forks / Tenderly | the 1delta API builds against mainnet state and the index reads mainnet; nothing we read would see a fork |
| **Paper trading in the app** | every read stays real (catalogue, rates, quotes, risk, feed, board); only the signature and the book are replaced. No infrastructure. |

## The contract — what "paper" means

**A paper account is a generated wallet with a play bank.** The app generates a
key (an EVM account, viem `generatePrivateKey` → `privateKeyToAccount`), keeps it
in the browser, and connects it like any other wallet through a tiny wagmi
connector. That address is "you": the profile, the follows, the threads, the
alerts — everything the social layer signs — are real and signed by that key. What
is paper is its money: a ledger keyed by the paper address holds token balances and
positions, the ticket's confirm writes to that ledger instead of sending a
transaction, and positions accrue from the real rate history instead of from the
chain.

So a reviewer needs **no wallet at all**, and the account is **portable**: the key
(and, until phase 3, the ledger) exports as one string / QR and imports on another
device, where it is the same identity with the same book.

**Everything real except the signature and the book.** The real menu, the real
rates and 30-day history, the real quote (entry cost, routes, simulated health),
the real risks, the real feed and board, the real threads.

Hard lines, so paper never passes for real:

- A paper position is never sent to the index (`syncHints`), never on the board,
  never in the feed, never to `/v1/actions/*`. Nothing is built, nothing is sent.
- The paper account is its own address, never a real wallet in a "mode": the real
  book and the paper book cannot be on screen at once. Switching is a connect
  (`ConnectSheet`: *Paper account* beside the wallets).
- Paper money has its own colour (amber), its own word on every confirm ("Confirm
  paper deposit"), a tag on the balance chip, and the account's **profile carries a
  `paper` tag** (a signed profile edit, visible to everyone through `Who`).
- The key is a burner: the app says so, never asks to fund it, and refuses
  `eth_sendTransaction` (the connector throws). Social writes are the only thing it
  signs.

## Design

### A · The ledger — `src/model/paper.ts` (pure, no React, no fetch)

```ts
interface PaperLedger {
  v: 1
  account: string            // the paper address
  createdAt: number
  /** play money, as TOKENS per chain: `bank[chainId][tokenAddress] = units` (native at ZERO) */
  bank: Record<string, Record<string, number>>
  /** what was put in, in dollars at the time: the starting allotment valued at creation + every top-up — so the return is honest */
  putInUsd: number
  /** the paper clock's offset ("skip ahead 30 days") */
  skewMs: number
  positions: PaperPosition[]
  /** bridges on their way: debited at send, credited to `bank[toChainId]` once `now() >= arrivesAt` (§K) */
  inflight: { id: string; toChainId: string; to: string; unitsOut: number; bridge: string; sentAt: number; arrivesAt: number }[]
  log: PaperOp[]
}
/** what the route said, kept with the op: who, how long, what it cost — the trace and the PnL say it back */
type QuoteStamp = { bridge?: string; aggregator?: string; estimatedDuration?: number; feesUsd?: number }
```

**The starting bank** (decisions 1, 8, 9): real tokens on **every chain the app
offers**, mirroring `CHAINS` — the same fifteen EVM chains and Solana the
catalogue, the chain picker and the balance reads already span. On each:
`10,000` of the chain's dollar (USDC; USDT0 on Stable, pUSD on Plume — the
table `model/positions.ts` `NATIVE` already keeps for the gas coin, extended
with the dollar) plus a gas-coin allotment: `1 ETH` on the ether chains,
`3 BNB`, `100 AVAX`, `20 HYPE`, `500 POL`, `20 SOL`, … (a `STARTER` table beside
`NATIVE`, maintained the same way — a chain added to `CHAINS` gets a bank the
same day; the figures are a copy decision, roughly $2–3k of gas coin). "Add
cash" tops up the dollar on the chain the ticket is on and is counted in
`putInUsd`.

**Other tokens and other chains come from the real quote** (§K): the ticket's
"Get wstETH" line (`GetAsset.tsx`) quotes the same spot or cross-chain route a
real wallet would and the paper account takes the quote's output, fees and
bridge time included. Same component, one branch at the send.

```ts
interface PaperPosition {
  id: string                 // `Holding.key` = `paper:<id>`
  openedAt: number
  chainId: string
  kind: 'simple' | 'loop'
  strategyId: string
  /** what is needed to price and name it when the row is off the menu */
  snap: { asset: string; group: GroupId; label: string; venue: string; logo?: string; earnUid?: string; marketUid?: string
          symbol: string; decimals: number; assetAddress: string; priceUsd: number
          debt?: { symbol: string; decimals: number; address: string; priceUsd: number; marketUid: string }
          liqLtv?: number; nature: Nature }
  /** units of the held token at the open (a vault's assets, a deposit, a loop's collateral) — accrual is computed, never stored */
  units: number
  debtUnits?: number
  leverage?: number
  /** the quote's entry cost, taken off at the open (a fresh loop starts slightly negative, as a real one does) */
  entryCostUsd: number
  /** the rates seen at the open — the fallback when the history has no point */
  aprAtOpen: { deposit: number; borrow?: number }
}
type PaperOp =
  | { t: 'topup'; chainId: string; token: string; units: number; usd: number }
  | { t: 'swap'; chainId: string; from: string; to: string; unitsIn: number; unitsOut: number; route: QuoteStamp }
  | { t: 'bridge'; fromChainId: string; toChainId: string; from: string; to: string; unitsIn: number; unitsOut: number; route: QuoteStamp; arrivesAt: number }
  | { t: 'deposit'; pos: Omit<PaperPosition, 'id' | 'openedAt'>; paid: { token: string; units: number } }
  | { t: 'add'; id: string; units: number; paid: { token: string; units: number } }
  | { t: 'withdraw'; id: string; units: number | 'all'; received: { token: string; units: number } }
  | { t: 'open'; pos: …; paid: { token: string; units: number } }
  | { t: 'lever'; id: string; leverage: number; costUsd: number }
  | { t: 'close'; id: string; fraction: number | 'all'; exitCostUsd: number; received: { token: string; units: number } }
```

Functions, all pure:

- `apply(ledger, op): PaperLedger` — every ticket action is one op; the log is the
  position's history (what the PnL drawer draws). Tokens leave and enter `bank`
  exactly as a real wallet's would (a close pays the collateral token back, a
  withdrawal pays the held token or the native coin).
- `accrue(pos, history, rateNow, now)` → `{ units, debtUnits }`: units grow day by
  day at the leg's rate — the 30-day history from `sdk/rateHistoryStore.ts` (one
  time-weighted mean per UTC day, base + rewards) where it has a point, the row's
  current rate after the last point, `aprAtOpen` before the first. A loop accrues
  its two legs separately, so equity, leverage and health are *derived*, exactly as
  `holdingsFrom` derives them from the chain's legs.
- `value(pos, prices)` — `units × price − debtUnits × debtPrice`, prices from the
  catalogue row when on the menu, else the snapshot. A non-pegged loop is marked to
  market at today's price: the price bet is simulated for real.
- `health(pos, prices)` — `(coll × pC × liqLtv) / (debt × pD)`. Below 1 the row
  says **would have been liquidated** (decision 4: a warning, never a forced close).
- `toHoldings(ledger, rows, prices, history, now): Holding[]` and
  `toIdle(ledger, chainId, prices): Idle[]` — the ledger in the app's own shapes, so
  everything downstream of `useBook` is unchanged. One new optional field on
  `Holding`: `paper?: true` (`key` prefixed `paper:`, no `subAccount`, no `accountId`).

Why `Holding`, not the wire shape: `holdingsFrom` is the one translator from
`EarnPosition`, a shape full of legs, sub-accounts and venue naming the ledger does
not have. Emitting `Holding` is a tenth of the code and cannot drift from the wire.

### B · The account — `src/wallet/paper.ts` + `src/state/Paper.tsx`

- **Key.** `localStorage['yieldcircle.paper.key']` holds the private key (hex). One
  per browser by default; "New paper account" makes another and archives the old
  (`yieldcircle.paper.accounts`: address → key + ledger).
- **Connector.** `paperConnector()` in `wallet/paper.ts` via wagmi `createConnector`:
  `connect` returns the paper address, `getProvider` is an EIP-1193 shim that answers
  `eth_accounts` / `eth_chainId`, signs `eth_signTypedData_v4` and `personal_sign`
  with `privateKeyToAccount`, and **throws on `eth_sendTransaction`**. Listed in
  `wagmi.ts` beside `injected` / `walletConnect`; `ConnectSheet` shows it as
  *Paper account — try it with play money, no wallet needed*. Everything that reads
  `useAccount` (AppState's `account` / `signer`, the social signer, the chip, the
  bell, the wallet page's `isMe`) works untouched.
- `usePaper()` → `{ isPaper(account), ledger, apply, now, exportPassport,
  importPassport, newAccount }`. The ledger is `localStorage['yieldcircle.paper.<address>']`.
- **Offered, not forced** (decision 2). Not connected: the home's connect card
  gets a second button, *Try with paper money*, which generates the key and
  connects. Connected with an empty live book (idle + positions under $5 once the
  reads have answered): a card offers the paper account instead of a dead end. The
  settings panel carries the switch and the account tools (export, import, new,
  reset bank).
- **Profile tag.** On creation the app signs and posts a profile for the paper
  address with `tags: ['paper']` (`social/pending.ts` queues profile edits; this one
  goes out with the first batch). `Who` renders a small amber *paper* pill on the
  tag; the wallet page says *A paper account — play money on real rates*. So every
  comment, follow or rating by a paper account is readable as such by everyone.
- **Name + password** (decisions 6 and 7 — portability and control). The key is
  not random: it is *derived* from a username and a password (§H), so the same
  name and password on any device is the same address, the same profile and —
  with phase 3a — the same book. No passport to carry, no key to look at. A
  one-line "Export book" (JSON) stays in settings as the fallback until 3a.
- `now()` is `Date.now() + skewMs`: the **paper clock** (decision 3), moved by
  "Skip ahead 30 days" in the positions sheet; reset in the same place.

### C · Where it plugs in

| seam | change |
|---|---|
| `ui/useBook.ts` | when `isPaper(account)`: `idle = toIdle(...)` per selected chain, `holdings = toHoldings(...)`; the live balance and positions hooks get no account (disabled), so `syncHints` never runs; `positionsLoading` is false. Every consumer (`Positions`, `Start`, `AssetPage`, `Ticket`, the chip) is unchanged. |
| `ui/useLadder.ts` | a sibling `usePaperLadder(key, chainId, paper)` returning the same `Ladder` shape; each ticket body picks with `useAnyLadder(...)`. `start()` makes one step `{ kind: 'route', label }`; `sendNext()` awaits `paper.apply()` (the ticket may await its real quote for the cost), applies the op, records a settled trace, marks the step done. `wrongChain` always false (no chain to switch to), `remote` false. The real ladder is not touched. |
| `sdk/txTrace.ts` | `tracePaper({ account, chainId, title, label })`: a trace already at `settled` with `hash: 'paper:<opId>'`, so `TxTray`, `TxInFlight`, the ticket's "Done" and Alerts behave as for a real one. `TxLink` renders nothing for a `paper:` hash. |
| `ui/Ticket.tsx` — `SimpleTicket` | op `deposit` / `add`: units = amount in the held token (a `$` row is 1:1), paid from `bank` in the chosen pay token. Button: **Confirm paper deposit**. |
| — `LoopTicket` | op `open` / `lever`: collateral units `E·L / priceLong`, debt units `E·(L−1) / priceShort`, `entryCostUsd` from the real quote's `economics.entryCostUsd.total`, `liqLtv` from the row. "No route at this size" from the quote still blocks, as for real. |
| — `WithdrawTicket` / `CloseTicket` | ops `withdraw` / `close` with the real `useCloseQuote` exit cost; reduce = fraction; the native option pays the gas coin into `bank`. |
| — `HoldingTicket` | a paper holding whose row is off the menu is managed from the snapshot, like a real off-menu one. |
| — `SayWhy` | not offered on a paper confirm (decision 5). The thread stays readable and writable from the row's 💬. |
| `ui/GetAsset.tsx` | unchanged up to the button: the same sources, the same real quotes, the same route list with bridge, aggregator, ETA and value check. The send becomes a `swap` / `bridge` op at the quote (§K); "Add cash" beside it. |
| `ui/Positions.tsx` | header *Paper money* + amber pill, the bank per chain, "earned so far", return since start, the paper clock, Reset bank / New account / Export. Each row carries the pill; health < 1 says *would have been liquidated*. |
| `ui/Shell.tsx` | `.moneychip.paper` with a **PAPER** tag; a one-line strip the first time in a session (*Paper account — play money on real rates, nothing goes on chain*). |
| `ui/SettingsPanel.tsx` | a "Paper account" block: export / import passport, new account, reset bank. Outside `FILTER_KEYS`. |
| `ui/Start.tsx` | the two offers (B); the "best passive" line reads paper idle like real idle. |
| `ui/Wallet.tsx` (me) | a paper account's page: the positions block is the ledger (not the index, which has never seen the address) and says so. |
| `ui/Profile.tsx` / `social-bits.tsx` | the `paper` tag's pill; the profile editor shows it as fixed. |
| `ui/PnlDrawer.tsx` | a `paper:` key builds its `PositionSeries` locally from `accrue` per day and the op log and feeds the same drawer. |
| `wallet/wagmi.ts`, `wallet/ConnectSheet.tsx` | the connector and its entry. |
| `design/tokens.css` | `--paper` (amber) + `--paper-ink`; `app.css`: `.pill.paper`, `.moneychip.paper`, the strip. |
| `docs/apis.md` | one rule: a paper account never calls an action builder, is never read live, is never sent to the index; quotes and every other read stay real. |

### D · Quotes without funds

The ticket already quotes before any balance check: `useLoopQuote` passes the
account only because a few lenders want one, and `useCloseQuote` takes none. A
paper address gets the same quote a funded wallet would. Two edges:

- A Solana row is quoted for the paper account's **Solana key** (§J), so the
  venues that only quote with an account (Kamino's obligation, Loopscale's
  tenors) answer as they would for a real wallet.
- Entry cost on Solana is `null` in the API's economics (worker-api `svmEconomics`);
  paper takes 0 and says so.

### E · The beta gate

A paper address is not whitelisted. The reviewer path is the access code that
already exists (`/?access=<GATE_PASS>`, `docs/deploy.md`), or `GATE_OFF`. The paper
account does not open the gate and should not.

### F · What a reviewer does (acceptance)

1. Access code, no wallet. Home: *Try with paper money* → name + password →
   the paper account is created and connected; the chip reads the bank's value
   with a **PAPER** tag; the profile shows the handle and the paper pill.
2. Earn → a Morpho vault on Base → deposit 1,000 USDC → **Confirm paper deposit**
   → Done, no wallet prompt. Chip and positions sheet show it, amber.
3. A 3× wstETH/ETH loop on Arbitrum from a feed card ("copy"): *Get wstETH*
   quotes the real spot route from the bank's Arbitrum USDC, the swap's fee in
   the value check; then the loop's real quote, confirm; equity shows minus the
   entry cost.
3a. A $15,000 deposit on Base, more than Base's bank: *Get USDC on Base* offers
   the other chains' USDC, the real bridge quote from Ethereum — Across in
   ~3 min, its fee in the value check — and the tray shows *Bridging…* until the
   paper arrival lands it; then the deposit.
3b. A Kamino JitoSOL/SOL loop on Solana from the bank's SOL: quoted for the
   paper Solana address, confirmed, in the book beside the EVM ones; the Solana
   wallet page says it is the same person as the EVM one.
4. Skip ahead 30 days: both positions show what they earned at the real rates of
   the last 30 days; the PnL drawer draws it.
5. Reduce the loop, close it, withdraw the vault. Tokens are back in the bank, the
   return since start is shown.
6. Sign out, open a private window, sign in with the name and password: same
   address, same handle and profile (same book once phase 3a exists).
7. Nothing of it on the board, the feed, or the index. A comment on the vault's
   thread is real and shows the paper pill. Connect a real wallet: the paper book
   is gone from view; reconnect the paper account: intact.

### G · A paper leaderboard (sized 2026-10-11)

A board is cross-user by definition, so it needs the server ledger (phase 3a):
the client-only book of phases 1–2 cannot be ranked. Three ways to build it,
cheapest last:

| | where | what | days | verdict |
|---|---|---|---|---|
| **A** | **pos-indexer** (recommended) | a `paper` package kept apart from the index tables: `paper_ops` (signed ops) + `paper_books`; `POST /paper/ops` verifies the EIP-712 signature (the social package's verifier) and applies the op with a copy of `model/paper.ts` `apply()` (the repo already keeps a checked copy of pos-indexer's `search.ts` — same pattern, `pnpm paper-check`), stamping the price from its own feed; `GET /paper/book/:a`; an hourly tick values every book from the prices and rates the index already holds (`accrue` + `value`, same copy); `GET /paper/board?sort=return\|apr` cached and pre-warmed like `/leaderboard`. | **≈ 4 server + 2 app = 6** | honest (server-valued, server-validated), fresh hourly, and the board gets profiles, pills and windows for free. The index never joins paper into real tables; "paper never reaches the index" becomes "never reaches the index's *positions*". |
| B | this repo only: `functions/paper/*` + KV, and a cron Worker in `worker/` | the same ops endpoint on a Pages Function over KV; the Worker values the books hourly, reading rates (`/v1/data/earn/rate-history`, one POST) and prices (`/v1/data/earn`) from the 1delta API on its own credits, and writes one `board` blob; the app reads it. | ≈ 5.5 | honest too; keeps pos-indexer untouched at the price of a second price/rate reader and KV `list` scans (fine to a few thousand accounts, then D1). |
| C | this repo, snapshots only | the client posts a signed `{ navUsd, putInUsd, returnPct, since }` with every write and on load; the board sorts the snapshots. | ≈ 2 | self-reported numbers: fakeable with one request and stale for anyone away. Fine for a closed beta demo, not for a public board. |

What the board shows, whichever way:

- **Rank by return since start** `(nav − putIn) / putIn`, and by **net APR**
  (NAV-weighted, as the real wallet board). Not by NAV or $/day: everyone starts
  with the same bank and top-ups are free, so size means nothing. Top-ups are
  capped (say five) so a book cannot be bloated for a bigger carry.
- **The server's clock, never the paper clock.** "Skip ahead 30 days" is a local
  view; the board values at real time. Said in the sheet next to the clock.
- A book appears after one day of age with at least half the bank deployed;
  until then the row is "warming up".
- **Seasons** (optional, +0.5 day): a monthly start-of-season snapshot per book,
  and the board's default window is the season — a reset without a wipe.
- **In the app:** `Board.tsx` gets a third segment *Paper* (`?by=paper`), rows in
  the `WalletEarnerRow` shape plus `returnPct` / `since`, the amber pill on `Who`,
  no crowns, an empty state ("no paper books yet — be the first"). ≈ 1 of the 2
  app days; the other is the client sending its ops to the server and taking the
  server's book as the truth on load (the local ledger becomes a cache), which
  also turns the passport into the key alone.
- **Abuse:** ops are signed and validated server-side (a bank cannot go
  negative, prices are the server's), one rate limit per author. Sybil accounts
  are free but each starts from the same bank, so they can only crowd the list,
  not beat it; a *claimed by a wallet* filter is a later option.

So: **about 6 engineer-days on top of phases 1–2** (option A), of which ~3 are the
server ledger that portability wants anyway; the board proper is ~3.

### H · A paper account system: username + password, key derived (sized 2026-10-11)

The ask: users create and control their paper account with a name and a password,
and the account is derived from them. Security reasonable, not tight — it is play
money. The cheapest honest form of that is **deterministic derivation, no server
of its own**: the key *is* the name and password, computed in the browser.

**Derivation** (`src/wallet/paperKey.ts`, pure):

```
seed   = scrypt(password, salt = 'yieldcircle-paper:' + lower(name), N = 2^16, r = 8, p = 1, 64 bytes)
evmKey = hkdf(seed, 'evm', index)   → viem privateKeyToAccount
solKey = hkdf(seed, 'sol', index)   → ed25519 (phase 3b: the paper Solana key for free)
```

`@noble/hashes` (already in the tree under viem; added as an explicit
dependency) gives scrypt and hkdf; the cost is ~0.3–1 s on a phone, on purpose.
`index` (default 0) allows "another account under the same name" later.

**Names are unique through the social service, with no new registry.** The name
is the account's social **handle**: on create the app asks `GET /handle/:h?account=`
(the editor's existing "handle taken" check), and the profile is written with
`handle: name, tags: ['paper']`. A name already registered to a *different*
address means either someone else has it or the password was mistyped — both say
"this name is taken; sign in with its password or pick another". So a wrong
password on an existing name is caught instead of silently making an empty
second account.

**Sign in and create are one form** (the *Paper account* entry in `ConnectSheet`):
name, password, one button. The app derives the address, looks up its profile
(`profiles([addr])`): found → signed in; not found and the handle free → "No
paper account for this name and password yet — create it?" with the one warning
that matters: *there is no reset; a new password is a new account; never send
real money here.* The derived key then lives in localStorage ("stay signed in",
default on); **Sign out** wipes it; the password is never stored anywhere.

**What it gives:** the user owns the account (nothing server-side to lose or
leak — the services only ever see signed messages from the address), it works
on any device, it needs no email, and the board, the profile and the threads
all name the account by the handle the user chose.

**What it does not give, said up front:** no password reset and no password
change (a different password derives a different address — phase 3a could add
"move my book to a new password", signed by the old key, ~0.5 day). A weak
password lets someone else post as that paper name; scrypt, the name as salt and
an 8-character minimum keep that to a nuisance, which is proportionate to what
is at stake: a paper book and a paper identity. The connector still refuses to
send transactions.

**Not recommended:** a conventional server-side account (password hash in a
table, the key encrypted server-side, sessions, reset emails). ~4–5 days plus
the first secrets this app would hold, to buy a password reset for play money.

**Effort:** derivation + tests 0.5, the sign-in/create form with the handle
check and profile lookup 1, session / sign-out / copy 0.5 → **≈ 2 days**, in
phase 1, replacing the passport (−0.5). Phase 1 becomes ~5.5 days; phases 1 + 2
+ QA ≈ 10.5. The book itself still travels only with the server ledger (3a),
which this makes more worth doing: name + password on a new phone is then the
whole account.

### I · The database (sized 2026-10-11)

**Where: pos-indexer's Postgres, a third schema `paper`, served by the social
service.** No new database, box, or base URL. What is already there
(`pos-indexer/DATABASE.md`): Postgres 16 in Docker on a Hetzner CX33, schemas
`idx` (chain-derived) and `social` (the app), hand-written SQL migrations in
`packages/position-store/migrations/NNNN_name.sql` applied at container start
under an advisory lock, nightly `pg_dump --schema=social`, and the social service
(Fastify, box 2, `DATABASE_URL`, `:8091`) that already verifies every signed write
(`envelope.ts::verifyEnvelope`, EIP-712 for `0x` authors, ed25519 for base58),
owns `social.profiles` (the handle registry §H relies on), and runs an in-process
job loop (`setInterval(tick, …).unref()`, the rating-flags materializer). The
rates and prices a valuation needs are one table each: `idx.market_latest`
(`supply_rate`, `borrow_rate`, `intrinsic_yield`, per market uid, hourly) and
`idx.price_cache` (one row per hour per token). So the paper routes are
`/paper/*` on the social service, and the app reaches them through
`VITE_SOCIAL_BASE_URL` it already has.

**The rule stays:** `paper.*` is never joined into `idx.positions`, the ledger,
the carry tables or the crowns. It *reads* `idx.market_latest` and
`idx.price_cache`, as `social` reads `idx.*` for the stake badge.

**Migration `0067_paper.sql`** (position-store, applied like every other):

```sql
CREATE SCHEMA IF NOT EXISTS paper;

-- one row per paper account (the derived address), made by its first op
CREATE TABLE IF NOT EXISTS paper.accounts (
  account        bytea PRIMARY KEY,            -- 20 bytes EVM (32 for a Solana key later), as social.*
  created_at     timestamptz NOT NULL DEFAULT now(),
  put_in_usd     double precision NOT NULL DEFAULT 0,   -- starting bank valued at creation + every top-up
  topups         int NOT NULL DEFAULT 0,                -- capped (§G)
  last_op_at     timestamptz
);

-- the signed op log: the truth; the tables below are derived from it and can be rebuilt
CREATE TABLE IF NOT EXISTS paper.ops (
  id          bigserial PRIMARY KEY,
  account     bytea NOT NULL REFERENCES paper.accounts,
  nonce       text  NOT NULL,
  kind        text  NOT NULL,                   -- topup | swap | deposit | add | withdraw | open | lever | close
  op          jsonb NOT NULL,                   -- the PaperOp as posted (units, strategy snapshot)
  prices      jsonb NOT NULL,                   -- the SERVER's prices at apply time: what the op was valued at
  sig         bytea NOT NULL,
  typed_data  jsonb NOT NULL,                   -- the envelope, re-verifiable (as social.messages)
  signed_at   timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account, nonce)                       -- replay: the same op posted twice applies once (as social.batches)
);
CREATE INDEX IF NOT EXISTS paper_ops_account ON paper.ops (account, id);

-- the current book, written by apply() in the same transaction as the op
CREATE TABLE IF NOT EXISTS paper.bank (
  account   bytea   NOT NULL REFERENCES paper.accounts,
  chain_id  text    NOT NULL,
  token     bytea   NOT NULL,                   -- the zero address = the native coin
  units     numeric NOT NULL CHECK (units >= 0),
  PRIMARY KEY (account, chain_id, token)
);
CREATE TABLE IF NOT EXISTS paper.positions (
  id             text PRIMARY KEY,              -- the client's id (`Holding.key` = paper:<id>)
  account        bytea NOT NULL REFERENCES paper.accounts,
  chain_id       text  NOT NULL,
  kind           text  NOT NULL,                -- simple | loop
  strategy_id    text  NOT NULL,
  market_uid     text,                          -- the earn / collateral market: joins idx.market_latest for its rate
  debt_uid       text,
  snap           jsonb NOT NULL,                -- symbol, decimals, addresses, liqLtv, nature, entry prices
  units          numeric NOT NULL,              -- the held token, RE-BASED at every op and every tick
  debt_units     numeric,
  units_as_of    timestamptz NOT NULL,          -- accrual base: the tick grows units from here at the market's rate
  leverage       double precision,
  entry_cost_usd double precision NOT NULL DEFAULT 0,
  opened_at      timestamptz NOT NULL,
  closed_at      timestamptz,
  health         double precision,              -- the tick's; < 1 = "would have been liquidated" (never closed, decision 4)
  liquidated_at  timestamptz                    -- first tick that saw health < 1
);
CREATE INDEX IF NOT EXISTS paper_positions_open   ON paper.positions (account) WHERE closed_at IS NULL;
CREATE INDEX IF NOT EXISTS paper_positions_market ON paper.positions (market_uid) WHERE closed_at IS NULL;

-- the hourly valuation: one row per account, diff-written like idx.wallet_carry; what the board reads
CREATE TABLE IF NOT EXISTS paper.books (
  account      bytea PRIMARY KEY REFERENCES paper.accounts,
  nav_usd      double precision NOT NULL,
  bank_usd     double precision NOT NULL,
  deployed_usd double precision NOT NULL,
  put_in_usd   double precision NOT NULL,
  return_pct   double precision NOT NULL,       -- (nav − put_in) / put_in: the board's first sort
  net_apr_pct  double precision,                -- NAV-weighted, as the real wallet board
  annual_usd   double precision,
  n_positions  int NOT NULL,
  chains       text[] NOT NULL,
  worst_health double precision,
  since        timestamptz NOT NULL,
  computed_at  timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS paper_books_return ON paper.books (return_pct DESC);
CREATE INDEX IF NOT EXISTS paper_books_apr    ON paper.books (net_apr_pct DESC NULLS LAST);

-- a bridge on its way (§K): debited from the bank at send, landed by the tick or the book read once past arrives_at
CREATE TABLE IF NOT EXISTS paper.transfers (
  id            text PRIMARY KEY,
  account       bytea NOT NULL REFERENCES paper.accounts,
  from_chain_id text NOT NULL,
  to_chain_id   text NOT NULL,
  token_in      bytea NOT NULL,
  token_out     bytea NOT NULL,
  units_in      numeric NOT NULL,
  units_out     numeric NOT NULL,              -- the quote's amountOut, bounded by the server's prices
  bridge        text,
  sent_at       timestamptz NOT NULL,
  arrives_at    timestamptz NOT NULL,          -- sent_at + the route's estimatedDuration
  landed_at     timestamptz
);
CREATE INDEX IF NOT EXISTS paper_transfers_due ON paper.transfers (arrives_at) WHERE landed_at IS NULL;

-- one point per account per day: the PnL drawer's line and the season window (§G)
CREATE TABLE IF NOT EXISTS paper.book_daily (
  account    bytea NOT NULL REFERENCES paper.accounts,
  day        date  NOT NULL,
  nav_usd    double precision NOT NULL,
  put_in_usd double precision NOT NULL,
  PRIMARY KEY (account, day)
);
```

Size is nothing: a few hundred bytes per op, one row per account per day. Ten
thousand accounts for a year is under 1 GB on a disk sized for the ledger.

**Writes — `POST /paper/ops`.** The body is a social envelope with a new primary
type in `typedData.ts`: `PaperOp { author address, kind string, body string,
nonce string, signedAt uint256 }`, where `body` is the op's canonical JSON — the
same shape the client signs for a `Message`, so `src/social/sign.ts` signs it
with one more case and `verifyEnvelope` verifies it unchanged (and a Solana paper
key would work the day it exists). One transaction, `synchronous_commit = on`
(the DATABASE.md rule for what is not re-derivable): insert the op (a replayed
nonce answers the existing result, applies nothing), run `apply()` against
`paper.bank` / `paper.positions` with the **server's** prices from
`idx.price_cache` (the client's prices in the op are a hint; the response carries
the book as applied and the client re-renders from it), create the account row
on its first op, refuse a sixth top-up or a bank going negative with a readable
`400`. `apply()` is a checked copy of this repo's `model/paper.ts` — the pattern
of `search/rank.ts` ↔ pos-indexer `search.ts` (`pnpm search-rank`), with a
`pnpm paper-check` beside it. A rate limit per author (ops per minute) in the
route, as the social writes have.

**Reads.** `GET /paper/book/:account` → bank, open positions (with the tick's
health) and the `paper.books` row; the client takes this as the truth on sign-in
and accrues locally between ticks. `GET /paper/board?sort=return|apr&limit=50`
→ `paper.books` joined with `social.profiles` (handle, tags, display name) in
the board's wallet-row shape; `Cache-Control: max-age=60`, pre-warmed each tick
like `/earners`. `GET /paper/book/:account/daily` → `book_daily` for the drawer.

**The tick** (in the social service, hourly, `.unref()` like rating-flags): for
every open position, grow `units` from `units_as_of` at the market's
`supply_rate` (+ `intrinsic_yield`) and `debt_units` at `borrow_rate` from
`idx.market_latest`, value both legs at `idx.price_cache`, write health, roll up
per account, diff-write `paper.books`, upsert today's `book_daily`. Hundreds of
accounts × a few positions is milliseconds; a market with no rate row keeps
`aprAtOpen` from the snapshot. The tick's age goes on social's `/health`.

**Operations, one line each:** migration `0067_paper.sql`; the nightly dump
becomes `pg_dump --schema=social --schema=paper` (small and irreplaceable, like
social); `DATABASE.md` §5 gets a `paper` line; the client in `src/social/api.ts`
gains `paperOps` / `paperBook` / `paperBoard`; a pos-indexer ticket (next
number, 0076) carries the server side. Local: `docker compose up -d db`
(`localhost:5433`), `pnpm --filter position-store migrate`, `pnpm --filter
social dev` on `:8091`, the app with `VITE_SOCIAL_BASE_URL=http://localhost:8091`
— the same setup `docs/apis.md` "Testing against the APIs" already describes.

**If pos-indexer must stay untouched** (§G option B): the same five tables on
Cloudflare **D1** (SQLite: `bytea` → `blob`, `numeric` → `text`, no schemas —
prefix the names), `functions/paper/[[route]].ts` on the app's Pages project
for the writes and reads, and a cron Worker in `worker/` for the tick, reading
rates and prices from the 1delta API (`/v1/data/earn` + `rate-history`) on its
own credits. Same effort, two more things to operate, and a second copy of the
rate and price plumbing the index already has — which is why option A is
recommended.

**Effort inside §G's 4 server days:** migration + store functions ~1, the ops
route with `apply()` and the typed-data case ~1, the tick ~1, the reads + cache +
tests ~1.

### J · Both VMs: one paper account, an EVM key and a Solana key (2026-10-11)

The app's model is already *one account per VM* (docs/solana.md §5; `useBook`
reads `{ evm, sol }`, a ticket's `actor` is its chain's signer, `GetAsset`
signs each leg with its VM's wallet), and *one person, several addresses* is
the wallet-links mechanic (docs/wallet-links.md: a primary profile, members
linked by a proof signed with both keys). A paper account fits both without a
new concept:

- **Two keys from one seed** (§H): `evmKey = hkdf(seed, 'evm')` and
  `solKey = hkdf(seed, 'sol')` → ed25519 (`@noble/curves/ed25519`, in the
  tree). Same name and password, both addresses, on any device.
- **The EVM address is the primary**; the Solana address is **linked as a
  member at creation**, automatically — the mutual proof is signed by both keys
  in one go, nothing to click. The profile, the handle, the follows and the
  ledger live on the primary; the Solana address wears the same handle in the
  feed and on its wallet page, as a linked real wallet does.
- **Plumbing.** `wallet/paper.ts` provides the wagmi connector (EVM) *and* a
  paper `StdWallet` for `wallet/solana.ts` — `standard:connect` and
  `solana:signMessage` implemented over the key, `solana:signAndSendTransaction`
  throwing — registered into the same state `useSolWallet` serves. So
  `solSigner`, `solAddress()`, `solSignMessage` and every Solana surface see a
  connected Solana wallet; nothing downstream knows it is paper. Signing in
  connects both; signing out drops both.
- **Bank and ledger.** `bank['solana']` keyed by mint (base58 verbatim,
  `normAddr`); `paper.bank.token bytea` holds a 32-byte mint, `market_uid` keeps
  the base58 uid's case. **Ops are signed by the primary only** — the Solana
  key never signs a ledger op, which keeps one author per account and one
  verification path.
- **Rates for the tick.** Solana markets are not in the EVM database's
  `idx.market_latest` (the Solana index is its own service and database, docs/
  solana.md); the tick asks the Solana index `GET /markets/:uid` for the open
  Solana uids once an hour (a handful of requests, EVM shapes by contract) and
  takes the price from the same answer, the snapshot's price as the fallback.
- **Quotes.** A Solana row is quoted for the paper Solana address, so Kamino
  and Loopscale quote as for a real wallet (§D).

Effort: +1 day in phase 1 (the Solana key, the std-wallet shim, the automatic
link), +0.5 server day in the tick. Phase 3b disappears.

### K · Bridging on paper (2026-10-11)

Today's "Get <asset>" (`GetAsset.tsx`) is the whole funding experience: pay
with anything held on any chain, the API's spot route on the same chain or a
cross-chain route through `/v1/actions/swap/x-chain`, the route list naming the
bridge and aggregator with an ETA, the value check with fees, and a trace that
says *Bridging…* until the bridge reports done and the target balance moves.
Paper keeps all of it and replaces only the send:

- **Same quote, same screen.** The paper account quotes with its own addresses
  (EVM for an EVM leg, Solana for a Solana leg — a Solana↔EVM bridge is quoted
  from one paper key to the other, as `walletOn()` already does). The route
  list, the ETA and the value check are the real ones.
- **The send is an op at the quote.** Same chain: `swap` — the source debited,
  the quote's `amountOut` credited at once (the route's fee and slippage are
  what the quote says, not par). Across chains: `bridge` — the source debited
  now, an `inflight` entry credited to the destination when `now() >=
  arrivesAt = sentAt + estimatedDuration`; the trace is recorded at `bridging`
  with the route's `bridge` name and flips to `settled` on arrival, so the tray,
  the ticket's "Received" line and Alerts read exactly as for a real bridge.
  The paper clock lands anything in flight.
- **When a paper account bridges** (§A, decision 9): the bank mirrors the real
  setup — every chain funded — so a first deposit never has to bridge, exactly
  as a user holding money everywhere would not. Bridging happens where it does
  for real: a strategy bigger than one chain's bank (`Get USDC on Base` then
  offers the bank's USDC on the other chains, biggest first, as it does today),
  a token only held elsewhere, or a deliberate move. The reviewer walkthrough
  (§F) includes one such step, so the flow is exercised without being forced.
- **Server side.** `paper.transfers` (id, account, from/to chain, tokens,
  units in/out, bridge, sent_at, arrives_at, landed) — the tick (and the book
  read) lands transfers past `arrives_at` into `paper.bank`. The server cannot
  re-quote every swap, so it **bounds the output by its own prices**: a `swap`
  or `bridge` whose `unitsOut × priceOut` exceeds `unitsIn × priceIn` (plus
  0.5 %) is refused — a route can lose value, never create it.

Effort: +1 day in phase 1 (replaces the half-day at-par exchange), +0.5 server
day (transfers table, landing, the bound).

## Phases and effort

One front-end engineer who knows `Ticket.tsx` / `useLadder.ts` (Achim + an agent).
Days are engineer-days.

| phase | ships | days |
|---|---|---|
| **1 · Account + deposits** | `wallet/paperKey.ts` (name + password derivation, §H) + `wallet/paper.ts` connector + the sign-in / create form in `ConnectSheet`, `model/paper.ts` (bank, apply, toHoldings/toIdle, value), `state/Paper.tsx` (session, ledger, offers, export book), `useBook` injection, `usePaperLadder` + `tracePaper`, Simple + Withdraw tickets, paper swap in `GetAsset`, positions sheet, chip tag + strip, the `paper` profile tag + handle + pill. A reviewer with no wallet creates a named paper account, deposits and withdraws paper money, and signs in to the same identity on another device — on EVM and Solana (§J), funding across chains through the real quotes (§K). | 7.5 |
| **2 · Loops, time, PnL** | Loop open / add / lever / reduce / close with the real quotes' costs, derived health + the liquidation warning, accrual from rate history, the paper clock, PnL drawer series, wallet-page block, settings tools. | 3 |
| **QA + docs** | `vitest` for `model/paper.ts` (apply / accrue / value / health / passport round-trip — the first unit tests in the repo), a Playwright walkthrough of §F (the paper connector needs no mock wallet), `pnpm shots` paper screens, copy pass, `docs/apis.md` rule, this ticket updated. | 2 |
| **3 · next** | (a) **server ledger + paper board** (§G option A, §I, with §J's Solana rates and §K's transfers): signed ops stored and valued in pos-indexer's `paper` schema, the book follows the name + password, the board's *Paper* segment in the app; (c) price history for directional loops from the index's `assetHistory`; (d) actually closing at health < 1; (e) seasons. | 7 + 1 + 1 + 0.5 |

Phases 1 + 2 + QA: **about 12.5 engineer-days**, roughly three calendar weeks
beside other work. The reviewer ask is met at the end of phase 1; phase 2 is what makes
it a product feature rather than a demo switch. Phase 3a (ledger + board, ~7 days,
~5 of them in pos-indexer) is recommended soon after, since portability was asked
for and a server ledger is the clean form of it; the board is ~3 of those days.

## Resources

- **People:** one front-end engineer for the whole of it; half a day of design for
  the amber language (chip tag, pill, strip, button copy, the connect-sheet entry);
  one outside person with a fresh browser to run §F at the end of each phase.
- **Infrastructure:** none for phases 1–2 (localStorage). Phase 3a: one KV
  namespace bound to the app's Pages project, same as `WHITELIST`.
- **APIs:** no change upstream. Request budget goes *down*: a paper confirm skips
  the action build; quotes and rate history are the calls a real ticket makes anyway.
  One signed profile write per new paper account on the social service.
- **Tooling:** `vitest` as a devDependency (the repo has `tsc` + Playwright shots,
  no unit runner). No mock wallet needed: the paper connector is the test wallet.

## Risks

- **Paper read as real.** Mitigations are §Contract and §C: a separate address,
  amber everywhere money is shown, "paper" on every confirm, the profile tag, one
  tap to a real wallet. Reviewed in the copy pass.
- **A derived key in localStorage, from a password.** Fine for play money; the app
  never asks to fund it and the connector cannot send. A weak password lets someone
  post as that paper name (§H); real funds sent to a paper address are not lost but
  not a path we support.
- **Rows leaving the menu** (chain filter, floors, catalogue changes): the snapshot
  prices and names the position; the ticket says "off the menu" as for a real one.
- **History window:** rate history is 30 days; a position older than that accrues at
  the oldest point before it. Said in the PnL drawer's footnote.
- **Anonymous quotes:** some venues want an account to quote; covered in §D.
- **Social noise from paper accounts:** they are generated at one tap, so the social
  service may want a rate limit per author and a filter on the `paper` tag for the
  feed's Talk tab. Not in this ticket; flagged for pos-indexer.

## Decisions (taken 2026-10-11)

1. **Starting bank as tokens**, not a dollar figure: 10,000 of the chain's dollar
   plus a gas-coin allotment on every chain; other tokens through the paper swap.
   Open: the exact native figures in `STARTER` (proposal in §A).
2. **Offered on an empty wallet and on the connect card, plus the settings
   switch;** the account's profile carries the `paper` tag.
3. **Paper clock: yes.**
4. **Health < 1: a warning only** ("would have been liquidated"); a forced close
   is phase 3d.
5. **No "say why"** on a paper confirm.
6. **Generated paper addresses, portable:** a key with its own ledger, a server
   ledger keyed by the paper address in phase 3a.
7. **Name + password, key derived** (§H): the user controls the account; security
   reasonable, not tight. No server-side accounts.
8. **Both VMs from the start** (§J): one paper account, an EVM primary and a
   linked Solana key from the same seed.
9. **Every chain funded, mirroring the real setup** (§A, §K): the bank lives
   on all EVM chains the app offers and on Solana; bridging is available through
   the real cross-chain quotes, with the wait, and is taken when a chain's bank
   is short or a token is held elsewhere — never forced by an empty chain.

Still open: whether to start phase 3a (server ledger + paper board) right after
phase 2, and the `STARTER` figures.
