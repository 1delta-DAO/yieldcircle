/**
 * What other wallets say about this thing — and what their word is worth.
 *
 * Every other number on a page in this app is something the chain did. This
 * one is something a person CLAIMED, so it is presented differently on
 * purpose: the claim is never merged into a score, the weight behind it
 * always expands into its parts, and a wallet the index has never seen is
 * shown saying what it said while counting zero.
 *
 * Three rules from pos-indexer docs/community-ratings.md that this component
 * is the last line of defence for:
 *
 *   1. **Zero ratings is not a verdict.** No claims renders as "nobody has
 *      rated this yet", in words. Never a tick, never a 0/5, never green.
 *   2. **Contested stays contested.** Eleven wallets disagreeing is the most
 *      useful thing this axis can say; collapsing it to one number throws it
 *      away.
 *   3. **A holder saying "good" is talking their book**, and it says so
 *      rather than being quietly re-weighted.
 *
 * The three conviction labels are one tap. The serious ones cost a second tap
 * and most cost a link — the friction IS the signal.
 */
import React from 'react'
import { useRatingLabels, useRatings, useSocialRefresh } from '../social/queries'
import { useSocialWrite } from '../social/sign'
import type { RatingLabel, RatingLabelAgg, RatingSubjectKind, RatingVote } from '../social/api'
import { Who } from './social-bits'
import { Ago } from './social-bits'
import { Sk, usdShort } from './bits'

const STATUS: Record<string, { text: string; cls: string; title: string }> = {
  none: { text: 'too few to say', cls: 'rs-none', title: 'fewer than two wallets, or too little weight behind them' },
  claimed: { text: 'claimed', cls: 'rs-claimed', title: 'said, but not by enough wallets to call it settled' },
  contested: { text: 'contested', cls: 'rs-contested', title: 'wallets here disagree — which is worth knowing, and is not a failure' },
  consensus: { text: 'consensus', cls: 'rs-consensus', title: 'five or more wallets, most of the weight on one label, nobody dominant, two of them long-standing' },
}

const tone = (p: number) => (p > 0 ? 'rp-up' : p < 0 ? 'rp-down' : 'rp-flat')

function Chip({ l }: { l: RatingLabelAgg }) {
  const title =
    `${l.title} — ${l.wallets} wallet${l.wallets === 1 ? '' : 's'}, weight ${l.weight.toFixed(1)}` +
    ` (holders ${l.weightHolders.toFixed(1)} · others ${l.weightNonHolders.toFixed(1)})` +
    (l.medianTenureDays ? `; median ${Math.round(l.medianTenureDays)} d on chain` : '')
  return (
    <span className={`rchip ${tone(l.polarity)}`} title={title}>
      {l.emoji && <span className="re">{l.emoji}</span>}
      <span className="rn">{l.title}</span>
      <span className="rc">{l.wallets}</span>
      {l.weight > 0 && <span className="rw">{l.weight.toFixed(1)}</span>}
    </span>
  )
}

function Vote({ v }: { v: RatingVote }) {
  const parts = Object.entries(v.components)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${k} ${n.toFixed(2)}`)
    .join(' + ')
  return (
    <div className="rvote">
      <Who account={v.account} size={20} plain idx={{ accountKind: v.accountKind as never, accountLabel: v.accountLabel }} />
      <span className={`rv-l ${tone(v.polarity)}`}>{v.emoji ? `${v.emoji} ` : ''}{v.label}</span>
      {v.ownBook && <span className="rv-b" title="a positive claim from someone who holds it — shown, not re-weighted">own book</span>}
      <span className="sp" />
      {v.holder && <span className="rv-s" title="what this wallet holds in this subject right now">{usdShort(v.stakeUsd)}</span>}
      <span className="rv-w" title={parts ? `weight = ${parts}` : 'this wallet is unknown to the index and counts zero'}>
        {v.weight.toFixed(2)}
      </span>
      {v.evidenceUrl && (
        <a className="rv-e" href={v.evidenceUrl} target="_blank" rel="noreferrer noopener" title={v.note ?? v.evidenceUrl}>link</a>
      )}
      <span className="rv-t"><Ago ts={v.signedAt} /></span>
    </div>
  )
}

export function Rate({
  kind,
  subject,
  compact,
}: {
  kind: RatingSubjectKind
  subject: string
  /** the row form: chips only, no controls */
  compact?: boolean
}) {
  const { account, rate } = useSocialWrite()
  const refresh = useSocialRefresh()
  const labels = useRatingLabels()
  const q = useRatings(kind, subject, account)
  const [open, setOpen] = React.useState(false)
  const [pending, setPending] = React.useState<RatingLabel | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [err, setErr] = React.useState<string | null>(null)

  const applicable = (labels.data?.labels ?? []).filter((l) => l.subjects.includes(kind))
  const conviction = applicable.filter((l) => l.group === 'conviction')
  const serious = applicable.filter((l) => l.group !== 'conviction')
  const mine = new Set(
    (q.data?.votes ?? []).filter((v) => v.account.toLowerCase() === account).map((v) => v.label),
  )
  const said = q.data?.totals.wallets ?? 0
  const followed = Object.entries(q.data?.byFollowed ?? {})

  async function send(label: string, o: { evidenceUrl?: string; note?: string } = {}) {
    setBusy(label)
    setErr(null)
    try {
      await rate(kind, subject, label, o)
      refresh.ratings(kind, subject)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  if (q.isLoading && !q.data) return <div className="rate"><Sk w={160} /></div>

  return (
    <div className="rate">
      <div className="rline">
        {q.data?.groups.length ? (
          q.data.groups.map((g) => (
            <span
              key={g.group}
              className={`rstat ${STATUS[g.status].cls}`}
              title={`${STATUS[g.status].title} — ${g.wallets} wallet${g.wallets === 1 ? '' : 's'}, weight ${g.weight.toFixed(1)}, top label ${(g.topShare * 100).toFixed(0)} % of it, opposing ${(g.opposingShare * 100).toFixed(0)} %`}
            >
              {g.group}: {STATUS[g.status].text}
            </span>
          ))
        ) : (
          /* rule 1 — in words, never a tick */
          <span className="rempty">Nobody has rated this yet.</span>
        )}
        {(q.data?.labels ?? []).map((l) => <Chip key={l.label} l={l} />)}
        {followed.length > 0 && (
          <span className="rfollow" title="the same votes, restricted to the wallets you follow">
            {followed.map(([k, v]) => `${v.wallets} you follow: ${k}`).join(' · ')}
          </span>
        )}
        {said > 0 && (
          <button className="rmore" onClick={() => setOpen(!open)}>
            {open ? 'hide' : `${said} wallet${said === 1 ? '' : 's'}`}
          </button>
        )}
      </div>

      {!compact && (
        <div className="rbtns">
          {conviction.map((l) => (
            <button
              key={l.key}
              className={`rbtn ${tone(l.polarity)}`}
              aria-pressed={mine.has(l.key)}
              disabled={!account || !!busy}
              title={account ? l.meaning : 'connect a wallet to say something'}
              onClick={() => (l.evidence === 'required' ? setPending(l) : void send(l.key))}
            >
              <span className="re">{l.emoji}</span>{l.title}
            </button>
          ))}
          {serious.length > 0 && (
            <details className="rflag">
              <summary className="rbtn">flag…</summary>
              <div className="rflag-menu">
                {serious.map((l) => (
                  <button
                    key={l.key}
                    disabled={!account || !!busy}
                    onClick={(e) => {
                      ;(e.currentTarget.closest('details') as HTMLDetailsElement | null)?.removeAttribute('open')
                      l.evidence === 'required' ? setPending(l) : void send(l.key)
                    }}
                  >
                    <span className={tone(l.polarity)}>{l.title}{l.evidence === 'required' ? ' *' : ''}</span>
                    <span className="rm">{l.meaning}</span>
                  </button>
                ))}
                <div className="rm foot">* needs a link to the evidence — a claim like this without one is a mood</div>
              </div>
            </details>
          )}
          {!account && <span className="rm">connect a wallet to rate</span>}
          {err && <span className="rerr">{err}</span>}
        </div>
      )}

      {pending && (
        <form
          className="rproof"
          onSubmit={(e) => {
            e.preventDefault()
            const f = new FormData(e.currentTarget)
            void send(pending.key, { evidenceUrl: String(f.get('url') ?? ''), note: String(f.get('note') ?? '') })
            setPending(null)
          }}
        >
          <span className="rm">{pending.title} — the link is the claim:</span>
          <input name="url" type="url" required placeholder="https://…" />
          <input name="note" maxLength={200} placeholder="one line of context (optional)" />
          <button className="btn sm pri" type="submit">Sign</button>
          <button className="btn sm" type="button" onClick={() => setPending(null)}>Cancel</button>
        </form>
      )}

      {open && (q.data?.votes.length ?? 0) > 0 && (
        <div className="rvotes">
          {q.data!.votes.map((v) => <Vote key={`${v.account}|${v.label}`} v={v} />)}
          {q.data!.totals.zeroWeightWallets > 0 && (
            <div className="rm">
              {q.data!.totals.zeroWeightWallets} of these wallets are unknown to the index and count zero —
              recorded, shown, never summed.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * The row form: how many wallets said what, from the BATCH route. Counts, not
 * weights — the weighted verdict needs the per-subject stake join and lives
 * on the subject's own page, and a chip that disagreed with the page it links
 * to would be worse than a chip that says less.
 */
export function RateMark({ c }: { c: { wallets: number; labels: Record<string, { wallets: number; polarity: number; emoji?: string }> } | null | undefined }) {
  if (!c || !c.wallets) return null
  const top = Object.entries(c.labels).sort((a, b) => b[1].wallets - a[1].wallets).slice(0, 2)
  return (
    <span className="rmark" title={Object.entries(c.labels).map(([k, v]) => `${v.wallets}× ${k}`).join(' · ')}>
      {top.map(([k, v]) => (
        <span key={k} className={`rm-i ${tone(v.polarity)}`}>{v.emoji ?? k}<span className="rm-c">{v.wallets}</span></span>
      ))}
    </span>
  )
}
