# 0001 — Solana in YieldCircle: catalogue, positions, actions, feed

- status: in progress — the client side of workstreams A–F landed 2026-10-02
  (uids/addresses, the `solana` chain, two-index routing, wallet-standard +
  svm ladder + signature watcher, composer gating). Still open here:
  - ~~flip `SOL_POSITIONS_READY`~~ — flipped 2026-10-02: worker-api's
    `/v1/data/earn/positions` serves a base58 account (lending legs + vault
    shares from the wallet's token balances; Loopscale LP and exit requests in
    flight are not served yet). Live once that worker-api change is deployed;
    the book, withdraw/manage flows and the Solana action buttons activate
    with it;
  - Solana rows in feed/Hot/holders appear once pos-indexer item 2 (EVM
    shapes on sol-positions) ships — the client already fans out and reads
    a non-matching shape as empty;
  - `search/rank.ts` gained base58/string-chain-id recognition ahead of its
    source: port the same hunk to pos-indexer `packages/position-store/src/search.ts`
    (until then `pnpm search-rank` reports a diff);
  - pos-indexer owes a `protocolKeyOf` rule for Solana lender keys
    (`KAMINO_<pubkey>`, `JUPITER_LEND_main_8`) before protocol filters can
    fold them; the app's copy stays in step with the index's.
- created: 2026-10-01
- area: `src/model/uid.ts`, `src/wallet/*`, `src/ui/useLadder.ts`,
  `src/sdk/*`, `src/index/*`, `src/config/backend.ts`, `src/social/sign.ts`
- depends on: worker-api serving Solana (`lending-sdks/UNIFIED_API_PLAN.md`),
  the Solana position index (now `pos-indexer/apps/sol-indexer`, in production
  since 2026-10-02)
- **plan: [docs/solana.md](../docs/solana.md)** (2026-10-02). It supersedes the
  "what exists" table and the order below: verified backend state, the
  shapes pos-indexer owes, and workstreams A–F.

## Goal

A Solana user can do in YieldCircle what an EVM user does today: see Solana
strategies (Kamino, Jupiter Lend, Save, Project 0, Loopscale lending; Jupiter
Lend earn, LSTs, Exponent PTs, Solstice, Huma vaults), deposit and withdraw,
open and close loops, and see their positions. The social half (feed,
holders, hot / trending, a wallet's history) shows Solana activity next to the
EVM chains.

## What exists on the backend side (2026-10-01)

| piece | state |
| --- | --- |
| Solana market rows (`/v1/data/earn`, `/lending/pairs/optimize`) | the rows are built (`@1delta/sol-lending`) and served by yield-tracer's shared tables; worker-api passes them through once `solana` is in its chain list — verify on `allocator.api.1delta.io` with `chainIds=solana` before starting |
| Actions | worker-api has `isSvmChainId` branches in the lending handlers (`v1/actions/lending/*`) returning the `chainType: 'svm'` envelope (`v1/envelope.ts`); earn deposit / withdraw and loops on Solana: check each route — not all are wired |
| The connected user's positions | `/v1/data/earn/positions` for `solana` (UNIFIED_API_PLAN §4.2) — served since 2026-10-02 |
| Other wallets, feed, markets, holders | the Solana position index (`pos-indexer/apps/sol-indexer`, `:8790`, https://sol-positions.1delta.io): `/events/recent`, `/positions/:a`, `/accounts/:a/events`, `/markets/:uid[/events\|/holders\|/flow]`, `/trending`, `/hot`, `/health` — pos-indexer's route NAMES, but a separate service until it merges into pos-indexer (plan §8), and its rows are a subset of pos-indexer's fields |

## What breaks in this app (each is a task)

1. **Market uids are lower-cased.** `model/uid.ts` `createMarketUid` does
   `ref.toLowerCase()`; base58 is case-significant, so every Solana uid
   becomes a different key (social threads, holders, the feed's Copy). Lower
   only on EVM chain ids, as `lending-sdks/packages/margin-fetcher-sol/src/utils/marketUid.ts`
   does. Same for `assetAddress?.toLowerCase()` in `model/positions.ts`
   (lines 76, 126, 229) and the vault check in `sdk/txTrace.ts:294`.
2. **Addresses are assumed `0x…{40}`.** `ui/GetAsset.tsx:210`, `txTrace.ts:294`,
   the `?as=0x…` parameter and the wallet dialog. Accept a base58 pubkey
   (32 bytes decoded) where the chain is Solana.
3. **Wallet.** wagmi / viem are EVM-only (`wallet/wagmi.ts`). Add a Solana
   wallet path (wallet-standard: Phantom, Solflare, Backpack; no SDK that
   pulls `@solana/web3.js` into the bundle unless measured) and an "active VM"
   in app state — one account per VM, the chain picker decides which.
4. **Signing.** `ui/useLadder.ts` sends `{ to, data, value }` through
   `useSendTransaction`. An svm step is a serialized v0 message
   (`chainType: 'svm'`): the wallet signs + sends it (`signAndSendTransaction`),
   and **a Solana transaction expires in ~60–90 s** — on expiry re-call the
   action endpoint, never retry the blob (lending-sdks `SOLANA_RULES.md`).
   `txTrace` needs a Solana confirmation path (`getSignatureStatuses`) to know
   when to re-read.
5. **Chains.** `solana` is a string chain id with no EVM chain object: chain
   picker, `ChainMark`, explorer links (solscan), balances
   (`/v1/data/token/balances` for solana, or the index's POST once it serves
   Solana) and `WRAPPED_NATIVE` / gas-token logic (`So111…112`, native SOL).
6. **The index.** Feed / holders / hot read `VITE_INDEX_BASE_URL`. Until the
   Solana index merges into pos-indexer, add `VITE_SOL_INDEX_BASE_URL` and route
   by chain in `index/api.ts`; map its rows to `index/types.ts` there (its
   events carry `tx_hash` / `account` as base58, `ix_path`, `amount_usd` from
   its own valuation). Positions of OTHER wallets only — the hard rule in
   `docs/apis.md` holds for Solana too.
7. **Social signing.** `social/sign.ts` signs EIP-712 with `chainId: 1`. A
   Solana wallet signs a message (ed25519) — the social service has to accept
   it first (pos-indexer `packages/social`, separate ticket there). Until then,
   a Solana-only user reads threads but cannot post.
8. **Strategy model.** `model/assets.ts` groups by asset: Solana's USDC / USDT
   / SOL / JitoSOL join their groups through the token list's `assetGroup`
   (already shared). LSTs (JitoSOL, bSOL, jupSOL) are SOL strategies; PTs
   (Exponent) mature — reuse the Pendle PT handling.

## Order

1 → 2 → 5 (read-only Solana catalogue and a pasted base58 address via `?as=`)
→ 6 (feed + holders) → 3 → 4 (deposit / withdraw first, loops second) → 7.
Steps 1–2 are safe to land now: they change nothing on EVM.

## Done when

- `?as=<base58 wallet>` shows that wallet's Solana positions and history.
- A Phantom user deposits into a Jupiter Lend earn row and withdraws it, with
  `txTrace` re-reading the position after confirmation.
- The home feed shows Solana events next to EVM ones, and a Solana market page
  lists its holders from the Solana index.
- No EVM regression: `pnpm build` and the existing flows unchanged.
