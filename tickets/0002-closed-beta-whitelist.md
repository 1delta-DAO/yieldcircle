# 0002 — Closed beta: a wallet whitelist at the edge, a waitlist that markets itself

- status: open
- created: 2026-10-02
- area: `gate/` (new, the app worker's `main` script), `src/ui/` (one gate
  screen), `scripts/whitelist.mjs` (new), `pos-indexer` (one badge row)
- depends on: nothing new. The app already deploys as a Cloudflare Worker with
  static assets (`docs/deploy.md`), already operates a Worker + KV (`worker/x-link`), already
  signs EIP-712 (`src/social/sign.ts`), and the free X-post verification
  mechanic already shipped in `pos-indexer` (`packages/social/src/xVerify.ts`).

## Goal

Launch as a **closed beta**: only whitelisted wallets get the app; everyone
else gets a waitlist page that is itself the marketing. Minimal effort, no new
accounts system, no emails, no new infrastructure beyond what the repo already
uses.

## The analysis — where can a gate even live?

The app has no backend of its own; all three services it reads are **public by
design** (CORS `*`, no keys) and shared with other consumers. So:

1. **The data cannot be gated and should not be.** Anyone can curl
   `positions.1delta.io` today. The beta gate is a velvet rope around the
   *product*, not a vault around the data — and that is exactly right for the
   goal, which is hype, not secrecy.
2. **Identity is the wallet, so the whitelist is a set of addresses.** No
   emails, no OAuth, no sessions to invent. Proving you own a whitelisted
   address is one signature, and every piece needed for that — connect flow,
   signing, signature recovery with viem — is already in the stack.
3. **The gate goes at the edge, in the same deploy.** The app is a Worker
   serving `dist/` as static assets; give it a `main` script with
   `assets.run_worker_first = true` and KV/D1 bindings, and that script runs
   in front of **every** request, static assets included — so a
   non-whitelisted visitor never receives the app bundle at all. That is a
   real gate, unlike a client-side check that anyone opens devtools around
   (and someone *would*, in a quote-tweet, on launch day).

The rejected alternatives, for the record: **client-side-only gate** (hours of
work, but publicly bypassable — fatal for a gated launch); **Cloudflare
Access** (gates by email, wrong identity for this audience); **gating the
backends** (they are shared services and the whole social design assumes
public reads); **a waitlist SaaS** (an email list when the product's identity
is an address, plus a vendor).

## The design

### Tier 1 — the gate (ship first, ~1–2 days)

```
gate/                the app worker's `main`, routing by path:
  index.ts           no valid cookie → serve the waitlist page; let
                     /gate/*, the waitlist assets and og images through;
                     otherwise env.ASSETS.fetch(request)
  verify.ts          POST { address, signature } of "YieldCircle beta <nonce>"
                     → recover signer (viem runs in workers) → KV wl:<addr>
                     exists → Set-Cookie: HMAC-signed `addr.exp`, HttpOnly
  join.ts            POST { address, signature, ref? } → D1 waitlist row
                     → { position, total }
```

- **Cookie, not per-request KV.** The cookie is `address.expiry.hmac` signed
  with a worker secret — the middleware verifies it with one HMAC, zero reads.
  Revoking the whole beta = rotate the secret.
- **KV for the whitelist** (`wl:<address>` → `{ source, ts }`), because it is
  a membership test. **D1 for the waitlist**, because a waitlist wants a
  count, a position, dedupe and a CSV export, and a one-table D1 gives all
  four for free (KV can do none of them well).
- **Admin is a script, not a UI.** `scripts/whitelist.mjs add 0x… --source
  team` wrapping `wrangler kv key put`, plus `promote N` (move the next N
  waitlist rows into the whitelist) and `export`. Nothing to host, nothing to
  secure beyond the wrangler login already used to deploy.
- The waitlist page is served *by the middleware* at the same origin — connect
  wallet, sign, see **"You're #412 of 2,381"**. One screen, this app's idiom.
  Signing (not just typing an address) is what makes every row a real key
  holder rather than a pasted ENS dump.
- The gate blocks everything, `?as=0x…` read-only mode included. One door.

### Tier 2 — the hype mechanics (~1–2 days, after the gate works)

Three mechanics, in order of value per effort:

1. **Invite codes.** Every whitelisted wallet gets 3 codes, **derived, not
   stored**: `code_i = base32(HMAC(secret, addr|i))[0..7]`, shown in-app. Only
   *redemptions* are stored (D1: code, redeemer, issuer — an issuer the
   middleware can recompute from the code). Redeeming whitelists the new
   wallet instantly and records who brought them. Scarcity plus a personal
   grant is the entire growth loop of every gated beta that worked; an
   inviter leaderboard falls out of the table for free later.
2. **Post on X to skip the line.** The waitlist page offers: post
   *"On the @YieldCircle waitlist at #412 · yc-〈nonce〉"*, paste the URL, and a
   gate function reads it back through `publish.x.com/oembed` — documented,
   unauthenticated, free, and **already implemented** in pos-indexer's
   `xVerify.ts` (port the ~40 lines, don't call the social service for this).
   Post verifies → instant whitelist (or a capped daily quota of skips, which
   is better theatre). Every verified skip is an ad with a scarce number in
   it, and the count of *verified posts* is the sybil-resistant metric to
   quote — waitlist wallet counts are free to inflate, posts are not.
3. **The permanent `beta` badge.** One row-source in pos-indexer's existing
   `system_tags` job (the whitelist CSV is the input) → a gated character
   layer per social.md §3.4–3.5. Unpurchasable, visible on every comment the
   wallet ever writes, and it converts "beta access" from a temporary key
   into **permanent status** — which is the actual reason people chase
   whitelists. Half a day, in the other repo.

### Tier 3 — make the waitlist page worth screenshotting (opportunistic)

The index is public, so the waitlist page can show the **live pulse** (the
one-line stream the home already renders) behind the gate copy: *this place is
already moving, you just can't act yet*. Reuse the existing component; the
teaser costs one query that is already written. Add the signup counter and an
og-image, and the page shares itself.

## Launch playbook (zero code)

- Seed the whitelist by hand: team, friendly curators, the loudest wallets
  from the index's own leaderboard (they can be *named* in the invite — "you're
  one of the 100 largest depositors in markets we list").
- Admit in **waves** (`promote 100`), not a trickle — each wave is an
  announcement, and codes from wave N recruit wave N+1.
- Quote only verified-post numbers publicly.

## What this deliberately does not do

- **No pretence of data secrecy.** If asked, say it plainly: the chain and the
  index are public; the beta gates the terminal. Honest, and nobody can
  "leak" what is already public.
- **No sybil arms race.** Wallets are free; the waitlist count is theatre and
  is treated as such. The costly signals (signature, X post, invite from a
  member) are the numbers that matter.
- **No accounts, no emails, no sessions beyond one HMAC cookie.** The day the
  beta opens, drop `main` from `wrangler.toml` and the app is exactly what it
  was.

## Deploying

[`docs/deploy.md`](../docs/deploy.md). The gate's `main`, `run_worker_first`
and `WHITELIST` binding are already in the root `wrangler.toml`, commented;
`GATE_SECRET` is a Secret on the `yieldcircle` project.

## Tasks

1. `gate/index.ts` + `verify.ts` + cookie HMAC; uncomment the gate lines in
   `wrangler.toml`.
2. Waitlist screen (gate mode of the SPA or one static page) + `gate/join.ts`
   + D1 table + position number.
3. `scripts/whitelist.mjs` — add / promote / export.
4. Invite codes: derivation, redeem endpoint, "Your 3 codes" surface in-app.
5. X-post skip: port `xVerify.ts`'s oEmbed check into a gate function.
6. pos-indexer: `beta` system tag from the whitelist + one gated layer.
7. Waitlist page dressing: pulse teaser, counter, og-image.

Tier 1 (tasks 1–3) is a shippable closed beta on its own. 2 is the honest MVP
of the hype loop; 4–7 are each independently droppable.
