import React from 'react'
import { subjectOf, type TxBundle } from '../index/types'
import { marketHref, walletHref } from '../state/AppState'
import { useApp } from '../state/AppState'
import { useFeedPage } from '../index/queries'
import { Ago, Money, Who, describeBundle } from './social-bits'
import { isDust, primaryLeg } from './Feed'

/** how fast the tape runs, px/s: slow enough to read a name as it passes */
const SPEED = 42
const SHOWN = 12

/**
 * The pulse: the tape at a glance, a strip at the top of the page that moves.
 * It is the smallest possible proof that this is a live place and not a
 * listing; the feed under it is the same tape at reading speed.
 *
 * It used to be ONE move, swapped every few seconds, in a bar the width of
 * the page — a short line in a long empty box, with a fade that sat on the
 * line's own end and ate the age. It is a ticker now: the last dozen real
 * moves (dust is left out, as in the feed) running under a fade at the BOX's
 * edges, paused under the pointer so a move can be clicked.
 *
 * The strip is two copies of the list and runs to -50%, where the second copy
 * is exactly where the first began. A poll that lands mid-run is held until
 * that seam, so new moves never make the strip jump.
 */
export function Pulse() {
  const { chainIds, allChains } = useApp()
  const scope = allChains ? undefined : chainIds.join(',')
  const q = useFeedPage({ chainIds: scope }, 30)
  const latest = React.useMemo(() => (q.data?.txs ?? []).filter((t) => !isDust(t)).slice(0, SHOWN), [q.data])
  const next = React.useRef(latest)
  next.current = latest

  const [shown, setShown] = React.useState<TxBundle[]>(latest)
  const view = React.useRef<HTMLDivElement>(null)
  const track = React.useRef<HTMLDivElement>(null)
  /** seconds for one lap, or null when the list fits and there is nothing to run */
  const [lap, setLap] = React.useState<number | null>(null)
  const still = useReducedMotion()

  /**
   * A strip that is not running has no seam to wait for, and a change of
   * chains is not a poll: a lap is over a minute, and the old chains' moves
   * running on for that long read as the picker not having worked.
   */
  const took = React.useRef(scope)
  React.useEffect(() => {
    if (q.isPlaceholderData) return
    if (lap == null || still || !shown.length || took.current !== scope) {
      took.current = scope
      setShown(latest)
    }
  }, [latest, lap, still, scope, q.isPlaceholderData])

  React.useLayoutEffect(() => {
    const v = view.current, t = track.current
    if (!v || !t) return
    // running, the track holds two copies; still, one
    const measure = () => {
      const one = lap != null ? t.scrollWidth / 2 : t.scrollWidth
      setLap(!still && one > v.clientWidth ? one / SPEED : null)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(v)
    return () => ro.disconnect()
  }, [shown, still, lap != null])

  const running = lap != null
  const items = (copy: number) =>
    shown.map((t) => <Move key={`${copy}:${t.chainId}:${t.txHash}`} t={t} hidden={copy > 0} />)

  return (
    <div className="pulse" aria-live="off">
      <span className="p-lbl"><span className="dot" />live</span>
      <div className="p-view" ref={view}>
        {shown.length ? (
          <div
            ref={track}
            className={running ? 'p-track run' : 'p-track'}
            style={running ? ({ '--lap': `${lap}s` } as React.CSSProperties) : undefined}
            onAnimationIteration={() => setShown(next.current)}
          >
            {items(0)}
            {running && items(1)}
          </div>
        ) : (
          <span className="p-empty">{q.isLoading ? 'reading the index…' : 'nothing on the selected chains'}</span>
        )}
      </div>
    </div>
  )
}

function Move({ t, hidden }: { t: TxBundle; hidden: boolean }) {
  const l = primaryLeg(t)
  if (!l) return null
  const d = describeBundle(t)
  const who = subjectOf(t).account || l.account
  return (
    <a
      className="p-it"
      href={l.marketUid ? marketHref(l.marketUid) : walletHref(who)}
      aria-hidden={hidden || undefined}
      tabIndex={hidden ? -1 : undefined}
    >
      <Who account={who} idx={subjectOf(t)} size={18} plain />
      <span className={`verb ${d.cls}`}>{d.verb}</span>
      <span className="p-m">{l.marketName ?? l.symbol}</span>
      <span className="p-usd"><Money usd={t.volumeUsd ?? l.amountUsd} amount={l.amount} symbol={l.symbol} short /></span>
      <Ago ts={t.blockTs} />
    </a>
  )
}

function useReducedMotion() {
  const mq = React.useMemo(() => (typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null), [])
  const [on, setOn] = React.useState(() => !!mq?.matches)
  React.useEffect(() => {
    if (!mq) return
    const h = () => setOn(mq.matches)
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [mq])
  return on
}
