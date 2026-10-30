# 0021 — Profile wallets: manage in Lite, show the group on every profile

- status: steps 1–2 done 2026-10-30 (`ui/LinkedWallets.tsx`); steps 3–5 open
- created: 2026-10-30
- builds on: [tickets/0004](0004-wallet-links.md) and
  [docs/wallet-links.md](../docs/wallet-links.md) — the two-signature link
  (`WalletLink`, both halves on one nonce, 10-minute skew, max 10 members,
  depth one, either side unlinks) is live in the social service and on in
  this app (`SOCIAL_LINKS_READY`). Nothing in the proof changes here.

## Why

A person has several wallets — EVM main, EVM hot wallets, Solana — and wants
them under one profile. The proof exists, but:

- Lite has no place to manage it (only Pro's `#/me` has "Linked wallets");
- only the Solana wallet can be linked from the app (`linkWallet` refuses
  EVM members, though the service accepts EVM↔EVM);
- no profile page SHOWS the group — Pro's wallet page uses the cluster only
  for `isMe`, Lite's profile ignores it.

## Steps

1. **Manage in Lite.** The linked-wallets section moves out of `ui/Profile.tsx`
   into `ui/LinkedWallets.tsx`, used by Pro's `#/me` and by a "Your wallets"
   section on Lite's You. It handles the connected wallet being a MEMBER
   (says whose, offers Unlink — the service would refuse an add from it), and
   `unlinkWallet` gains the EVM-member half.
2. **Show the group.** `ProfileWallets` on Lite's profile and Pro's wallet
   page: every wallet of the profile as a chip (the open one marked), and on
   a member's page "one of <primary>'s wallets". Signed links only; renders
   nothing for an unlinked address.
3. **A second EVM / second Solana wallet.** The account-switch flow: with the
   wallet to add connected, sign its member half naming the primary (half kept
   in memory only, ≤ 10 min — alone it proves nothing); switch back to the
   primary, sign the primary half; post both. Client only.
4. **Curated groups, never in the signed table.** Unsigned groupings (the
   Binance exploiter test) come from the index's curated entities
   (pos-indexer `packages/indexer/config/known-names.json`, one evidence link
   per address). Needs an index route entity → addresses (the stored rows
   carry `ref = <entityId>:<name>`), then a second block in `ProfileWallets`:
   "grouped by YieldCircle from public evidence", each chip with its evidence
   — visibly different from "each wallet signed". Test entity:
   `binance-hot-wallet-exploiter` (renamed from `…-exploiter-3` 2026-10-30) —
   14 wallets, Etherscan's "Binance Hot Wallet Exploiter" 2, 3, 4, 5, 6, 10,
   13, 16, 31, 33, 36, 45, 46, 49, each read from its own page and
   checksum-verified. Etherscan numbers to 49+; the rest still to list.
   Leave out `0x5225…2f8c`, a look-alike of Exploiter 2 used for address
   poisoning.
5. **Optional: sum the group.** "What it runs" across all members on a
   profile (the index, for other people). On You, linked members' positions
   come from the 1delta API, never the index (docs/apis.md).

## Decisions

- Only the PRIMARY can add a wallet (not any member): keeps depth one, and a
  stolen secondary key cannot grow the group.
- A curated group never writes `social.wallet_links`: every row there carries
  both signatures, and one unsigned row would weaken all of them.

## Done when

- Lite's You lets the profile wallet link a Solana wallet and unlink any
  member; a member wallet sees whose it is and can unlink itself.
- A linked wallet's page, Lite or Pro, lists every wallet of the profile.
- (3) Two EVM wallets of one person link from the app; (4) the exploiter's
  profile lists its addresses as curated, with evidence, and no signed badge.
