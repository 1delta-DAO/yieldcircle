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

- **Aave-fork gateways that round, on 16 markets.** These are forks of Aave
  v2 or v3.0. Their gateway moves `amount` aTokens to itself, then withdraws
  `amount`. At some liquidity indexes the aToken transfer rounds 1 wei short,
  so the withdraw reverts with Aave error `32` (v3) or `5` (v2), or
  `WETH.withdraw` runs short. On the v2-era gateways a full exit (`max`) fails
  every time, with an underflow. XLend failed three times in a row at one block,
  and HypurrFi passed and failed on different runs. The Aave main markets passed
  every run. The fix would be to route these forks through the composer with a
  withdraw-the-balance-received step. That is not built. See "The gateway
  addresses, backchecked" below for the list.
- **Euler V2 WETH on Ethereum** (`0x2117…`) is at its supply cap
  (`E_SupplyCapExceeded`), and one of **Euler Earn's** strategy vaults has
  "vault operations are paused". The listing still offers deposits into both.

## The gateway addresses, backchecked (2026-09-28)

Aave and its forks take the native coin through a gateway contract per market.
1delta lists them by hand in lender-metadata's `config/aave-weth-gateway.json`,
so that file was checked in two ways:

- **On chain, for every entry.** The gateway's wrapped native must be the
  chain's, and it must hold an unlimited approval to *this* market's pool.
- **On a fork, where one could be run.** A fresh account deposits 1 coin, then
  withdraws 0.123456789, 0.37, 0.0101 and 0.2333333333333, then `max`.

What was wrong in the metadata, now fixed:

| Market | Problem | Effect | Fix |
|---|---|---|---|
| Aave V3, Sonic | Address with a broken checksum | Rejected before sending: viem and wallets refuse the `to` | Checksum corrected |
| YLDR (Ethereum, Polygon, Arbitrum, Base) and Agave (Gnosis) | The gateway takes a different call: `depositETH(onBehalfOf, referral)`, `withdrawETH(amount, to)`, with no pool argument | Every native call hit the gateway's fallback and reverted `Fallback not allowed` | Entries removed. Native now goes through the composer, which already handles YLDR's pool |
| ZeroLend, Abstract | The market's `pool` was the pool's *implementation* contract, not the proxy | The whole market read as empty: no reserves, no rates, and the gateway looked unapproved | Pool corrected to `0x7C4b…0b02`; reserves, tokens and oracles regenerated |
| Granary, Avalanche | No gateway listed | Native was offered through the composer only | Gateway added; every fork leg passed |
| Avalon uniIOTX, IoTeX | No gateway listed | Same | Gateway added. The wiring checks pass, but the WIOTX reserve is paused, so it could not be run |
| ZeroLend and Ploutos, Ethereum | Gateways for markets that are not listed | None | Removed |

The Aave markets checked against Aave's own address book (V2 on Ethereum and
Polygon, V3 on eight chains, the Lido market) all match it. Ploutos on Arbitrum
also has a gateway, but it rounds (see below), so it was not added.

**Gateways that are correct but fail on some withdraws.** These are the
right contracts, and no other deployed gateway for these markets behaves
better. The fault is the rounding described above:

| Market | Partial withdraw | Full exit (`max`) |
|---|---|---|
| XLend (Optimism, Base) | fails on some amounts | fails |
| Granary (Ethereum), Valas (BNB), Prime Fi (XDC), Ploutos (Hemi) | fails on some amounts | fails |
| Radiant V2 (Ethereum), RMM (Gnosis), ZeroLend (Manta), Molend (Mode), Meridian (Taiko) | passed | fails |
| Fathom (XDC), Avalon (Kaia), Polter (Base), Radiant V2 (Base), PAC (Blast) | fails on some amounts | passed |

"Fails on some amounts" depends on the block, so a market that passed one run
can fail the next. Until the composer route above exists, **do not offer a
native full exit on the markets whose `max` fails.** The ERC-20 exit, or a
native exit through the composer (not yet fork-checked on these markets), is
the way out there.

Not a gateway fault, but seen in the same run: **ZeroLend's WETH market on
Base has a liquidity index of 1000** (a healthy one is at least 1e27). Every
supply there reverts `SafeCast`, in any asset form. Many other markets
reverted the test deposit with the pool's own frozen, paused or cap errors
(Aave V3 on Sonic, Soneium and Scroll, Aave V2, Spark on Gnosis, Kinza, several
Avalon and ZeroLend markets, Granary on Base, Ironclad). That is the market's
state, not the gateway, and it applies to the ERC-20 as well.

Not run on a fork: chains with no public RPC that forks (Telos, Meter, Fuse,
PulseChain, Taraxa, GOAT, Merlin, ZetaChain, Artela, Zircuit, Corn, Neon,
Harmony; Hemi's Lendos timed out) and zkSync-family chains (zkSync Era,
Abstract), where anvil cannot run the bytecode. Their entries passed the
on-chain checks, except Taraxa, Artela, Corn and Neon, where no RPC answered
at all.

## `acceptsNative` on the listing

Every earn row now carries `capabilities[].acceptsNative` on `deposit` and
`withdraw`. It is always an explicit boolean, so a missing key means the API is
older than the flag. It is true exactly where the table above says ✓ for an
**earn** request. Earn requests carry no `troveId`, so Liquity-family rows say
false. TermMax and Term rows say true to deposit and false to withdraw. Fluid
rows say false. On vaults, withdraw is true only for the ERC-4626 rows.

`Ticket.tsx` already reads the flag (`s.nativeIn` / `s.nativeOut`) and falls
back to the `NO_NATIVE_DEPOSIT` list only when it is absent.

## What this app changed (2026-09-29)

1. **Deploy order decides when the flag appears.** The routes go live with the
   worker-api deploy. The flag is stamped by `margin-fetcher`, and
   `/v1/data/earn` is served from the yields origin (`yield-tracer`). So it
   appears only after a `margin-fetcher` publish **and** a `yield-tracer`
   redeploy. In between, the fallback lists in `Ticket.tsx` are the ones in
   force. Nothing to do in this app; just deploy in that order.
2. **Fallback lists updated** (`Ticket.tsx`):
   - `NO_NATIVE_DEPOSIT` is now the complete Liquity family (`LIQUITY`,
     `FELIX`, `NERITE`, `QUILL`, `EBISU`, `SONETA`, `ENOSYS_LOANS`) plus
     `FLUID`. Lagoon, Curvance, Exactly, LlamaLend and Flying Tulip were
     dropped: they take the coin now.
   - The withdraw fallback excludes `NO_NATIVE_DEPOSIT` plus `TERMMAX`,
     `TERM_FINANCE`, `vault.savings` and `vault.lagoon` (`NO_NATIVE_WITHDRAW`).
     It matches on the holding's venue (the strategy's `venueKey`, else the
     position's `earnUid` / `lender`).
   - Also added: `NATIVE_MAX_ROUNDS`, the Aave forks whose gateway fails a
     native `max` (see the gateway table). On those, a **full** exit greys out
     the coin and says to take the wrapped token, or to leave a little in.
     Partial exits still offer it.
3. **Wrap / unwrap labels match on the wrapper's address** (`useLadder.ts`
   `wrapStep`). A step is only called a wrap or unwrap when `tx.to` is
   `WRAPPED_NATIVE[chainId]`, so a Vesper `withdraw(shares)` keeps its own
   label. `stepsFrom` now takes the chain id, not the coin symbol. The labels
   are `Wrap ETH → WETH` and `Unwrap WETH → ETH`, the same as the API's.
4. **A failed unwrap says where the money is.** An unwrap step carries its own
   `onFail` text: "The unwrap reverted. The withdrawal itself went through:
   the funds are in your wallet as WETH." It is shown whether the revert comes
   from the receipt or from the wallet's pre-send estimate. The payout picker's
   info popover says the same.
5. **Dust is not idle.** `idleFrom` drops a priced balance under $0.01, so the
   wei of WETH a floor unwrap leaves behind never shows as idle money (the
   ticket reads it as 0). Unpriced balances are kept.

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
