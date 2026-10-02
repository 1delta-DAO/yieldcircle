# 0004 — Wallet links: one profile, several addresses (EVM + Solana)

- status: implemented 2026-10-02, gated on the social service's deploy
  - pos-indexer `packages/social` (uncommitted there): migration
    `0051_wallet_links.sql`, `walletLinks.ts` (base58/ed25519/canonical-JSON
    verification, `parseLinkHalf`/`verifyLinkHalf`/`checkLinkPair`),
    `WalletLink` type, VM-aware `rateOk`/`follows`/`followers`/profiles,
    `POST /wallet-link` (EIP-1271 fallback for an EVM primary half) +
    `GET /wallet-links/:account`, member→primary resolution on both profile
    reads; `test/walletLinks.test.ts` pins the canonical bytes and the
    refusals — 53/53 green.
  - here: `WalletLink` in `social/sign.ts` (`linkWallet`/`unlinkWallet`,
    two halves, one nonce), `social/api.ts` calls, `useWalletLinks`,
    the Profile "Linked wallets" section, cluster-aware `isMe` on the
    wallet page, a one-line hint in the connect sheet.
  - **flip `SOCIAL_LINKS_READY` (`social/api.ts`) when the service
    deploys** — it gates the UI, the cluster `isMe`, and base58 accounts in
    the profile batch (which the live service still 400s).
  - not in v1: linking a SECOND EVM wallet from this app (needs a mid-flow
    wagmi reconnect; the service accepts it already), follower expansion and
    stake aggregation (plan §6 phases 3–4).
- created: 2026-10-02
- **plan: [docs/wallet-links.md](../docs/wallet-links.md)** — the model
  (directed `member → primary` links, no cluster id), the two-half mutual
  proof (`WalletLink` EIP-712 / ed25519 over the canonical JSON already
  pinned in `social/sign.ts`), the schema, routes, read-path resolution
  phases, and the client work here.
- depends on: pos-indexer `packages/social` accepting ed25519 identities and
  VM-aware account checks (the same prerequisite as docs/solana.md §F —
  one piece of work serves both tickets).
- area here (step 3 of the plan's sequencing): `social/sign.ts`,
  `social/api.ts`, `ui/Profile.tsx` (Linked wallets section + add flow),
  `ui/social-bits.tsx` / `identity/name.ts` (resolved names),
  `state/AppState.tsx` + `ui/Wallet.tsx` (cluster-aware `isMe`),
  `wallet/ConnectSheet.tsx` (one opt-in hint line).

## Done when

- A user with an EVM profile signs twice (once per wallet) and their Solana
  address appears under "Linked wallets"; the feed names that address with
  their handle; either key alone can unlink.
- Following the Solana address counts as following the person.
- Nobody can link a wallet without BOTH keys signing, and the refusal cases
  (second primary, link chain, member with a handle, mixed nonces, stale
  `signedAt`) answer in words.
