# Solana in YieldCircle

**Status:** plan, written 2026-10-02. The backend facts below were checked on
that day. This document replaces the "what exists" and "order" sections of
`tickets/0001-solana-integration.md`, which named the Solana index's
prototype location (`lending-sdks-sol/packages/indexer`). The index now lives
in `pos-indexer/apps/sol-indexer` and runs in production.

## Objective

A Solana user can do in YieldCircle what an EVM user does today:

- browse Solana strategies;
- open any Solana wallet, market or transaction;
- connect Phantom, Solflare or Backpack and deposit, withdraw and loop.

Solana activity appears in the feed, Hot and holders lists **next to** the EVM
chains, not in a separate app. **No EVM flow may regress**: every change below
either applies only when the chain is Solana, or behaves the same on EVM.

## What exists (verified 2026-10-02)

| Piece | State | Consequence here |
| --- | --- | --- |
| **Catalogue** (`GET /v1/data/earn?chainIds=solana`) | **Live.** Rows are named `vault.lst:solana:J1toso1…`, `vault.jupiter-lend:solana:…`, `JUPITER_LEND_main_8:solana:…` and `KAMINO_<market>:solana:<reserve>`. Pubkeys keep their case. | Read-only browsing works once the uid and address code keeps case. |
| **The connected user's positions** (`GET /v1/data/earn/positions`) | **Not wired for Solana**: a base58 `account` answers `INVALID_PARAM: Invalid account address format`. | Blocks "my positions" on Solana. This is worker-api's work (lending-sdks `UNIFIED_API_PLAN.md` §4.2). The hard rule still applies. |
| **Actions** (`v1/actions/lending/*`, earn deposit / withdraw, loops) | worker-api returns the `chainType: 'svm'` envelope on some routes. Each route has to be checked before its button is wired. | Blocks transactions only. |
| **Solana position index** (`pos-indexer/apps/sol-indexer`) | **In production since 2026-10-02.** It runs on box 2, fed by a block scanner on its own box. Every finalized slot is read, and an hourly audit compares the result with `getSignaturesForAddress` (pos-indexer tickets/0054). It is a **separate service from positions.1delta.io**, public at `https://sol-positions.1delta.io`. | Feed, holders and other wallets need the response shapes listed in "What pos-indexer owes". |
| **Social** (`social.1delta.io`) | Accepts only `0x` addresses and EIP-712 signatures (`packages/social/src/index.ts:41` regex on author, wallet thread keys, follows, profiles and ratings). Accounts are stored with `hexToBuf`. | A Solana wallet can read threads on Solana markets, but cannot sign, follow or have a profile until social accepts ed25519 identities. |

## Decisions

1. **One app, chain-routed clients, no Solana-only pages.** `solana` is a
   chain id like any other, and Solana entries carry string ids. The split
   happens in the client modules (`index/api.ts`, `wallet/*`, `social/sign.ts`)
   and nowhere in the UI.
2. **The Solana index must answer the EVM index's shapes. YieldCircle does not
   adapt them.**
   - The two indexers differ in envelope: Solana returns `{ok, data}` with
     snake_case rows, EVM returns named arrays with camelCase rows.
   - They also differ in content. Solana has no `group=tx` bundles, and no
     `totals` or `groups` on positions. Its `/hot` ranks *accounts* while EVM's
     ranks *markets*. Its `/flow` has different bucket fields.
   - Writing an adapter in `index/api.ts` would mean a second copy of logic the
     EVM indexer already has (tx folding, netting, subject choice). It would
     also drift.
   - So the work is listed under "What pos-indexer owes" and done there. Until
     then, YieldCircle shows Solana only where the shapes already match (a
     wallet's raw event list, holders).
3. **Base58 is never lower-cased.**
   - Every `.toLowerCase()` on an address, uid or key goes through one helper:
     `normAddr(chainId, a)`, which lower-cases on EVM chains and is the
     identity on `solana`.
   - The uid rule follows lending-sdks' `createMarketUid`, which lower-cases
     the ref only for EVM chain ids (`margin-fetcher-sol/src/utils/marketUid.ts:22`).
4. **The hard rule holds on Solana.**
   - The connected Solana wallet's own positions come from
     `/v1/data/earn/positions` only, never from the index.
   - `isMe` must compare against the **Solana** wallet when the page's chain is
     Solana, not only against wagmi's `address` (`ui/Wallet.tsx:29`).
5. **One account per VM.** App state carries `evmAddress` and `solAddress`. A
   page's chain decides which one is "you". The chain picker never forces a
   wallet switch for reading.

## Workstreams

### A — Identity and addresses (safe to land first, no backend needed)

| Where | Change |
| --- | --- |
| `model/uid.ts:27` | Lower-case the ref only for numeric chain ids. Update the comments that say "ref lower-cased" (`AppState.tsx:211-216`, `docs/apis.md:156-164`). |
| New `model/address.ts` | Add `isEvmAddr`, `isSolAddr` (base58, 32 bytes decoded), `chainOfAddr`, `normAddr(chainId, a)`. Replace the three `/^0x[0-9a-fA-F]{40}$/` copies (`AppState.tsx:50`, `wallet/ConnectSheet.tsx:13`, `ui/GetAsset.tsx:209-210`). |
| `state/AppState.tsx:72, :90, :196, :206` | Make `#/w/<addr>`, `walletHref` and `?as=` accept a base58 wallet and keep its case. |
| `identity/name.ts:29-35` | **Crash fix.** `autoName` lower-cases, strips `0x` and calls `parseInt(…,16)`. A base58 address that starts with a non-hex character gives `NaN`, then `cap(undefined)` throws. Derive the seed from a hash of the raw string (an FNV-1a hash is enough), and keep the existing output for `0x` addresses so no EVM name changes. Do the same for `identity/character.tsx:169-172` `specOf`, which barely varies on base58. |
| All other `toLowerCase()` call sites on addresses or keys (`model/positions.ts:76, :126, :202-229`, `model/desk.ts:40, :131`, `model/strategies.ts:16`, `sdk/txTrace.ts:118-311`, `sdk/queries.ts:287, :339, :360`, `index/queries.ts:188, :197`, `ui/*` (Shell, Stats, Market, Rate, Thread, Profile, Ticket, GetAsset, AssetPage, TokenPage), `social/*`) | Route each one through `normAddr`. List them in the PR. |
| `search/rank.ts:272-280` | Recognise a uid with a string chain id (`/^[^\s:]+:[^\s:]+:[^\s]+$/`), a base58 wallet (32–44 characters) and an 87–88-character base58 signature. |

**Done when:** `?as=<base58 wallet>` and `#/m/<solana uid>` load without
crashing, show a stable generated name, and keep the case in the URL. `0x`
behaviour is byte-for-byte unchanged.

### B — The chain itself

| Where | Change |
| --- | --- |
| `sdk/queries.ts:31-47` `CHAINS`, `chainLabel`, `chainBuckets` | Add `solana`, with a string id. `wallet/wagmi.ts:21-28` says every `CHAINS` entry must be a wagmi chain. Split it: `EVM_CHAINS` for wagmi, `CHAINS` for the app. |
| `ui/ChainMark.tsx:24-61` | Add a `solana` entry (colour, glyph). Make explorer paths per chain: Solscan uses `/tx/<sig>` and `/account/<addr>`, not `/address/`. Fix `bits.tsx:240-255` `AddrExplorers`, which assumes "the same address on every EVM chain". |
| `model/positions.ts:155-230` | Native SOL: symbol `SOL`, **9 decimals** (`ui/Ticket.tsx:140` hard-codes 18). Wrapped native is wSOL `So11111111111111111111111111111111111111112`. Do not use the `0x000…0` zero address on Solana. |
| `index/types.ts:318-332` `indexChainLabel` | Add `solana`. |
| `state/feedLink.ts`, `ui/ChainPicker.tsx` | Add a chain slug `solana`. The picker lists it, and choosing it changes reads only. |
| Balances (`sdk/queries.ts:320-372`) | Use `/v1/data/token/balances` for Solana (check that worker-api serves it). The index's balance route is EVM-only. |

### C — The read path (feed, Hot, holders, other wallets)

- **The public host exists**: `https://sol-positions.1delta.io`, live since
  2026-10-02.
- `config/backend.ts`: add `VITE_SOL_INDEX_BASE_URL`, defaulting to
  `https://sol-positions.1delta.io`. Add it to `.env.example`.
- `index/api.ts`: give `get()` a base-URL argument, and add
  `indexFor(chainId)`. These calls fan out:
  - feed, Hot and trending go to both indexes when the selection includes
    Solana and at least one EVM chain, and merge by time or score
    (`mergeTxs` exists at `index/queries.ts:267`);
  - wallet, market and holders calls go to exactly one index, chosen by the
    address or uid.
- Keep `postUnsupported` (`index/api.ts:71-88`) **per index**. A 404 from the
  Solana index must not switch POST off for the EVM one.
- "All chains" currently means "omit `chainIds`" (`Feed.tsx:127`,
  `Pulse.tsx:30`, `Hot.tsx:62`, …). It must become "both indexes". Without that
  change, adding `solana` to `CHAINS` shows nothing.
- Pages that work as soon as the shapes match:
  - Pulse, the Feed tabs, Wallet (other wallets: positions, events);
  - Market (header, events, holders, flow);
  - Token pages (Solana members of a group).
- Pages that stay EVM-only until their routes exist on Solana:
  - Board / earners, curators, `/assets` history;
  - `/stress`, `/find`, issuer, protocol and curator filters.

  On Solana these show "not on Solana yet" in words, never an empty state.

### D — Wallet and signing

- **Wallet:** use wallet-standard (`@wallet-standard/app` discovery) for
  Phantom, Solflare and Backpack. Do not add the full `@solana/web3.js` unless
  its bundle cost is measured. Use `@solana/kit` or the `svm-kit` codec
  (lending-sdks) for message (de)serialisation. Phantom currently appears only
  through WalletConnect/EVM (`wallet/wallets.ts:90`). Add a native Solana entry
  to `ConnectSheet.tsx`.
- **Transactions** (`ui/useLadder.ts:43-116`):
  - An `svm` step is a serialized v0 message: the wallet runs
    `signAndSendTransaction` on it.
  - **The message expires after about 60–90 s.** On expiry, call the action
    endpoint again for a fresh message. Never retry the old blob.
  - `wrongChain` / `switchTo` do not apply to Solana.
- **Confirmation** (`sdk/txTrace.ts:3-4, :169`): poll `getSignatureStatuses`
  to `confirmed`, then trigger the same scoped re-read of
  `/v1/data/earn/positions` that EVM uses (`scopeOf` :285-300 must accept a
  base58 vault).

### E — The connected user's positions and actions

This workstream is blocked on worker-api: `/v1/data/earn/positions` for
Solana, and each action route answering `chainType: 'svm'`.

1. Read: `useEarnPositions` for `solana` with the Solana wallet. Then
   `useBook` shows them next to the EVM book.
2. Earn deposit and withdraw first (Jupiter Lend earn, LSTs), then lending,
   then loops (Kamino, Jupiter Lend vaults).
3. Exponent PTs mature: reuse the Pendle PT handling. LSTs (JitoSOL, bSOL,
   jupSOL) group under SOL through the token list's `assetGroup`.

### F — Social

- **Reading** works for market and position threads once workstream A stops
  lower-casing. The keys are:
  - `marketKey`: the uid, verbatim;
  - `positionKey`: `solana|<base58>|<uid>|side|posId`;
  - `eventKey`: `solana:<sig>:<ix>:<seq>`.

  The key choice (base58, verbatim) has to be agreed with social **before** the
  first Solana thread is written, because changing a key later orphans its
  threads.
- **Writing, follows and profiles** need social to accept a Solana identity.
  That is pos-indexer work: an ed25519 signature over the same typed payload
  (JSON-canonical, domain-separated), accounts stored as text or by VM, and
  every `ADDR` check made VM-aware. Until then, a Solana-only user reads but
  does not post, and the composer says so.
- `social/sign.ts` gets a second signer, `signSolana(message)`, chosen by the
  author's VM. The EIP-712 domain stays unchanged.

## What pos-indexer owes (Solana index), in order of need

| # | Route | Needed shape (the EVM index's) | Used by |
| --- | --- | --- | --- |
| 1 | public host | **done 2026-10-02**: https://sol-positions.1delta.io (CORS reflects the origin; `/ingest/*` is 404 at the edge) | everything in C |
| 2 | every route | camelCase rows, named arrays (`txs` / `events` / `positions` / `holders` / `flow`), `chainId: 'solana'` on every row, no `ok` envelope | `index/types.ts` as is |
| 3 | `/events/recent`, `/accounts/:a/events`, `/markets/:uid/events` | `group=tx` → `TxBundle` (legs, `subject`, `kinds`, `lenders`, `netUsd`, `volumeUsd`); `chainIds`, `protocols`, `accounts`, `markets`, `follower`; `POST { inMarkets }` | Feed, Pulse, Alerts, Wallet, Market |
| 4 | `/positions/:account` | `positions` + `groups` + `totals` + `asOf`; `aprNow`, `usdStatus`, `valueStatus`, `lenderName` / `lenderLogo`, `assetGroup` | Wallet (other wallets) |
| 5 | `/hot` | **markets**, ranked like EVM's (`heat`, `pVolume`, `pEvents`, `nWallets`, …). Today it ranks accounts. | Hot |
| 6 | `/markets/:uid`, `/holders`, `/flow` | `MarketRow` (404 when unknown), camelCase `Holder`, `flow?bucket=day` with `side` | Market, ticket holders |
| 7 | `/health` | `{ok, chains}`. Keep its 503 off the client path (the client throws on 503). | `useIndexHealth` |
| 8 | social | ed25519 identities; VM-aware `ADDR` | F |

Items 2–6 are one piece of work in `apps/sol-indexer/src/api/server.ts`. Port
`bundleTransactions` / `netPositions` from `packages/position-store`, or share
them once the merge (PLAN §8) brings the Solana ledger into the main schema.

## Sequencing

1. **A + B** (one PR each, no backend): Solana uids and wallets open, nothing
   crashes, EVM unchanged.
2. **pos-indexer 2** (shapes; the host is done), then **C** for Wallet / Market /
   holders. This is the first visible Solana data.
3. **pos-indexer 3 + 5**, then C for Feed / Pulse / Hot. Solana appears next to
   EVM on the home page.
4. **D + E** once worker-api serves Solana positions: connect, deposit,
   withdraw, then loops.
5. **F** once social accepts ed25519.

## Acceptance

- `?as=<base58 wallet>` shows that wallet's Solana positions and history from
  the index, with a generated name.
- The home feed with "all chains" shows Solana transactions merged by time
  with EVM ones. A Solana market page lists holders, flow and events.
- A Phantom user deposits into and withdraws from a Jupiter Lend earn row;
  `txTrace` re-reads the position after `confirmed`.
- `pnpm build` passes and every EVM flow behaves as before. The diff touches no
  `0x` output: names, uids and keys are identical.

## Open decisions

- **Wallet library:** wallet-standard directly vs a Solana wallet adapter (its
  bundle size must be measured). Recommendation: wallet-standard.
- **A Solana-only user's identity in social:** a separate base58 identity, or
  an optional link to an EVM wallet (two signatures). Recommendation: a
  separate identity first, with linking later.
- **Mixed "all chains" ranking on Hot:** merge two independently scored lists,
  or have the indexes share a scoring window and percentile base. The two
  percentile sets are not comparable, so: interleave by rank first, and score
  jointly once the ledgers merge.
