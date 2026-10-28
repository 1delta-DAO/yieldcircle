# Lite — design review before the phone port

**Date:** 2026-10-28. **Scope:** every Lite surface on the web (`#/lite/…`) as it renders on a
phone (390 × 844 and 360 × 780) and on a desk (1280), read against [`lite.md`](lite.md)'s own
rules and against what a native iOS / Android port needs. Reviewed from the code
(`packages/web/src/ui/lite/*`, the `lite` branches of `Ticket.tsx`, `styles/lite.css`,
`model/lite.ts`) and from screenshots of a live run with a wallet that holds positions
(`?as=0xd8dA…` — the vitalik.eth wallet the shots harness uses) and without one.

The phone app already carries Lite's four tabs and the ticket ([`mobile-plan.md`](mobile-plan.md),
phases 1–3), matched screen by screen to the web. So "port soon" is mostly "finish and polish",
and the question this review answers is: **what in Lite's design is wrong, or web-only, that the
phone should not inherit.** Fix these on the web first; the phone imports the result.

How to re-shoot: `pnpm --filter ./packages/web exec vite --port 5199`, then the script at
`scripts/shots.mjs` for Pro, or the Lite variant used here (routes `#/lite/`, `earn`, `USD`,
`board`, `board?by=wallet`, `you`, `search`, `w/<addr>`, plus a row tap for the ticket and a
Details tap). Shots from this run are not checked in.

## 1. Verdict

Lite's bones are right for a consumer app: three tabs, one balance, one number per row, the
three-line ticket, Copy as the one social action, paper money as onboarding. The ticket's
Earn / Can lose / Costs lines are the best thing in the app and should be the model for every
other number on every other screen.

What lets it down is **leakage**: Pro's words, Pro's tickers, Pro's controls and Pro's density
show through on four of the six screens, most of all on the Board, which is a default tab.
Then a set of **touch problems** the desktop never exposed: information that lives only in
hover tooltips, sub-11px type, 28–32px controls, sub-lines that truncate on every row at
390px. Neither is a port problem; both are things the port would copy faithfully.

Ordered by what it buys:

1. The Board's Strategies view shows raw tickers (`PT-USD3-17DEC2026`, `CarryTradeUSDTRYLeverage`,
   `asUSDF`) in the hero and in 30 of 36 rows. It is Lite's default Board view. §3.4.
2. The list row: the sub-line truncates on every row at 390 (`Levered ×5.6 · borr…`), the name
   is a brand with no family word ("3Jane" three times, "Tori" twice), and the lever is said
   three ways. §3.2.
3. Risk is a 7px dot on rows and cards, with no word. A 53% row with an amber dot reads as a
   bargain. §4.1.
4. Touch: 24 `title=` tooltips carry real information, 20 distinct font sizes down to 7.84px,
   most secondary controls 28–32px tall. §5.
5. Two "you" entries: the face (top-left) opens Pro's profile sheet with Pro links; the chip
   (top-right) opens Lite's You. §3.6.
6. Details opens the whole Pro ticket inside Lite (venue, chain, tiers, health factor). The phone
   has no Details at all. One design is needed. §3.3.
7. The ticket's amount defaults to 1,000 against a 38 USDC balance and opens on a warning;
   its helper line wraps in monospace; the signing note is three lines of API jargon. §3.3.
8. You: five stat tiles leave an orphan, Points is a labelled "preview", the streak is an emoji.
   The withdraw sheet uses Pro's uppercase cells, not Lite's lines. §3.5.

## 2. What is right (keep, and port as is)

- **Home's order:** balance → what it earns a day → idle nudge → three lenses → six cards →
  moves → "every category". The idle nudge ("$27k sits idle. Ether pays 15.34%: about $4.1k a
  year · Put it to work") is the single best line on the home.
- **Earn as one page:** four tiles that stay put, the list changing in place, the picked tile
  lit in its money's colour. No back arrow needed; the tile is the way back.
- **The three lines.** "If 3Jane's dollar drops 4.4% — under the dollar: the loop is
  liquidated. It ends on 17 Dec: close or roll it then." No health factor, no LTV. Keep every
  word; make the rest of the app sound like this.
- **Managing in words:** Add · Lower risk · Top up · Pay back · Close, with "Lower risk" as
  three targets by distance from liquidation. Opening on Lower risk when a position is within
  10% of the line is exactly right.
- **Copy at the best holder's leverage, your own size**, and the copy banner that says so.
- **Paper money as onboarding**, amber everywhere, never mistaken for real.
- **Loading states:** skeletons on the balance, tiles, rows, cards, board; `aria-busy`; the
  hero's balance never flashes a zero.
- **Semantics:** tablists, radiogroups, `aria-pressed`, labelled chips, reduced-motion handled.
  The phone's equivalents (`accessibilityRole`, `accessibilityState`) are already used.
- **The podium medals drawn, not emoji** — the reason given in `LiteBoard.tsx` ("an emoji medal
  renders differently on every platform") applies to the 🔥 too; see §4.3.

## 3. Screen by screen

### 3.1 Home

- **"nothing earning yet" during load.** The balance waits for positions
  (`positionsLoading ? <Sk/> : usd(t.tot)`), the line under it does not
  (`t.yearly > 0 ? … : 'nothing earning yet'`), so for a second or two the home says the
  wallet earns nothing. The desk shot caught it. Same in the chip (`LiteYours` hides the small
  while loading; the hero should too).
- **The paper offer is the biggest block on the first screen** for a visitor without a wallet,
  above the cards, and its copy is four lines with "Solana", "bridge", "routes", "signed":
  Pro words in the one place a first visitor reads. Two lines: *"No wallet? Play with $10,000 of
  paper money — real rates, nothing on chain. A name and a password are the whole account."*
  On the phone, where connecting a wallet means a round trip to another app, the paper path
  matters more, so give it a proper card with one button, not a note.
- **Cards carry four tap targets** (the card, the holder's face, a 30×30 "+" follow, Copy) with
  `stopPropagation` to keep them apart. On touch that is fragile, and in React Native it becomes
  nested `Pressable`s. Make it two: tap the card to open, Copy. Follow belongs on the profile
  (where it already is), and the face can open the profile from the ticket's "Who's in it".
- **The proof line clips at 360** ("705+ people run this · $280m" needs 152px, gets 123) because
  the generated-name tag (`auto`, 10px uppercase) and the "+" sit beside it. Drop the tag on
  cards (it is hidden on rows at 640 already) and the "+".
- **"Proven" mixes 3.7% savings with 53% ×5.6 loops** on one lens with the same card weight.
  The lever pill and amber dot are the only difference. Fine by `lite.md` §4, but see §4.1:
  the card needs the risk word, not the dot.
- **Moves load last and slowest.** "Everyone" needs the rate board, then a feed call for 40
  accounts: two round trips, and the skeleton was still up after six seconds on a desk. Below
  the fold is the right place; on a phone, fetch it only when it scrolls into view, and show
  the first six from cache.

### 3.2 Earn and the list row

- **"Dollars · up to 58.96%"** on the tile is the best *levered* rate (a ×5.6 PT loop). This is
  the objection `simplify.md` recorded against mixed lists, now on the category tile itself.
  Say two numbers or the safe one: *"4–12% · up to 59% levered"*, or "up to 12.2%" with the
  loops' "up to" on the list header.
- **"Highest steady rates" sorts by rate; a category sorts by risk tier first.** The
  all-category list on Earn's landing is therefore five amber ×5.6–×7.8 loops in a row. Use one
  rule: risk tier first (as `liteMenu` does), and let the tile's "up to" carry the big number.
- **The row's right side costs 170px** (lever pill 48 + dot 16 + rate 62 + chevron 18 + gaps),
  so the sub-line gets ~120px at 390 and truncates on every levered row: `Levered ×5.6 ·
  borr…`, `Fixed rate until 28 Jan · 4+ peo…`. What is lost is exactly what distinguishes the
  three "3Jane" rows from each other (fixed / savings / levered, the date, who holds it).
  - Drop the chevron: the rows are cards, obviously tappable, and `›` as text is a web habit.
  - The lever is said three ways on one row: the pill `×5.6`, the sub `Levered ×5.6`, and on the
    ticket head `×5.6 levered` beside a `×5.6` pill. Keep the pill (it is the guard the doc asks
    for) and drop "Levered ×5.6 ·" from the sub, so the sub starts with what matters:
    `borrows dollars · until 17 Dec · 27+ people`.
  - Let the sub wrap to two lines on a phone instead of `nowrap; ellipsis`. The phone's
    `numberOfLines={1}` copies the web's truncation today; give it 2.
- **The name is a brand with no family word.** "3Jane", "Apyx", "Forest Road", "Tori", "Huma",
  "Yuzu" — the money's icon is the only clue it is a dollar, and the full phrase ("Dollars via
  3Jane") exists only as a hover `title`, which touch never shows. `lite.md` §4's "a row says
  *USDC* or *dollars via Ethena*, in words" was the rule; item 17 of the build traded it for the
  icon. On a category page the family is known, so the brand alone is fine there, but on the
  all-category list, on Home's cards, on Search and on the Board the family word has to be back
  in the row (sub or title). A kind word first also fixes the three-3Jane problem:
  `Fixed · 3Jane`, `Savings · 3Jane`, `Loop · 3Jane`.
- **Rows that say nothing of who holds them** ("USDC · Savings rate") are the majority on
  Dollars. Where the proof is empty the sub should say the exit instead ("out any time").
- **"every category ›" is a 92×18 link** under the section head. The lit tile is already the
  way back; either drop the link or make it a 44px row.

### 3.3 The ticket

- **Default amount 1,000 against 38 USDC held** opens the sheet on "more than you have" in
  amber plus the Get USDC banner, before the reader has done anything. Default to the balance
  (the withdraw sheet already defaults to All), or to the largest preset that fits, or to empty
  with the presets as the first tap.
- **The helper line wraps badly:** `≈ $1,000` on the left and `You have 38.1921 USDC here · more
  than you have` on the right are two `justify-content: space-between` spans in monospace; at
  390 the left one breaks to two lines. One proportional line: *"You have 38.19 USDC here"*, the
  dollar equivalent inside the input's unit.
- **The signing note is API jargon:** "The API builds the exact calls (approvals, then the
  action); nothing is sent until you sign — once, where your wallet batches them. Gas on
  Ethereum." Lite's version is one line: *"One signature in your wallet. Network fee ≈ $0.40 on
  Ethereum."* Keep the long note for Pro.
- **The Can-lose sentence is split by a size change:** the value line "If 3Jane's dollar drops
  4.4%" (15px, red) continues in the sub "under the dollar: the loop is liquidated" (12px,
  grey). Reads as one sentence broken in two. Either end the value line with a full stop
  ("…drops 4.4% under the dollar.") and start the sub fresh ("Then the loop is liquidated. It
  ends on 17 Dec…"), or keep "under the dollar" in the value.
- **The head repeats itself:** "Dollars via 3Jane · Levered ×5.6 · borrows dollars · until 17
  Dec" plus a `×5.6` pill. Head: name; sub: "borrows dollars · until 17 Dec"; the pill says the
  lever once.
- **Withdraw and manage use Pro's cells**, not Lite's lines: `YOU GET BACK` in 11px uppercase,
  a monospace `921.2909 USDC to your wallet`, `FROM LIQUIDATION`, `STILL YOURS`. Inside the same
  Lite sheet the open ticket uses `.lite-lines`. One language: make `LiteLines` take any
  `k / v / s` rows and use it for "You get back · When · Costs" and "Earns after · From
  liquidation · Still yours".
- **The withdraw amount shows six decimals** (`921.290905`) in a 20px monospace box. Round what
  is shown to the money's cents (the raw value can stay underneath).
- **"Not one of Lite's picks: you can take it out or make it safer here"** appears on a plain
  USDC deposit on Base, because `L.runs(h)` found no catalogue row. It reads as a warning about
  the reader's own money. Say it only when the strategy is truly off the menu (`s` found and
  `!liteEligible(s)`), and say it plainly: "Lite does not offer this one new, but it is yours:
  withdraw or make it safer here."
- **Details is Pro's whole ticket in a drawer**: "PT-USD3-17DEC2026 / USDC loop · 3Jane
  strategy · Morpho · Ethereum", "You pay with", three tiers with "−1.5% to liq.", "NET YIELD",
  "SAFETY Tight · HF 1.05", "Where the yield comes from". Every rule in `lite.md` §4 and §7 is
  broken inside Lite's own sheet, and the phone has nothing here ("comes next"). Two options:
  1. **A Lite "More choices" sheet** (recommended): leverage as the three tiers *in Lite's
     words* ("Careful ×4.1 · earns 44% · 12% to liquidation", "Balanced", "Bold"), what to pay
     with, and a flat list of the numbers Pro's cells hold. Built from the same controller
     (`useLoopTicket`), ~150 lines, portable to the phone as a sheet.
  2. Port Pro's ticket (mobile phase 6) and accept the leak.
  The "Open this in Pro" link stays either way.
- **"Who's in it"** is good content with 29px tap rows and a 26px "What people say ›" text
  button; both go to 44 on touch. The thread under it (compose box) is the one place a keyboard
  appears inside the sheet; on the phone that needs the sheet to grow with the keyboard.
- **The sheet itself:** slide-up, scrim, grab handle, 88dvh, safe-area padding — right. No
  swipe-to-dismiss on the web (a native sheet gives it free). Keep the ticket's own scroll
  inside the sheet, never the page's.

### 3.4 Board

- **Strategies (the default view) is Pro in disguise.** The hero is `PT-USD3-17DEC2026 ·
  Levered · borrows USDT · ×5.8–9.4 · 86.0%`; rows 2–13 are `PT-apxUSD-11FEB2027`,
  `reUSD-sDOLA`, `asUSDF`, `mixUSDC`, `CarryTradeUSDTRYLeverage`, `sfrxUSD`… with a "Who" button
  because Lite carries none of them. Of 36 rows, 3 have Copy. The cause is `boardStrategies`'s
  fallback to the index's `title` when `liteByKey` has no row, which is most of the top rows
  since the strategy board ranks whatever earns most today. Three fixes, pick one:
  1. Name every key in Lite's words from the *whole* catalogue (`b.all + b.hidden + b.overflow`
     through `plainName`), with Copy only where Lite carries it. Keeps the ranking honest.
  2. Show only strategies Lite carries (the rows with Copy), so the Board is "what people run
     *here*". Shorter, all copyable, but hides the real top.
  3. Default to Wallets, where every row is a person and the positions underneath are already
     named through `liteByKey` with Lite's fallback.
  Option 1 for the words, plus 3 for the default, is the least surprising.
- **Three control rows before the first item** at 390: Strategies/Wallets, Best rate/Most a
  day, All/Dollars/ETH/BTC, then a two-line "why" sentence. Half the first screen is chrome.
  Fold the sort into the title ("Leaderboard · best rate ▾"), make the held chips one
  horizontally scrolling row, drop the sentence into the sort's own menu.
- **The row sub clips on every row** ("Levered · borrows APXUSD · 2 people · $112k" needs 248px,
  gets 184 at 390, 154 at 360). Same fix as the list row: two lines, lever once.
- **40 rows, 31 "Who" buttons.** Cap at 20 with "Show more", as Earn does.
- **Wallets:** the sub "1 position · on $11k" clips at 360 under a 123.1% value. Give the value
  less ("123%", one decimal only under 10%). The expanded positions with Copy and the medal
  rings are good; "Their profile ›" is an 18px-tall link.

### 3.5 You

- **Five tiles in a 2-column grid leave Rank alone on a third row.** Four tiles, or a 2+3 split
  with the second row smaller. Rank already links out; make it a row ("Rank #12 on the board
  ›") under the tiles rather than a tile with an em dash.
- **Points is a labelled preview** ("preview · a point a day per $100 at work"). A consumer app
  does not ship a number that says it is not real. Until the ledger exists, drop the tile; keep
  the streak. The owner's open question in `lite.md` §9.3 stands.
- **Streak is an emoji** (🔥 in the hero, the chip and the tile). Draw it (a 14px flame SVG the
  phone already has to draw anyway); emoji differ per platform and per OS version.
- **"What you made" is the strongest block** and should sit directly under the balance tiles
  (it does). Its empty copy ("No record yet. 3 positions drawing now — this updates by itself")
  is fine. The Spark line is 56px with no axis: right for Lite.
- **Your money rows** say "Earning" where they could say what they earn in dollars a day, the
  one number the home leads with. `$921 · 4.05%` → `$921 · +$0.10 a day`.
- **The Lite/Pro switch** at the foot with a two-line hint is the right place. The same switch
  also sits in the profile sheet; see §3.6.

### 3.6 The frame: header, tabs, sheet

- **Two "you" entries.** The face top-left opens `ProfileSheet`, whose links are Pro's: "My
  page" → `walletHref` (Pro's wallet page, not Lite's You), "Edit profile" → `#/me` (Pro),
  Alerts (Pro's bell page), Chains, Pending changes. The chip top-right opens Lite's You. In
  Lite the face should open You (with Chains, Edit profile and the Pro switch at its foot), and
  the chip can stay as the balance. One entry, one page.
- **Back arrow + face + chip** at 390 leaves no room for the brand, which is hidden; fine. The
  chip hides the streak below 768 and the small line below 360; at 360 it is a number and a
  chevron, acceptable.
- **The tab bar** (three tabs + a round search) is the phone's native pattern and the phone has
  it already. The Home dot for unseen moves is good. Lite has no bell by design; keep it so.
- **The search button** reads as a fourth tab (same row, same weight). Fomo's is a tab. Either
  make it the fourth tab honestly or move search to the top bar where Pro has it.
- **The TxTray** sits top-centre under the header on a phone (`app.css`), where it collides
  with the sheet's head when a ticket is open. On the phone, use a toast above the tab bar and
  the ticket's own ladder.

### 3.7 Search and profile

Both are fine and already fomo-shaped. Notes: Follow buttons are 86×30; "Board ›" is 44×20;
the "auto" tag on generated names is hidden at 640 but the row's sub still clips at 360
("1 position · $37 a day"). The profile for a wallet the index has not drawn is two empty
boxes and a "Follow"; add the wallet's last moves from the feed (the code fetches them;
they just happened to be empty for the address shot).

## 4. Cross-cutting design issues

### 4.1 Risk is a dot

Every row and card shows risk as a 7px coloured dot, no word. Green also means "rate ≥ 3%",
and amber on the rate means "spike this month", so a row can show a green rate next to an
amber dot and mean two unrelated things. The doc's own argument for a mixed list is that "the
risk word is on every row" (`lite.md` §4). It is not; the word is on the ticket only. Put the
word on cards ("medium risk", one of three) and on the ticket head; on rows, where there is no
room, tint the rate by risk instead of a separate dot and drop the spike colour (keep the
spike as the sub's "higher than usual this month").

### 4.2 Names: one thing, four names

The same strategy is "Dollars via 3Jane" on the ticket head, "3Jane" on the row, "PT-USD3-
17DEC2026 / USDC loop" in Details and "PT-USD3-17DEC2026" on the Board. `plainName` exists;
use it everywhere a Lite surface names a strategy, including the board's fallback and the
Details head, and never show a ticker on a Lite surface except as a money's own mark (USDC,
WBTC).

### 4.3 Two visual languages inside Lite

- Pro's uppercase 11px labels (`.lbl`, `.cells .k`, `.tsec .lbl` "HOW MUCH") sit beside Lite's
  sentence-case 16px section heads. Inside the ticket both appear.
- Monospace appears in the amount input (right), in the helper lines, in the cells' subs and
  in "921.2909 USDC to your wallet". Consumer apps use tabular proportional numerals; keep mono
  for the input only.
- Two segmented-control sizes (`.seg` at 28px, `.dchip` at 32px) on the same board bar.
- Emoji (🔥), text glyphs as icons (`✕`, `›`, `−`, `→`), and SVG icons, mixed.

### 4.4 Colour

Dark only (`color-scheme: dark`, black ground). That is a decision, not a bug; fomo is dark
too. State it in `mobile.md` so nobody files light mode as a gap. Within it:

| token | over `--b200` | contrast | ok for |
|---|---|---|---|
| `--tx50` | ≈ #7b7b7c | ≈ 4.6 : 1 | ≥ 14px text, borderline at 12 |
| `--tx40` | ≈ #656567 | ≈ 3.3 : 1 | nothing textual |

`--tx40` is used for text on cards ("steadiest rate of its kind this month" at 12px), on
chevrons, ages and "a year" subs. Reserve it for decoration. `--tx50` at 11–12px (most subs)
should become `--tx70` at that size or 13px.

Eleven `color-mix()` rules (tile gradients, medal rings, bars) and three literals (`#0b0b0e`
for the hero line's ground, `#fff` inside mixes, two `rgba(0,0,0,…)` shadows) need tokens;
the phone's `mix()` / `alpha()` helpers reproduce `color-mix` but not a literal nobody named.

### 4.5 Type scale

`lite.css` uses 20 distinct sizes between 11px and 46px, and computed sizes on the page go down
to 7.84px (the `.pill` at 10px inside a 0.78em context) and 9px (`.xt .pill`, venue tags). iOS
and Android both treat 11px as the floor; React Native has no fractional sizes worth keeping
(14.5, 12.5, 13.5, 11.5 all appear). Settle a scale and name it in `tokens.css`:

| step | px | use |
|---|---|---|
| caption | 11 | pills, "a year", ages |
| small | 12 | subs, helper lines |
| body | 14 | rows, cards, notes |
| strong | 16 | row titles, section heads |
| title | 20 | page titles, tile rates |
| display | 28 / 36 / 44 | card rate, PnL, balance |

### 4.6 Touch targets

Under 44px on the shots: `.seg` buttons (28 tall) everywhere, presets `.pctb` (30), `.btn.sm`
(30: Copy, Follow, Who, Earn this), `.x` close (32), `.info` (15 × 15), `.dchip` (32),
`.lite-who` rows (29–30), `.ts-more` (26), `.linklike` and bare links (15–20). Raise the
visual height of `.seg`, `.pctb`, `.btn.sm` to 36 and give every control a 44px hit area
(padding on the web, `hitSlop` on the phone). The tab bar, the chip, the face, the rows, the
tiles and the primary buttons are already ≥ 44.

### 4.7 Hover and tooltips

22 `:hover` rules and 24 `title=` attributes in Lite's own files. Most hovers are harmless
(a lift, a tint). The titles are not: the full name of a row, "Higher than this month's usual:
the steady rate is what the list ranks by", "Days in a row with money at work", "open this
wallet", "Share a link that opens this strategy, copying you", the tile's one-line description.
Each is information a phone user never gets. Rule: anything in a `title` that a reader needs
is text or an info sheet; `title` is for mouse convenience only.

### 4.8 Truncation

`white-space: nowrap; text-overflow: ellipsis` on `.lrow-n small`, `.lcard-n small`,
`.ls-n small`, `.lb-pn small`, `.lite-sr .wn *`, the quotes. At 390 the probe found clipped
text on Earn rows, every Board row, Board wallets at 360, Home cards at 360, Search rows at
360. Design each row for two sub-lines on a phone; put the least important fact last so a
clip loses that; shorten the strings (`people run this` → `people`, `$280m` stays).

## 5. What the port needs that the web does not have

- **Platform calls inside Lite UI files:** `location.hash` (LiteBits, LiteYou),
  `location.replace` (LiteProfile's own-address redirect, LiteEarn's off-Lite redirect),
  `history.replaceState` and `localStorage` (LiteSearch's query echo and recent picks),
  `navigator.share` / clipboard (share.ts). The phone re-implements each by hand today
  (`mobile/src/ui/lite.tsx` has its own `sharePosition`). Move the recent-search store and the
  day log behind `@yieldcircle/app/platform` (a `kv` seam like the scratchpad), and give
  `openRow` / `liteWalletHref` a navigation seam so both apps call one `nav.strategy(s, params)`.
- **A deep-link map.** Share produces `https://app.yieldcircle.io/#/lite/USD?s=…&k=…&copy=…`.
  The phone must open that (universal links / app links, listed as a gap in `mobile.md`), and
  the map from every Lite route to an expo-router route should be written once:
  `#/lite/<GROUP>?s=&k=&copy=&lev=`, `board?by=&t=&x=`, `you?h=&m=`, `search?q=`, `w/<addr>`.
- **Modes the phone lacks** that the web ticket has: Details (§3.3), the profile sheet (§3.6),
  "Who's in it" and the thread (social, phase 4), paper (phase 5). Decide the Lite-native Details
  before phase 6 so the phone never ports Pro's ticket for it.
- **Keyboard:** the amount input is `type=text` with a mono font; on the phone use
  `inputMode="decimal"` / `keyboardType="decimal-pad"` and let the sheet grow with the keyboard.
- **Motion:** tile transitions, the ticket slide, card lift; all under `prefers-reduced-motion`.
  On the phone: a native sheet and `LayoutAnimation`, and honour "Reduce motion".
- **Safe areas:** the tab bar and sheet pad for the bottom inset; the header has no top inset on
  the web (not needed in a browser). The phone's `TopBar` already does it.
- **Data on a phone network:** Home's below-fold moves (two sequential calls), the rate history
  for every row (`useRateHistory` over `b.all`), and the strategy proofs are the heavy reads.
  Prefetch the four tiles' best rows and the six proven cards; defer the rest to scroll.

## 6. Open decisions for the owner

1. Board default: Strategies renamed through the whole catalogue, or Wallets? (§3.4)
2. Details: a Lite "More choices" sheet, or Pro's ticket? (§3.3)
3. Points: hide until the ledger, or keep the preview? (§3.5)
4. Risk: a word on cards and the ticket, and the rate tinted by risk on rows? (§4.1)
5. The face top-left in Lite: opens You, with Pro's sheet gone from Lite? (§3.6)
6. Dark only on the phone, stated as a decision? (§4.4)

## 7. Suggested order of work

| # | Change | Where | Size |
|---|---|---|---|
| 1 | Board strategies named through `plainName` over the whole catalogue; Wallets default; one control row | `LiteBoard.tsx`, `model/lite.ts::boardStrategies` | M |
| 2 | Row anatomy: no chevron, lever once, two-line sub on a phone, family/kind word on all-category surfaces | `LiteBits.tsx`, `lite.css`, `mobile/src/ui/lite.tsx` | S |
| 3 | Risk word on cards and ticket head; rate tinted by risk on rows | `LiteBits.tsx`, `Ticket.tsx` (Lite head), `bits.tsx` | S |
| 4 | Type scale and tap sizes as tokens; `.t40` off text; `title` → text | `tokens.css`, `lite.css`, Lite files | M |
| 5 | Ticket: amount default, helper line, signing note, Can-lose sentence, Lite lines for withdraw/manage, off-menu wording | `Ticket.tsx` Lite branches, `LiteTicketBits.tsx`, `model/lite.ts` | M |
| 6 | One "you": face → You in Lite; sheet's Pro links gone from Lite | `Shell.tsx`, `ProfileSheet.tsx`, `LiteYou.tsx` | S |
| 7 | You: four tiles, Points hidden, drawn flame, dollars-a-day on rows | `LiteYou.tsx`, `Shell.tsx` | S |
| 8 | Lite "More choices" sheet replacing Pro's ticket in Details | new `LiteMore.tsx` over `useLoopTicket` | M |
| 9 | Home: hero subline while loading, paper card copy, card targets, deferred moves | `LiteHome.tsx`, `LiteBits.tsx`, `PaperPanel.tsx` | S |
| 10 | Platform seams (kv, nav, share) in `@yieldcircle/app`; deep-link map in `mobile.md` | `packages/app`, `mobile/` | M |

Items 1–5 change what the phone copies; do them before the next side-by-side pass.

## As built (2026-10-28)

All ten items of §7, with the six decisions of §6 taken as recommended. Checked by a fresh
screenshot run at 390 and 1280 with the same probe: no clipped text and no sideways overflow on
any Lite screen at 390 (there were clips on six screens before), every Lite control at least 36px
to look at, and no text under 11px but the money icons' glyphs.

| # | What changed | Where |
|---|---|---|
| 1 | Wallets is the board's default (`?by=strategy` for strategies). Strategies are named in Lite's words from the whole catalogue (`useBoardNames`); one the catalogue does not hold is left to Pro and counted in the foot, never shown as a ticker. 20 rows, then "Show the top n". Controls in one sideways-scrolling row. Lite now keeps its Dollars / ETH / BTC chips: the route had sent any `x=` to Pro's board. | `LiteBoard.tsx`, `App.tsx`, `AppState.tsx::liteHas` |
| 2 | Rows: no chevron; the lever said once, by the pill (`plainName`'s loop sub is "Borrows dollars · until 17 Dec"); subs wrap to two lines on a phone; the full phrase ("Dollars via 3Jane") wherever categories mix (Earn's top list, cards, search) | `model/lite.ts`, `LiteBits.tsx`, `mobile/src/ui/lite.tsx`, `cards.tsx` |
| 3 | Risk: a word on cards and the ticket head (`riskWord`); on rows the rate is the risk's colour, with a key in the list's foot; a spike is "higher than usual" in words | `LiteBits.tsx`, `Ticket.tsx`, phone `bits.tsx` |
| 4 | Tokens for the type scale and touch sizes; every `lite.css` size on them; `.t40` off words; `title=` tooltips that carried information are text or labels | `tokens.css`, `lite.css`, Lite files |
| 5 | Ticket: a connected reader's amount starts from the balance (all of it up to $1,000); one helper line in words; a one-line signing note; "If 3Jane's dollar trades 4.4% under $1 / Then the loop is liquidated"; withdraw, Lower risk and Close in Lite's lines (`withdrawLines`, `saferLines`, `closeLines`); amounts shown to cents; the off-menu line only when the strategy truly is off Lite's menu | `Ticket.tsx`, `LiteTicketBits.tsx`, `tickets/simple.ts`, `loop.ts`, `withdraw.ts`, `model/amount.ts::portion` |
| 6 | In Lite the face opens You; You's foot carries the wallet, chains, the profile editor link, Lite / Pro and the community links (`ProfileSheet embedded`) | `Shell.tsx`, `ProfileSheet.tsx`, `LiteYou.tsx` |
| 7 | You: four tiles (three on paper, the last across), no Points, a drawn flame on both apps, positions in dollars a day | `LiteYou.tsx`, `Shell.tsx`, `mobile/app/you.tsx` |
| 8 | "More choices" replaces Pro's ticket for opening a position: leverage as Careful / Balanced / Bold (`liteTiers`, only those that clear `LITE_MIN_BUFFER`) and the copied one, what to pay with, the numbers as a list. Held positions: see the second pass below | `Ticket.tsx`, `LiteTicketBits.tsx`, `tickets/loop.ts` (`liteTier`) |
| 9 | Home: the line under the balance waits for positions; the paper card in two plain lines; cards have two targets (the card, Copy); the moves load when they near the screen | `LiteHome.tsx`, `PaperPanel.tsx`, `LiteBits.tsx` |
| 10 | Share text and rules in core (`shareOf`, `canShare`), used by both apps; recent search picks in `@yieldcircle/app/lite` (`useRecentPicks`); the deep-link map and the dark-only decision in `docs/mobile.md` | `model/lite.ts`, `share.ts`, `mobile/src/ui/lite.tsx`, `packages/app/src/lite.ts` |

### Second pass (2026-10-28, evening)

What the first pass left out, now built. Checked with the same probe at 390 on a wallet holding a
×8.1 loop (every tab, each "More choices") and on a wallet the index has never drawn: no clipped
text, no sideways overflow. The phone bundles for iOS and Android.

| What changed | Where |
|---|---|
| **Held positions, in Lite's words.** Pro's ticket is never drawn inside Lite any more; it is only the link at the foot of "More choices". A held loop offers any of Lite's leverages (`liteLeverTargets`: the safer steps and the tiers that clear Lite's floor, up to the venue's maximum, most leverage first, "As it is" in its place); the button says Raise or Lower. A close asks what it comes back in (all in the debt coin, or keep what the loop holds), never carried over from Pro's remembered choice. A withdrawal asks how it is paid out (the token, or the chain's coin unwrapped). Top up, Pay back and a loan show the position's numbers. Several positions on one strategy are picked in the sheet ("Which one") | `model/lite.ts`, `tickets/manageLoop.ts` (`targets`, Lite's own `recv`), `Ticket.tsx`, `BorrowTicket.tsx`, `LiteTicketBits.tsx` |
| **The phone's "More choices"** — the same sheet, natively (`MoreSheet`, `Choices`, `Numbers`), for every body: opening a deposit or a loop, withdrawing, a held loop's leverage and close, a loan. Its foot opens the same place in Pro on the web. The phone's bodies now also use Lite's lines for withdraw / lower risk / close, the one-line amount helper, cents for a dollar amount, the balance-seeded amount on a deposit and the short signing note | `mobile/src/ticket/parts.tsx`, `bodies.tsx`, `app/strategy/[id].tsx` |
| **The phone's You settings:** wallet, "Edit your name and face" (Pro, on the web), Chains (a saved scope the session reads — the phone read every chain before), Lite / Pro. Positions in dollars a day and "made". The phone's board opens on Wallets, as the web's does | `mobile/app/you.tsx`, `mobile/src/chains.ts`, `session.tsx`, `ui/board.tsx` |
| **The navigation seam.** Every Lite address is written once in core (`model/liteLinks.ts`: `LiteDest`, `liteHash`, `liteUrl`, `proUrl`, `parseLiteHash`, tested both ways). `@yieldcircle/app/nav` (`useNav`: `go`, `href`, `pro`) is filled by the web from hashes and by the phone from expo-router (`mobile/src/nav.tsx::pathOf`). Share links, the web's `openRow` / `liteWalletHref` and the phone's `openStrategy` / `openWallet` go through it; the phone's deep links too (`app/+native-intent.tsx`) | core, `packages/app/src/nav.tsx`, `state/platform.tsx`, `mobile/src/nav.tsx` |
| **Search** stays a round button after the three tabs (the owner's call, 2026-10-27), now set apart by a hairline so it does not read as a fourth tab | `lite.css`, `mobile/src/ui/TabBar.tsx` |
| **The transaction tray** on a phone sits above the tab bar where the toasts are, not under the header; an open ticket covers it and its own ladder says the same | `app.css` |
| **A wallet the index has not drawn** shows one plain card instead of two empty boxes; when it has moves but nothing open, "Lately" leads. The feed's slow read is not waited for | `LiteProfile.tsx` |

Still open:

- **The phone's wallet page** is a placeholder (social layer, `mobile-plan.md` phase 4), so §3.7's
  profile change is the web's only.
- **Universal links:** the phone reads `yieldcircle://lite/…` today; `https://app.yieldcircle.io/#/lite/…`
  needs the domain association files (`docs/mobile.md`, known gaps). A link the map does not know
  passes through unchanged, so the wallet's return to the app never moves the screen.
- **The community link** is not on the phone's You: the phone does not depend on `@yieldcircle/design`.
- **Board names:** a wallet's expanded positions on the board still fall back to the index's
  title (a PT ticker) when Lite's catalogue has no row for it.
