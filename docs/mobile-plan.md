# Mobile — native rebuild to match the web (plan)

**Decision (2026-10-25, owner):** the phone app is native React Native, and it
looks and works like the web's mobile view — not a web view, not a simplified
cousin. Same screens, same words, same order, same tokens; native where the
platform is (navigation, sheets, gestures, the wallet).

## How "the same" is checked

Every screen is compared against the web at 390 × 844, side by side, before it
is called done:

- **Web:** Playwright on `pnpm dev` (`#/lite/…`, `#/pro/…`), mobile viewport.
- **Phone:** the same Playwright on the Expo app's **web render**
  (`expo export --platform web`, react-native-web) — layout and type the same
  engine draws on the phone, close enough to compare spacing, sizes and colour.
- The device itself (Expo Go / a dev build) is the final check for gestures,
  fonts and the wallet.

The rule for every port: **read the web component and its CSS, not its
screenshot** — sizes, radii, weights and colours come from `packages/web/src/styles/app.css`,
`packages/design/*.css` and the tokens; the screenshot only checks the result.

## Shared code, so the screens stay thin

Logic moves down, never sideways: what both apps need goes to
`@yieldcircle/core` (plain TS) or `@yieldcircle/app` (React, no DOM). The phone
never copies a rule from the web — it imports it. Each phase starts by moving the
pure part of the web code it ports.

## Phases

1. **Look foundation.** IBM Plex Sans / Mono (`@expo-google-fonts`), the
   tokens, the web's icons (inline SVG → `react-native-svg`), the header
   (profile button · search in Pro · balance / Connect), the tab bar (icon +
   word, the active pill), and the primitives every screen uses: card, row
   card, seg, pill, button, note, chip, skeleton, `Tok`/`Toks`, `GroupIcon`,
   `RiskDot`, the wallet character (`identity/character.tsx` → SVG).
2. **Lite, matched:** Home (hero, paper offer, lenses, cards with the best
   holder and Copy, people you follow), Earn (tiles with the gradient, rows as
   cards, show all), Board (Strategies — the podium card and ranked rows — and
   Wallets with positions), You (behind the profile button).
3. **The ticket.** Lite's three-line ticket and Pro's ticket as native sheets,
   the ladder (`useLadder`: approvals → setup → route, or one `wallet_sendCalls`
   batch when the wallet can), receipts and the transaction tray. The pure
   parts of `Ticket.tsx` / `useLadder.ts` move to `@yieldcircle/app` first.
4. **Social.** Profiles, follows (queued, one Batch signature), the feed
   (Hot right now, Following · In the menu · Everyone · Talk, the move cards
   with Copy), threads and comments, X links. `social/*` moves to core / app.
5. **Paper accounts.** Sign-in with name + password, the paper bank and its
   ledger, paper moves. Measure scrypt on Hermes; native crypto only if it is
   too slow (Expo Go has none, so a dev build would then be required).
6. **Pro, matched:** Home (lanes, the earn-in chips), Earn (group tiles with
   30d, Best rates, the asset page), Borrow (collateral chips, take-out chips,
   loan cards, the borrow ticket), Board (all views), market, token and wallet
   pages, search, settings and filters, alerts.
7. **Solana.** AppKit's Solana adapter with the Phantom / Solflare connectors;
   the Solana half of the book, tickets and paper.

Each phase ends with the side-by-side shots of its screens and a device run in
Expo Go (and a dev build once something needs native code Expo Go lacks).

## Progress

**2026-10-25 — phase 1 and Lite's three tabs.** IBM Plex, the web's icons,
header and tab bar; the primitives (`Txt`, `Tok`/`Toks` with their rings,
`GroupIcon`, `RiskDot`, `Rate`, `LeverPill`, `Seg`, `Btn`, `Pill`, `Sk`); the
wallet character, now **one drawing for both apps** (`@yieldcircle/app/identity/character`,
`CharacterArt` over each app's SVG primitives — the web's ten reference faces
render byte-identical to before); Lite Home (hero, paper offer, lenses, cards
with the best holder and Copy), Earn (gradient tiles, row cards, show all) and
Board (Strategies: podium card on a radial gradient, ranked rows with medals and
bars; Wallets with positions), each compared side by side with the web.

Tools for the comparison (scratch, not in the repo): Playwright reads the
web's **computed** styles at 390 px (`getComputedStyle` — the CSS cascade
resolved, mobile media queries and the refit included) and screenshots both
renders; the phone's web render is `expo export --platform web`.

Not matched yet, kept compiling with a transitional `T` style map in
`mobile/src/ui/bits.tsx`: Pro's tabs, the strategy screen (becomes the ticket,
phase 3) and You.

**2026-10-25 — phase 3, the ticket (Lite).** The web's ticket logic moved down
before any phone screen was drawn, so both apps run one ticket engine:

- `@yieldcircle/app`: the ladder (`ladder.ts`: approvals → setup → one route,
  or one `wallet_sendCalls` batch), the trace store (`sdk/txTrace.ts`, fed each
  app's wagmi client through `configureTrace`) and its words (`sdk/txWords.ts`),
  sticky ticket inputs (`sticky.ts`), the paper plans, the value check, and one
  controller per ticket body — `tickets/simple.ts` (deposit), `loop.ts`,
  `withdraw.ts`, `manageLoop.ts` (lower risk / close).
- `@yieldcircle/core`: the ticket's rules (`model/ticket.ts`: pay options,
  native-coin venues, routes, safety words, terms, tenors), Lite's tab rule
  (`liteModes`), `solRpc`, `normaliseDecimal`, `cents`, `paperId`.
- The platform seam: `@yieldcircle/app/platform` — a scratchpad (web:
  sessionStorage, phone: SQLite localStorage), bringing the wallet forward
  (web: deep links, phone: the WalletConnect session's own redirect), switching
  chains, Solana signing. The session gained `isConnected` and `actorOn`.

Checked by recording the web's tickets' text before the move and after each
step (4 open tickets, 49 manage states across 7 wallets viewed with `?as=`):
the open tickets byte-identical throughout, the manage ones differing only in
live quotes and loading timing. `Ticket.tsx` went from 1,541 to 1,054 lines.

On the phone: the Lite ticket as a sheet (head, mode tabs, copy banner,
amount box with presets and Max, the three lines, the Get line, the action
with its step ladder, trust line, Details), its four bodies, and You (stats,
what you made with its line and split, every position opening its ticket,
Share, Lite / Pro), each compared with the web side by side.

Not yet on the phone: Get (swap / bridge in), loans (pay back), Details (Pro's
ticket) and the profile sheet — they open a "comes next" note.
