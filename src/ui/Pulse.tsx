import React from 'react'
import { subjectOf } from '../index/types'
import { marketHref, walletHref } from '../state/AppState'
import { useApp } from '../state/AppState'
import { useFeedPage } from '../index/queries'
import { Ago, Money, Who, describeBundle } from './social-bits'
import { primaryLeg } from './Feed'

/**
 * The pulse: one line at the top of the page that changes. It is the smallest
 * possible proof that this is a live place and not a listing. The feed under
 * it is the same tape at reading speed; this is the tape at a glance.
 */
export function Pulse() {
  const { chainIds, allChains } = useApp()
  const q = useFeedPage({ chainIds: allChains ? undefined : chainIds.join(',') }, 12)
  const txs = q.data?.txs ?? []
  const [i, setI] = React.useState(0)
  React.useEffect(() => {
    if (txs.length < 2) return
    const t = setInterval(() => setI((n) => (n + 1) % Math.min(txs.length, 8)), 4500)
    return () => clearInterval(t)
  }, [txs.length])
  const t = txs[Math.min(i, Math.max(0, txs.length - 1))]
  const l = t ? primaryLeg(t) : undefined
  const d = t ? describeBundle(t) : null
  return (
    <div className="pulse" aria-live="off">
      <span className="dot" />
      <span className="p-lbl">live</span>
      {t && l ? (
        <a className="p-body" key={t.txHash} href={l.marketUid ? marketHref(l.marketUid) : walletHref(subjectOf(t).account || l.account)}>
          <Who account={subjectOf(t).account || l.account} idx={subjectOf(t)} size={18} plain />
          <span className={`verb ${d!.cls}`}>{d!.verb}</span>
          <span className="t70">{l.marketName ?? l.symbol}</span>
          <span className="mono"><Money usd={t.volumeUsd ?? l.amountUsd} amount={l.amount} symbol={l.symbol} short /></span>
          <Ago ts={t.blockTs} />
        </a>
      ) : (
        <span className="p-body t40">{q.isLoading ? 'reading the index…' : 'nothing on the selected chains'}</span>
      )}
    </div>
  )
}
