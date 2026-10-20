# 0012 — Move a held loop or loan to a better market (migrate), EVM + Solana

- status: **plan, 2026-10-19**. Nothing built.
- area: `src/sdk/api.ts`, `src/sdk/types.ts`, `src/sdk/queries.ts`, new `src/model/migrate.ts`,
  `src/ui/Ticket.tsx`, `src/ui/BorrowTicket.tsx`, `src/ui/AssetPage.tsx`, `src/state/AppState.tsx`
- depends on: worker-api's `/v1/actions/loop/migrate` and `/loop/migrate/targets`, which already exist
  (checked in `~/lending-sdks/packages/worker-api/src` on 2026-10-19, router.ts:167-177).
  Production deploy not yet confirmed (§0).

## The idea in one paragraph

The backend already does the hard part. `GET /v1/actions/loop/migrate` builds **one atomic transaction**:
flash the debt, repay the source, withdraw the collateral, deposit on the target, borrow there, repay
the flash. On EVM this goes through the composer, or bundler3 for Morpho→Morpho. On Solana it is a
single v0 message. So in the app, "migrate" is not close-then-reopen. It is a third action on a held
position, next to Add and Manage. It is called **Move**, and it is one button and one signature (plus any
permissions). The clever part is in discovery. The loop catalogue is already loaded for every page
that shows a held position, so we can work out "this earns more elsewhere" in the client with **zero
extra requests**. The server is only asked (`/targets`, then `/migrate`) once someone opens Move.

## What the API gives us (summary, file refs in worker-api)

| | EVM | Solana |
|---|---|---|
| route | `GET /loop/migrate` (`leverage/migrate.ts:106`) | same route; SVM uids go to `handleSvmLoopMigrate` (`svm/loop.ts:2061`) |
| params | `marketUidSource{Collateral,Debt}`, `marketUidTarget{Collateral,Debt}`, `debtAmount` (raw, **required**), `account`, `accountIdFrom/To`, `slippage` (**a fraction**, 0.005) | same four uids, `operator`, `accountIdFrom/To`, `slippage` in **bps**; the position is read on chain, so no `debtAmount` |
| asset changes | at most one leg converts (collateral EXACT_IN or debt EXACT_OUT); native⇄wrapped is a wrap | the debt mint must match on both sides; the collateral may be sold inside the move |
| targets | `GET /loop/migrate/targets`: ranked by `migrate.netApr`, with `healthFactor`, `sufficientLiquidity`, `excluded[]` | **EVM only**, so the app builds the list itself (§2) |
| answer | `actions.permissions` + `transactions[0]`; `data.result` = `MigrateResult` (`from`/`to`, `apr`, `healthFactor`, `economics{entryCostUsd, carryPerDayUsd, breakEvenDays}`) | tx in `actions.alternatives`; `data.migrate{repay, withdraw, deposit, borrow}`, `data.economics` with **no carry**, so the app prices it |
| refused | Dolomite source; as target: Euler, Dolomite, LlamaLend (except →LlamaLend), Curvance, Twyne (except Aave teleport), Lista SmartLP, Fluid smart T2–T4 | two Loopscale sides; `TRANSACTION_TOO_LARGE` (Kamino→Save measured 11 bytes over) |

The route also takes a plain deposit+borrow **loan**, because nothing in it checks how the position was
opened. So the same feature covers both loops and Borrow-tab loans. A deposit-only (earn) position is
not supported: that would be withdraw + deposit, which is out of scope here (§7).

## 0. Verify before building (half a day)

1. Check the routes are deployed on `allocator.api.1delta.io`. Use a local `wrangler dev` for any sweep,
   not portal.
2. EVM: send `/targets` for a real Aave V3 Base loop. Then send `/migrate` with `account` (from `?as=`)
   to a Morpho target. Check that the `permissions` + tx simulate, and record the `MigrateResult` fields
   the UI relies on.
3. Solana: send `/migrate` for a Kamino → Jupiter Lend SOL-debt loop. Confirm the message fits and that
   `data.economics` / `data.migrate` look as documented.
4. Check what unit `Holding.debtAmount` is in. EVM needs the **raw** debt. Upstream floors at the live
   debt (MIGRATE_MORPHO_BUNDLER3.md §2), but we should still send the positions route's raw figure,
   never one read off the screen.
5. Ask upstream to turn on `DOCUMENT_SVM` (`openapi/actions/svm.ts:16`), or at least to freeze the SVM
   response shape we read.

## 1. SDK layer (follow docs/apis.md "New action")

- `sdk/api.ts`:
  - `migrateTargets({ from: {collateral, debt}, debtAmount?, collateralAmount?, count })`.
  - `loopMigrate({ from: {collateral, debt}, to: {collateral, debt}, debtRaw, account, accountIdFrom, accountIdTo, slippageBps })`.
  - Callers speak *from/to · collateral/debt*. The `marketUidSource*` / `Target*` names and the
    **slippage unit split** (fraction on EVM, bps on Solana) are translated here and nowhere else.
  - `accountId` `'0'` is left unsent, as on every other action.
- `sdk/types.ts`: `MigrateResult`, `MigrateTarget`, and the SVM `migrate` block.
- `sdk/queries.ts`:
  - `useMigrateTargets` (EVM only, `staleTime` 60 s, only while the Move ticket is open).
  - `useMigrateQuote` (`staleTime` 20 s, like `useLoopQuote`; on Solana it shows a quote only, and the
    signed build happens at click, see §4).
  - Account-specific, so these don't touch the prewarm list.
- Add one row to docs/apis.md's action-builder table, with the param mapping and the slippage gotcha.

## 2. Model: `model/migrate.ts` (pure, tested)

`movesFor(holding, catalogue, { chainKind }) → MoveOption[]`, from the loop rows already in memory:

- **Same position, other venue.** Same chain, same collateral and debt group (native⇄wrapped counts as
  the same), not the source pair, a target lender in the support matrix, and `debtTerms.canOpen !== false`.
  - The support matrix is a small mirror of `loopActionSupport.ts:786-801` (EVM) and `svmActionFamily`
    (Solana). It drives **hints** only. The `/targets` answer, or the `/migrate` error, is the truth, so
    a drift costs a hint and never a bad tx.
- **Compare at the holding's own leverage:** `net = dep·L − bor·(L−1)`, APR.
  - Rank and hint on `steadyRate` (30-day), not spot, so a one-day incentive spike doesn't send people
    across venues. The spot rate is still shown.
- **Fits:**
  - health after the move (`liqLtv` of the target at the holding's LTV) is above the Watch border;
  - `borrowLiquidityUsd ≥ debtUsd × 1.1`;
  - the Midnight / Loopscale / Lista term targets that need a term choice are left out of v1.
- **Worth it:** `deltaApr ≥ 0.5 pt` **and** break-even within 30 days.
  - Break-even = entry cost ÷ (Δcarry per day). Before a quote, entry cost is estimated as gas + flash
    fee (0 on Morpho/Balancer); the quote replaces the estimate.
- Solana: keep only targets with the same debt mint. Drop a pair if both sides are Loopscale.
- Tests: native⇄wrapped matching, base58 uids kept verbatim (`normAddr`), the leverage arithmetic, and
  the threshold edges.

## 3. UI

- **The hint** (`AssetPage.posOf`, and the held-loan row in `loanOf` / `BorrowPage`).
  - Under a held position: "earns **+2.4 % APR** on Morpho · Move ›". At most one line, only when
    `movesFor` says it is worth it.
  - The Positions sheet stays a link list.
- **The route:** add `Mode = 'move'` in `state/AppState.tsx:39`, and `to=<strategy id>` (optional;
  without it the ticket shows the list).
  - e.g. `#/USD?u=..&s=<from id>&k=loop&h=<holdingKey>&m=move&to=<id>`.
- **Loop ticket.** `Ticket.tsx` gets a third tab next to Add / Manage: `MoveLoop`.
  1. *Where to*: the `movesFor` rows, refined by `/targets` on EVM. Rows the server excluded are greyed
     out and show its `reason`; `sufficientLiquidity: false` rows go last.
  2. *Before → after* card: venue, net APR (spot and 30d), health, leverage (kept), and per-day carry
     Δ in dollars.
  3. *Cost*: `economics.entryCostUsd` (slippage/fees/gas), and "pays for itself in N days". Above the
     30 days, say so and soft-block the button behind a tick box, as the borrow ticket does for spicy.
  4. One `Action` through `useTicketLadder`, with the permissions as steps.
     - `touches` = **both** source and target uids, so `txTrace` re-reads both.
     - `watch` = the collateral and debt tokens, for dust from a collateral sale.
  5. A held sub-account: send `accountIdFrom`. `accountIdTo` stays unset (a fresh Fluid NFT / Kamino
     obligation), unless the reader already holds the target, which is then an "add to your existing
     position" line.
- **Loan ticket.** `BorrowTicket.tsx` gets the same pane on a held loan.
  - The "a cheaper market elsewhere is a new loan there, not a switch" rule (`:295`) becomes "cheaper
    on X · Move this loan ›".
  - It is the same component as `MoveLoop`, labelled in loan words.
- **After the move:** the old holding disappears and the new one appears, from the same positions
  re-read. No special state is needed.

## 4. Solana specifics

- **Build at click, never in advance.** The blockhash lasts about 90 s, and the ladder already drops and
  rebuilds an expired bundle (`useLadder.ts:140-156`). The quote shown is an unsigned build without
  `operator`, or with `operator` but never signed.
- **Price the carry ourselves.** `data.economics` has no carry, so use the `movesFor` rates × the
  position's dollars.
- **`TRANSACTION_TOO_LARGE`**: mark that target "can't move in one transaction" and remember it per
  (source lender, target lender) for the session. There is no automatic close + reopen in v1: two
  transactions leave the user unhedged in between.
- **`UNSUPPORTED_ON_SVM` / `NO_POSITION`**: show the server's sentence; don't retry.

## 5. Paper

v1 hides Move on paper accounts. A paper move done as `reduce{all}` + `open` would be two server
round-trips that both charge entry costs, so it would be cheaper to do for real than on paper, which
is backwards. The proper fix is a `move` op in `model/paper.ts`: one ledger step, priced with the
quote's entry cost, keeping the server's value checks. That means copying `paperModel.ts` (`pnpm
paper-check --write`) and a social deploy, which is ticket 0013 if the Yield Cup wants it.

## 6. Order of work

| step | what | done when |
|---|---|---|
| 0 | verify routes, units, SVM shape | a recorded EVM + Solana quote in this ticket |
| 1 | `sdk/*` + docs/apis.md row | `pnpm build` green |
| 2 | `model/migrate.ts` + tests | tests green |
| 3a | `MoveLoop` tab + `m=move` route, EVM | a real Aave→Morpho move on Base, small size |
| 3b | the hint on held rows | shows on a held position with a real better venue, silent otherwise |
| 3c | the loan pane in `BorrowTicket` | a real loan moved |
| 4 | Solana branch | a real Kamino→Jupiter Lend move |
| 5 | paper `move` op | separate ticket |

## 7. Out of scope (later tickets)

- **Converting a leg** (USDC debt → USDT debt, wstETH → weETH). The API can do one leg, but comparing
  two moneys needs the desk logic (`model/desk.ts`). v2.
- **Refinance**: Lista/Exactly term roll on EVM; Kamino rollover and Loopscale on Solana
  (`/loop/refinance`). Same lender, new term. This is a natural follow-up for dated loans.
- **Moving an earn deposit**: withdraw + deposit as one ladder of two transactions, not atomic.
- **Cross-chain.** The API refuses it.
- **Feed / index:** a move shows on the index as repay + withdraw + deposit + borrow in one tx. Folding
  that into a "moved from Aave to Morpho" card is pos-indexer work. It is also worth a badge on the
  board ("moved to better carry").

## Risks

- **Matrix drift** between `model/migrate.ts` and worker-api. Mitigation: the server decides, and the
  hint is only a hint.
- **Unit mistakes** (raw debt; fraction vs bps slippage). Mitigation: keep them in one place in
  `sdk/api.ts`, with a unit test on the mapping.
- **Chasing spikes.** Mitigation: rank on the 30-day rate, plus the break-even gate.
- **Fresh vs existing target account.** Mitigation: Fluid/Kamino open a new position by default. Merging
  into an existing one is only offered when the reader holds the exact target pair.
