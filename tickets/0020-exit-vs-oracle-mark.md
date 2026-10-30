# 0020 — A loop's close reads as a loss when its oracle is a NAV feed

- status: **open, nothing built.** Found 2026-10-30 on the sUSDai / USDC loop (Jupiter Lend vault
  101, Solana, 6.86×). The cause is known for that position. Whether other positions do the same has
  not been checked.
- area: `src/ui/Ticket.tsx` (the close's `ValueRow` / `LossAck`, the `closeBlock === 'short'`
  copy), core `model/positions.ts` (`valueUsd` = the API's `netUsd`). Upstream: margin-fetcher-sol
  `lending/user-data/jupiter-lend/fetchUser.ts` (`*USDOracle`) and the EVM user-state builders, which
  also mark equity at the venue oracle.
- depends on: nothing, to check. A fix to how equity is marked would be a lending-sdks change first.

## What happened

Close ticket, receive USDC: **Equity $9.46 → You get back $9.03, Value change −$0.42 · −4.49 %**,
shown as a loss to acknowledge. The size is 57.89 sUSDai, so this looked like a thin market or a
broken oracle. Neither is the cause:

| Price of 1 sUSDai, in USDC (2026-10-30) | | vs oracle |
|---|---|---|
| Jupiter Lend vault 101 oracle (Chainlink `DXSLbLNf…`) | 1.121885 | — |
| USD.AI `depositSharePrice` (Arbitrum `0x0B2b…5ef9`, optimistic NAV) | 1.121885 | same |
| USD.AI `redemptionSharePrice` (what the 30-day queue pays) | 1.119172 | −0.24 % |
| Jupiter sell quote, 57.89 sUSDai (Orca Whirlpool, ~8 bps impact) | 1.114540 | −0.65 % |
| Jupiter sell quote, 500 sUSDai | 1.114382 | −0.67 % |
| Jupiter buy quote, 10 USDC | 1.115676 | −0.55 % |

57.8925 × (1.121885 − 1.114540) = **$0.425**, which is the whole value change. The sale's own cost
is the $0.06 "exit cost". At 6.86×, a 0.65 % gap between the oracle and the market becomes 4.5 % of
equity.

The oracle relays the vault's deposit price correctly. But sUSDai has no instant exit (a 30-day
redemption queue on Arbitrum, none on Solana), and the market trades it below even the
conservative redemption price. So **the equity we show is a price nobody can exit at**. The user
did not lose 4.5 % by closing: they entered through the same market, so the open looked like a
gain of about 0.55 % × leverage. The real round trip costs about the 11 bps spread.

Our savings row for sUSDai already prices at `redemptionSharePrice` for this reason
(margin-fetcher `vaults/savings/registryGapSweep.ts`). The lending position path does not.

## What to check

1. **Which held collateral has a NAV oracle.** Mainly exchange-rate feeds (sUSDai, sUSDe, syrupUSDC,
   PT feeds, LST rate feeds) and fixed-price oracles. List, per venue, the collateral whose oracle
   is not a market price. Kamino Scope, Jupiter Lend `oracleSources`, Morpho oracle descriptions and
   Aave/Euler feeds all say which kind of oracle it is.
2. **How far its market sits from that oracle.** Size a sell quote at a few amounts against the
   oracle price, the way the table above does. Where the gap is a few bps, there is nothing to do.
3. **The opposite sign.** Where the market trades ABOVE the oracle, the close reads as a gain and
   the open as a loss. Both are as wrong as the case above.
4. **The `short` block.** On a loop this levered, a gap of 1–2 % blocks the close outright ("the
   sale cannot repay the debt"). Check which held loops are within one gap of that.

## What to do, once checked

- **Split the value change into its two causes.** In `ValueRow`, show the sale's slippage and fees
  and the oracle-vs-market gap as separate lines. Today the ⓘ tooltip mentions the gap, but the
  headline counts it all as a loss, and `LossAck` makes the user acknowledge it.
- **Or mark at what an exit realises.** For collateral without an instant exit, value equity at the
  market price, or at least at the redemption price, and show the oracle value beside it. That
  changes `netUsd` and the leverage, so it belongs in the lending-sdks user readers, not in the UI.
  The venue's own health factor must stay on its oracle.
- **Say the same thing at the open.** The open's economics should state that the position starts
  out marked above (or below) what it cost.

## Not the cause: the −37.40 % on the same row

Checked the same day. It is correct. Jupiter Lend's USDC is fully drawn: every USDC-debt vault reads
`borrowable 0`, the base borrow rate is 15.19 %, and vault 101 pays 14.19 % (our row: utilization
100.17 %). Against sUSDai's 6.67 % intrinsic yield:
(6.67 % × $64.92 − 14.19 % × $55.46) / $9.46 = **−37.40 %**. The loop breaks even at a 7.81 % borrow
rate. That is a separate question for the position (it costs about $3.5/yr while USDC stays pinned),
not an exit-pricing one.

## Done when

The checks above are done, with a list of the positions they affect, and a decision taken on which
of the two fixes to build.
