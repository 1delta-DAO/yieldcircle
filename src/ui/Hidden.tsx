/**
 * What the list is not showing, under the list.
 *
 * A curated menu that simply ends is indistinguishable from a chain nobody
 * lends on — HyperEVM read as "zero loops" while the optimizer had 104 pairs
 * for it. So every gate keeps its count: a `+` moves exactly the floor that
 * hid those rows, a `−` puts it back, and the rows that come in wear the
 * reason they were out (`primitives`: the `why` pill on the row).
 *
 * The last line is the part no switch can fix — a debt in another money, an
 * asset the whitelist does not map. It is counted anyway, because "we cannot
 * show these" is an answer and silence is not.
 */
import React from 'react'
import { HIDES, relaxFor, restoreFor, widenedCodes, type HideCode } from '../model/visibility'
import { useSettings } from '../state/Settings'
import type { HiddenRow, StructuralCount } from '../sdk/queries'
import { Info } from './bits'

export function HiddenBar({ kind, rows, structural, busy }: { kind: 'simple' | 'loop'; rows: HiddenRow[]; structural: StructuralCount[]; busy?: boolean }) {
  const { st, set } = useSettings()
  const counts = new Map<HideCode, number>()
  for (const r of rows) counts.set(r.hide, (counts.get(r.hide) ?? 0) + 1)
  // the one bucket that cannot be counted: `minTvlUsd` is the earn listing's
  // OWN filter, so most rows under it never arrive. The few that do (the API
  // filters on its own figure, not on `tvl.usd`) would make a "+3" that lets
  // nine rows in — so the chip asks for them rather than counting them.
  const ask: { code: HideCode; word: string }[] = []
  if (kind === 'simple' && st.minTvlUsd > 0) { ask.push({ code: 'small', word: 'smaller markets' }); counts.delete('small') }
  const widened = widenedCodes(st).filter((c) => (HIDES[c].kind ?? kind) === kind)
  const struct = structural.filter((x) => x.kind === kind && x.n > 0).sort((a, b) => b.n - a.n)
  const nothing = counts.size === 0 && ask.length === 0 && widened.length === 0 && struct.length === 0 && (kind !== 'loop' || st.wideNet)
  if (nothing) return null
  return (
    <div className="hidbar">
      <span className="hb-l">
        Not shown
        <Info label="What is not shown">
          <b>The menu is curated.</b> Size floors, a risk cap and "the collateral has to earn something on its own" keep the list short. Each button here moves exactly one of those floors — and a row let in that way carries a chip saying what was wrong with it. The last line is what no switch can fix: the app cannot name the asset, or the debt is a different money, so there is nothing to show.
        </Info>
      </span>
      {[...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([code, n]) => (
          <button key={code} className="chip hb" title={`${HIDES[code].why}${HIDES[code].refetch ? ' Showing them asks each chain again.' : ''}`} onClick={() => set(relaxFor(code))}>
            <span className="s">+</span>{n} {HIDES[code].word}
          </button>
        ))}
      {ask.map(({ code, word }) => (
        <button key={`ask-${code}`} className="chip hb ask" title={`${HIDES[code].why} They are not in this page's data — asking for them is one more request per chain.`} onClick={() => set(relaxFor(code))}>
          <span className="s">+</span>{word}
        </button>
      ))}
      {kind === 'loop' && !st.wideNet && (
        <button className="chip hb ask" title="The optimizer only answers with collateral it has tagged. Dropping the collateral tag finds untagged carries (sUSDp, syzUSD on HyperEVM) at one more request per chain."
          onClick={() => set({ wideNet: true })}>
          <span className="s">+</span>search wider
        </button>
      )}
      {widened.map((code) => (
        <button key={`w-${code}`} className="chip hb on" title={`Put the ${HIDES[code].word} floor back where it was.`} onClick={() => set(restoreFor(code))}>
          <span className="s">−</span>{HIDES[code].word}
        </button>
      ))}
      {kind === 'loop' && st.wideNet && (
        <button className="chip hb on" title="Stop asking the optimizer without collateral tags." onClick={() => set({ wideNet: false })}>
          <span className="s">−</span>wider search
        </button>
      )}
      {busy && <span className="hb-busy" aria-live="polite">asking…</span>}
      {struct.length > 0 && (
        <div className="hb-note">
          {(() => { const n = struct.reduce((a, x) => a + x.n, 0); return `${n} ${kind === 'loop' ? (n === 1 ? 'pair' : 'pairs') : (n === 1 ? 'market' : 'markets')} no switch can show:` })()}{' '}
          {struct.map((x, i) => (
            <span key={x.code}>{i ? ' · ' : ' '}<span className="hb-w" title={HIDES[x.code].why}>{x.n} {HIDES[x.code].word}</span></span>
          ))}
          {struct[0].examples.length > 0 && <span className="hb-ex"> ({struct[0].examples.slice(0, 3).join(', ')})</span>}
        </div>
      )}
    </div>
  )
}
