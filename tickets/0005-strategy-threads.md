# 0005 — Strategies you can talk about, not just transactions

- status: implemented 2026-10-06, gated on the social service's deploy
  - pos-indexer (uncommitted there): `packages/social` `strategyKey.ts`,
    `strategy` subject + follow target, `loopStake`, `GET /messages/recent`,
    `GET /accounts/:a/messages`, `POST /latest`, `/typed-data` lists
    `subjectKinds`/`followTargetKinds`; migration `0060_messages_recent.sql`;
    follow expansion in `position-store` `evmFollowTargets` and
    `sol-indexer/src/social.ts`. Tests: `strategyKey.test.ts`,
    `followTargets.test.ts`, `scripts/e2e-strategy.mjs` (24 checks, local
    stack). Typed-data digests unchanged.
  - here: `threadOf`/`loopKey` (`model/uid.ts`), `useThreadOf`,
    `useRecentMessages`, `useAccountMessages`, `useLatest`; ticket thread
    first + Follow; row 💬 → `talk=1`; feed Talk tab (`ui/Talk.tsx`); quoted
    reason on move cards; wallet "Said"; `Stake` reads the stored object.
  - the app switches loops to their own thread by itself once `/typed-data`
    lists `strategy` — no flag to flip.
  - not built: Home stream rows (the stream was folded into the feed; Talk is
    that surface now).
  - the actual routes differ from the plan below: a wallet's comments are
    `GET /accounts/:a/messages`, and `POST /latest` was added for the quoted
    reason.
- area: pos-indexer `packages/social` + this app's ticket, Earn rows, feed, wallet page
- depends on: nothing new upstream. `Message.subjectKind` is a `string` in the
  EIP-712 type, so a new subject kind is additive: no struct hash changes and
  no stored signature is invalidated.

## Symptom

You can already comment on a strategy, but it doesn't feel that way:

1. **A loop has no thread of its own.** `uidOf(s)` sends a loop's comments to
   its *collateral market* (`marketLongUid`). sUSDe/USDT on Aave, sUSDe/USDC
   on Aave and "lend sUSDe on Aave" all share one thread, and the debt leg
   (the half that makes it a loop) plays no part. "Say why" on a loop is filed
   under a market, not under the strategy the user just opened.
2. **The thread is hidden.** In the ticket it is a collapsed toggle at the
   very bottom, under "Who else is in it" ("Be the first to say something…").
   The 💬 on an Earn row opens the **market page**, not the strategy's thread.
3. **Comments surface only as transaction comments.** Feed cards thread on the
   position key. Strategy and market comments appear in no stream, so nobody
   ever comes across one by browsing.

Live state: `GET social.1delta.io/threads?limit=200` returns 1 thread holding
3 messages (a wallet thread). Nothing needs migrating.

## The model

**A strategy's thread** = what you would open again, independent of size and
leverage:

| strategy | subject | key |
|---|---|---|
| deposit | `market` (unchanged) | its earn uid = market uid. A deposit IS one market, so its thread stays shared with the market page. |
| loop | **`strategy`** (new) | `loop:<longUid>\|<shortUid>`. Both uids are canonical `createMarketUid` output. `\|` never occurs in a uid (the position key already splits on it). |

The `loop:` prefix leaves room for later shapes (`pt-loop:`, a multi-leg
vault) without a new kind each time. Leverage tier and fixed term are **not**
part of the key: they are parameters of one strategy, not different ones.

One function owns the mapping on the client: `threadOf(s): { kind, key }` in
`model/uid.ts`. Every surface calls it: ticket, Say why, row counts, feed. That
way none of them can drift back to `uidOf`.

## Backend — pos-indexer `packages/social`

1. **`typedData.ts`**: add `'strategy'` to `SUBJECT_KINDS`, plus
   `STRATEGY_KEY` and `parseStrategyKey(key) → { shape, legs[] } | null`.
2. **`index.ts` `/write` → `Message`**: refuse a `strategy` key that does not
   parse, whose two legs are on different chains, or that is **not
   canonical** (EVM ref not lower-cased). Refuse rather than rewrite: the
   signature covers the key, so the stored key must be the signed one. The
   `Reaction` case already accepts any `SUBJECT_KINDS` member.
3. **Stake (`db.ts`)**: `SocialDb.marketOf` stays for `market`/`position`. Add
   `db.loopStake(author, long, short)`: the author's `idx.positions` rows on
   both uids, paired on `pos_id`. Store
   `{ kind: 'loop', netUsd, collateralUsd, debtUsd, legs: 2 }`. With only the
   collateral leg, store the plain market stake plus `legs: 1`, which is shown
   but not labelled "in this loop". `author_stake` is already `jsonb`, so no
   migration is needed.
4. **`GET /messages/recent?kinds=&chainIds=&protocols=&before=&limit=`**: the
   latest top-level messages with their subject, author and stake, newest
   first, cursor on `received_at`. Take the chain and protocol filters from
   the key (`split_part` on the first leg's uid, `protocolKeyOf` SQL twin), so
   they agree with the feed's chips. This is the one new read the feed needs.
   Uses the existing `messages_subject` index plus one on `received_at` for
   the unfiltered case.
5. **`GET /messages?author=`**: a wallet's own comments for its page. Small.
6. **Follow a strategy** (phase 3): `checkFollow` accepts `targetKind:
   'strategy'`, and `/events/recent?follower=` expands a followed loop into
   its two market uids. Follow's `targetKind` is also a string, so this is
   additive too.
7. **Tests**: `ops`/envelope cases for the new kind (good key, unparseable,
   cross-chain, non-canonical); the pinned digests in `typedData.test.ts` must
   **not** change; a `loopStake` case on the local stack; `e2e` posts a loop
   comment and reads it back through `/threads/strategy/:key`, `/counts` and
   `/messages/recent`.

Ratings are left out on purpose. A claim is about a contract (a market, an
asset, a curator), and a loop's risk is already its two markets' ratings.

## Frontend — this app

**P1: a strategy has a thread, and you can see it**
- `model/uid.ts`: `threadOf(s)`. `SubjectKind` gains `'strategy'`.
- `SayWhy`: takes `{ kind, key }` from `threadOf`. A loop's "Say why" lands on
  the loop.
- `TicketSocial`: **the thread goes first** and stays open, with the two
  latest comments visible and the composer below them. "Who else is in it"
  moves under the thread. On a loop, a quiet "N more on the sUSDe market ›"
  links to the collateral market's thread, so older market talk stays
  reachable.
- Earn rows (`AssetPage`): counts come from `threadOf`. 💬 opens the **ticket
  with the thread focused** (`go(group, { u, s: id, c: '1' })`), not the market
  page. `c=1` scrolls the drawer to the thread.
- `social-bits` `Stake`: renders the loop stake ("in this loop · $24k net").

**P2: comments you come across**
- `social/api.ts` + `queries.ts`: `recentMessages(...)` and a
  `useRecentMessages` hook with the same filter params as the feed.
- **Feed: a "Talk" segment** next to Following / Everyone / My markets: one
  card per comment, showing the strategy it is about (resolved through the
  catalogue, like Copy), the author with their stake, and a one-tap **Open
  strategy**. A comment on a strategy the menu doesn't carry links to the
  market page, as Copy does.
- Feed cards (transactions): when the card's strategy has a newer comment than
  the card itself, show it as the quoted line. The position thread keeps
  replies.
- Home stream: a "said" verb row now and then (one line: face · "on
  sUSDe/USDT loop" · first 80 chars). This is how comments show up between
  moves without a new tab on Home.
- Wallet page: a "Said" list (`/messages?author=`).

**P3: following a strategy**
- A Follow button in the ticket header (queued like other follows, signed in
  the batch, §17). Its moves and comments arrive in Following and `#/alerts`.

## Acceptance

- Two loops on the same collateral market show separate threads. A comment
  written via Say why on one appears only there, with a `legs: 2` stake when
  the author holds the loop.
- A deposit's thread is the same thread as its market page, as today.
- Every Earn row's 💬 count matches the thread the ticket opens.
- The Talk feed respects the chain and protocol chips and paginates.
- `typedData.test.ts` digests are unchanged. A client on the old build still
  posts and reads `market` threads.

## Rollout

The backend goes first and is harmless alone: a new kind nobody writes yet.
Gate the client on `/typed-data` or a `/health` field listing
`subjectKinds`, the same pattern as `Batch` (§17). An old service then keeps
the loop on its collateral market instead of failing the write.
