# 0016 — "It's yours": a position-created moment you can't miss

- status: **proposed 2026-10-24**. Nothing built.
- area: `src/ui/Ticket.tsx` (`Action`, `StepRow`), `src/ui/useLadder.ts` (what the ladder
  exposes once `settled`), `src/ui/TxTray.tsx`, `src/ui/lite/LiteEarn.tsx`,
  `src/ui/lite/LiteBits.tsx` (`LiteRowView`, the `yours` pill), the Pro earn list on
  `src/ui/AssetPage.tsx`, the balance chip in the shell, `src/sdk/txTrace.ts` (read only),
  `styles/app.css`, maybe `brand/mascot`.
- depends on: nothing upstream. Every number it needs is on the client once `txTrace` has synced:
  the merged `earn-positions` rows, `received`, the trace phases.

## What happened

A $10 USDT0 → Maple loop (×7.7, Aave V3) was opened with one batched signature (EIP-5792). It
landed, and the app's feedback was:

1. **The ticket:** four step rows (Approve ERC20 · Approve borrow · Switch mode · Open loop), each
   with a ✓, the same hash and the same orange note repeated four times. Then "See your
   positions", which goes to `#/`. That's Home, the social page, not your positions.
2. **The list:** the Maple row got a small `yours $10` pill (`LiteRowView`, `pill run`). The row
   stays wherever it ranks, about 25th, below the fold. Nothing moves, highlights or scrolls.
3. **The header:** the ticket subtitle switches to `$10 yours · Levered ×7.7 …`. That's correct,
   but it's small text in the same place as before.

Without knowing where to look, you can't tell that it worked. For an app whose pitch is
"everything you hold, earning", the moment you start earning is the moment that has to land.

## Goal

When an action settles, the user should know without searching:

- **that it worked**, in one line,
- **what they now have**: amount, rate, what it earns per month, and for a loop how far it is from
  liquidation. These are read from the synced position, not the quote,
- **where it lives** (one tap to the position itself) and **what to do next**.

The same goes for the way out: a withdraw or close ends with "$10.12 back in your wallet, +$0.12
earned", not with checkmarks.

## Design

### 1. The ticket becomes a receipt card

Once the ladder is `finished`, the step list and the CTA block are replaced by one card:

```
 ✓  Your loop is open                     [mascot / brand mark]
    $10 in Dollars via Maple · Aave V3 · Base

    15.34% a year        ≈ $0.13 / month
    ×7.7 levered         5.3% from liquidation

    [ See it in your positions ]   [ Say why you did this ]
    Do another · View transaction ↗
```

- **While syncing** (`finished && !settled`): the same card in an "Opening…" state with
  `TxTrack` as one bar (sent · in block · final · in your positions), not one row per step. The
  figures fill in from the quote, greyed, and switch to the synced position when it arrives,
  with a short count-up on the amount and rate.
- **A batch is one transaction.** Show it as one line, "4 steps in one transaction", with the
  step names in a disclosure. The repeated per-step note is already fixed (shown once, under the
  last step); the card makes that moot.
- **Figures come from the merged position** (`earn-positions` after `txTrace.merge`), matched on
  the ticket's `touches` uids. If the sync timed out, say so plainly: "Landed on chain. Your
  position will show in a minute." Add a "Check again" button that re-runs the narrow read. Don't
  claim figures we haven't read.
- **The way out** uses the same card. Withdraw / close / repay shows what came back (`received`)
  and what was earned since the open, where the index has it.
- **Paper** gets the same card with the paper pill. "Done on paper" isn't a separate design.

### 2. "See it in your positions" goes to the position

It doesn't go to `#/`. It goes to the holding itself: Lite opens the holding's ticket on its
Manage tab, or You with that row scrolled to and highlighted. Pro goes to Positions with the row
highlighted. "Do another" resets the ticket on the same market.

### 3. The list shows what's yours

- **Yours first.** In a category list (Lite Earn and Pro), rows you hold go into a small "Yours"
  group at the top. The rest keep their ranking below. If you hold nothing, nothing changes.
- **Arrival highlight.** The row that just changed gets a 2–3 s accent glow and is scrolled into
  view when the ticket closes. One time only, keyed on the trace id.
- **The pill grows into a figure.** Replace `yours $10` with the row's right side showing your
  amount and your rate ("$10 · 15.34%"), with the market rate secondary. This needs to read at
  390 px.

### 4. The rest of the app hears it too

- **Balance chip:** the header total counts up to the new value, with a brief "+$10 at work" tag
  (for a deposit this is idle → at work, so the net doesn't change; say that, not "+$10").
- **Tray:** if the ticket was closed before it settled, the tray pill ends as "Loop open · $10 at
  15.34%", and tapping it opens the receipt card. Today it ends on "Done" and fades
  (`LINGER_MS`).
- **Home (Lite):** the next visit shows the new position at the top of "yours" for a day, with
  "new".

### 5. Tone

Pleased, not a slot machine: one restrained animation (✓ draw-in plus count-up), no confetti.
The brand mascot (`brand/mascot`) is a candidate for the card's corner. Decide in review.
Respect `prefers-reduced-motion`.

## Out of scope

- Push notifications (mobile app ideation; separate).
- Social auto-post. "Say why" stays opt-in, as today.

## Acceptance

- After a real or paper open, deposit, withdraw and close (EVM and Solana), the ticket shows the
  receipt card with figures from the synced position, or the honest "will show in a minute"
  state.
- "See it in your positions" lands on the holding, visibly highlighted.
- In the category list, the held row is in "Yours" at the top and glows once after the action.
  Check at 1440 and 390 px, Lite and Pro.
- A batched action shows as one transaction, not N identical rows.
- `pnpm build` and `pnpm test` pass, and `pnpm shots` covers the card in syncing, settled and
  timed-out states.

## Open questions

1. Lite only first, or both shells together? The ticket is shared, and the lists are separate.
2. Should "Yours first" apply in Pro as well, where people scan by rate?
3. Mascot on the card, or keep it typographic?
