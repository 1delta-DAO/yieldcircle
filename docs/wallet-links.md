# Wallet links: one person, several addresses

**Status:** implemented 2026-10-02 (service in pos-indexer, client here
behind `SOCIAL_LINKS_READY`) — see tickets/0004 for what is still gated.
Plan written the same day. Resolves the open decision in
[`solana.md`](solana.md) ("a Solana-only user's identity in social: a separate
identity first, with linking later" — this is the linking). The service work
lives in pos-indexer `packages/social`; this app is one of its two clients.

## Objective

A profile — the handle, the name, the face — stands for a PERSON, and a person
has several wallets: an EVM main, an EVM hot wallet, a Solana wallet. Today
the wallet IS the account (`social.profiles.account` is the primary key), so
the same person is three strangers: three generated names in the feed, three
follow targets, stake badges that see a third of their money.

After this plan, a user can ATTACH addresses to their profile by signing a
mutual proof **with both keys**, and every surface that names a wallet
resolves the attachment: a linked Solana address in the feed wears the EVM
profile's handle, following any member follows the person, and "you" on a
wallet page means any wallet of yours.

## The model: a primary, and directed links to it

No abstract "account id". The principle *the wallet is the account* stays:
the profile keeps living on ONE wallet — the **primary**, whichever wallet
signed the Profile message (EVM today; base58 too once the service accepts
ed25519 profiles, so a Solana-only user can be a primary). A link is a
directed edge `member → primary`: "this address is also me."

Why not a symmetric cluster id: every existing row (profiles, messages,
follows, x_links, ratings) is keyed by a wallet and stays valid untouched; a
cluster id would need a migration of all of them or a resolution layer on
every query. The directed edge needs resolution only where a DISPLAY or an
AGGREGATE is computed, which is a short, known list (§6).

Rules (enforced in the service, stated in the UI):

1. **A member belongs to at most one primary** (`member` is the table's PK).
2. **No chains**: an address that is a primary of others cannot become a
   member, and an address that is a member cannot be named as a primary.
   Depth is exactly one; resolution is one lookup, never a walk.
3. **A member that holds a handle cannot be linked** — the service refuses
   with "release the handle on <addr> first, or link in the other
   direction". Two handles in one cluster is two names for one person, and
   silently shadowing a name someone signed for is worse than asking them to
   choose. (A member with only a displayName is allowed and shadowed; unlink
   restores it.)
4. **Any VM pair links**: EVM↔EVM (two EIP-712 halves) and EVM↔SVM work the
   same way. Multiple EVM wallets under one identity is the same feature.
5. **Linking is public and is meant to be**: it ties the wallets' histories
   together for everyone, forever as far as third parties are concerned
   (unlink deletes the row, not anyone's copy of it). The UI says this in
   words before the first signature.
6. **Unlink is one-sided**: either key alone can sign `action: 'unlink'` —
   consent withdrawn by either party ends the claim.

## The proof: two halves, tied by a nonce

Exactly the `/x-link` pattern — *two independent proofs meet, tied together
because each quotes the other's material* — except both halves are wallet
signatures, so no worker, no secret and no observer is needed:

- the PRIMARY's half says "I claim `<member>` as mine" — only its key can;
- the MEMBER's half says "I am claimed by `<primary>`"  — only its key can;
- both quote the SAME client-generated `nonce`, and each names the other
  address, so halves from different sessions (or different counterparties)
  cannot be mixed and matched.

New EIP-712 type (additive, like `XLink` and `Rating` before it — no stored
signature is disturbed):

```
WalletLink: [
  { name: 'author',  type: 'address' },  // the signer's own address
  { name: 'other',   type: 'string'  },  // the counterparty, spelled canonically (hex lowered / base58 verbatim)
  { name: 'otherVm', type: 'string'  },  // 'evm' | 'svm' — of the counterparty
  { name: 'role',    type: 'string'  },  // 'primary' | 'member' — which side THIS signature is
  { name: 'action',  type: 'string'  },  // 'link' | 'unlink'
  { name: 'nonce',   type: 'string'  },
  { name: 'signedAt', type: 'uint256' },
]
```

A base58 signer cannot be an EIP-712 `author` (that type is 20 bytes), so a
Solana half is the SAME field set signed ed25519 over the canonical JSON
`{ domain, primaryType: 'WalletLink', message }` — the exact encoding this
app already pins in `social/sign.ts` (`signSolanaEnvelope` / `canonicalJson`:
keys sorted at every depth, domain included). That encoding is thereby
AGREED between client and service before the first link is written, the same
discipline as the Solana thread keys in `solana.md` §F.

Verification dispatch in the service, by the author's shape:

| author | check |
| --- | --- |
| `0x…40` | EIP-712 recover == author; EIP-1271 fallback where `erc1271.ts` already applies (a Safe can be a primary) |
| base58, 32 bytes decoded | ed25519 verify over `canonicalJson(...)` with the address as the public key (Node's `crypto.verify` does ed25519 natively; no new dependency) |

Server-side checks on `POST /wallet-link`: both signatures valid; both
`action`s equal; `nonce`s equal; `signedAt` within the existing 10-minute
skew, both halves; each half's `other` equals the other half's `author` and
`otherVm` matches its shape; roles are one `primary` + one `member`; rules
1–4 above; rate-limited like a write. An unlink needs ONE valid half (either
role) naming the pair.

## Storage (pos-indexer migration `00xx_wallet_links.sql`)

`bytea` already holds both shapes — a 20-byte EVM address and a 32-byte
ed25519 pubkey — so the account columns do not change anywhere:

```sql
CREATE TABLE IF NOT EXISTS social.wallet_links (
  member          bytea PRIMARY KEY,
  member_vm       text  NOT NULL,          -- 'evm' | 'svm'
  primary_account bytea NOT NULL,
  primary_vm      text  NOT NULL,
  member_sig  bytea NOT NULL, member_payload  jsonb NOT NULL,
  primary_sig bytea NOT NULL, primary_payload jsonb NOT NULL,
  nonce text NOT NULL,
  linked_at timestamptz NOT NULL DEFAULT now(),
  CHECK (member <> primary_account)
);
CREATE INDEX IF NOT EXISTS wallet_links_primary ON social.wallet_links (primary_account);
```

Both payloads and both signatures are stored whole, like every other write:
anyone can re-verify a link later without trusting the service.

**Prerequisite** (it is the same prerequisite as `solana.md` §F): the
service's `ADDR` checks become VM-aware and writes from a base58 author
verify ed25519. Without it a Solana wallet cannot even sign its member half.

## Routes

| Route | Does |
| --- | --- |
| `POST /wallet-link` | body `{ primary: SignedEnvelope, member: SignedEnvelope }` for link; `{ half: SignedEnvelope }` for unlink. Kept OFF `/write`, exactly as `XLink` is: half a link proves nothing. |
| `GET /wallet-links/:account` | the cluster from any member or the primary: `{ primary, members: [{ account, vm, linkedAt }] }` — public, like everything here. |
| profile reads (`/profiles/:a`, batch `/profiles`) | resolve member → primary before lookup and carry the cluster on the answer: `{ profile, resolvedFrom?, linkedWallets }`. One extra LEFT JOIN; batch cost unchanged. |

## What resolves where (the read path)

Phased on purpose — the link is useful from phase 1, and nothing breaks
while the later phases land:

1. **Names** (service: profile resolution; clients: `Who`/`labelFor`): a
   linked member wears the primary's handle and face everywhere an address
   is named — feed rows, holders, boards, thread authors. The member's
   generated name retires. This alone is most of the user-visible value.
2. **"You"** (clients only): `isMe` / wallet-page self-view treat any
   cluster member as you; the app already carries one signer per VM
   (`signer` / `solSigner` in `AppState`), so the cluster is the union of
   both plus their links.
3. **Follows**: following any member counts as following the person — the
   feed's `follower=` SQL expands the target set through the table (one
   join); the Follow button shows "following" on every member page.
   Follows WRITTEN stay keyed by the signing wallet, nothing migrates.
4. **Stake badges**: `author_stake` sums `idx.positions` across the cluster
   (an EVM commenter's Solana stake counts once the ledgers merge, §8 of the
   Solana plan). Until then: EVM members only, which is just today's
   behaviour per address.
5. **Messages / ratings**: unchanged at write time (author = signing
   wallet); display resolves through phase 1. A Delete still needs the
   AUTHOR's key — a primary cannot delete a member's message; the link
   grants a name, never custody of another key's words. Same rule as
   curator claims: a claim grants a name and a voice, not moderation.

## Client work (this repo)

| Where | Change |
| --- | --- |
| `social/sign.ts` | `walletLink(member)`: builds both halves — one nonce, EVM half through the existing `sign('WalletLink', …)`, Solana half through `signSolanaEnvelope` — and posts them. `unlink(addr)` signs one half with whichever of the two connected wallets is in the pair. |
| `social/api.ts` | `postWalletLink`, `walletLinks(account)`; profile types gain `resolvedFrom` / `linkedWallets`. |
| `ui/Profile.tsx` | a "Linked wallets" section: the cluster as rows (address, VM mark, linked-since, Unlink), and **Add a wallet** — the flow: both wallets must be connected (the sheet already holds one per VM); sign with the profile wallet; sign with the wallet being added; posted. The section states rule 5 in words before the first signature. |
| `ui/social-bits.tsx` `Who` + `identity/name.ts` `labelFor` | prefer the resolved profile that the batch answer now carries; no second request. |
| `state/AppState` / `ui/Wallet.tsx` | `isMe` = signer, solSigner, or any member of their cluster (one `walletLinks` query per session, cached). |
| `wallet/ConnectSheet.tsx` | after both VMs are connected and unlinked, one quiet line: "These two wallets can share one profile — link them", deep-linking to the Profile section. Never a modal; linking is opt-in, not onboarding. |

## Sequencing

1. **pos-indexer**: VM-aware accounts + ed25519 verification (shared
   prerequisite with Solana social, `solana.md` §F) — its own ticket there.
2. **pos-indexer**: `WalletLink` type, table, `/wallet-link` +
   `/wallet-links`, profile resolution; tests pin the canonical-JSON bytes,
   the mix-and-match refusals, and rules 1–4.
3. **this repo**: sign builder + API + Profile UI (phases 1–2 of §6).
4. **pos-indexer**: follower expansion (phase 3), then stake aggregation
   (phase 4) once useful.

Nothing here blocks, or is blocked by, the Solana read-path work — only
step 1 is shared.

## What can go wrong, and why it doesn't

- **Claiming a wallet that isn't yours** (reputation theft, attaching a
  whale's book to your handle): impossible — the member's own key must sign
  the member half.
- **Mixing halves** from two different link attempts: refused — the nonce
  must match and each half must name the other's exact address.
- **Replay** of an old link after an unlink: refused by `signedAt` skew
  (10 min, both halves), same as every write.
- **Handle squatting via link**: linking grants no handle — the handle
  stays where it was signed; rule 3 refuses ambiguity instead of resolving
  it silently.
- **A compromised member key**: can post as itself (as today) and can
  UNLINK itself — it cannot touch the profile, the handle, or other
  members, because those need the primary's key.
- **Sybil "proof"**: a link proves two keys cooperated once. It is identity
  for DISPLAY, and explicitly not a credential for ratings weight — a
  rating's weight stays per-author stake until phase 4 deliberately sums it.

## Open decisions

- **Should a primary be re-pointable** (move the profile to a new main
  wallet)? Not in v1: it is an unlink + relink of every member plus a fresh
  Profile signature from the new primary. Honest, if laborious; a `migrate`
  verb can come later if anyone actually hits it.
- **Cap on members per primary**: start with 10. Nobody legitimate needs
  more before we learn what the feature is used for.
- **Show links made elsewhere** (ENS, Farcaster via `social.identities`)
  beside signed links? Display-only candidates, clearly marked unproven —
  out of scope here.
