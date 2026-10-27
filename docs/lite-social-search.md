# Lite: search and the social layer, closer to fomo

**Status:** built 2026-10-27, all six pieces. What the build changed is in
[As built](#as-built) at the end. Builds on
[`lite.md`](lite.md) §8 (the broad fomo study, 2026-10-23) and
[`social.md`](social.md); this note looks only at **how fomo does search and
social**, and what Lite would need to match it.

## 1. The short answer

fomo's social layer isn't a tab. It shows up on every surface: the coin
page lists who holds it, the feed quotes why they bought, the search finds
people as well as coins, and a profile shows everything someone holds. Lite
has the parts (follows, comments at execution, holders, wallet PnL, the
board, a full search), but most of them are only in Pro, or only show up once
you already follow someone.

Five changes would close most of the gap:

1. **A search pill in Lite's tab bar** that finds *things to earn* and *people*, and nothing else.
2. **"Who's in it" on the Lite ticket**: faces, what each earns, people you follow first, and their reasons.
3. **A Lite profile page** (`#/lite/w/<addr>`) that every face, search hit and board row opens.
4. **A social Home for a new user too**: "Following / Everyone" over the moves list, so a reader with no follows still sees people.
5. **The reason on the move.** The comment a mover signed at execution is shown on their move card in Lite.

## 2. What fomo does (sources at the end)

| Surface | fomo |
|---|---|
| **Navigation** | Five tabs: Home · Search · Feed · Friends/Leaderboard · Profile. Since the Nov 2025 redesign the **search bar is part of the tab bar** (a "liquid glass" bar, the iOS 26 pattern where search sits as its own pill at the end). Alerts open from the top-left. |
| **Search** | One box for "anything on the app": coins by name, ticker or contract address, **and user profiles by name** (X handle). You can send to someone straight from a search result. Third-party docs describe the people results as handle + wallet + PnL. Search is also how you narrow coins, because the coin lists have almost no filters. |
| **Home** | Discovery with three filters (verified · trending · most held, later "crypto" + gainers). Share cards for wins and fumbles. |
| **Coin page** | **Which fomo users hold it, each up or down, and their thesis.** Since Jan 2026 each coin has its own feed of buys, sells and theses. Comment threads sit under the chart (replies since Dec 2025, likes since Nov 2025). |
| **Feed** | "Twitter for trades": real buys and sells with live PnL. Theses show on the cards, with the trader's PnL and balance (global feed, Feb 2026). A **Following toggle** (Oct 2025) and a Friends feed (Sep 2025). Daily summaries. |
| **Profile** | Balance, open and closed positions, a portfolio chart over several timeframes, volume, followers/following, **mutual followers**, average hold time. Buttons: Follow, notify me on their trades, Send. |
| **Friends / Leaderboard** | Returns over 24h / 7d / all time, one ranking across all chains. Find friends by X. |
| **Alerts** | Push when someone you follow buys ("apes in"), plus a list of their buys and sells. |

Across all of these, a face sits next to every number, every face opens a
profile, and every profile leads to something you can buy.

## 3. Where Lite is today

| fomo surface | Lite now | Gap |
|---|---|---|
| Search in the tab bar | **None.** Lite's frame removes Pro's `Search` (`Shell.tsx`: `lite ? <span className="sp" /> : <Search />`). The phone app's top bar has Pro's search (`mobile/src/ui/TopBar.tsx`). | No way to find a person, or "USDC", without scrolling. |
| Coin page: holders + theses | The Lite ticket returns before `TicketSocial` (`Ticket.tsx:78`), so it has **no "who else is in it" and no "what people say"**. `SayWhy` still asks for a reason at confirm, because `Action` is shared. | Lite asks people for a reason but never shows the reasons anywhere in Lite. |
| Feed with theses | `FollowedMoves` on Home and You: who, the verb, what, how much, Copy. It **renders nothing when you follow no one**, and shows no comment. | A first visitor sees no people except the one face on each card. |
| Following toggle | none (followed only) | |
| Profile | The board's wallet sheet (`LiteBoard.tsx`: positions, what each made, Copy, Follow, a link to Pro's wallet page). Faces on cards open **Pro's** `walletHref`. | No Lite profile page. A face takes you out of Lite. |
| Mutuals, followers | `api.followers` exists; Lite doesn't use it. | |
| Leaderboard | `#/lite/board`, ranked by rate on all money, with a "People you follow" filter | At parity. Our ranking is better: by yield, not price moves. |
| Alerts | the followed-moves list; no bell in Lite | Fine on web. Push is a mobile question. |
| Share | a share link for any position (a Copy link) | No image card (lite-plan "As built" 12) |

The data for every gap already exists: `useHolders` (who holds a market),
the thread and `useCounts` (comments), `POST /latest` (a mover's own newest
comment), `useProfiles`, `useMyFollows`, `api.followers`, `/find` and the
catalog (`Search.tsx`), the strategy proofs, and the index's PnL book. **This
is mostly a UI job. No new endpoint is needed** except possibly §4.3's
follower counts in bulk.

## 4. Proposal

### 4.1 Search, in the tab bar

**Where it goes.** A round search button to the right of Lite's three tabs,
the way fomo and iOS 26 do it, not a fourth tab. This keeps the bar within
the five-slot maximum. On desktop it is a search field in the top bar
where Pro's sits. Tapping it opens a full-screen sheet (`#/lite/search`)
with the keyboard already up.

**Before you type** (fomo has no empty state worth copying; this is ours):

- Recent searches (`Search.tsx` already keeps them).
- **People you follow**, as a row of faces.
- **Top earners this week**: the first five on the board, with Follow buttons.
- Four category chips (Dollars · Ether · Bitcoin · More) that open Earn.

**Results: two sections only, in this order:**

1. **Earn**: Lite rows whose name or asset matches ("usdc", "dollars", "steth",
   "btc", "loop"), drawn as `LiteRowView`. Opening one opens the Lite ticket.
   Matched against Lite's own catalogue (`useLiteMenu().rows` and
   `plainName`), so a result is always something Lite offers.
2. **People**: wallet, profile, ENS, Basename, `.sol` and X hits from `/find`,
   each with its face, the kind of claim the name rests on (kept from Pro: "a
   name is not an identity"), the rate on all its money, and **Follow** on the
   row. Opening one opens the Lite profile (§4.3).

Vaults, curators, protocols, markets and issuers stay in Pro. At the end of the
results: **"More results in Pro ›"** (`proHref('#/…')` with the query).

**Code.** Split `Search.tsx`'s data half (catalog load, `/find` with
abort, `merge`, recents) into a hook, `useFind(q)`. It belongs in
`packages/app`, since the phone app needs it too. Pro's dropdown and Lite's
sheet then become two renderers over the same hook. The rule that maps a hit
to a Lite row goes in `model/lite.ts` as `liteFind(hits, rows)`, pure and
with tests, per lite-plan's "pure first" rule.

### 4.2 "Who's in it" on the Lite ticket (fomo's coin page)

Under the three lines, above the button:

```
 Who's in it                                   148 wallets · $41M
 ◑ ◐ ◒ ◓ +144     2 people you follow run this
 ─────────────────────────────────────────────────────────────────
 ◑ Amber Otter  · 6.1 % for 94 days        “funding back above 10 %”
 ◐ you follow · Kite                       earning $12 a day        Copy
 What people say (7) ›
```

- The faces come from `useHolders(uid)`, **people you follow first**, then the
  largest stakes. The headline count and dollars come from the proof
  (`n people run this`, already on the row).
- Each face shows one number in words: the rate it earns, or dollars a day.
  This is fomo's "up or down" line, and it can't be bent by price moves.
- A face shows its own newest comment on this strategy if it has one
  (`POST /latest` by author, as Pro's feed does). The full thread opens in a
  drawer.
- **Copy** on a face is the same Copy as on a card (`openRow(s, { copy })`).

Pro's `WhoIsIn` and `RowSocial` already do most of this. The Lite version is
a smaller layout over the same hooks, not a new data path. This also gives
`SayWhy` a reason to exist in Lite: a reason signed in Lite is then shown in
Lite.

### 4.3 A Lite profile page

`#/lite/w/<addr>` takes over from the board's sheet. Every face in Lite opens
it: cards, moves, search, the ticket and the board. Today faces on cards
link to Pro's wallet page.

- **Header:** face, name and claim, X link, **Follow**, followers / following,
  "followed by Kite and 2 others you follow" (the mutuals: `api.followers`
  of this wallet intersected with your follows).
- **One number:** the rate on all its money, and dollars a day (the board's
  number). Then days active and its board rank.
- **What it runs:** positions as Lite rows with what each made (the index's
  PnL book, the data the board sheet already uses), each with Copy.
- **What it said:** comments with what they were about (Pro's "Said").
- **Recent moves:** this wallet's moves, drawn as `FollowedMoves` rows.

Rule from `apis.md`: this page is for *other* wallets. Your own profile is
You, which reads the live book, never the index.

### 4.4 Home: the moves for everyone, not only followers

`FollowedMoves` becomes **Moves**, with fomo's toggle: **Following ·
Everyone**.

- *Everyone*: real moves from the top of the board, and from any wallet
  ≥ $10k into a Lite row, newest first. Only moves Lite can Copy, so every row
  has the button. Dust filtered with the existing `isDust`.
- *Following* is today's list, and the default once you follow at least one
  person. A new reader starts on *Everyone*, so Home is social on the first
  visit, which is when it matters most.
- Each row shows the mover's reason under it in one muted line, when there is
  one (§4.5).
- A Follow button on any row you don't follow yet. This is how a new reader
  goes from zero follows to some.

### 4.5 The reason on the move

Each move row in Lite (Home, profile, ticket) quotes the **mover's own** newest
comment on that strategy, one line, trimmed. It is the same rule as Pro's
move card (`social.md` §19), never a stranger's comment. This is fomo's thesis
in the feed, and we already have it in the comment written at execution
(§3.2 there).

### 4.6 Small things that make it feel like fomo

- **Faces on rows**: "Kite + 3 run this" when someone you follow is in a
  Lite row, ahead of the plain count. Follows are the strongest social proof
  and cost one set lookup.
- **Follow on cards**: the face on a Home card gets a small `+` when you don't
  follow them yet.
- **Unread dot**: a dot on the Home tab when people you follow have moved since
  your last visit (`useUnseen` exists). This replaces the bell Lite dropped.
- **Likes**: fomo's one-tap endorsement. Only if the social service already
  has them; otherwise this is a service change and later work.

## 5. What not to copy

- **A Search tab or a Feed tab.** Lite has three tabs on purpose. Search is a
  button and the feed is part of Home. fomo needs a Search tab because there
  are a million memecoins. Lite's catalogue is four category lists.
- **Ranking by PnL.** fomo's leaderboard and profile charts show price
  moves. Ours rank by rate, and a profile shows no lifetime total, for the
  reason lite-plan "As built" 14 gives.
- **An unfiltered firehose.** Bankless's main complaint was a global feed
  with no network filter. *Everyone* in §4.4 only shows moves you can copy,
  from wallets that put real money in.
- **Send / gift cash** between users. Not a yield feature, and it brings
  moderation work (fomo had to add AI moderation to messages).
- **Push "X just aped in" alerts** that press for speed. For yield, a weekly
  "what the people you follow changed" is the honest version. A mobile
  decision.

## 6. Order and size

| # | Piece | Size | Depends on |
|---|---|---|---|
| 1 | Moves with Following · Everyone, plus the reason line | S | – |
| 2 | Who's in it on the Lite ticket | S–M | – |
| 3 | Lite profile page; every face links to it | M | – |
| 4 | `useFind` split into `packages/app`; Lite search sheet; `liteFind` with tests | M | 3 (people results open the profile) |
| 5 | Faces on rows, `+` on cards, unread dot | S | 1, 3 |
| 6 | Phone app: Lite search on the same hook | S | 4 |

Items 1 and 2 make the biggest difference for the least work, and neither
needs the other.

## 7. Questions for the owner (answered with the defaults, 2026-10-27)

1. **The search button's position on desktop**: in the top bar like Pro (my
   suggestion), or a fourth item in the side tab bar?
2. ***Everyone* moves**: from the top of the board only, or any wallet
   ≥ $10k? The board is safer; any wallet feels more alive.
3. **Should a profile show a wallet's dollar amounts**, or only rates and
   dollars a day? fomo shows balances. Our index has them, but a big number
   next to a stranger's face changes how the app feels.

## Sources

- [Navigating your fomo app](https://fomo.family/blog/learn/navigating-your-fomo-app): tabs, search covers coins and profiles, profile contents
- fomo recaps: [Sep 2025](https://fomo.family/blog/september-2025-recap) (friends feed, send from search), [Nov 2025](https://fomo.family/blog/november-2025-recap) (search bar in the tab bar, mutuals, comment likes), [Jan 2026](https://fomo.family/blog/january-2026-recap) (a feed per coin, theses), [Feb 2026](https://fomo.family/blog/february-2026-recap) (feed revamp, global theses)
- [Bankless: Trading in public with fomo](https://www.bankless.com/read/trading-in-public-with-fomo): holders and theses on the coin page, profiles, no network filter
- [Datawallet: Fomo app explained](https://www.datawallet.com/crypto/fomo-app-explained): feed with PnL, comments under the chart
- [fomobyte beginner guide](https://fomobyte.com/how-to-use-fomo-app/): search by name, ticker or address, alerts top-left
- [fomoapi.io search](https://fomoapi.io/blog/search-fomo-traders-tokens-by-name-api): people results carry handle, wallet and PnL (third party, unverified)

## As built

| Piece | Where |
|---|---|
| `liteFind`, `followedFirst` (pure, tested) | `model/lite.ts` + `lite.test.ts` (core) |
| `usePeopleFind`, `useTopEarners` | `packages/app/src/index/queries.ts` |
| Moves (Following · Everyone, reasons), Who's in it | `src/ui/lite/LiteSocial.tsx`; the ticket's slot in `LiteTicket` (`Ticket.tsx`) |
| Profile | `src/ui/lite/LiteProfile.tsx`, `#/lite/w/<addr>` (`liteHas`: a wallet without `pos=`) |
| Search | `src/ui/lite/LiteSearch.tsx`, `#/lite/search?q=…`; the button in `Shell.tsx` |
| Phone | `mobile/app/search.tsx`; the round button in `mobile/src/ui/TabBar.tsx` |

Changes against the proposal, and why:

1. **Pro's `Search.tsx` was not split.** Lite's search needs only people from
   `/find`, so `usePeopleFind` asks `kinds=wallet` and the catalogue tier stays Pro's.
   "…in Pro ›" hands the query over as `#/pro/?q=…`, which Pro's header search opens on.
2. **People are people.** `/find`'s wallet group includes tokens, routers and vaults
   by label ("USDC Token", "Aave USDC"). `usePeopleFind` drops any hit whose
   `accountKind` is a contract, router, protocol, DEX, wrapper, exchange or curator.
3. **Everyone is the top 40 of the dollars-a-day board** (the request the header's
   rank already makes), only moves Lite can Copy, no dust, and **one move per wallet
   and strategy**. A desk that tops up all day showed as six identical rows.
4. **The feed API splits `accounts` by VM** (`recentTxs`, core). The EVM index answers
   400 to a base58 address in the list, so any mixed list (every top-earners list) lost its EVM half.
5. **Who's in it shows dollars in it, not each holder's rate.** The holders read has no
   per-holder rate. "n people you follow run this" counts among the 12 largest holders.
6. **A move row says what was done under the name** ("deposited Dollars via …"). On a
   phone the old row hid the verb and the strategy columns.
7. **The profile ranks a wallet on the first board it is on**: by rate (Lite's board as it
   opens), else by dollars a day. There is no one-wallet read. "What it runs" is the
   board's position list (the PnL book), so a wallet the book has not drawn yet says so.
   That can be a top-10 wallet whose positions are only hours old.
8. **The phone app has no Follow and no profile yet** (no social layer on mobile).
   Search shows Earn rows and people, and a person opens the existing wallet
   placeholder. Pro's top bar on the phone opens the same screen.
9. **Slow names.** The EVM index's `/find` takes about 30 s for a name it has not
   cached (it asks for ENS remotely). The page says "looking…" until then; the
   Solana half answers in about 0.2 s. This is a pos-indexer matter: the two halves
   could be answered separately.

