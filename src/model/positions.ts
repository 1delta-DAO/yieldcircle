/**
 * Positions in the simple app's shape: group → asset → idle (wallet) + strategies. Built from
 * `/v1/data/earn/positions` (vault rows are standalone; a lending account with debt is a loop,
 * one without is a plain deposit per leg) and `/v1/data/token/balances` for idle.
 */
import type { EarnPosition, TokenBalance } from '../sdk/types'
import { isSvmChain, normAddr } from './address'
import { baseOfSymbol, groupOf, sameMoney, type GroupId } from './assets'
import { deskKey, keyOfToken, moneyOf } from './desk'
import { decToRaw } from './leverage'
import { marketTag } from './market'
import { ptMaturityOf, venueLabel } from './strategies'

export interface Holding {
  key: string
  chainId: string
  group: GroupId
  /** the row: a base asset, or a dollar's credit desk — a loop's COLLATERAL desk, never its debt's (`Strategy.asset`) */
  asset: string
  kind: 'simple' | 'loop'
  label: string
  venue: string
  valueUsd: number
  apr?: number
  health?: number | null
  leverage?: number
  earnUid?: string
  logo?: string
  /** a loop whose debt is in another group (ETH / USDC): a directional bet, not a simple-mode strategy */
  directional?: boolean
  /** what is held, in token units, and the token: vault assets, a lending deposit, or a loop's collateral */
  amount: number
  /** `amount` exactly, in raw units — what a full exit sends (see `decToRaw`) */
  amountRaw?: string
  symbol: string
  decimals: number
  /** loop legs, for a close / reduce */
  collateralUid?: string
  debtUid?: string
  debtSymbol?: string
  debtAmount?: number
  accountId?: string
  lender?: string
  /**
   * A fixed-rate loop's loans (Lista's broker): one per term opened, on shared collateral, largest
   * first. A close repays ONE of them, named by `id` — the API needs it, and repaying one loan cannot
   * repay the others.
   */
  loans?: { id: string; debt: number; debtUsd: number }[]
  /** the loop's own collateral leg, in dollars — `valueUsd` is the whole account's equity */
  collateralUsd?: number
  /**
   * Every OTHER leg of the account, largest first. A loop here is one collateral against one debt, so
   * a second collateral (or a second debt) is carried by the account but not by anything the ticket
   * builds: a close sells `symbol` only and repays `debtSymbol` only. Shown so nobody finds out from
   * a reverted close.
   */
  others?: { side: 'collateral' | 'debt'; symbol: string; amount: number; usd: number }[]
  /** the held token's address — what a withdraw pays out unless it is asked for the native coin */
  assetAddress?: string
  /** a Pendle PT's maturity (unix s), from its symbol — the positions route carries no expiry */
  maturity?: number
}
/**
 * Vault rows name themselves from the positions route's own `name`/`brand`,
 * the same fields the earn listing carries — no registry is joined. Unnamed
 * vaults come back as `USDC · 0x5b8b`; the address tail is stripped.
 */
/** the API's decimal string → exact raw units; none when the decimals are unknown or the string is not a plain decimal */
const rawOf = (dec: string | undefined, decimals: number | undefined) => (dec && decimals != null && /^\d+(\.\d+)?$/.test(dec) ? decToRaw(dec, decimals) : undefined)
export function holdingsFrom(items: EarnPosition[]): Holding[] {
  const out: Holding[] = []
  for (const p of items) {
    if (p.venueKind === 'vault') {
      const asset = keyOfToken({ ...p.asset, chainId: p.chainId }); if (!asset || p.suppliedUsd < 0.5) continue
      const brand = p.brand ?? p.venue
      const own = (p.name ?? '').replace(/\s*·\s*0x[0-9a-f]{4,}$/i, '').trim()
      out.push({ key: p.positionUid, chainId: p.chainId, group: groupOf(asset), asset, kind: 'simple', label: `${own || p.asset.symbol || asset} · ${brand}`, venue: brand, valueUsd: p.suppliedUsd, apr: p.apr ?? p.rate?.total, earnUid: p.earnUid, logo: p.logoURI,
        amount: parseFloat(p.assets) || 0, amountRaw: rawOf(p.assets, p.asset.decimals), symbol: p.asset.symbol ?? asset, decimals: p.asset.decimals ?? 18, assetAddress: normAddr(p.asset.address), maturity: ptMaturityOf(p.asset.symbol) })
      continue
    }
    // `Morpho sUSDS-USDT 97`: the positions route names the MARKET where the catalogue names the
    // family. Split it — the family is the venue, the rest says which of its markets this is, and
    // the API's own casing is kept for the family word (`LlamaLend`, not venueLabel's `Llamalend`).
    const lead = venueLabel(p.lender)
    const full = (p.name ?? p.brand ?? '').trim()
    const named = full.toLowerCase().startsWith(lead.toLowerCase())
    const protocol = named ? full.slice(0, lead.length) : lead
    const instance = named ? full.slice(lead.length).trim() : ''
    const venueOf = (symbol: string | undefined) => { const t = marketTag(instance, symbol ?? ''); return t ? `${protocol} · ${t}` : protocol }
    // `crossMargin` only says ONE sub-account is active — not that it is account 0. An Euler
    // sub-account 3 (or a Fluid NFT) alone is still "cross-margin", and a close sent without its id
    // goes to account 0. Keep the active one's id; '0' is the default and stays unsent.
    const lone = p.crossMargin ? p.subAccounts.find((s) => s.netUsd !== 0 || s.legs.some((l) => l.depositsUsd > 0 || l.debtUsd > 0))?.accountId : undefined
    const accounts = p.crossMargin ? [{ accountId: lone ?? '0', health: p.health, legs: p.legs, netUsd: p.netUsd, borrowedUsd: p.borrowedUsd, suppliedUsd: p.suppliedUsd }] : p.subAccounts
    for (const a of accounts) {
      // a leg with a `loanId` is one broker loan the market's unbound leg already counts: kept aside, never summed
      const own = a.legs.filter((l) => !l.loanId)
      const supply = own.filter((l) => l.depositsUsd > 0.5).sort((x, y) => y.depositsUsd - x.depositsUsd)
      const debtOf = (ls: typeof own) => ls.filter((l) => l.debtUsd > 0.5).sort((x, y) => y.debtUsd - x.debtUsd)
      const debt = debtOf(own).length ? debtOf(own) : debtOf(a.legs)
      if (!supply.length) continue
      if (debt.length) {
        const coll = supply[0], d = debt[0]
        const collT = { ...coll.asset, chainId: p.chainId }, debtT = { ...d.asset, chainId: p.chainId }
        // a dollar / ether / bitcoin loop is its COLLATERAL's desk (the debt is a rate, not an
        // exposure). A collateral nothing can place, against such a debt, is not filed under the
        // debt: it stands for itself as a price bet, which is all this can honestly say about it
        const money = moneyOf(debtT)
        const same = !!money && moneyOf(collT) === money
        const asset = money ? (same ? deskKey(collT, money) : keyOfToken(collT) ?? coll.asset.symbol) : baseOfSymbol(coll.asset.symbol) ?? baseOfSymbol(d.asset.symbol)
        if (!asset) continue
        const debtBase = baseOfSymbol(d.asset.symbol)
        // same test as the catalogue's: same money, not the same display tab
        const directional = money ? !same : !debtBase || !sameMoney(debtBase, asset)
        const lev = a.suppliedUsd > 0 && a.netUsd > 0 ? a.suppliedUsd / a.netUsd : p.leverage
        const others = [...supply.slice(1).map((l) => ({ side: 'collateral' as const, symbol: l.asset.symbol ?? '?', amount: parseFloat(l.deposits) || 0, usd: l.depositsUsd })),
          ...debt.slice(1).map((l) => ({ side: 'debt' as const, symbol: l.asset.symbol ?? '?', amount: parseFloat(l.debt) || 0, usd: l.debtUsd }))]
        const loans = a.legs.filter((l) => l.loanId && l.marketUid === d.marketUid && l.debtUsd > 0.005)
          .map((l) => ({ id: l.loanId!, debt: parseFloat(l.debt) || 0, debtUsd: l.debtUsd })).sort((x, y) => y.debtUsd - x.debtUsd)
        out.push({ key: `${p.positionUid}:${a.accountId}`, chainId: p.chainId, group: groupOf(asset), asset, kind: 'loop', label: `${coll.asset.symbol} / ${d.asset.symbol} loop`, venue: venueOf(coll.asset.symbol), valueUsd: a.netUsd, apr: p.apr, health: a.health, leverage: lev, earnUid: coll.earnUid, logo: coll.asset.logoURI, directional,
          amount: parseFloat(coll.deposits) || 0, amountRaw: rawOf(coll.deposits, coll.asset.decimals), symbol: coll.asset.symbol ?? asset, decimals: coll.asset.decimals ?? 18, collateralUid: coll.marketUid, debtUid: d.marketUid, debtSymbol: d.asset.symbol, debtAmount: parseFloat(d.debt) || 0, accountId: a.accountId === '0' ? undefined : a.accountId, lender: p.lender, collateralUsd: coll.depositsUsd, ...(loans.length ? { loans } : {}), ...(others.length ? { others } : {}) })
      } else {
        for (const l of supply) {
          const asset = keyOfToken({ ...l.asset, chainId: p.chainId }); if (!asset) continue
          // the label is the FAMILY, `venue` the market inside it: the two are printed together
          // (the asset page) and one under the other (the explorer), so neither may repeat the other
          out.push({ key: `${p.positionUid}:${a.accountId}:${l.marketUid}`, chainId: p.chainId, group: groupOf(asset), asset, kind: 'simple', label: `${l.asset.symbol} · Lend on ${protocol}`, venue: venueOf(l.asset.symbol), valueUsd: l.depositsUsd, apr: p.depositApr, earnUid: l.earnUid, logo: l.asset.logoURI,
            amount: parseFloat(l.deposits) || 0, amountRaw: rawOf(l.deposits, l.asset.decimals), symbol: l.asset.symbol ?? asset, decimals: l.asset.decimals ?? 18, assetAddress: normAddr(l.asset.address), accountId: a.accountId === '0' ? undefined : a.accountId, lender: p.lender })
        }
      }
    }
  }
  return out
}

/** One idle balance: one TOKEN on one chain (native ETH and WETH are two entries with the same base `asset`). */
export interface Idle { asset: string; symbol: string; amount: number; usd: number; address: string; decimals: number; price: number; chainId: string }
/** Solana's balances route spells the native row's address as the System Program id since 2026-10 (`native` before; both accepted). */
export const isNativeAddress = (a: string) => /^0x0{40}$/i.test(a) || /^0xe{40}$/i.test(a) || a === 'native' || a === '11111111111111111111111111111111'
/**
 * What the native coin of a chain IS. It used to be "BNB on 56, ETH
 * everywhere else", which was true until Avalanche was offered and then said
 * a wallet's AVAX was ether — and true again until HyperEVM was offered and
 * called 1.56 HYPE "1.5591 ETH / $142".
 *
 * That kept happening because the map was the ONLY answer and a new chain is
 * added in four other files first. It is the fallback now: the balances route
 * names the coin on the row itself (`symbol: 'HYPE'`, `name: 'Native'`), so a
 * chain nobody thought about here still reads its own coin. The map stays
 * because it is the offline answer and because it is where the reader finds
 * out what a chain's gas is — each entry below was read off
 * `/v1/data/token/balances` on 2026-09-24, not guessed.
 *
 * Ethereum, Base, Arbitrum, Optimism and Robinhood Chain are ETH and are
 * absent on purpose: the DEFAULT is right for them. A chain's ticker is not
 * its gas coin — Optimism's mark says `OP` and its gas is ether.
 */
const NATIVE: Record<string, string> = {
  '56': 'BNB', '43114': 'AVAX',
  '999': 'HYPE', '143': 'MON', '137': 'POL', '9745': 'XPL', '98866': 'PLUME',
  // three chains pay their fees in a dollar. Arc's coin IS USDC and Stable's IS USDT0, so those
  // balances belong in the US Dollar group with every other dollar, not in a drawer of oddities.
  // Tempo's pathUSD is dollar-priced too, but `assets.ts` keeps it in More and says why there.
  '5042': 'USDC', '988': 'USDT0', '4217': 'pathUSD',
  'solana': 'SOL',
}
/** Native coin decimals: 18 on every EVM chain here, 9 for SOL (lamports). `ui/Ticket.tsx` reads this instead of hard-coding 18. */
export const nativeDecimals = (chainId: string): number => (isSvmChain(chainId) ? 9 : 18)
/** The coin the row reported, else what this chain is known to use, else ether. */
export const nativeSymbol = (chainId: string, reported?: string): string => reported || NATIVE[chainId] || 'ETH'
/**
 * Chains whose gas coin IS an ERC-20: the native balance and the token's `balanceOf` are one
 * ledger read two ways (18 decimals native, 6 through the token — measured 2026-09-25, equal to
 * the token's last digit on every holder tried). The balances route answers BOTH rows, so a
 * wallet with $158k of USDC on Arc read $317k. There the native row is dropped when the token's
 * row is present, and otherwise stands in for the token (its address, its decimals), so a
 * deposit built from it spends the ERC-20. Mirrors `GAS_TOKEN_ERC20` in pos-indexer's
 * `assetBook.ts`. Tempo (4217) is the third shape — no gas coin at all, `eth_getBalance` is a
 * sentinel the route zeroes — and needs nothing here: its zero row reads 0 and is skipped.
 */
export const GAS_TOKEN_ERC20: Record<string, { address: string; decimals: number }> = {
  '5042': { address: '0x3600000000000000000000000000000000000000', decimals: 6 }, // Arc USDC
  '988': { address: '0x779ded0c9e1022225f8e0630b35a9b54be713736', decimals: 6 }, // Stable USDT0
}
/**
 * The other direction: a coin with an ERC-20 VIEW of its own balance beside a real wrapper
 * (Polygon's `0x…1010` is POL itself; WPOL is the wrapper). The view is dropped when the native
 * row is there. Both maps are token-lists' `native-currencies.json` (`erc20` / `coin+erc20`).
 */
export const NATIVE_ERC20_VIEW: Record<string, string> = { '137': '0x0000000000000000000000000000000000001010' }
/**
 * Each chain's wrapper of its gas coin (`wrapped` in token-lists' `native-currencies.json`,
 * read 2026-09-28). A market in WHYPE is a market the wallet's HYPE can go into as-is: the API
 * wraps it in the same transaction when asked with `payAsset` = the zero address, and unwraps on
 * the way out with `receiveAsset`. Without it the API is asked for the ERC-20 — an approve of a
 * token the wallet may not hold, then a deposit that reverts. Arc, Stable and Tempo have no
 * wrapper (their coin IS an ERC-20, or there is none) and are absent on purpose.
 */
export const WRAPPED_NATIVE: Record<string, string> = {
  '1': '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', '8453': '0x4200000000000000000000000000000000000006',
  '42161': '0x82af49447d8a07e3bd95bd0d56f35241523fbab1', '10': '0x4200000000000000000000000000000000000006',
  '56': '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c', '43114': '0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7',
  '999': '0x5555555555555555555555555555555555555555', '143': '0x3bd359c1119da7da1d913d1c4d2b7c461115433a',
  '9745': '0x6100e367285b01f48d07953803a2d8dca5d19873', '137': '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270',
  '4663': '0x0bd7d308f8e1639fab988df18a8011f41eacad73', '98866': '0xea237441c92cae6fc17caaf9a7acb3f953be4bd1',
  // wSOL — base58, case kept (normAddr is the identity on it)
  'solana': 'So11111111111111111111111111111111111111112',
}
/** Is this token the chain's wrapped gas coin — i.e. can the native coin stand in for it on a deposit or withdraw? */
export const wrapsNative = (chainId: string, address?: string) => !!address && WRAPPED_NATIVE[chainId] === normAddr(address)
/**
 * The one floor for wallet money: under it a balance is dust (dropped by `idleFrom`), over it it is
 * counted AND shown. Totals and rows used to disagree — totals summed every idle cent while rows
 * hid idle under $1, so a loop's residual collateral (0.2 sUSDai) was in the chip and nowhere else.
 */
export const DUST_USD = 0.01
export function idleFrom(items: TokenBalance[], chainId: string): Idle[] {
  const out: Idle[] = []
  const gasToken = GAS_TOKEN_ERC20[chainId]
  const hasGasToken = !!gasToken && items.some((b) => normAddr(b.address) === gasToken.address)
  const view = NATIVE_ERC20_VIEW[chainId]
  const hasNative = !!view && items.some((b) => isNativeAddress(b.address))
  for (let b of items) {
    if (hasNative && normAddr(b.address) === view) continue
    const native = isNativeAddress(b.address)
    // Arc / Stable: the native row is the token's balance again — count it once
    if (native && gasToken) {
      if (hasGasToken) continue
      b = { ...b, address: gasToken.address, decimals: gasToken.decimals }
    }
    // `symbol` is the token as held: native reads as the chain coin (ETH on Base, BNB on BNB Chain), never "ETH" on BNB
    const symbol = native ? nativeSymbol(chainId, b.symbol) : b.symbol
    // The whitelist decides what an ERC-20 balance IS, and drops the ones this app does not
    // present. A gas coin is never dropped: the wallet holds it whether or not the whitelist
    // carries it, so an unlisted one stands for itself (group `MORE`) rather than vanishing.
    const asset = keyOfToken({ chainId, address: native ? undefined : b.address, symbol }) ?? (native ? symbol : undefined); if (!asset) continue
    const amount = parseFloat(b.balance); if (!(amount > 0)) continue
    const usd = b.balanceUSD ?? amount * (b.priceUSD ?? 0)
    // dust is not idle money: a native full exit through a wrap-less venue unwraps a floor and leaves
    // wei of WETH behind (docs/native-routes.md). Only a PRICED balance is judged — unpriced stays
    if (b.priceUSD && usd < DUST_USD) continue
    // native keeps the spelling its chain's routes use: the zero address on EVM, `native` on Solana
    out.push({ asset, symbol, amount, usd, address: native && !gasToken && !isSvmChain(chainId) ? '0x0000000000000000000000000000000000000000' : normAddr(b.address), decimals: b.decimals, price: b.priceUSD ?? (amount ? usd / amount : 0), chainId })
  }
  return out
}

export interface AssetBook { asset: string; group: GroupId; idle: Idle | null; idleUsd: number; atWorkUsd: number; yearlyUsd: number; blended: number; totalUsd: number; holdings: Holding[] }
export function books(allHoldings: Holding[], idle: Idle[]): AssetBook[] {
  const holdings = allHoldings.filter((h) => !h.directional)
  const assets = new Set<string>([...holdings.map((h) => h.asset), ...idle.map((i) => i.asset)])
  const out: AssetBook[] = []
  for (const asset of assets) {
    const hs = holdings.filter((h) => h.asset === asset).sort((a, b) => b.valueUsd - a.valueUsd)
    const id = idle.find((i) => i.asset === asset) ?? null
    const atWork = hs.reduce((a, h) => a + h.valueUsd, 0)
    const yearly = hs.reduce((a, h) => a + h.valueUsd * (h.apr ?? 0) / 100, 0)
    out.push({ asset, group: groupOf(asset), idle: id, idleUsd: id?.usd ?? 0, atWorkUsd: atWork, yearlyUsd: yearly, blended: atWork ? yearly / atWork * 100 : 0, totalUsd: atWork + (id?.usd ?? 0), holdings: hs })
  }
  return out.filter((b) => b.totalUsd >= DUST_USD).sort((a, b) => b.totalUsd - a.totalUsd)
}
