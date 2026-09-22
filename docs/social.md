# The social layer — YieldCircle as the yield FOMO

*Design, 2026-09-22. **Built** the same day — see §12 for what shipped, what
is deliberately still open, and what to verify before trusting it in prod.*

The premise: **fomo.family** is a social feed wrapped around a trading
terminal — a continuous stream of other people's buys, each with the trader's
one-line reason attached, a profile you can open, a follow button, a
leaderboard by PnL and a notification when someone you follow moves. The
conversion trick is that every row in the feed is one tap from the same trade.

YieldCircle already owns the *terminal* half (the catalogue and the ticket),
and `pos-indexer` already owns the *social* half (a cross-chain ledger of who
did what in which market, plus wallet-signed threads, profiles, reactions and
follows, both live and public). Almost nothing new has to be invented at the
infrastructure level. What has to be invented is the **unit of the feed**,
because a deposit is not a trade.

---

## 1 · What already exists

### This app (`yieldcircle`, 3.4 k lines, no backend)

| Piece | Where | What it gives the social app |
|---|---|---|
| Curated catalogue | `model/strategies.ts` | ~30 deposits + ~30 loops per asset, already risk- and size-filtered. **The set of things worth talking about.** |
| Strategy identity | `SimpleStrategy.earnUid`, `LoopStrategy.marketLongUid` / `marketShortUid` | the thread keys (see §6) |
| Your positions | `model/positions.ts` on `/v1/data/earn/positions` | the live path — stays live (pos-indexer's HARD RULE: never serve the connected user's own positions from the index) |
| Execution | `ui/Ticket.tsx` + `ui/useLadder.ts` | **copy-a-position in one tap, already written** |
| Cross-chain funding | `ui/GetAsset.tsx` | a copier who holds the wrong token on the wrong chain still converts |
| Routing | hash routes in `state/AppState.tsx` | every social object gets a URL for free |

### The data layer (`pos-indexer`, live and public, CORS `*`)

Positions API — **https://positions.1delta.io**

```
GET  /events/recent?follower=0x…&follow=wallets|markets|all&group=tx
GET  /events/recent?accounts=…&markets=…&chainId=&kind=&since=&group=tx
GET  /accounts/:account/events?group=tx        a wallet's moves, folded per tx
GET  /accounts/:account/flows?days=30          deposited / withdrawn / borrowed / repaid, USD
GET  /positions/:account                       NAV, per-position accrual, health inputs
GET  /markets/:uid                             what a market IS (name, lender, logo, rates)
GET  /markets/:uid/events?group=tx             the market's tape
GET  /markets/:uid/holders?side=&limit=        who is in it, biggest first
GET  /markets/:uid/flow?hours=&bucket=         in/out per hour or day
GET  /trending?window=1h|24h|7d&side=          markets by net USD inflow
GET  /vaults?held=1&provider=                  the vault book
```

Social API — **https://social.1delta.io**

```
GET  /threads/:kind/:key         kind ∈ market | event | wallet | position
POST /counts   {subjects:[…]}    up to 1000 subjects in one call → 💬 badge per row
GET  /threads?limit=             recent threads anywhere
GET  /profiles/:account          profile + who they follow
GET  /follows/:account  /followers/:account
POST /write                      one endpoint; EIP-712 Message | Profile | Reaction | Follow | Delete
GET  /typed-data                 the domain + types, so a client never hardcodes them
```

Every row the positions API returns already carries what a feed card needs:
`lenderName` / `lenderLogo`, `marketName`, `symbol` / `assetLogo`, `amountUsd`
with a `usdStatus` that says how sure it is, `apr`, `blockTs`, and
`accountKind` / `accountLabel` (so `0xbeef0173…` renders as *"Steakhouse
Financial USDC"*, not as a whale). `group=tx` folds a four-leg loop into one
bundle with `netUsd`, `volumeUsd` and `kinds` — **that is the feed card,
pre-baked.**

The social schema (`0003_social.sql`) already has empty tables waiting for the
rest: `x_links`, `system_tags`, `alerts`, `notifications`, `copy_intents`,
`leaderboard_cache`.

---

## 2 · What does not port from FOMO

FOMO's loop runs on minutes: buy → feed → copy → PnL → leaderboard. Yield runs
on weeks. Three things break, and each break is the hint for what to build
instead.

| FOMO | Why it breaks on yield | What replaces it |
|---|---|---|
| A post is a **trade** | most days a deposit does nothing; a feed of deposits is a feed of nothing | a post is a **position**, which is alive: opened, added to, levered, harvested, closed — it keeps producing rows |
| The score is **PnL on a token** | yield PnL is a slow number nobody can screenshot credibly | the score is **realized yield**, and the index can prove it: `Δbalance − net flows` between two anchors |
| The pull is **missing the pump** | nothing pumps | the pull is **risk and rate drift**: "your health is 1.11", "the rate you copied fell to 3 %", "two people you follow just exited this market" |

The third row is the retention engine. It is also the thing a memecoin app
physically cannot have, because it needs a position index — which we have.

---

## 3 · The five inventions

### 3.1 The move card

One `TxBundle` from `/events/recent?group=tx` = one card. Never four legs.

```
┌──────────────────────────────────────────────────────────────┐
│ ◑ Amber Otter  ·  🔷 verified 4.2 % realized · 180d      2m  │
│   opened a loop                                              │
│   sUSDe / USDT  ·  Aave v3  ·  Ethereum       3.0×  +$24,100 │
│   “funding is positive again and the PT is expensive”        │
│   ♥ 12   💬 4                              [ Copy this ▸ ]   │
└──────────────────────────────────────────────────────────────┘
```

Everything on that card except the quoted line comes out of one request. The
quoted line is §3.2.

### 3.2 Comment at execution — *the central mechanic*

A yield app gets no comments if it waits for people to want to comment. It
gets comments if it asks at the one moment intent is maximal: **inside the
ticket, next to the confirm button.**

> *Say why (optional) — it shows on your position and in the feed.*

One extra EIP-712 `Message` signature, free, no gas, signed **before** the
transaction is sent and posted against the **position key**
(`chain|wallet|marketUid|side|posId`) — which the ticket can compute without
waiting for the indexer, unlike an event key (`chain:tx:logIndex:seq`) whose
`logIndex` nobody knows client-side. The feed then shows a position's latest
comment under that position's newest move.

This single mechanic delivers requirement (1) *"a strong set of options with
comments on them"* and requirement (2) *"comments on the respective
positions"* at once, and it needs no new server endpoint.

### 3.3 Copy is real, not a screenshot

FOMO's copy = buy the same token. Ours = **open the same strategy at your
size**, and the ticket already builds it.

```
feed card → marketUid / earnUid → find the catalogue Strategy → go('#/USD?u=USDe&s=<id>&k=loop&copy=<wallet>')
         → Ticket opens prefilled, leverage tier matched to theirs, banner:
           “copying Amber Otter's sUSDe / USDT loop · they are at 3.0×”
```

When the catalogue has no row for it (an old market, a risk-5 venue, a chain
we do not list) the card says so plainly and links the market page instead.
`social.copy_intents` records the click, so "47 copied this" becomes real
social proof rather than a vanity metric.

### 3.4 Verified yield, and badges you cannot buy

The leaderboard metric is **realized yield**, and the index's anchor + ledger
design computes it without an index series: `realized = Δbalance − net flows`
between two anchors. A wallet's number is therefore *checkable by anyone* —
and that is the entire pitch against every screenshot-based crypto-social app.

The same ledger mints **earned badges** into `social.system_tags`:

| Badge | Derived from |
|---|---|
| `held-180d` | oldest un-exited position row |
| `never-liquidated` | no `liquidated` kind on any position |
| `early` (per market) | in the first 100 depositors — `/markets/:uid/holders` + `market_first_seen` |
| `size` tiers | lifetime deposited USD from `/accounts/:account/flows` |
| `survived` | held through a week the market lost > 30 % TVL |

Self-claimed `tags` already exist on the profile; system tags are the
*unpurchasable* half, and they are what makes the character (§3.5) a status
object instead of a doodle.

### 3.5 The character

`pos-indexer` already gives every address a blockies grid and a two-word name
(`apps/ui/src/lib/identity.ts` → *"Amber Otter"*). That is an ops tool's
identity, not a social app's. Port the **name** verbatim (it is good, and
cross-client determinism matters) and replace the **face**.

- A layered inline-SVG character: `backdrop · creature · eyes · mouth ·
  accessory · palette` (say 12 · 16 · 8 · 6 · 10 · 12 ≈ 1.1 M combinations).
  No images, no uploads, no hosting, no moderation, no requests — the same
  discipline as the blockie, but it reads as a character.
- The default is **derived from the address**, so an un-profiled wallet in the
  feed still has a face and the feed is legible from day one.
- Customization is a **spec string**, `yc1:b3.c7.e1.m4.a2.p9`, signed into the
  existing `Profile.avatarUrl` field. Reuse that field rather than adding one:
  changing the `Profile` EIP-712 type changes its struct hash, and every
  profile signature already stored was made against the current shape.
- Some layers are **gated by a system tag** (a diamond backdrop for
  `held-180d`, a shield for `never-liquidated`). Any client can render any
  spec; the server marks the profile `verified: false` when a gated layer is
  not earned, and the UI shows it hollow. Cheap, and it is the whole status
  game.

---

## 4 · Screens

```
 #/              THE HOME.  pulse · Yours · HOT RIGHT NOW · the stream
 #/explore       the catalogue: every asset, every strategy, what it pays
 #/feed          the full feed.  Following | Everyone | My markets
                 move cards · 💬 · ♥ · Copy · infinite scroll on `since=`
 #/              EXPLORER — unchanged, plus a 💬 count and "3 you follow are in this"
                 on every asset row
 #/USD?u=USDe    ASSET PAGE — unchanged, plus per-row 💬 count (one POST /counts for
                 the whole list) and a "holders" strip under the selected row
 #/USD?…&s=…     TICKET — unchanged, plus: the market's thread, its 5 biggest holders
                 with faces, and "Say why" beside the confirm button
 #/w/0x…         WALLET — character, badges, X, NAV, realized yield, flows chart,
                 open positions with health, the tape, Follow
 #/m/<uid>       MARKET — the tape, holders, flow, thread.  (`/markets/:uid`)
 #/board         LEADERBOARD — realized yield 24h | 7d | 30d | all, by group
 #/me            PROFILE EDITOR — character picker, handle, bio, tags, link X
 #/alerts        NOTIFICATIONS
```

Every one is a hash route, so `state/AppState.tsx` grows two segments (`w`,
`m`) and nothing else changes.

---

## 5 · Where the code goes

Build it **here**, in `yieldcircle`. `pos-indexer/apps/ui` is explicitly the
ops page, not the product; both its services are already public with `CORS *`,
so a static Pages app talks to them straight from the browser and no new
backend is needed for anything but X (§7).

Mirror the existing boundaries — `sdk/` is the 1delta allocator API, so:

```
src/
  sdk/            unchanged — the allocator (catalogue, positions, actions)
  index/          NEW  api.ts + queries.ts + types.ts   → positions.1delta.io
  social/         NEW  api.ts + queries.ts + typed.ts   → social.1delta.io
                       sign.ts (wagmi signTypedData + burner fallback)
  identity/       NEW  name.ts (ported verbatim), character.tsx (new)
  ui/Feed.tsx  ui/Wallet.tsx  ui/Market.tsx  ui/Board.tsx  ui/Thread.tsx
      ui/Profile.tsx  ui/Character.tsx  ui/bits: Face, Badge, Follow, SayWhy
  config/backend.ts  + VITE_INDEX_BASE_URL, VITE_SOCIAL_BASE_URL
```

**Port, never import.** `pos-indexer/apps/ui` is React 19 + Tailwind v4 +
daisyUI + TanStack Router-ish tabs; this app is hand-written CSS and a hash
router. Copy `identity.ts` (150 lines) and read `ThreadDrawer.tsx` (418),
`signer.tsx` (242) and `ProfileDialog.tsx` (163) as *reference implementations
of the protocol*, then write them in this app's idiom. Same rule
`pos-indexer/CLAUDE.md` applies to `~/position-indexer`.

---

## 6 · The join — uids (read this before writing any code)

This is the only real unknown, and everything social hangs off it.

**Loops are already joined.** `pos-indexer`'s `createMarketUid` is a *port* of
lending-sdks' function — `<lender>:<chainId>:<ref>` with `ref` lower-cased —
so the optimizer's `marketLongUid` / `marketShortUid` in this app are
byte-identical to the index's `market_uid` and to the social thread key. A
comment written on a loop row here is the same thread the ops UI shows.
✅ no work.

**Deposits are not.** A `SimpleStrategy` carries an `earnUid` from
`/v1/data/earn`, which spans lending markets *and* vaults / LSTs / PTs. The
index keys a vault `vault.<provider>:<chainId>:<address>` (the `vault-fill`
job) — a different namespace. Two consequences:

1. Write `model/uid.ts`: `earnUid → index uid`, resolved **by (chainId, token
   address)**, which both sides have. Lending-market earn rows should already
   fall out as `<lender>:<chain>:<underlying>`; vault rows map to the
   `vault.*` uid. *Verify this against live data before building on it* —
   dump 50 earn rows per chain and diff against `GET /vaults` and
   `GET /markets/:uid`.
2. **`INCLUDE_VAULTS=1` must be on in prod.** Without it the index drops every
   `vault.*` lender key at roster load, and most of this app's deposit menu
   (sUSDe, syrupUSDC, wstETH, PTs, curated vaults) has no rows, no holders and
   no threads. Budget: ≈ +50 k ledger rows/day.

Position keys for the social thread are
`chainId|wallet|marketUid|side|posId`, `posId` = `''` except on Euler
(sub-account index) and Dolomite (account number) — `subAccountPosId` in
`position-events/src/util.ts` is the definition. For v1 the ticket writes
`posId: ''`, which is correct for every family this app can open a position in
today.

Chains: this app offers 1 / 8453 / 42161 / 56; the index follows those plus
43114. Full overlap, nothing to reconcile.

---

## 7 · Linking X

X ended free API access for new developers on **6 February 2026** and moved to
pay-per-use: roughly **$0.010 per user read**, no monthly minimum. So "sign in
with X" is no longer free, and it needs a developer app and a client secret
that a static site cannot hold.

There are two ways in, and the default is the one that costs nothing.

### The free one: the holder says it in public

```
1  the wallet signs  XLink { author, nonce, action }        ← "this address consents"
2  the holder posts  "Linking my wallet 0x… on YieldCircle. yc-a1b2c3"
3  they paste the post's url
4  the social service reads the post back through
   https://publish.x.com/oembed  — documented, unauthenticated, free —
   and stores the link only if the post quotes BOTH the address and the nonce
```

Two independent proofs meet: only the address's key can produce the signature,
and only the X account's owner can post from it. Neither half is enough alone
and neither can be forged with the other's material. The nonce is what stops
an old post about the same wallet being replayed.

The service fetches the post itself and never believes the client about what
it says, and it takes the handle from oEmbed's `author_url` rather than from
the url that was pasted — so pasting someone else's post links *their* handle,
not the one you typed, and the content check then fails anyway.

**What it does not buy:** X's stable numeric id. oEmbed names the handle, so a
rename breaks the link and the proof is the post staying up. The row records
`method = 'post'` and keeps `post_url` so it can be re-checked. Protected
accounts cannot be verified this way — oEmbed will not serve them.

### The paid one: OAuth, when the numeric id is worth a cent

`worker/x-link` still implements OAuth 2.0 + PKCE against a Cloudflare Worker
holding the client secret, calling `GET /2/users/me` in the user's own
context and handing both halves to `POST /x-link` under a shared secret. It
stores `method = 'oauth'` and X's numeric id, which survives a rename. Set
`VITE_XLINK_URL` and `XLINK_SECRET` to enable it; without them the app uses
the free path and says nothing about OAuth.

> A third option exists and was not taken: OAuth **1.0a** ("Sign in with
> Twitter") returns `screen_name` and `user_id` in the access-token response
> itself, so it never calls a billed endpoint. It would give the numeric id
> for free — but it still needs an approved developer app, and X's own docs
> page for it now answers `402 Payment Required`, which is not a foundation to
> build on. Worth revisiting if an app already has 1.0a enabled.

## 8 · The three things that will go wrong

**Cold start.** Zero comments on day one, and an empty feed kills a social app
faster than a bad one. Mitigations, in order of value: (a) the feed is
*already full* without any humans — it is the on-chain tape, and the move card
is interesting on its own; (b) seed system-generated cards the index can
justify ("first deposit into this market", "largest deposit this week", "a
holder exited 40 % of a market you follow"); (c) comment-at-execution (§3.2)
converts the people who are already transacting, which is the only reliable
comment supply a yield app has.

**Noise and sybils.** Already half-solved: `author_stake` is read from
`idx.positions` at write time, so the API knows whether a commenter actually
holds the position they are talking about. Rank and badge on it — *"holds
$24 k here"* next to a comment is a primitive FOMO does not have. Writes are
rate-limited to 20 per 600 s per address.

**Privacy.** The chain is public and the index is public, so a wallet page is
publishable whether or not its owner wants it. The honest posture, and the one
to state in the UI: *reading anyone is possible because the chain is;
appearing as a person — name, face, badges, leaderboard rank — requires a
signed profile, and nothing else.* Decide explicitly whether an un-profiled
wallet may appear on `#/board` (recommended: no) and whether
`Profile.visibility = 'unlisted'` (already in the type) suppresses it
(recommended: yes).

---

## 9 · What `pos-indexer` owes this app

Numbered so they can be filed as tickets there.

1. **`INCLUDE_VAULTS=1` in prod** + the earnUid ↔ index-uid map verified
   against live data. *Blocks: every deposit row's thread, holders and
   comment count.* §6.
2. **`POST /profiles` (batch)** on the social API. A feed page needs 50
   profiles and today that is 50 requests. `/counts` already proves the
   pattern. *Blocks: the feed at acceptable latency.* Small.
3. **Realized-yield rollups** — `position_daily` / `account_daily`, already
   open item 6 in `pos-indexer/CLAUDE.md` → `social.leaderboard_cache` →
   `GET /leaderboard?window=&group=`. *Blocks: `#/board` and the verified
   number on every profile.* Until it lands, `#/board` ships as "most active /
   biggest net inflow" off `/trending` + `/accounts/:a/flows` and **must say
   so on the page** — never label a proxy as yield.
4. **`system-tags` job** — the badges in §3.4, plus `GET /tags/:account`.
   *Blocks: earned character layers.*
5. **`XLink` typed data + the OAuth worker** (§7).
6. **Alerts / notifications** — `social.alerts` + a job. v1 of `#/alerts` can
   be computed client-side from `/events/recent?follower=…&since=<last seen>`,
   so this is not a blocker, only the difference between an in-app badge and a
   push.
7. Nice-to-have: `GET /events/recent` accepting `kind=` lists and a
   `minUsd=` floor, so the feed can drop dust without fetching it.

---

## 10 · Phases

| Phase | Ships | Depends on |
|---|---|---|
| **P0 · plumbing** | `index/` + `social/` sdk modules, `sign.ts`, ported `autoName`, two env vars | — |
| **P1 · the spine** | 💬 counts on every catalogue row · thread panel in the ticket and on the asset row · character + profile editor · follow buttons · `#/w/0x…` and `#/m/<uid>` | owed #1 for deposits |
| **P2 · the app** | `#/feed` with Following / Everyone · **comment at execution** · **Copy this** · holders strips | owed #2 |
| **P3 · the game** | `#/board` · earned badges and gated layers · X link · `#/alerts` | owed #3, #4, #5 |

All four are built. P1 is still the honest MVP if any of it has to be rolled
back: it makes every strategy in the menu a place where people talk, and it
runs against endpoints that were already live.

---

## 11 · Open questions for the product owner

1. **Is the feed global or curated?** Everything the index sees is ~19 k
   rows/day on Ethereum alone. Recommendation: the default tab is *Everyone
   but only the catalogue's markets* — the same curation that already decides
   what this app will let you open. It keeps the feed on strategies a reader
   can act on in one tap.
2. **Un-profiled wallets on the leaderboard** — yes or no (§8).
3. **Does the character earn or is it bought?** Earned-only is the
   recommendation; it is the one status economy that costs nothing to run and
   cannot be farmed.
4. **Does "copy" mean the same strategy or the same *size ratio*?**
   Recommendation: the same strategy and the same leverage tier, your own
   amount. Mirroring size is a promise about someone else's balance sheet.


---

## 12 · What shipped

Built 2026-09-22, in both repos, verified against a local stack and a
headless browser driving a real EIP-712 signer.

### In `yieldcircle`

```
src/index/       types · api · queries          → positions.1delta.io
src/social/      types · api · queries · sign   → social.1delta.io
src/identity/    name.ts (ported) · character.tsx
src/model/uid.ts the join
src/ui/          Feed · Wallet · Market · Board · Profile · Alerts
                 Thread · SayWhy · TicketSocial · social-bits · useMenu
worker/x-link/   the OAuth worker
```

The ticket gained three things and lost none: a **copy banner** when it was
opened from a feed card, **Say why** beside the confirm button and again after
the last transaction lands, and **who else is in it** + the market's thread
under the numbers. The asset page gained a **Talk** column — one `POST /counts`
for the whole list, whatever its length.

### In `pos-indexer`

| What | Where |
|---|---|
| `POST /profiles` — batch, ≤ 200 | `packages/social` (owed #2) |
| `XLink` typed data + `POST /x-link` | `packages/social`, `XLINK_SECRET` |
| profile reads are account-driven | a wallet with badges but no signed name is no longer invisible |
| `idx.account_yield`, `idx.account_badges`, `idx.market_first_holder` | migration `0011` |
| `GET /leaderboard`, `GET /badges/:account` | `packages/indexer` (owed #3) |
| jobs `account-yield` (30 min) and `badges` (6 h) | `JOB_YIELD_MS`, `JOB_BADGES_MS` (owed #4) |

Realized yield is computed as the closed form in `0011`'s comment —
`units_now × (i1 − i0) + Σ Δunits_e × (i0 − i_e)` — valued through the
position's own `amount_usd / amount_raw`, so no decimals or price lookup is
needed and a row is valued in exactly the money the rest of the API uses.
Measured on the local ledger: $653 on a $882k Benqi position over 7 days,
3.86 % annualised, and monotonic as the window widens (48 h → $69, 96 h →
$281, 168 h → $653). A borrow leg's yield is interest paid, hence negative.

Badges minted on the same data: `held-180d`, `never-liquidated`, `early`
(first hundred into a market, from `idx.market_first_holder`), `size-whale` /
`size-large`. `never-liquidated` is *deleted* when it stops being true, which
is the only reason a badge is worth wearing.

### Four things the build changed about the design

1. **The execution comment goes on the MARKET, not the position.** A position
   key needs a `side`, and the index's side for a vault deposit (`share`) is
   not the one a client would guess (`supply`); a comment filed under a key no
   reader computes is a comment nobody sees. The market uid is the string all
   three systems provably agree on, and it puts the note where the next person
   choosing that strategy reads it — which is requirement (1) anyway. Feed
   cards still thread on the position key, because there both sides derive it
   from the same ledger row.
2. **`survived` was dropped.** It needed a TVL-drawdown history the rollups do
   not keep. The gated character layers are the four badges that can actually
   be minted.
3. **A tx bundle's `kinds` are `<side>/<kind>`** (`supply/deposit`), not bare
   kinds — `describeTx` parses both.
4. **Reactions come back as an object**, `{ like: 3 }`, not an array.

### Vaults: verified, and already on

Owed #1 is **closed**. Two facts settled it:

1. **The uid join is exact and needs no mapping table.** `/v1/data/earn`'s
   `earnUid` IS `<venue>:<chainId>:<ref>`, which is what
   `createMarketUid` builds and what `vault-fill` writes
   (`buildVaultEarnUid`). Checked against the live listing on all four
   chains: **842 rows, 0 mismatches**, vault rows included
   (`vault.savings:1:0xa3931…`).
2. **`INCLUDE_VAULTS=1` is already set on prod** and the `vault-fill` job is
   running — 558 vault markets on Ethereum, and `vault.savings`,
   `vault.morpho` and `vault.lst` rows in the live tape.

That matters more than it sounds: **393 of the 842 catalogue rows (47 %) are
vault-kind** — savings, Morpho and Euler Earn vaults, Pendle PTs, LSTs, GMX,
Upshift, Lagoon, Fluid, Lista. Without the flag nearly half the deposit menu
would have no holders, no tape and no threads.

Testing against prod caught the one bug a lending-only local index could not:
the ticket's holders strip asked for `side = 'supply'`, and a vault's holders
sit on the **`share`** side, so "who else is in it" was empty on every vault
in the menu. It now asks for every side.

### Still to verify before prod

- The 24 h board is empty on a deploy whose rate cache has not moved in a day.
  That is correct — no index movement, nothing earned — but it means the
  `rates` job must be healthy for the shortest window to say anything.
- The free X path depends on `publish.x.com/oembed` staying public and
  unauthenticated. It is rate-limited; at one call per link that is not a
  problem, but it is X's endpoint and X changes things.

### Not built

`social.alerts` / `social.notifications` and their delivery job. `#/alerts` is
computed in the browser from the following feed and a last-seen mark, which is
the useful half; the server half is what makes it arrive when the tab is shut.


---

## 13 · The home, and what "hot" means

*Added after the first build, 2026-09-22.*

The first version kept the catalogue as the home and put the social layer
beside it. That was wrong, and it is worth writing down why: **a table sorted
by the biggest number answers its question once.** "What pays most" has the
same answer tomorrow, so there is nothing to come back for. The social layer
was one tab away from a page with no heartbeat.

So `#/` now answers *what are people doing?* and the catalogue moved to
`#/explore`, one tap away and otherwise untouched. Three things on it:

**The pulse.** One line, one move, changing every few seconds. It is the
smallest possible proof that this is a live place rather than a listing, and
it costs nothing — it reads the stream's own query.

**Hot right now.** The important one, and the one with a real design decision
in it.

**The stream.** Deliberately not the feed. A feed card is something you *read*
— a face, a sentence, a reason, a Copy button. A stream row is something you
*notice*: one line, one verb, one number. A feed on a home page pushes
everything else below the fold; a stream leaves the page a shape.

### Heat is two numbers

Ranking markets by **volume** alone crowns whichever one a single whale passed
through this morning. Ranking by **frequency** alone crowns the dust — two
hundred $12 deposits. Both are worse than useless on a page whose job is to
tell someone where to look.

So a market's heat is the **geometric mean of its percentile on each**:

```
heat = sqrt( percent_rank(volume) × percent_rank(n_events) )
```

Scale-free — no constant to tune, no units to reconcile, and it survives a
chain where everything is a thousand times smaller. It reads as one sentence:
*as busy as the top X % of markets, and as big as the top Y %.* Because it is
a product, being extreme on one axis and absent on the other scores **zero**:

| market | volume | moves | heat |
|---|---|---|---|
| busy and big | $9m | 220 | **0.693** |
| busy and mid | $1.5m | 180 | 0.490 |
| quiet and big | $22m | 6 | 0.400 |
| one whale, one trade | $50m | 1 | **0.000** |
| dust spray | $12k | 400 | **0.000** |

The card shows both percentiles as bars *and* the raw evidence — `73 moves ·
32 wallets · $555k · +64 new` — so the ranking is checkable rather than an
opinion with a number attached. `+n new` is wallets that had never been in
that market before, which is the closest thing the ledger has to "this is
catching on".

Two refusals worth keeping:

- **A market the index has not valued never appears.** Heat needs volume, and
  an unpriced market has none — so it stays out rather than ranking as cold.
  The empty state says so, and offers the next window up rather than a dead
  end.
- **A row nobody can act on is not an option.** Hot rows are matched to the
  catalogue first; a market this app has no ticket for sorts below the ones it
  does, and says "not in the menu".

Served by `GET /hot?window=1h|6h|24h|7d` on the index
(`store.hotMarkets`), which returns every component of the score.
