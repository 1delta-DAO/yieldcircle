# 0015 — Lever a deposit that is already there

- status: **built 2026-10-21** (§1–§4 and §5 for EVM; see "As built"). Not committed or deployed.
  Nothing was signed. Solana / Kamino in place is left for later.
- area: `src/model/positions.ts`, `src/model/strategies.ts` (or a new `model/putUp.ts`),
  `src/ui/AssetPage.tsx` (`matches`), `src/ui/Ticket.tsx` (`Ticket`, `LoopTicket`, `ManageLoop`),
  `src/ui/Positions.tsx`, `src/sdk/types.ts`, `src/sdk/api.ts`
- depends on: nothing new upstream for Aave forks, Euler, Morpho, Dolomite or Fluid. Two upstream
  gaps (eMode read on a GET, and the Aave collateral flag) are worked around here; see §4.
- follows: [0011](0011-borrow-tab-amounts-collateral.md) §4, which did the same for Borrow
  (`depositsAsLoans` in `model/borrow.ts`).

## As built (2026-10-21)

Where this differs from the plan below, this section is what the code does.

- **The screenshot was not a plain deposit.** Read live, the xLend account owes **0.486 USDC
  against 0.616 YOUSD**: a 3.8× loop at health 1.06. `holdingsFrom` dropped every debt leg under
  $0.50 as dust, so the loop read as a 0 % deposit. Now a debt is dust only when it is also under
  1 % of the account's supply (`positions.ts`). That account shows as `YOUSD / USDC loop · 3.8× ·
  owes $0.49`, health 1.06, with Add / Manage. Test: `putUp.test.ts`, "holdingsFrom on a small loop".
- **`model/putUp.ts`**:
  - `depositsAsLoops(s, holdings)` returns `{ lever, beside }`.
  - `cannotLeverInPlace` covers Solana, Gearbox, a Morpho or Lista supply with the flag off, and
    Dolomite account 0 or `iso:` under 100. A Kamino Multiply sub-account goes in `beside` with
    its own `unsupported` text.
  - `needsCollateralOn` is true when the flag is false and the lender is not on the list of
    venues that switch it themselves or have fixed flags.
  - A deposit's neighbours in the same account (`Holding.accountKey`, with the flag on) become
    `others`.
- **AssetPage**:
  - `matches` joins loops on `collateralUid` (case-insensitive) instead of `earnUid`.
  - `heldAll(loop)` adds the put-up deposits.
  - The deposit row gets **Lever**, which opens the best loop on that market on Manage.
  - The loop card or row gets a "500 YOUSD in" pill. Like "running", it is hidden while a ticket
    is open.
  - `beside` goes to the ticket as one line ("stays a plain deposit: … This opens a new loop
    beside it").
- **Ticket**:
  - A put-up holding opens on the second tab, labelled **Lever it**. The summary reads
    "$533 · 500 YOUSD deposited".
  - `ManageLoop` runs from 1× to max. There is no Close snap and no close at 1×. It starts on
    the tier the open ticket would use, and the button reads `Lever to 3.25× · borrow … USDC`.
  - The account's other collateral gets its own caution: the venue's health will be higher than
    the pair's.
  - With the flag off, a visible line says the first transaction switches it on.
- **Builds**:
  - `loopOpen` takes `simulate`. It is sent on every step-up (running loops too) and on an Add
    into a held account.
  - `enableCollateral` (`/lending/enable-collateral`) is prepended by `collateralOnFirst` on a
    put-up lever, on a LoopTicket Add into one, and on a put-up borrow in `BorrowTicket`. 0011
    had the same hole there.

**Verified.**
- `pnpm build` passes, and 124 tests pass (9 new).
- Live API:
  - xLend positions carry `collateralEnabled` per leg.
  - The pair uid is the leg uid, lower-cased.
  - The YOUSD/USDC pair is eMode 0.
  - `enable-collateral` on the xLend YOUSD market answers one `setUserUseReserveAsCollateral` tx
    (permissions `null`, handled).
  - `loop/leverage` with no `payAmount` and `simulate=true` for a plain-USDC Aave Base wallet
    (0x03a5…c467, USDC/GHO, 1000 GHO) answers one credit-delegation permission and 6 routes.
    It returned no `simulation` block, so the venue's health is not cross-checked yet.
- In the browser (`?as=0xbada…`, 1440 and 390 px):
  - the real account as a loop at health 1.06;
  - a mocked plain deposit (the same account with its debt removed, plus 0.1 WETH beside it,
    flag on and off): the Lever button, the pill, the Lever it tab, the others caution, the
    collateral line and the figures.

**Not verified.** Nothing signed. No Euler, Fluid or Dolomite deposit was quoted live. Gearbox's
quota on an existing account is still unconfirmed, so Gearbox is not levered in place.

## What happened

The YO asset page shows **YOUSD · xLend · Base, $0.66, Deposit, 0.00 %**. It also lists the
**YOUSD / USDC · Xlend** loop. That loop's ticket opens as a fresh open: "You pay with YOUSD 0",
"Don't have enough YOUSD?". It does not offer "Increase leverage" on the 0.616 YOUSD that is
already supplied to the same market. That deposit earns 0 %, so levering it is the only reason
to hold it there.

Why:

- `holdingsFrom` (`positions.ts` ≈ line 166) makes an account with supply and no debt one
  `kind: 'simple'` holding per supply leg. These carry `marketUid` and `accountId`, but no
  `collateralUid` or `debtUid`.
- `AssetPage` `matches` (line 129) requires `h.kind === s.kind`, so a deposit never matches a loop.
  The loop ticket gets `holdings=[]`. There is no Manage tab, and `ManageLoop`, which already
  builds a pure leverage step, is never reached.
- `matches` also joins loops on `h.earnUid === s.marketLongUid`. That is the catalogue's earn uid
  standing in for the market uid. It holds today, but `marketUid` is the field that means
  "this market".

Borrow already handles this case: `depositsAsLoans` reads such a deposit as a $0 loan
(`putUp`). Loops need the same thing.

## What the API does (checked in `~/lending-sdks`, 2026-10-21)

- **`/v1/actions/loop/leverage` with no `payAmount` is a pure leverage step on EVM.** It
  flash-borrows `debtAmount` of debt, swaps it to collateral, deposits for the user and borrows to
  repay (worker-api `v1/actions/leverage/open.ts:1264`, `:1391-1427`). It needs no margin and
  sets no health gate. `leverage` is ignored on the composer path, and `debtAmount` alone sizes
  the trade. `ManageLoop`'s "Increase to N×" already relies on this.
- **It reads the account but never sizes from it.** The existing deposit is untouched and the
  new collateral is added beside it. So the step is "borrow `E·(L−1)` of debt" with
  `E` = the deposit's value, exactly as `ManageLoop` computes it with `D = 0`.
- **Per venue:**

  | Venue | In-place lever of a plain deposit | Notes |
  |---|---|---|
  | Aave V3 + forks (xLend is one: `AAVE_V3_LENDERS`) | yes, with two caveats | (a) the build never enables the collateral flag. A supply with `usageAsCollateral` off stays off, and the borrow reverts. (b) eMode comes from the pair. On a GET without `simulate=true` the user is assumed to be in mode 0 (`open.ts:1465`), so a user already in mode X gets a redundant `setUserEMode`, and a user in X on a mode-0 pair gets no switch. |
  | Euler V2 | yes, same sub-account only | The EVC batch always prepends `enableController(debt)` + `enableCollateral(coll)` for the sub-account (`euler/margin/open.ts:56-68`). `accountId` picks the sub-account, so the deposit's own `accountId` must be sent. |
  | Morpho Blue | only a **collateral** supply | A loan-side supply (`supply`) can never back a borrow. Positions mark it `collateralEnabled: false`. Market uids are `MORPHO_BLUE_<id>:<chain>:<asset>`, so a loop's `marketLongUid` is the collateral leg by construction. bundler3 takes margin 0 ("pass 0 to lever an existing position"). |
  | Dolomite | yes, explicit | margin 0 means "collateral is ALREADY in the trade account, just borrow + swap" (`dolomite/margin/open.ts:21-30`). Account 0 is supply-only, so borrowing needs account ≥ 100 for isolation (`isolation.ts:182`). A deposit in account 0 cannot be levered in place. |
  | Fluid | only a vault NFT with collateral and no debt | `accountId` = nftId. The open goes through the NFT-custody flow on that NFT. An fToken lend is not a vault position and never matches by uid. |
  | Compound V3, Silo | yes, nothing special | |
  | Init | `posId` required: an existing position is the only way in | |
  | Gearbox | credit account by `accountId` | Whether a quota is raised for existing collateral is unconfirmed. Leave Gearbox out of v1. |
  | Kamino, Jupiter Lend (Solana) | ADJUST: no `payAmount` + `accountId` → adjusts to `leverage` from the chain's position (`svm/loop.ts:1483-1517`) | On Solana `debtAmount` is ignored and `leverage` is the input. Jupiter Lend: `accountId` = NFT, so a lend-only deposit has none. Kamino: vanilla obligation by default. The elevation-group check reads the vanilla PDA even for a custom `accountId` (`calldata-sdk-sol .../margin/index.ts:1295`). |

- **Positions legs carry `collateralEnabled`** (margin-fetcher `earn/positions.ts:419`, from
  Aave's `usageAsCollateralEnabled`, Morpho's leg side). The app's `EarnPositionLeg` type drops
  it today. No eMode or `modeId` is on the positions route (`selectedMode` is dropped at
  `positions.ts:441-525`).
- **Uids**: legs are `lender:chainId:ref`, with ref lower-cased on EVM. The pairs feed is built
  elsewhere, so compare case-insensitively (as `depositsAsLoans` and the worker do).

## The plan

### 1 · Model: a deposit in a loop's collateral market is a 1× loop

- `sdk/types.ts`: add `collateralEnabled?: boolean` to `EarnPositionLeg`.
- `positions.ts`: carry it on simple lending holdings (`collateralEnabled`), alongside `marketUid`
  and `accountId` / `subAccount`.
- New `depositsAsLoops(s: LoopStrategy, holdings): Holding[]`, the twin of `depositsAsLoans`.
  It takes every `kind: 'simple'`, non-paper holding with `marketUid` ≈ `s.marketLongUid`
  (case-insensitive) on `s.chainId` and `valueUsd ≥ 0.5`, and returns it as
  `{ ...h, kind: 'loop', putUp: true, leverage: 1, collateralUid: h.marketUid, debtUid: s.marketShortUid, debtSymbol, debtDecimals, debtAmount: 0, collateralAddress, debtAddress, collateralUsd: h.valueUsd, health: null }`.
  The `key` stays the deposit's, so `pick` / `route.h` keep working.
- It does **not** match when:
  - `collateralEnabled === false` on a venue where that is final: a Morpho loan-side supply, a
    Fluid fToken. On Aave forks a disabled flag still matches, but the ticket must enable it
    first (§4).
  - the account already owes something. That account is a `loop` / `borrow` holding already, and
    it falls under the existing match or under "other debt" (§3).
  - the venue cannot lever in place (table above): Dolomite account 0, a Jupiter Lend earn
    deposit, Gearbox for now. There the deposit is shown as context only ("your 0.6 YOUSD on
    xLend stays as a deposit; this opens beside it").
- Tests in `model/putUp.test.ts`: uid casing; a Morpho loan-side supply is refused; a deposit in
  a sub-account keeps its `accountId`; two sub-accounts give two holdings; an account with debt
  is not turned into a 1× loop.

### 2 · Join: the loop row and ticket see it

- `AssetPage` `matches`: for loops, compare `h.collateralUid ?? h.marketUid` against
  `s.marketLongUid` case-insensitively, not `earnUid`. `heldAll(s)` for a loop becomes
  `[...real loops, ...depositsAsLoops(s, b.holdings)]`.
- `Your positions`: the deposit row stays a deposit and keeps its own ticket. Under it, a quiet
  line links to the best loop on that market: "Lever it · up to 6.1 % on YOUSD / USDC →". Open
  that loop's ticket on Manage with `h` = the deposit.
- Loop rows: when a put-up deposit exists, the row's sub-line says "0.62 YOUSD already in". This
  is the 0011 "already put up" wording, so the same idea reads the same in Borrow and Earn.
- Paper: `depositsAsLoops` skips `h.paper` in v1, as `depositsAsLoans` does. A paper deposit
  levered in place needs a `lever` plan from a 1× start; check `leverPlan` handles `D = 0`
  before turning it on.

### 3 · Ticket: Manage on a put-up deposit

`Ticket` gets the 1× holding and shows the tabs. **Add** keeps today's fresh-margin open into
the same account (`holding: into`, `accountId`). **Manage** opens `ManageLoop`. Changes there
when `h.putUp`:

- `Lnow = 1`, `D = 0`. `minL = 1`, but **there is no "Close"**: left of 1× is the deposit
  ticket's Withdraw. The slider runs 1× → `s.maxLev`, the snaps are the tiers plus "Now · 1×",
  and the default target is the strategy's default tier, not "Now".
- Copy: "You have 0.616 YOUSD in xLend · nothing borrowed. Borrow USDC against it, buy more
  YOUSD." The button reads `Lever to 3.25× · borrow 1.48 USDC`.
- The figures (net after, health, drop to liquidation) use `s.liqLtv` and `s.depSpot` /
  `borAt(D2)`, exactly the existing step-up path.
- **Other legs in the same account.** On a cross-margin venue (Aave, Compound V3, Dolomite
  account N, Euler sub-account with more than one collateral) the account's other supplies
  will back this debt too. The model's health is the pair alone, which is the pessimistic side.
  Say so with the existing `LegsPill` / others note. Build `others` for the put-up holding from
  the sibling simple holdings with the same `positionUid:accountId`.
- **Other debt in the account** (an account that owes something else, e.g. YOUSD supplied and
  WETH borrowed). Not levered in place in v1. On an isolated-account venue (Euler, Dolomite,
  Fluid) the Add tab opens in a fresh sub-account, as the "opens a new position beside" note
  already says. On Aave-likes it is the loan holding's business; show only the context line.
- Build: `loopOpen({ collateralMarketUid: s.marketLongUid, debtMarketUid: s.marketShortUid,
  debtAmountRaw: toRaw(E·(L−1)/priceShort), slippageBp, leverage: L, account, accountId: h.accountId })`.
  This is the existing `upParams`, unchanged. Trace `watch` covers both legs already.
- **Solana** (Kamino vanilla obligation): the same call is an ADJUST to `leverage`, and
  `debtAmount` is ignored, so it fits as is. Allow it only where `accountId` resolves to the
  obligation the elevation check reads (vanilla). Leave custom obligations and Jupiter Lend out
  in v1.

### 4 · Guards for the two upstream gaps

- **Aave collateral flag off.** When `h.collateralEnabled === false` on an Aave-type lender,
  prepend `/v1/actions/lending/enable-collateral` (worker-api already serves it,
  `v1/actions/lending/enable-collateral.ts`) as the first step of the ladder: "Use YOUSD as
  collateral" → then "Lever to N×". Add it to `sdk/api.ts` next to `lendingAction`. Upstream
  ask: let the loop build add the step itself, as it does for Venus and Aave V4
  (`open.ts:1488-1510`).
- **eMode assumed 0 on a GET.** Send the step-up for an account that already holds something
  with `simulate=true`, so `simulationBody.modeId` is the user's real mode (`userContext.ts:764`).
  This also fixes today's step-up on running Aave loops, which has the same blind spot, and the
  simulation's `pre`/`post` health becomes a cross-check for the model's number. 0008 notes that
  trust `post` only when `pre` matches. Upstream ask: read `selectedMode` on every request with
  an `account`, and put it on the positions route.
- **eMode conflict.** If the pair needs eMode X and the account holds other assets outside X,
  `setUserEMode` reverts. The positions route does not say which mode the account is in. Rely on
  the quote/simulation failing and show the API's message. Do not guess.

### 5 · Sub-accounts, all together

- One put-up holding per sub-account that holds the collateral. The existing "Which position"
  picker shows them (`Main account $0.66`, `Sub-account 3 $1.2k`). They are never summed.
- `subAccount.unsupported` (a Kamino Multiply obligation) shows `CannotManage`, as today.
- Every call sends the deposit's `accountId` (`'0'` stays unsent). On Euler that is what makes
  the EVC enable the controller on the right sub-account. On Fluid it is the NFT. On Dolomite
  it is the account number, and account 0 is refused before the build (§1).
- A sub-account picked for a put-up lever that already has a controller on another debt vault
  (Euler) is "other debt" (§3) and is not offered in place.

## Order

1. §1 + §2 (model, join, tests). The Manage tab appears. Half a day.
2. §3 (ticket copy, no Close at 1×, others note). Half a day.
3. §4 guards: `simulate=true` on step-ups, enable-collateral pre-step. Half a day. Verify first
   whether `simulate=true` changes the returned transactions or only adds the simulation.
4. §5 Solana / Kamino vanilla, after an ADJUST from a 0-debt obligation has been quoted.

## Verify before building

- V1. The user's xLend position: read `/v1/data/earn/positions` for the wallet (once; mind the
  rate limit, see the API-testing notes). Check that the YOUSD leg's `marketUid` equals the
  loop's `marketLongUid` up to case, that `collateralEnabled` is set, and which eMode the pair
  carries.
- V2. Quote `/v1/actions/loop/leverage` for that wallet with no `payAmount` and a 1.5 USDC
  `debtAmount`, with and without `simulate=true`. There should be one transaction (plus
  `setUserEMode` if the pair needs one), and `post` health should be ≈ `healthAt(liqLtv, L)`.
- V3. A Euler wallet with a plain deposit in sub-account N: the quote's EVC batch enables both
  vaults on sub-account N.

## What a reviewer does (acceptance)

1. With 0.616 YOUSD supplied on xLend Base and none in the wallet: the YO page's loop row says
   "0.62 YOUSD already in". The ticket opens with Add / Manage. Manage at Balanced reads
   "Lever to 3.25× · borrow ≈ 1.4 USDC". The build is one batch, with no transfer from the
   wallet.
2. The deposit row in "Your positions" links to that loop on Manage.
3. A Morpho loan-side USDC supply does not show up as leverageable on any USDC-collateral loop.
4. An Euler deposit in sub-account 2 shows "Sub-account 2" on the ticket and builds for it.
5. An Aave deposit with the collateral flag off gets "Use as collateral" as step 1.
