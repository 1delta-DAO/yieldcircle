# Transaction feedback — success, failure and "still going"

- status: **built 2026-11-14**, not yet shipped and not yet run on a phone: §2–§5 as below, with
  the notes in §9. Haptics and a background notification (slice 6) wait for a native release.
  Decisions taken the same day are in §8.
- why: the phone test run. A swap, a bridge or a new position ends without a visible "it worked";
  a bridge that takes minutes shows nothing once its sheet is closed; and *Get* opened with no
  amount in the ticket prefills dust that no route takes.
- builds on [`tickets/0016-position-created.md`](../tickets/0016-position-created.md) (the receipt
  card, proposed 2026-10-24, not built). This plan keeps its substance and **replaces its §5 tone**
  ("no confetti") with a louder one, and adds the failure side, the phone's pending indicator and
  the Get fixes.
- area: `packages/app/src/sdk/txTrace.ts` · `txWords.ts`, `packages/app/src/ladder.ts`,
  `packages/app/src/tickets/get.ts`, `mobile/src/ticket/{parts,get,bodies}.tsx`,
  `mobile/src/ui/TabBar.tsx` · `TopBar.tsx`, `mobile/app/_layout.tsx`; then the web's
  `ui/Ticket.tsx`, `ui/GetAsset.tsx`, `ui/TxTray.tsx`.

## 1. What is there today (read from the code)

| | Web | Phone |
|---|---|---|
| A ladder ends (deposit, loop, withdraw, close, loan) | step rows with ✓, the label "Done", a button "See your positions" → `#/` (Home) | the same rows, `Action` in `mobile/src/ticket/parts.tsx:220-242`; the button does `router.replace('/')` — Home, not the position |
| A swap or bridge ends (*Get*) | one green line "Received. Your X balance is refreshed…" + `TxTrack` | the same line, no track (`mobile/src/ticket/get.tsx:172`) |
| Something fails | `l.err` as a red line under the steps; a failed trace stays in the tray until dismissed | the red line only. A wallet "no" on a single send prints viem's raw message (`ladder.ts:264`, `get.ts:287`); only the batch path says "Rejected in the wallet" |
| Something is in flight and its sheet is closed | `TxTray` pill on every page (`ui/TxTray.tsx`, `Shell.tsx:117`) | **nothing.** No component reads `useTraces` on the phone; the trace keeps running in the store and nobody shows it |
| Animation | a spinner, the track's pulse | `ActivityIndicator` |

The engine underneath is sound and shared: every send is followed by `txTrace` through
`pending → included → final → syncing | bridging → settled` (or `reverted` / `dropped` / `failed`),
outside React, mirrored to `localStorage` (SQLite on the phone), resumed by `initTxTrace` at launch.
The plan adds faces to it and a little data; it does not change how transactions are followed.

Two things the store lacks for the screens below:

- **A trace knows a title and a label, not what the action was.** "Deposit" is a string the ticket
  passed to `l.start(label)`. A success screen needs the verb, the amount, the token, the rate, the
  chain(s) and where to go next, and it needs them after the ticket body has remounted (the new
  position changes its `key`) or the sheet was closed.
- **A real bridge has no ETA and no way out of `bridging`.** `bridge()` (`txTrace.ts:481-495`) polls
  `bridgeStatus` every 10 s until a terminal status. A failed read is swallowed (`catch(() => null)`)
  and `NOT_FOUND` is treated as lag forever, so a bridge the status route never recognises sits at
  "Bridging · waiting for the bridge to pick it up" until the trace ages out after 24 h. Only paper
  bridges carry `arrivesAt`.

## 2. Bugs fixed first (built 2026-11-14, not yet shipped)

### 2.1 *Get* prefills dust when the ticket has no amount

`packages/app/src/tickets/get.ts:80`:

```ts
const want = src.price > 0 && target.price > 0 ? (need * target.price * 1.01 + 0.05) / src.price : 0
```

`need = max(0, want − target.have)`. With an empty ticket (`want = 0`), or when the wallet already
covers the amount ("Get more USDC"), `need` is 0 and the box is prefilled with **5 cents' worth** of
the source token. Every bridge has a minimum and fixed fees above that, so the quote answers no
routes and the sheet says "No route found for this pair. Try another asset to pay with." — which
sends the user to the wrong fix.

Fix, in the shared hook so both apps get it:

1. **No amount typed → no prefill.** With nothing asked for in the ticket (or the wallet already
   covering it) the box stays empty: the reader has to say what to spend anyway. The sheet already
   has the words for that state ("Enter an amount.", `get.tsx:118`) and the quote effect already
   skips `amount = 0`.
2. **A shortfall too small to route gets a floor.** Across chains, prefill at least about $1 of the
   source (a constant next to the 1 % / 5 c ones; on the same chain no floor). Buying a dollar more
   than needed is harmless; a 3-cent bridge never routes.
3. **Empty reads as empty.** The box shows `0` today because `'0'` is the app's empty amount. Give
   `AmountBox` (phone) and `AmountInput` (web, `ui/bits.tsx:36`) a `0` placeholder and let the Get
   hook start from `{ text: '' }`; `unitsOf` and `parseUnits` already read `''` as zero.
4. **Say "too small" when that is the reason.** No routes and under about $1 across chains →
   "Too small to bridge — routes have fixed fees. Try $1 or more." instead of "try another asset".
5. Move the rule out of the effect into a pure function (core, `model/getAmount.ts`:
   `prefill(need, src, target, cross)`) with a test: no need → empty; tiny need across chains → the
   floor; need above the balance → Max; no price on either side → empty.

### 2.2 The repay sheets subtract the balance twice (phone only)

`mobile/src/ticket/bodies.tsx:306-307` and `:433-434` pass
`have: t.debtBal.amount` **and** `want = max(0, t.r − t.debtBal.amount)`. The hook subtracts `have`
again, so owing 100 and holding 40 asks for 20, not 60 (and for nothing once you hold half). Every
web caller passes the full amount. Fix: `want={t.r}`.

### 2.3 "See your positions" goes Home

Ticket 0016 §2, still open on both apps. Folded into the success screen's button (§4.3).

### 2.4 A wallet "no" is not an error

Run every send's catch through `isRejection` (`core/sdk/walletErrors`), as the batch path does:
"Rejected in the wallet — nothing was sent.", quiet, inline, no failure screen.

## 3. Shared groundwork (`packages/app`, no DOM)

**3.1 What the action was, on the trace.** A small optional `receipt` on `Trace`, written once at
send and persisted with it:

```ts
receipt?: {
  kind: 'deposit' | 'withdraw' | 'open' | 'close' | 'lever' | 'delever' | 'borrow' | 'repay' | 'roll' | 'swap' | 'bridge'
  amount: string; symbol: string; logo?: string; usd?: number      // what went in (or comes out)
  out?: { amount: string; symbol: string; logo?: string }          // a swap's / bridge's other side, as quoted
  apr?: number; leverage?: number; venue?: string                  // the promise, from the quote
  strategyId?: string; holdingKey?: string                         // where "See it" goes
  etaMs?: number                                                   // a bridge's quoted time
}
```

Each ticket hook (`tickets/simple.ts`, `loop.ts`, `manageLoop.ts`, `withdraw.ts`, `borrow.ts`,
`repay.ts`, `roll.ts`) hands it to `l.start(label, receipt)`; the ladder keeps it on the bundle and
passes it through `follow` / `traceBatch` on the step that moves the position; `usePaperLadder`
through `tracePaper`; `useGetAsset` through `bridgeTrace()`. Nothing else in `txTrace` reads it.

**3.2 One reading of how it ended** — `sdk/txOutcome.ts`, beside `txWords.ts`, pure and tested:

```ts
outcomeOf(t: Trace, now): { state: 'flying' | 'won' | 'soft' | 'lost'; head: string; lines: string[]; money: string; next: Next[] }
```

- `won`: settled, no note. `soft`: settled **with** a note (final on chain, the positions or the
  balance have not shown it yet) — an honest amber "it landed", never the confetti, with "Check
  again" (re-runs the narrow read).
- `lost`: `reverted` / `dropped` / `failed`. `money` is the one sentence that matters on a failure,
  **where the funds are**, taken from what the trace already knows:

| End | Headline | Where the money is | Next |
|---|---|---|---|
| reverted | It didn't go through | Nothing moved; only the network fee was spent | Try again · View transaction |
| reverted, step has `onFail` (the unwrap) | Almost | the step's own sentence ("…the funds are in your wallet as WETH") | Done · View transaction |
| batch reverted | It didn't go through | The batch reverted — nothing was moved | Try again |
| dropped | It never landed | Nothing left your wallet | Try again |
| dropped (Solana expiry) | It expired | Nothing left your wallet; a Solana transaction lives ~90 s | Start again |
| failed, `TRANSFER_REFUNDED` | The bridge sent it back | Refunded on {source chain} | Try another route |
| failed, bridge | The bridge failed | the bridge's message + its explorer link | View on {bridge} |
| failed, lost track | We lost track of it | Your wallet shows whether it landed | Check again · View transaction |
| a later step failed after earlier ones landed | Half done | what landed (the approval, the wrap) and what did not | Send step N again |

- A refusal *before* anything is signed (the API will not build it, not enough depth, the value
  check) stays inline in the ticket: there is no transaction to have an outcome.

**3.3 One activity feed** — `sdk/activity.ts`: `useActivity()` merges `useTraces` over every account
the session acts as (EVM, Solana, **and the paper account**, which has no connector on the phone)
and returns `{ live, fresh, lead, all }`. It is `TxTray`'s own filtering lifted out (`LINGER_MS`,
"a success lingers, a failure stays"), so the web tray and the phone pill cannot drift.

**3.4 Bridges that say how long, and stop waiting.**

- `etaMs` from the route's `estimatedDuration` onto `trace.arrivesAt` for real bridges, so the words
  can be "Bridging · about 2 min left" and the ring can fill by time.
- A slow note once it is past `max(2 × ETA, 10 min)`: "Taking longer than {bridge} quoted. Your funds
  are with the bridge, not lost." + the bridge's explorer.
- A second way to land: while `bridging`, read the watched destination balance every third poll; if
  it moved against `watchBase`, settle — the same "whichever answers first" rule batches follow.
  This ends the stuck-forever case in §1.
- Extend `txTrace.batch.test.ts`'s fake chain with a bridge case: DONE, refunded, never found but
  the balance moved.

**3.5 Wake up with the app.** A phone backgrounds the app on every signature. Export
`resumeTraces()` (calls `run` for every trace not done; `run` is already idempotent) and call it
from an `AppState` `active` listener in `mobile/app/_layout.tsx`.

## 4. The phone

Everything here is React Native's own `Animated` (native driver), `react-native-svg` and
`expo-linear-gradient`, all already in the dev client — so it ships with `pnpm mobile update`, no
build. Motion respects `AccessibilityInfo.isReduceMotionEnabled()`: no particles, no shake, a still
mark and the same words.

### 4.1 The look: a trading app's order screen

The reference is what Robinhood shows when a stock order goes through: the whole screen is the
answer — one big mark, one bold line, the order in a few rows, one button — and a burst of confetti
over it. No mascot, no illustration. Ours draws the mark as a ring (`mobile/src/ui/outcome/Ring.tsx`),
the one shape all three states share:

- **flying**: the ring fills with the trace's stages (`reached / stages`, or elapsed / ETA on a
  bridge), a comet running along its lit part. Cyan (`C.primary`).
- **won**: the ring snaps shut, overshoots (spring), turns green, the tick draws itself through it,
  and confetti falls over the whole screen: a hundred-odd paper strips and dots in cyan / green /
  violet / white, thrown up from the mark and drifting down with spin, once, about two seconds.
  The amount counts up under the mark.
- **lost**: the ring fails to close — it cracks at the gap, shakes twice and settles tilted, red
  (amber for `soft` and "half done"). Short and a little comic, not an alarm.

### 4.2 While it runs — in the sheet

The step list stays while there is something left to sign (a multi-tap ladder needs it). Once every
step is sent (`l.finished`, or `sent` in *Get*), the list collapses into the ring with one line
under it (`phaseWords`), the steps behind a "4 steps in one transaction" fold. For a bridge:

```
        ◜◝        Bridging 250 USDC
       ◟ ◞        Arbitrum ────•──▸ Base        the dot travels between the two chain marks
                  Across · about 1 min left
     [ Keep browsing — we'll tell you ]           closes the sheet; the pill takes over (§4.4)
```

### 4.3 It worked — the success screen

Takes over the ticket sheet (the whole `Frame`, not a card in it), and is also a route of its own
(`app/receipt.tsx?id=<trace id>`) so the pill can open it later. It is driven by the trace id kept
in the ladder's scratch entry, not by component state, because the body remounts when the new
position appears.

```
      ▪  ▫ ▪     ▫   ▪  ▫
        ▫   ╭────╮  ▪     ▫       confetti over the whole screen
     ▪      │ ✓  │     ▫
            ╰────╯
        Deposit complete
           $250.00                 big, counted up

     Into            Maple · Aave V3 · Base
     Rate            15.3% a year
     Earns           ≈ $3.19 a month
     Leverage        ×7.7 · 5.3% from liquidation
     Transaction     0x3f…a91c ↗

     [          Done          ]                   closes the sheet
     See it · Say why · Share                     "See it" → /strategy/_?h=<holdingKey>, never Home
```

| Kind | Headline | The figures |
|---|---|---|
| deposit / add | Deposit complete | amount · rate · per month, a ticker that starts counting what it earns |
| open a loop | Your loop is open | + leverage, distance from liquidation |
| withdraw / close | Back in your wallet | what came back (`received`), what it made since the open (`useHoldingPnl`) |
| safer / delever | Safer now | old → new leverage, the new distance |
| borrow | The money's in your wallet | borrowed, the rate, health |
| repay | Paid back | what is still owed, or "All of it — the loan is closed" |
| swap | Swapped | in → out, as received |
| bridge | Landed on Base | amount arrived, how long it took, the gas it brought |
| paper | the same, with the paper pill and "nothing was sent on chain" | |

Rules:

- **Figures are read, not promised.** While syncing they show the receipt's quoted values in grey;
  at `settled` they switch to the merged position (matched on the trace's `touches` / holding key)
  with a short count-up. `soft` never claims figures: "Landed on chain. Your position will show in a
  minute." + Check again.
- ***Get* is a step, not the end.** Its success is the compact version — the confetti, "250 USDC landed
  on Base", one button "Continue with the deposit" — because the user is mid-ticket.
- The summary is rows of label and value, as an order receipt reads; the paper pill sits beside the
  headline on paper.
- A gas leg that did not go out (`gasLegMiss`) is a success with an amber card under it, as today.

### 4.4 It didn't — the failure screen

Same frame, the cracked ring, and the three things from §3.2 in this order: what happened, **where
the money is** (large), one primary action. "Try again" resets the ladder and rebuilds (a stale
bundle is never resent); "View transaction" opens the explorer. Failures of a closed sheet stay on
the pill until opened or dismissed.

### 4.5 Still going — the pending indicator

Three places, one source (`useActivity`):

1. **The pill** (`mobile/src/ui/ActivityPill.tsx`), drawn by `AppTabBar` just above the tab bar on
   every page, where the web puts its tray on a phone: a small ring, the lead trace's title and
   phase ("Bridge 250 USDC · about 1 min left"), `+2` when there are more. It ends with a small burst
   and "Landed on Base ›" for 8 s, or turns red and stays. Tap → the receipt (one trace) or the
   activity sheet (several).
2. **The balance chip** (`TopBar.tsx`): the wallet mark gets a turning ring while anything is in
   flight — visible on pages where the eye is at the top, and the only cue that survives a page that
   covers the bar.
3. **Activity** (`app/activity.tsx`, a sheet): every trace of the last 24 h, in flight first — the
   web's `TxRow` natively (ring, title, route, words, explorer link, dismiss). Also reachable from
   Profile and settings, so a finished bridge can be found again after the pill has gone.

Sheets cover the pill (the ticket is a native modal on iOS, *Get* an RN `Modal`); both show their
own state (§4.2), so nothing is said twice.

**Does a success interrupt?** Recommended: the full screen appears by itself only where the user is
still looking at that action (the sheet is open). Anywhere else the pill celebrates and waits to be
tapped — a bridge that lands while someone is typing an amount elsewhere must not take the screen.

## 5. The web

The same data and words; CSS for the motion (`@keyframes`, all of it inside the existing
`prefers-reduced-motion` rule).

- `Action` in `ui/Ticket.tsx`: the receipt card of ticket 0016 §1 with the ring and the confetti, the
  failure card, "See it" to the holding (0016 §2).
- `GetAsset.tsx`: the compact success, the travelling dot on a bridge, the "too small" words.
- `TxTray`: reads `useActivity`; the pill ends as "Loop open · $10 at 15.3% ›" and opens the receipt
  instead of fading on "Done"; bridge ETA in the row.
- 0016 §3 and §4 (yours first in lists, the arrival glow, the chip's count-up) stay in that ticket;
  they are list work, not transaction feedback.

## 6. Order of work

| # | Slice | Ships as | Size |
|---|---|---|---|
| 1 | §2 fixes: Get prefill + floor + words, the repay double-count, rejection words | web deploy + `pnpm mobile update` | half a day |
| 2 | §3 groundwork: `receipt` on the trace, `txOutcome`, `useActivity`, bridge ETA / slow note / balance fallback, `resumeTraces`, tests | no visible change | 1.5 days |
| 3 | §4.5 the phone's pill, chip ring and Activity sheet | `pnpm mobile update` | 1 day |
| 4 | §4.1–4.4 the ring, the success and failure screens in the ticket and in *Get*, `app/receipt.tsx` | `pnpm mobile update` | 2–3 days |
| 5 | §5 the web: receipt card, Get, tray | web deploy | 1.5–2 days |
| 6 | **Built** (§9). Needs a native build, so it rides the next `pnpm mobile release` (one is already owed for Solflare and the wallet-return link): `expo-haptics` (a success tap, a double knock on failure), later a local notification when a bridge lands while the app is in the background | release | half a day |

1 and 3 fix the two things that hurt most in the test run and can go out before any of the design
work is settled.

## 7. Acceptance

- *Get* opened from an empty ticket, and with enough already held, starts empty and asks for an
  amount; a 2-cent shortfall across chains prefills a routable amount; "too small" is said as such.
- Repay → *Get* with 40 of 100 held asks for 60.
- On the phone, a real and a paper deposit, loop open, withdraw, close, repay, swap and bridge (EVM
  and Solana, batched and step by step) each end on the success screen with read figures, or on the
  honest `soft` state; "See it" lands on the position.
- A revert, a wallet cancel, a Solana expiry, a refunded bridge and a rejected gas leg each show the
  right row of §3.2; a wallet "no" shows no failure screen.
- Close the *Get* sheet during a bridge: the pill shows it on every page with time left, survives an
  app restart and a trip to the wallet, ends in the burst, and opens the receipt.
- A bridge whose status never resolves settles when the destination balance moves, and says it is
  slow before that.
- Reduce Motion on: no particles or shake, same words.
- `pnpm build`, `pnpm typecheck`, `pnpm test`, `pnpm bundle:mobile` pass; `outcomeOf`, `prefill` and
  the bridge cases have tests.

## 8. Decided (2026-11-14)

1. **The look** is a trading app's order confirmation with confetti (§4.1), for every action that
   ends in a transaction. **No mascot.**
2. **No prefill when no amount is typed** (§2.1); a real shortfall is still prefilled, with the $1
   floor across chains.
3. **A success takes the screen by itself only where its sheet is still open**; elsewhere the pill
   celebrates and waits for a tap (§4.5).
4. Everything else as written above.

## 9. As built (2026-11-14)

- **Shared** (`packages/app`): `Receipt` on the trace (`sdk/txTrace.ts`), handed in by every
  ticket's `Action` and by *Get*; `recheck`, `resumeTraces`; the bridge's quoted arrival, its slow
  note and the destination-balance fallback (`bridgePollMs` in `configureTrace` for tests);
  `sdk/txOutcome.ts` (`outcomeOf`, `wonHead`, `holdingFor`); `sdk/activity.ts` (`useActivity`).
  The ladder exposes `traceId`, `sent`, `failed`, `failedStep`, `dismissFailed`; `start(title, receipt)`.
  Tests: `txOutcome.test.ts`, `txTrace.bridge.test.ts`, core's `getAmount.test.ts`.
- **Phone**: `src/ui/outcome/` (`Ring`, `Confetti`, `Outcome`, `motion`), `TicketEnd` in
  `src/ticket/parts.tsx` (a full-screen RN `Modal` over the ticket), the compact end in
  `src/ticket/get.tsx`, `src/ui/ActivityPill.tsx`, the chip's `Orbit`, `app/activity.tsx`,
  `app/receipt.tsx`, `src/explorer.ts` (explorer links from wagmi's chains), the `AppState` resume in
  `app/_layout.tsx`, and Activity under Profile and settings.
- **Web**: `ui/Outcome.tsx` (`OutcomeCard` in the ticket's `Action` and in *Get*, `ReceiptDialog`
  from the tray), `TxTray` on `useActivity`, the styles at the end of the tx section of `app.css`.
  Checked in a browser with injected traces (won, refunded bridge, bridging) at 1280 and 390 px.
- **"Done"** resets the ladder, so the same ticket opened later starts fresh; on the phone it also
  closes the sheet. A "Half done" failure goes back to the steps; any other "Try again" rebuilds.
- **Ticket 0016 §3–§4**, the same day: Lite's category lists put what you hold first under "Yours"
  (both apps; Pro unchanged), the yours pill says its rate (`yours $48 · 3.7%`), the row an action
  just landed in glows once when the ticket over it closes (`useArrivals`; scrolled to on the web),
  the balance chip's total moves instead of jumping and says what just landed for a few seconds
  (`useTween`, `useChipNews`, "+$250 at work"), and You puts positions opened in the last day
  first, marked new (`useNewHoldings`). On the phone the tab pages leave room for the pill while it
  shows (the bar's inset). The phone scrolls the glowing row into view; Pro's Earn on the phone puts
  held rows first (the web's Pro already lists your positions apart). A swap's or bridge's result
  remembers the ticket it was opened from (`useGetAsset`'s `from`), so "Try again" from the pill or
  the tray goes back there.
- **The rest of §4.3** (same day): the order's rows are one shared function (`receiptRows` in
  `sdk/txOutcome.ts`, both apps draw it) — the way out says what the position made since it was
  opened (`Receipt.made`, the index's figure at send), a change says before → after (leverage and
  distance to liquidation, `beforeOf`), a repay what is still owed or that the loan is closed, a
  bridge the gas it brought and its arrival transaction (`bridge.toHash`). A figure moves to the
  synced position's value instead of swapping (`Row.n`, `useTween`); a deposit's screen counts what
  it has earned since it landed (`earnedSince`); the steps signed sit behind a fold ("4 steps in one
  transaction"); a bridge that is on its way or failed links its own tracker where it keys one on the
  source hash (`core/model/bridgeLinks.ts`); the pill ends on "Your loop is open · $10.00 at 15.3%"
  (`pillLine`); Pro's "See it" names the strategy, so the row is lit and its ticket open.
  `pnpm shots --only end-` draws the four end states (won, soft, refunded, bridging).
- **Slice 6, native** (`mobile/src/feel.tsx`): `expo-haptics` (success pattern, error knock, a light
  tap as the pill lands) and `expo-notifications` (a reminder at a bridge's quoted arrival while the
  app is in the background, cancelled on return, a tap opens its receipt). Needs `pnpm mobile
  release`; older builds run the same JS without them. A bridge sent as a batch from a smart account
  still has no transaction to ask the bridge about: it settles on the destination balance, as before.
