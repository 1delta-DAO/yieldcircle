# Paying in and out with the native coin: what the API now does

On a row whose token is the chain's wrapped gas coin (WETH, WBNB, WHYPE, WMON,
WAVAX, …) the ticket offers the coin itself: `payAsset` = the zero address on a
deposit, `receiveAsset` = the zero address on a withdraw. Plenty of those
routes did not resolve. This note records what failed, what the API (1delta
`lending-sdks`, worker-api) does about it now, and what this app should change
once that ships.

## What failed (checked 2026-09-28)

We swept every earn row whose token is a 1:1 wrapped native, on every chain,
with no TVL or risk floor: **933 rows**. For each row we asked
`/v1/actions/earn/deposit` with the coin and `/v1/actions/earn/withdraw` for
the coin. Production answered in five ways:

| What production did | Where | Rows |
|---|---|---|
| `getLenderData: Unsupported lender …`: the request was sent to a composer that cannot encode the venue | TermMax, Teller, Curvance, LlamaLend, Exactly, River, Inverse, the Liquity family | 85 |
| A refusal by name: "no native gateway", "not ERC-4626, pay-asset conversion not supported", "requires ERC-20 input, not native" | Flying Tulip, Gearbox pools (withdraw), Vesper, wNLP, Hyperbeat, ynETHx / ynBNBx | 31 |
| **The ERC-20 flow, as if the coin had not been asked for**: a WETH approve plus a `requestDeposit` carrying no value, which reverts after the user pays for the approve | Lagoon (ERC-7540) | 14 |
| **The WETH exit, ignoring `receiveAsset`**: a success that pays the wrapped token | Vesper, wNLP | 9 |
| `aaveV4Params required`: the Aave V4 spoke has no native gateway | Aave V4 on Optimism | 1 |

Two of those are the dangerous kind: a response that looks successful and does
the wrong thing. The same sweep also found a non-native bug: a **plain WETH
withdraw from Moonwell's WETH market** died with "Moonwell requires
receiveAsset to be ETH". That market's redeem always pays ETH, so a direct
redeem can never deliver WETH.

## What the API does now

Every venue that can hold the wrapped coin takes the native coin one of two
ways:

- **One transaction.** The venue or 1delta's composer wraps and unwraps inside
  the call: Aave gateways, Morpho's bundler, and the composer for Aave, Compound,
  Euler, Silo, Lista, Midnight and Morpho. Unchanged in design, but checked
  on forks for the first time, which found three bugs (see "The
  one-transaction paths" below).
- **Two transactions**, for every venue with no payable entry and no composer
  route. The API returns them as ordered `actions.transactions`:
  - deposit: `[wrapper.deposit{value: amount}, <the ordinary ERC-20 deposit>]`
  - withdraw: `[<the ordinary ERC-20 withdraw>, wrapper.withdraw(x)]`

  Approvals stay in `permissions`, which run first. Approving before wrapping is
  fine, because an approve never reads the balance. The wrap is never a
  `permission`: it moves funds, it grants nothing. Gearbox used to send it as
  one, and no longer does. The steps are labelled `Wrap ETH → WETH` and
  `Unwrap WETH → ETH`.

The unwrap amount `x` is never more than what the withdraw pays, and it is
exactly that wherever it can be:

| Exit | `x` | What stays wrapped |
|---|---|---|
| An amount the calldata names: `withdraw(assets)`, `withdrawColl(amt)`, `removeCollateral(amt)`, `freeGem(amt)` | exactly that amount | nothing |
| A full exit (`isAll`) that redeems every share | the shares' value read while the request is built (`previewRedeem`, or the venue's own state). Share prices only rise between that read and the block, so `x` is a floor. | the interest of the seconds in between, measured on forks as ~1e10 to ~4e12 wei |
| An exit whose price a market sets at execution: a fixed-rate early exit, a sale into an order book, a pro-rata redemption | refused by name | — |

The unwrap is its **own** transaction. If the share price ever fell between
the read and the block (socialised bad debt), the unwrap reverts on its own and
the user is left holding the WETH the withdraw paid. Nothing is lost, but the
UI should say what happened.

### Per venue

| Venue | Coin in | Coin out | Full exit in coin |
|---|---|---|---|
| Aave V2/V3, Compound, Morpho, Euler, Silo, Lista, Midnight | ✓ one tx | ✓ one tx (Morpho / Lista: fixed, see below) | ✓ |
| Aave V4 with a native gateway | ✓ gateway | ✓ gateway | ✓ |
| Aave V4 without one (Optimism, ether.fi Cash) | ✓ wrap first | ✓ exact | ✓ floor (the supplied balance, read from the spoke when the balance data lacks it) |
| Moonwell WETH market | ✓ composer | ✓ composer (and plain WETH now works: redeem → wrap → sweep) | ✓ |
| Gearbox pool side | ✓ wrap first | ✓ exact | ✓ exact (withdraws the balance read) |
| Curvance | ✓ | ✓ | ✓ floor |
| Exactly, floating | ✓ | ✓ exact | ✓ floor |
| Exactly, fixed | ✓ | ✓ at or after maturity | ✗ before maturity (discounted exit) |
| LlamaLend, lend side | ✓ | ✓ exact | ✓ floor |
| Flying Tulip | ✓ | ✓ exact | ✓ exact (the max is sized, then sent as a number) |
| Teller, supply pools | ✓ | ✓ exact | ✓ exact |
| Inverse FiRM | ✓ | ✓ exact | ✓ exact (the escrow balance) |
| River (existing trove) | ✓ | ✓ exact | — (a full exit closes the trove) |
| Fraxlend, Frankencoin, Sky ETH ilks, Term collateral | ✓ | ✓ exact | ✓ where the venue supports a full exit at all. Unit-tested only: none has a wrapped-native row in the listing today |
| TermMax | ✓ lend | ✗ an FT sale or a pro-rata redemption | ✗ |
| Term Finance, loan side | ✓ | ✗ redemption value, haircut on default | ✗ |
| Liquity family | ✓ with a `troveId` | ✓ with a `troveId` | — |
| Fluid | ✗ its vaults list the coin as their own token, never the wrapper | ✗ | ✗ |
| ERC-4626 vaults (Morpho, Euler Earn, Spark, Fluid, Lista, …) | ✓ composer | ✓ composer (was broken everywhere, fixed, see below) | ✓ |
| Lagoon, Vesper, wNLP, Hyperbeat, ynETHx / ynBNBx / tHYPE mints | ✓ wrap first | ✗ refused by name: their exits pay the vault's token only | ✗ |

Two more fixes shipped with these:

- **ynETHx with no `payAsset` now builds.** It used to default to the native
  coin and refuse. It now takes the input the mint accepts: WETH, read from
  the mint's list of accepted inputs or its `asset()`.
- **Moonwell's composer re-wrap.** A `receiveAsset` or `lenderAsset` naming WETH
  in checksum case used to skip the re-wrap, which could strand the redeemed
  ETH on a full exit. Both are lower-cased now.

## The one-transaction paths, checked on forks

The venues marked "one tx" above use their own native entry (Aave gateways,
Compound's bulker, Morpho's bundler) or 1delta's composer. They were
assumed to work and had never been run end to end through the earn route.
They are now: 41 rows on Ethereum, BNB, Base, Arbitrum and HyperEVM. Each
row runs deposit in the coin, partial withdraw in the coin, then full exit in
the coin. That found three bugs, all live in production before this change:

| Bug | Effect | Fix |
|---|---|---|
| **Every native exit from an ERC-4626 vault through the composer reverted** `ERC20InsufficientAllowance` | MetaMorpho, Spark Savings ETH, Fluid fTokens and Lista vaults, on every chain. The SDK pulled the shares into the composer first. But the deployed composer calls `withdraw` / `redeem` with `owner` set to the **user** (`ERC4626Transfers._encodeErc4646Withdraw`), so the vault then found neither the shares nor the allowance. | The composer no longer pulls the shares. The vault burns them against the user's allowance to the composer, which is the approval the API already asks for. |
| **The second native withdraw from a Morpho Blue or Lista market failed at its first step** with `already set` | The native bundler route re-sent `setAuthorization(generalAdapter1)` on every withdraw and borrow. Morpho reverts a repeat, so the first permission of the ladder failed. | The authorization is read first and only sent when missing. |
| A Morpho full exit with no share balance to hand built `withdraw(0, 0)` | The transaction reverts `inconsistent input`. | Refused with the reason instead. |

What still fails, and is not ours:

- **XLend (Base) and HypurrFi (HyperEVM), native partial withdraw, sometimes.**
  These are Aave v3.0 forks. Their gateway transfers `amount` aTokens to itself,
  then withdraws `amount`. At some liquidity indexes the transfer rounds 1 wei
  short, so `POOL.withdraw` reverts with Aave error `32`, or `WETH.withdraw` runs
  short. It depends on the block, not on the request. XLend failed three times
  in a row at one block, and HypurrFi passed and failed on different runs. The
  Aave main markets passed every run. The fix would be to route those forks
  through the composer with a withdraw-the-balance-received step. That is not
  built.
- **Euler V2 WETH on Ethereum** (`0x2117…`) is at its supply cap
  (`E_SupplyCapExceeded`), and one of **Euler Earn's** strategy vaults has
  "vault operations are paused". The listing still offers deposits into both.

## `acceptsNative` on the listing

Every earn row now carries `capabilities[].acceptsNative` on `deposit` and
`withdraw`. It is always an explicit boolean, so a missing key means the API is
older than the flag. It is true exactly where the table above says ✓ for an
**earn** request. Earn requests carry no `troveId`, so Liquity-family rows say
false. TermMax and Term rows say true to deposit and false to withdraw. Fluid
rows say false. On vaults, withdraw is true only for the ERC-4626 rows.

`Ticket.tsx` already reads the flag (`s.nativeIn` / `s.nativeOut`) and falls
back to the `NO_NATIVE_DEPOSIT` list only when it is absent.

## What this app should change

1. **Deploy order decides when the flag appears.** The routes go live with the
   worker-api deploy. The flag is stamped by `margin-fetcher`, and
   `/v1/data/earn` is served from the yields origin (`yield-tracer`). So it
   appears only after a `margin-fetcher` publish **and** a `yield-tracer`
   redeploy. In between, the fallback lists are the ones in force.
2. **Update the fallback lists for that window.**
   - `NO_NATIVE_DEPOSIT`: drop `vault.lagoon`, `CURVANCE`, `EXACTLY`,
     `LLAMALEND` and `FLYING_TULIP`, which now take the coin. Keep the Liquity
     family and complete it: `LIQUITY`, `FELIX`, `NERITE`, `QUILL`, `EBISU`,
     `SONETA`, `ENOSYS_LOANS`. Add `FLUID`.
   - The withdraw fallback (`canNative = s?.nativeOut ?? wrapsNative(…)`) is
     true for every wrapped-native row. Exclude `TERMMAX`, `TERM_FINANCE`,
     `FLUID`, the Liquity family, and the non-4626 vaults (`vault.savings`
     Vesper / wNLP / Hyperbeat, and `vault.lagoon`, whose exit is async
     anyway).
3. **`wrapWord` in `useLadder.ts` mislabels Vesper withdraws.** It detects an
   unwrap by selector (`0x2e1a7d4d`, `withdraw(uint256)`). Vesper's pool
   `withdraw(shares)` has the same selector, so a plain Vesper exit renders as
   "Unwrap to ETH". Check `tx.to` against `WRAPPED_NATIVE[chainId]` as well.
4. **Say what a native withdraw is on the two-step venues.** It is two
   signatures: the withdraw, then the unwrap. If the unwrap fails, the user
   holds WETH. The step label from the API (`Unwrap WETH → ETH`) is enough to
   show it; the error text for a failed unwrap should say the funds are in
   WETH.
5. **Full exits** (`isAll`, which the ticket sends above 99.9 %) now work in
   the coin on Curvance, Exactly, LlamaLend, Gearbox pools and the gateway-less
   Aave V4 spoke. A few wei of WETH may stay behind. Treat that balance as dust
   in the idle strip.

## Still not served, and why (none of these are native-specific)

| Rows | Why |
|---|---|
| TermMax on BNB / Arbitrum (all 46 wrapped-native rows) | `config/termmax.json` in lender-metadata has no `routerV2` for chains 56 and 42161, and the builder requires one. **Every** TermMax action there fails, plain WETH included. |
| Exactly's WETH market on Base | Firewalled: only allow-listed accounts may interact (`NotAllowed`). Optimism works. |
| Lagoon vaults with a whitelist (e.g. DAMM Ethereum Fund `0x3c63…`) | `requestDeposit` reverts `NotWhitelisted()` for a fresh account, native or not. The listing does not flag it. |
| Gearbox credit-account rows | Need the credit account (`accountId`), which an earn request does not carry. |
| LlamaLend and Teller collateral-side rows | Collateral goes in only with a loan. The earn row offers a deposit that cannot build. |
| Liquity family (earn) | Needs a `troveId`. |
| Midnight rows | 13–14 markets in the listing no longer exist ("market not found"), and lending the loan token is not supported yet. |
| Teller exits right after any share movement | The withdraw delay re-arms after every share transfer, a partial withdraw included. A second withdraw straight after reverts `SW`. |

## How it was verified

- **Unit tests** (worker-api): every builder's native leg; exact and floor
  amounts; refusals; a plain request stays byte-identical; each solver claims a
  native withdraw and never a native borrow. See `nativeExit.test.ts`,
  `nativeExit.others.test.ts`, `aaveV4NativePathPermissions.test.ts`,
  `conversion-solver.test.ts`, `vaults-actions.test.ts` and `earn.test.ts`.
  Capability flags: `margin-fetcher` `capabilities.native.test.ts`.
- **Fork tests**: `worker-api/scripts/fork-tests/tests/native/`, 79 tests on
  anvil forks of Ethereum, BNB, Base, Arbitrum, Optimism, HyperEVM and Monad. They run every step the
  API returns and assert the native balance change **net of gas to the wei**,
  the WETH balance change, and the position:

  | Suite | Chain | What it proves |
  |---|---|---|
  | `exactly` | Optimism | deposit, partial withdraw, full exit (floor), plain exit untouched |
  | `curvance` | Monad | deposit, partial withdraw (~3.7e12 wei stays wrapped), full exit |
  | `gearbox-pool` | Ethereum | wrap as a transaction, exact partial and full exit |
  | `flying-tulip` | Ethereum | deposit, partial, full exit, all exact |
  | `teller` | Base | deposit, partial and full exit after the delay |
  | `inverse` | Ethereum | deposit, partial, full exit (escrow balance) |
  | `llamalend` | Optimism | lend, partial, full exit (floor) |
  | `liquity` | Ethereum | addColl and withdrawColl on a real trove |
  | `river` | Base | addColl and withdrawColl on a real trove |
  | `aave-v4-no-gateway` | Optimism | supply, partial, full exit read from the spoke |
  | `moonwell-weth` | Base | plain WETH exit, checksummed WETH, ETH exit, full exit |
  | `vaults` | Ethereum | Vesper, wNLP, ynETHx and Lagoon in ETH; ynETHx with no payAsset |
  | `composer/{ethereum,bnb,base,arbitrum,hyperevm}` | 5 chains | 41 one-transaction rows through `/v1/actions/earn/*` with the API's own routing: deposit, partial and full exit in the coin |

  ```bash
  cd lending-sdks/packages/worker-api
  FORK_BACKEND=anvil FORK_RPC_10=https://optimism.gateway.tenderly.co \
    npx vitest run --config scripts/fork-tests/vitest.config.ts \
    scripts/fork-tests/tests/native --fileParallelism=false
  ```

- **The sweep**, re-runnable against production or a local worker:
  `node packages/worker-api/scripts/native-sweep.mjs`, with `BASE=` to point it
  at another worker and `FAM=` to limit it to some venues. Against the local
  worker with these changes, native deposits resolved on **767 of 862** rows
  (production: 692) and native withdraws on **764 of 913** (production: 702,
  including the 9 "successes" that paid WETH). Some of production's misses
  were rate limits (429s). Of the 85 rows that answered `Unsupported lender`,
  every one now reaches its builder; the rows that still fail are the ones in
  the table above. A withdraw "failure" in the sweep is often a builder saying
  the test account holds nothing, which means the route resolved.
