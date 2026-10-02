/**
 * Chain marks: the API's logo, with a drawn one underneath it.
 *
 * `/v1/data/chains` names every chain 1delta knows and gives it a logo, so a
 * chain wears the same mark here as in the rest of the product and a chain
 * added upstream needs no art here. That is the first choice.
 *
 * It is not the only one, because an icon fetched from a URL can be slow,
 * blocked or 404, and a header full of empty discs is worse than a plain one.
 * So `CHAIN_INFO` keeps what this app can draw with no request at all — the
 * five oldest chains as paths, the rest as their own short name on their own
 * colour — and the mark falls back to it while the directory loads and
 * forever if the image fails. A chain neither knows gets the grey
 * two-character disc, because a row from it must not be the only nameless,
 * unlinkable thing on the page.
 *
 * The colour and the explorer stay local on purpose: the directory carries
 * neither, and an explorer link is the one thing a reader uses to check what
 * this app claims.
 */
import React from 'react'
import { useChainMeta } from '../sdk/queries'

export interface ChainInfo {
  id: string; name: string; short: string; color: string; explorer: string; explorerName: string
  /** the explorer's address path where it is not `/address/` (Solscan says `/account/`) */
  accountPath?: string
}
export const CHAIN_INFO: Record<string, ChainInfo> = {
  '1': { id: '1', name: 'Ethereum', short: 'ETH', color: '#627eea', explorer: 'https://etherscan.io', explorerName: 'Etherscan' },
  '8453': { id: '8453', name: 'Base', short: 'BASE', color: '#0052ff', explorer: 'https://basescan.org', explorerName: 'Basescan' },
  '42161': { id: '42161', name: 'Arbitrum', short: 'ARB', color: '#12aaff', explorer: 'https://arbiscan.io', explorerName: 'Arbiscan' },
  '56': { id: '56', name: 'BNB Chain', short: 'BNB', color: '#f0b90b', explorer: 'https://bscscan.com', explorerName: 'BscScan' },
  '43114': { id: '43114', name: 'Avalanche', short: 'AVAX', color: '#e84142', explorer: 'https://snowscan.xyz', explorerName: 'Snowscan' },
  // The ten the index added on 2026-09-23. They carry a name, a colour and an
  // explorer but no drawn glyph: a mark is a brand, and an invented one is
  // worse than the chain's own letters on its own disc, which is what these
  // render (see `ChainMark`). The colour is the chain's where it is widely
  // known and slate where it is not — a wrong brand colour says something
  // false about the chain, a neutral one says nothing.
  '10': { id: '10', name: 'Optimism', short: 'OP', color: '#ff0420', explorer: 'https://optimistic.etherscan.io', explorerName: 'Optimistic Etherscan' },
  '137': { id: '137', name: 'Polygon', short: 'POL', color: '#8247e5', explorer: 'https://polygonscan.com', explorerName: 'Polygonscan' },
  '143': { id: '143', name: 'Monad', short: 'MON', color: '#836ef9', explorer: 'https://monadscan.com', explorerName: 'MonadScan' },
  '999': { id: '999', name: 'HyperEVM', short: 'HYPE', color: '#1a9e8f', explorer: 'https://hyperevmscan.io', explorerName: 'HyperEVMScan' },
  '4663': { id: '4663', name: 'Robinhood Chain', short: 'HOOD', color: '#00a804', explorer: 'https://robinscan.io', explorerName: 'Robinscan' },
  '9745': { id: '9745', name: 'Plasma', short: 'XPL', color: '#64748b', explorer: 'https://plasmascan.to', explorerName: 'Plasmascan' },
  '5042': { id: '5042', name: 'Arc', short: 'ARC', color: '#64748b', explorer: 'https://explorer.arc.io', explorerName: 'Arc Explorer' },
  '4217': { id: '4217', name: 'Tempo', short: 'TEMPO', color: '#64748b', explorer: 'https://explore.tempo.xyz', explorerName: 'Tempo Explorer' },
  '988': { id: '988', name: 'Stable', short: 'STBL', color: '#64748b', explorer: 'https://stablescan.xyz', explorerName: 'Stablescan' },
  '98866': { id: '98866', name: 'Plume', short: 'PLUME', color: '#64748b', explorer: 'https://explorer.plume.org', explorerName: 'Plume Explorer' },
  // the one non-EVM chain. Solscan's paths differ: a wallet is /account/, a transaction /tx/.
  'solana': { id: 'solana', name: 'Solana', short: 'SOL', color: '#9945ff', explorer: 'https://solscan.io', explorerName: 'Solscan', accountPath: '/account/' },
}

/** the ids `Glyph` draws; the rest wear their own letters */
const DRAWN = new Set(['1', '8453', '42161', '56', '43114'])
export const chainInfo = (id: string | undefined): ChainInfo | undefined => (id ? CHAIN_INFO[id] : undefined)

/**
 * A move the index shows is a transaction on a public chain, and the only way
 * to check it is the chain's own explorer. A chain this file does not know
 * gets no link rather than a guessed one.
 */
export const txUrl = (chainId: string | undefined, hash: string | undefined) =>
  chainId && hash && chainInfo(chainId) ? `${chainInfo(chainId)!.explorer}/tx/${hash}` : undefined
export const addressUrl = (chainId: string | undefined, address: string | undefined) =>
  chainId && address && chainInfo(chainId) ? `${chainInfo(chainId)!.explorer}${chainInfo(chainId)!.accountPath ?? '/address/'}${address}` : undefined

function Glyph({ id }: { id: string }) {
  switch (id) {
    // the ether diamond: two solid faces above, two shaded below
    case '1':
      return (
        <g>
          <path d="M12 2.6 5.6 12.3 12 9.4z" fill="#fff" fillOpacity=".62" />
          <path d="M12 2.6 18.4 12.3 12 9.4z" fill="#fff" />
          <path d="M12 16.1 5.6 12.3 12 15.2z" fill="#fff" fillOpacity=".62" />
          <path d="M12 16.1 18.4 12.3 12 15.2z" fill="#fff" />
          <path d="M12 17.5 5.9 13.7 12 21.4z" fill="#fff" fillOpacity=".45" />
          <path d="M12 17.5 18.1 13.7 12 21.4z" fill="#fff" fillOpacity=".8" />
        </g>
      )
    // base: a ring with its right side opened by a flat
    case '8453':
      return <path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 8.93-8h-12.2v-2h12.2A9 9 0 0 0 12 3z" fill="#fff" />
    // arbitrum: the shield outline with the inner chevron
    case '42161':
      return (
        <g fill="none" stroke="#fff" strokeWidth="1.7" strokeLinejoin="round">
          <path d="M12 2.8 20 7.4v9.2L12 21.2 4 16.6V7.4z" />
          <path d="M9.4 16.6 12 9.6l2.6 7" strokeWidth="1.5" />
        </g>
      )
    // bnb: the diamond made of diamonds
    case '56':
      return (
        <g fill="#000">
          <path d="M12 3.4 15 6.4 12 9.4 9 6.4z" />
          <path d="M6.6 8.8 9.6 11.8 6.6 14.8 3.6 11.8z" />
          <path d="M17.4 8.8 20.4 11.8 17.4 14.8 14.4 11.8z" />
          <path d="M12 14.2 15 17.2 12 20.2 9 17.2z" />
          <path d="M12 9.6 14.2 11.8 12 14 9.8 11.8z" />
        </g>
      )
    // avalanche: the peak, split
    case '43114':
      return (
        <g fill="#fff">
          <path d="M13.2 5.6 20 17.6h-4.2l-2.6-4.7a1.5 1.5 0 0 1 0-1.5l1.4-2.5a1.5 1.5 0 0 0 0-1.5z" />
          <path d="M9.4 11.4 12.9 17.6H5.9z" />
        </g>
      )
    default:
      return null
  }
}

/**
 * The mark alone. `plain` drops the coloured disc for places that already have
 * a background of their own.
 */
export function ChainMark({ chainId, size = 16, title }: { chainId: string; size?: number; title?: string }) {
  const meta = useChainMeta()[chainId]
  const [imgFailed, setImgFailed] = React.useState(false)
  const c = chainInfo(chainId)
  const name = title ?? c?.name ?? meta?.name ?? chainId
  if (meta?.logo && !imgFailed)
    return (
      <img className="chainmark" src={meta.logo} alt="" role="img" aria-label={name} title={name}
        width={size} height={size} style={{ width: size, height: size }} loading="lazy"
        onError={() => setImgFailed(true)} />
    )
  if (!c)
    return (
      <i className="chainmark unknown" style={{ width: size, height: size, fontSize: size * 0.42 }} title={name}>
        {chainId.slice(0, 2)}
      </i>
    )
  // a chain we know but do not draw: its own letters, sized to fit the disc
  const letters = DRAWN.has(c.id) ? null : c.short.slice(0, 4)
  return (
    <svg className="chainmark" viewBox="0 0 24 24" width={size} height={size} style={{ width: size, height: size }}
      role="img" aria-label={c.name}>
      <title>{name}</title>
      <circle cx="12" cy="12" r="12" fill={c.color} />
      {letters ? (
        <text x="12" y="12.6" textAnchor="middle" dominantBaseline="middle" fill="#fff" fontWeight="700"
          fontSize={letters.length > 3 ? 7.4 : letters.length > 2 ? 9 : 11} letterSpacing="-.3">
          {letters}
        </text>
      ) : (
        <Glyph id={c.id} />
      )}
    </svg>
  )
}

/** A mark with its name beside it — the selector, and anywhere with room. */
export function ChainTag({ chainId, size = 15 }: { chainId: string; size?: number }) {
  const c = chainInfo(chainId)
  const meta = useChainMeta()[chainId]
  return (
    <span className="chaintag">
      <ChainMark chainId={chainId} size={size} />
      <span>{c?.name ?? meta?.name ?? chainId}</span>
    </span>
  )
}

/**
 * The corner indicator on a card: the mark, and the chain's short name on a
 * screen wide enough for it. Absolute, so it never joins the flow of the
 * numbers it sits above.
 */
export function ChainCorner({ chainId }: { chainId: string | undefined }) {
  if (!chainId) return null
  const c = chainInfo(chainId)
  return (
    <span className="chain-corner" title={c?.name ?? chainId}>
      <ChainMark chainId={chainId} size={18} />
      <b>{c?.short ?? chainId}</b>
    </span>
  )
}
