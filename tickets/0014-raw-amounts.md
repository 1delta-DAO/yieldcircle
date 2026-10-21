# 0014 — Amounts are integers: stop sending floats to the API

- status: **parts 1–3 built 2026-10-21.** Amount boxes hold text, and Max and the percent buttons hold
  references to the raw value. Everything sent is resolved on raw integers and capped at what is held.
  Part 4 (the API side) is open and needs a decision, see below. Not committed or deployed, and the
  fork check is not done.
- area: `src/model/leverage.ts` (`toRaw`, `payRaw`), `src/model/positions.ts` (`Idle.raw`),
  `src/ui/Ticket.tsx`, `src/ui/BorrowTicket.tsx`, `src/ui/GetAsset.tsx`, `src/ui/useBook.ts`,
  `src/sdk/queries.ts`
- depends on: nothing outside this repo. The API already takes raw integer strings everywhere and
  already serves raw balances (`balanceRaw` on wallet rows, `amountRaw` on holdings).

## What happened

A Resupply loop open reverted on-chain. The calldata asked to pull a margin of
`74.279038916651000000` from a wallet holding `74.279038916650833376` — **166,624 wei more than the
wallet had**. The transfer failed, and the whole loop failed with it. Simulating the same transaction
with the exact balance as the margin succeeded, so nothing else in the build was wrong.

The margin had gone through these steps:

1. The API served the balance as a raw integer (`balanceRaw`) and as a float (`amount`).
2. The UI kept only the float, `74.27903891665083`, which is already rounded at about 16 significant
   digits.
3. **Max** set the box to that float. The leverage slider then re-rendered the ticket, and the
   number was passed along as a plain JS number.
4. `toRaw(amount, 18)` turned it back into an integer with `toFixed(12)`, which **rounds half up**
   to `74.279038916651` and pads the remaining 6 decimals with zeros.

Every step looks harmless, and nothing downstream checks the result against the balance. A number
meant to be "all of it" came back larger than all of it. With an 18-decimal token this is almost
certain whenever Max is used, because any balance with more than 12 significant decimals is
affected. The same thing happens with 6-decimal tokens whenever the float carries representation
error past the 6th decimal. That error is rarer, but it is the same bug.

## The rule

**A user amount is an integer in the token's smallest unit from the moment it is read until the
moment it is sent.** Floats are for display and for maths that only produce display numbers, such
as health, APR or dollar value. Two consequences:

- *Max* and *100 %* are not numbers the reader typed. They are **references to a raw value** we
  already have (`balanceRaw`, `amountRaw`, the debt the API quotes). Send that value verbatim.
- A *percentage* of a balance is computed on the raw integer (`raw * p / 100n`, rounding down),
  never as `float * p / 100` then `toFixed(6)`.

A typed amount is the only legitimately decimal input. It is parsed from the **string the reader
typed** (`parseUnits(text, decimals)`), not from a JS number. It is then clamped to the raw balance
before it is sent.

## Part 1 — built: clamp the pay side (2026-10-21)

- `Idle.raw` carries the wallet's `balanceRaw` (`positions.ts` `idleFrom`). When `useBook` merges two
  idle rows for the same token, it clears `raw`, because the summed float no longer has a single raw
  value behind it.
- `payRaw(amount, decimals, have)` (`model/leverage.ts`):
  - returns `have.raw` verbatim when `amount >= have.amount`;
  - otherwise returns `min(toRaw(amount), have.raw)`;
  - and without a `raw` it falls back to plain `toRaw`.
- Used at `Ticket.tsx` 263 (earn deposit), 363 (fixed-rate deposit), 594 (loop quote) and 636 (loop
  open), and in `GetAsset.tsx`. Tests: `model/payRaw.test.ts`, including the exact case above.
  101/101 pass.

This fixes the reported failure. It is a guard at the boundary, not the design: the float still
travels through the ticket, and every other place that sends an amount still converts a float.

## Part 2 — built: the remaining float → raw sites (2026-10-21)

`heldRaw(h)` (`model/leverage.ts`) gives a position's `{ amount, raw: amountRaw }`, so that `payRaw`
caps what comes out of a position the same way it caps a wallet:

- **Withdraw**: `ManageFixed` and `ManageTicket` (`earnWithdraw`, `midnightSell`) send
  `payRaw(eff, …, heldRaw(h))` when they are not on the `amountRaw` full-exit path. Max and 100 % can
  no longer exceed the holding.
- **Manage loop**: a partial deleverage sells, and so does the keep-collateral close, plus the paper
  quote for that sale: each is capped at the collateral's `amountRaw`.
- **BorrowTicket**: Put up (deposit, and deposit-and-borrow) is capped at the wallet's `balanceRaw`.
  A partial repay is capped at the debt token's wallet balance, and the withdraw leg at `amountRaw`.
- Tests: 4 more in `model/payRaw.test.ts`: Max withdraw, 100 % rounding up, a 6-decimal float error,
  and no raw. 105/105 pass, and `pnpm build` is clean.

`grep -n "toRaw(" src/` now lists only output sizes: the loop's `debtAmountRaw`, the borrow amount,
and the `lendingRange` read-only probes. It also lists the `allRaw` fallback for a position that has no
`amountRaw`.

The table below is the audit this part worked from:

Each of these can send more than the reader holds, or more than they owe, in the same way.

| Where | What is sent | Raw value to use instead | Risk |
|---|---|---|---|
| `BorrowTicket.tsx` 253–255 (`build`) | `collateralRaw: toRaw(put, …)` and deposit `amountRaw` | wallet `balanceRaw` of `chosen` via `payRaw` | Max on Put up uses `floor6` (safe for 6-dec tokens, safe-by-truncation on 18), but a typed float is not clamped |
| `BorrowTicket.tsx` 203, 227 | borrow `toRaw(debtUnits, …)` | — (an output, the venue caps it) | low: an over-ask reverts with the venue's own error |
| `BorrowTicket.tsx` 425–427 (repay / withdraw-and-repay) | `repayRaw: toRaw(r, …)`, `withdrawRaw: toRaw(w, …)` | `isAll` / `repayMax` already cover "all"; partial repay should be `min(toRaw(r), walletRaw)` | **medium**: Max sets `+owed.toFixed(6)`, which can land a hair *above* owed and is pulled from the wallet |
| `Ticket.tsx` 424, 810 (withdraw) | `toRaw(amount, …)` unless `fullExit` | `h.amountRaw` (already used on `fullExit`) | **medium**: Max = `h.amount` (float); 100 % = `+(h.amount).toFixed(6)`, which rounds half up, and the default `+h.amount.toFixed(6)` on line 421 can start above the holding |
| `Ticket.tsx` 451, 823 (percent buttons) | `+(h.amount * p / 100).toFixed(6)` | `h.amountRaw * p / 100n` | 100 % is the Max case above |
| `Ticket.tsx` 921, 953–974 (manage loop / close) | `allRaw` and `toRaw` on withdraw / repay legs | the position's `amountRaw` / `debtRaw` | medium on partial close; full close is flagged `isAll` |
| `queries.ts` 1040 | `debtAmountRaw` | the API's quoted debt (raw) | low: a quote, re-sized server-side |
| `GetAsset.tsx` 67 | `min(src.amount, …toFixed(6))` | clamped by `payRaw` since part 1 | done |

The **sliders** (`Ticket.tsx` 694 and 986 for leverage; `BorrowTicket.tsx` 328 for borrow amount) do
not produce pay amounts themselves. They set leverage or the amount *taken*. What they do is
re-render the ticket and recompute derived numbers from the float margin. That is why the bug
showed up "after moving the slider": the slider was where the reader stopped, not where the error
came from. Under part 3 they need no change. The derived numbers will read the raw margin divided
by `10^decimals`, which is a display-only float.

## Part 3 — built (2026-10-21)

How it was built, against the design below:

- `model/amount.ts` holds `Amount = { text, pct? }`. A keystroke sets `text`. **Max** and the
  **percent buttons** set `pct` (100 = Max) through `portion(have, p, decimals)`. `pct` is a reference:
  it is resolved on `have.raw` when the amount is sent, so it follows a balance that refreshes or a
  pay token that changes. Storing a `bigint` would have gone stale in both cases. The box shows the
  raw value cut to 8 decimals, never rounded up.
- `payRaw(amount, decimals, have)` is the only path to the API. A reference gives
  `raw * pct / 100n`, rounding down. Typed text is parsed digit by digit (`parseUnits`, which cuts
  extra decimals) and capped at `have.raw`. No float is involved at any step.
- `AmountInput` (`ui/bits.tsx`) is the text box, and `AmountBox` uses it. `DecimalInput` (number) is
  left only on the borrow amount, which is an output.
- `useStickyAmount` (`state/sticky.ts`) stores the `Amount` as JSON. A bare number written by an older
  build is read back as typed text.
- Converted:
  - earn deposit, fixed-rate deposit and loop margin (`Ticket.tsx`);
  - fixed-rate withdraw and sell, and earn withdraw, including their percent buttons;
  - Put up, Pay back and Take out (`BorrowTicket.tsx`);
  - GetAsset. Its custom-token row now carries `raw` as well.

  Ladder keys use the raw that is sent, not the float.
- Float-born sizes keep a float and are capped by `capRaw` (`model/leverage.ts`). These are the
  manage-loop deleverage and keep-collateral sells, a full exit on a holding that has no `amountRaw`,
  and a full repay, which the venue sizes on chain through `isAll` / `repayMax`.
- **Merged idle rows: this differs from point 6.** `mergeIdle` (`model/positions.ts`, moved out of
  `useBook`) always drops `raw`, even when the decimals agree. The parts sit on different chains, so
  no single transfer can send their sum. Nothing pays from a merged row today: it only feeds the book
  view.
- Tests (`model/payRaw.test.ts`, 115/115 pass) cover:
  - the live 18-decimal case and a 6-decimal balance;
  - percents rounding down on the raw;
  - a reference following a changed balance;
  - typed text parsed past 15 digits and capped;
  - text-to-units round trips, and reading a number stored by an older build;
  - merged rows.

  `pnpm build` and `pnpm build:landing` are clean.

The design as proposed:

1. **Ticket state holds `{ text, raw }`, not a number.**
   - `text` is what the box shows, exactly as typed.
   - `raw` is a `bigint`. It comes from `parseUnits(text, decimals)` for a typed amount, or from
     the referenced raw value for Max and the percent buttons.
   - The float everyone uses today becomes a derived `Number(raw) / 10 ** decimals`, for display and
     health maths only.
2. **`AmountBox` / `DecimalInput` gain `onMaxRaw`.**
   - Max sets `raw = balanceRaw` (or `amountRaw`, or the quoted debt) and `text = formatUnits(raw)`
     trimmed for display.
   - A later keystroke replaces both.
3. **Percent buttons** set `raw = base * BigInt(p) / 100n`. 100 % is the same reference as Max.
4. **The send sites** read `raw.toString()` and drop `toRaw` entirely. `toRaw` stays only for
   genuinely float-born numbers that are outputs, such as a borrow amount derived from a leverage
   or a slider. Those are capped server-side, and a tiny overshoot is a refusal with a message, not
   a revert.
5. **Sticky state** (`useSticky`) stores `text`, never a float, so a reload cannot resurrect a
   rounded value.
6. **Merged idle rows** (`useBook`) sum the raws when the decimals agree. When they disagree, they
   keep `raw` undefined, and Max is then refused instead of guessed.

## Part 4 — belt and braces on the API side

**Open: needs a decision first.** The app *quotes* through the same `/loop/leverage` call it
builds with, and it sends `account` on quotes (`useLoopQuote`; LlamaLend only quotes with an
account). A hard refusal would therefore also blank the preview whenever the reader types more than
they hold, which is exactly when the ticket offers Get more. It would blank it on paper as well.
Options:

- refuse only on an explicit build flag;
- or return the shortfall as a warning on the quote (`data.warnings: INSUFFICIENT_BALANCE`) and
  refuse on simulate.

Also, `marginFromAccountId` (Dolomite) funds from a sub-account rather than the wallet, so the check
must read that source instead.

The original proposal: when `/loop/leverage` (and the lending deposit / repay routes) are called with
an `account`, they already read the wallet's balance for allowance checks. They should refuse a
`payAmount` above that balance with a named error (`INSUFFICIENT_BALANCE`, both figures in the
message) instead of building calldata that reverts on-chain. That protects every client, not only
this one. It is a lending-sdks change, tracked there.

## Done when

- No `toRaw` call takes an amount the reader pays or receives from their own wallet or position.
  `grep -n "toRaw(" src/` lists only output sizes.
- Max and 100 % on every ticket send the exact raw balance or holding. Tests cover an 18-decimal
  balance with more than 12 significant decimals, a 6-decimal balance, and a merged idle row.
- A loop opened at Max on a fork succeeds with the margin equal to `balanceOf` to the wei.
