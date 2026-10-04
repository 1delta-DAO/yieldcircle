import { useApp } from '../state/AppState'
import { isEvmAddr, isSolAddr } from '../model/address'
import { useBalancesPerChain, useCatalog, useEarnPositions } from '../sdk/queries'
import { books, holdingsFrom, idleFrom, type AssetBook, type Holding, type Idle } from '../model/positions'
import type { Strategy } from '../model/strategies'

/**
 * Everything a screen needs in one hook: the curated catalogue, the account's holdings and idle
 * balances (per selected chain), and the per-asset books that combine them.
 */
export function useBook() {
  const { chainIds, account, solSigner, viewAs } = useApp()
  // one address per VM: `account` is the EVM wallet when both are connected, so Solana reads the
  // Solana wallet — unless the page is viewing someone else, whose other VM we do not know
  const accounts = { evm: isEvmAddr(account) ? account : undefined, sol: isSolAddr(account) ? account : viewAs ? undefined : solSigner }
  const cat = useCatalog(chainIds)
  const all: Strategy[] = [...cat.simple, ...cat.loops]
  // one balance read per selected chain, for every address the catalogue knows there, sent once that chain has settled
  const bals = useBalancesPerChain(accounts, chainIds.map((c) => ({ chainId: c, addresses: cat.addresses[c] ?? [], ready: cat.settled.has(c) })))
  const idle: Idle[] = bals.flatMap((b, i) => (b.data ? idleFrom(b.data.items, chainIds[i]) : []))
  // the group view sums the same base asset across tokens and chains (native ETH + WETH, all chains)
  const idleMerged: Idle[] = []
  for (const i of idle) { const cur = idleMerged.find((x) => x.asset === i.asset); if (cur) { cur.amount += i.amount; cur.usd += i.usd; if (i.usd > cur.usd - i.usd) { cur.address = i.address; cur.decimals = i.decimals; cur.chainId = i.chainId } } else idleMerged.push({ ...i }) }
  const pos = useEarnPositions(accounts, chainIds)
  const holdings: Holding[] = pos.anyData ? holdingsFrom(pos.items) : []
  const bk: AssetBook[] = books(holdings, idleMerged)
  return {
    ...cat, all, idle, idlePerChain: idle, books: bk, holdings,
    positionsLoading: !!(accounts.evm || accounts.sol) && (pos.isLoading || bals.some((b) => b.isLoading || (!b.data && b.fetchStatus === 'idle' && !b.isFetched))),
    positionsError: pos.error as Error | null,
    account,
  }
}
