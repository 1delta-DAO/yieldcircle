# 0006 — Paper trading: a generated paper account, so the app works with an empty wallet or none

- status: planned 2026-10-11 (decisions taken, see §Decisions); implementation not started
- area: `src/model/paper.ts` (new), `src/state/Paper.tsx` (new), `src/wallet/paper.ts` (new
  connector), `src/ui/useBook.ts`, `src/ui/useLadder.ts` (+ `usePaperLadder`), `src/ui/Ticket.tsx`,
  `src/ui/GetAsset.tsx`, `src/ui/Positions.tsx`, `src/ui/Shell.tsx`, `src/ui/SettingsPanel.tsx`,
  `src/ui/Start.tsx`, `src/ui/Wallet.tsx`, `src/ui/Profile.tsx`, `src/ui/PnlDrawer.tsx`,
  `src/sdk/txTrace.ts`, `src/wallet/ConnectSheet.tsx`, `design/tokens.css`
- depends on: nothing new for phases 1–2 — no backend, no new service, no API change.
  Phase 3 adds one KV namespace behind a Pages Function, the pattern
  `functions/_middleware.ts` + `gate/waitlist.ts` already use.

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
  log: PaperOp[]
}
```

**The starting bank** (decision 1): a dollar and the gas coin on every chain the
app offers, as real tokens — `10,000 USDC` (the chain's dollar where there is no
USDC: USDT0 on Stable, pUSD on Plume — the same table `model/positions.ts`
`NATIVE` keeps, extended) plus a native allotment: `1 ETH` on the ether chains,
`20 SOL`, `3 BNB`, `100 AVAX`, `20 HYPE`, `500 POL`, … (a `STARTER` table beside
`NATIVE`, maintained the same way; exact figures are a copy decision, roughly
$2–3k of gas coin). The bank is **per chain**, so no paper bridge is needed.

**Other tokens come from a paper swap.** A wstETH row is paid in wstETH; the
ticket's existing "Get wstETH" line (`GetAsset.tsx`, today a real swap / bridge)
becomes, for a paper account, an exchange at the current price from the chain's
USDC or native — no fee, one tap. Same component, one branch. "Add cash" (a
top-up of the chain's dollar) sits beside it and is counted in `putInUsd`.

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
  | { t: 'swap'; chainId: string; from: string; to: string; unitsIn: number; unitsOut: number }
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
- **Passport** (decision 6 — portability). `exportPassport()` → one base64url string
  `yc-paper-1.<key>.<ledger>` (shown as text and as a QR through the `uqr`
  dependency); `importPassport()` on another device restores the key and the book.
  Phase 3's server ledger makes the key alone enough. The passport carries a burner
  key and is said so.
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
| `ui/GetAsset.tsx` | for a paper account: the paper swap (§A) + "Add cash"; the real swap / bridge branch is not rendered. |
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

- A Solana row: the paper account is an EVM key, so the quote goes out without an
  account (`account?` is optional) — fine everywhere except the venues that refuse
  to quote anonymously; there the ticket falls back to the row's rates and says
  "costs not quoted". A paper Solana key (ed25519, same connector idea through
  `useSolWallet`) is phase 3; the social service already accepts Solana authors.
- Entry cost on Solana is `null` in the API's economics (worker-api `svmEconomics`);
  paper takes 0 and says so.

### E · The beta gate

A paper address is not whitelisted. The reviewer path is the access code that
already exists (`/?access=<GATE_PASS>`, `docs/deploy.md`), or `GATE_OFF`. The paper
account does not open the gate and should not.

### F · What a reviewer does (acceptance)

1. Access code, no wallet. Home: *Try with paper money* → a paper account exists
   and is connected; the chip reads the bank's value with a **PAPER** tag; the
   profile shows the paper pill.
2. Earn → a Morpho vault on Base → deposit 1,000 USDC → **Confirm paper deposit**
   → Done, no wallet prompt. Chip and positions sheet show it, amber.
3. A 3× wstETH/ETH loop on Arbitrum from a feed card ("copy"): *Get wstETH* is a
   paper swap from USDC at today's price; the real quote's cost, route and health;
   confirm; equity shows minus the entry cost.
4. Skip ahead 30 days: both positions show what they earned at the real rates of
   the last 30 days; the PnL drawer draws it.
5. Reduce the loop, close it, withdraw the vault. Tokens are back in the bank, the
   return since start is shown.
6. Export the passport, open a private window, import: same address, same book.
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

## Phases and effort

One front-end engineer who knows `Ticket.tsx` / `useLadder.ts` (Achim + an agent).
Days are engineer-days.

| phase | ships | days |
|---|---|---|
| **1 · Account + deposits** | `wallet/paper.ts` connector + `ConnectSheet` entry, `model/paper.ts` (bank, apply, toHoldings/toIdle, value), `state/Paper.tsx` (key, ledger, offers, passport export/import), `useBook` injection, `usePaperLadder` + `tracePaper`, Simple + Withdraw tickets, paper swap in `GetAsset`, positions sheet, chip tag + strip, the `paper` profile tag + pill. A reviewer with no wallet deposits and withdraws paper money and can move the account between devices. | 4 |
| **2 · Loops, time, PnL** | Loop open / add / lever / reduce / close with the real quotes' costs, derived health + the liquidation warning, accrual from rate history, the paper clock, PnL drawer series, wallet-page block, settings tools. | 3 |
| **QA + docs** | `vitest` for `model/paper.ts` (apply / accrue / value / health / passport round-trip — the first unit tests in the repo), a Playwright walkthrough of §F (the paper connector needs no mock wallet), `pnpm shots` paper screens, copy pass, `docs/apis.md` rule, this ticket updated. | 2 |
| **3 · next** | (a) **server ledger + paper board** (§G, option A): signed ops stored and valued in pos-indexer's `paper` package, the passport becomes the key alone, the board's *Paper* segment in the app; (b) a paper Solana key; (c) price history for directional loops from the index's `assetHistory`; (d) actually closing at health < 1; (e) seasons. | 6 + 2 + 1 + 1 + 0.5 |

Phases 1 + 2 + QA: **about 9 engineer-days**, roughly two calendar weeks beside
other work. The reviewer ask is met at the end of phase 1; phase 2 is what makes
it a product feature rather than a demo switch. Phase 3a (ledger + board, ~6 days,
~4 of them in pos-indexer) is recommended soon after, since portability was asked
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
- **A burner key in localStorage.** Fine for play money; the app never asks to fund
  it and the connector cannot send. The passport is said to be a burner. Someone who
  sends real funds to a paper address can still move them with the exported key in
  any wallet — not a loss, just not a path we support.
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
6. **Generated paper addresses, portable:** a burner key with its own ledger, a
   passport for export / import now, a server ledger keyed by the paper address in
   phase 3a.

Still open: whether to start phase 3a (server ledger + paper board) right after
phase 2, and the `STARTER` figures.
