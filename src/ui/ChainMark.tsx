/**
 * Chain marks, drawn rather than fetched.
 *
 * Every other icon in this app that comes from a URL has a fallback path and
 * a load error to handle; a chain is one of five known things, so it is a
 * path. Inline SVG costs no request, is crisp at 14px and at 28px, and cannot
 * half-render — the same reason the brand mark and the character are paths.
 *
 * The index follows one chain this app has no strategies for (Avalanche), so
 * a ledger row can name a chain the selector does not offer. It gets a mark
 * too: a row from it must not be the only nameless thing on the page.
 */

export interface ChainInfo { id: string; name: string; short: string; color: string; explorer: string; explorerName: string }
export const CHAIN_INFO: Record<string, ChainInfo> = {
  '1': { id: '1', name: 'Ethereum', short: 'ETH', color: '#627eea', explorer: 'https://etherscan.io', explorerName: 'Etherscan' },
  '8453': { id: '8453', name: 'Base', short: 'BASE', color: '#0052ff', explorer: 'https://basescan.org', explorerName: 'Basescan' },
  '42161': { id: '42161', name: 'Arbitrum', short: 'ARB', color: '#12aaff', explorer: 'https://arbiscan.io', explorerName: 'Arbiscan' },
  '56': { id: '56', name: 'BNB Chain', short: 'BNB', color: '#f0b90b', explorer: 'https://bscscan.com', explorerName: 'BscScan' },
  '43114': { id: '43114', name: 'Avalanche', short: 'AVAX', color: '#e84142', explorer: 'https://snowscan.xyz', explorerName: 'Snowscan' },
}
export const chainInfo = (id: string | undefined): ChainInfo | undefined => (id ? CHAIN_INFO[id] : undefined)

/**
 * A move the index shows is a transaction on a public chain, and the only way
 * to check it is the chain's own explorer. A chain this file does not know
 * gets no link rather than a guessed one.
 */
export const txUrl = (chainId: string | undefined, hash: string | undefined) =>
  chainId && hash && chainInfo(chainId) ? `${chainInfo(chainId)!.explorer}/tx/${hash}` : undefined
export const addressUrl = (chainId: string | undefined, address: string | undefined) =>
  chainId && address && chainInfo(chainId) ? `${chainInfo(chainId)!.explorer}/address/${address}` : undefined

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
  const c = chainInfo(chainId)
  if (!c)
    return (
      <i className="chainmark unknown" style={{ width: size, height: size, fontSize: size * 0.42 }} title={title ?? chainId}>
        {chainId.slice(0, 2)}
      </i>
    )
  return (
    <svg className="chainmark" viewBox="0 0 24 24" width={size} height={size} style={{ width: size, height: size }}
      role="img" aria-label={c.name}>
      <title>{title ?? c.name}</title>
      <circle cx="12" cy="12" r="12" fill={c.color} />
      <Glyph id={c.id} />
    </svg>
  )
}

/** A mark with its name beside it — the selector, and anywhere with room. */
export function ChainTag({ chainId, size = 15 }: { chainId: string; size?: number }) {
  const c = chainInfo(chainId)
  return (
    <span className="chaintag">
      <ChainMark chainId={chainId} size={size} />
      <span>{c?.name ?? chainId}</span>
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
      <ChainMark chainId={chainId} size={14} />
      <b>{c?.short ?? chainId}</b>
    </span>
  )
}
