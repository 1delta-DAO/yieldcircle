/**
 * The small pieces every social surface is built from: a face with a name, a
 * follow button, a comment count, an action pill, a time that ages, and money
 * that admits how sure it is. Same discipline as `bits.tsx` — presentation
 * only, no fetching except the one-line hooks that are genuinely per-widget.
 */
import React from 'react'
import { normAddr } from '@yieldcircle/core/model/address'
import { Character, unearned, specFor } from '../identity/character'
import { AUTO_TITLE, labelFor, shortAddr } from '@yieldcircle/core/identity/name'
import { useMyFollows, useSocialRefresh } from '../social/queries'
import { entryKey, useBatchSupported, usePending } from '../social/pending'
import { useSocialWrite } from '../social/sign'
import { stakeLine } from '@yieldcircle/core/social/words'
import type { AuthorStake, Follow, Profile } from '../social/types'
import type { AccountKind, UsdStatus } from '@yieldcircle/core/index/types'
import { chainLabel } from '@yieldcircle/app/sdk/queries'
import { Tip, pct, usd, usdShort } from './bits'

// ---------------------------------------------------------------- time
/** One shared clock: a hundred ages on a screen tick together and cost one timer. */
let tick = 0
const listeners = new Set<() => void>()
setInterval(() => { tick++; listeners.forEach((l) => l()) }, 15_000)
function useClock() {
  const [, set] = React.useState(0)
  React.useEffect(() => { const l = () => set(tick); listeners.add(l); return () => { listeners.delete(l) } }, [])
}
export { ago } from '@yieldcircle/core/model/format'
import { ago } from '@yieldcircle/core/model/format'
/** The age alone; the exact stamp is the title, so the table never jumps. */
export function Ago({ ts }: { ts: string | number | undefined }) {
  useClock()
  const t = typeof ts === 'number' ? ts : Date.parse(ts ?? '')
  return <span className="ago" title={Number.isFinite(t) ? new Date(t).toLocaleString() : undefined}>{ago(ts)}</span>
}

// ---------------------------------------------------------------- money
/**
 * The index says how sure a dollar figure is and this shows it, because a
 * silent guess is worse than a marked one: `~` a provisional price (newest
 * cached, not the block's), `≈` an amount derived as units × index.
 */
const NO_VALUE_WHY = {
  'no-amount': 'The transaction moved this position without stating an amount of the token (a Fluid smart vault moves DEX shares). The position’s balance is read from the chain.',
  implausible: 'The amount on record is more than the token’s whole supply, so it is a mis-scaled number, not money. It is left out of every total.',
} as const

export function Money({ usd: v, status, fromIndex, short, amount, symbol }: {
  usd: number | null | undefined
  status?: UsdStatus
  fromIndex?: boolean | null
  short?: boolean
  /** shown instead of a dash when the row has no dollar value yet */
  amount?: string | null
  symbol?: string | null
}) {
  if (v == null) {
    // no amount to show either: a "0 PAXG" here would read as a deposit of nothing
    if (status === 'no-amount' || status === 'implausible') return <span className="t40" title={NO_VALUE_WHY[status]}>—</span>
    if (amount && symbol) return <span className="t70" title={`no dollar value yet (${status ?? 'unvalued'})`}>{tokens(amount)} {symbol}</span>
    return <span className="t40" title={status ?? 'not valued'}>—</span>
  }
  const mark = fromIndex ? '≈' : status && status !== 'exact' ? '~' : ''
  const why = fromIndex ? 'amount derived as units × index' : status === 'provisional' ? 'valued at the newest cached price, not the block’s' : status
  return <span title={why}>{mark}{(short ? usdShort : usd)(v)}</span>
}

const IMPAIRED_WHY: Record<string, string> = {
  range: 'the market reports deposits no market has (over $100 bn)',
  insolvent: 'the market owes more than it holds and has no cash left',
  'full-at-size': 'the market is fully borrowed at size with no cash, so its rate model compounds the claim at its cap',
  'exceeds-supply': 'this one position is more than twice the token’s whole supply on the chain',
}

/**
 * A position its market cannot pay (pos-indexer tickets/0037). The claim is
 * real on paper and worth nothing like its face: the balance keeps growing at
 * the rate model's cap in a market with no cash. The face value is struck
 * through and counted in no total on the page.
 */
export function Impaired({ x, short }: { x: { faceUsd?: number | null; impairedReason?: string | null }; short?: boolean }) {
  const why = (x.impairedReason && IMPAIRED_WHY[x.impairedReason]) || x.impairedReason || 'the market cannot pay it'
  const face = x.faceUsd != null ? (short ? usdShort : usd)(x.faceUsd) : null
  return (
    <span title={`Impaired: ${why}.${face ? ` Face value ${face}, left out of net value and every ranking.` : ''}`}>
      <span className="pill bad">impaired</span>
      {face && <> <s className="t40">{face}</s></>}
    </span>
  )
}

/**
 * What a holders list left out because its market cannot pay it. Unranked is
 * right (a phantom has no value to rank by); unsaid is not.
 */
export function ImpairedNote({ n }: { n?: { positions: number; faceUsd: number } | null }) {
  if (!n?.positions) return null
  return (
    <span className="sub bad" title="positions in dead markets (fully borrowed, no cash) whose balance keeps compounding at the rate model's cap: left out of this list and of every total">
      · {n.positions} impaired ({usdShort(n.faceUsd)} face) left out
    </span>
  )
}

/** A scaled amount string as a reader wants it: grouped, and never 18 decimals long. */
export function tokens(a: string): string {
  const n = Number(a)
  if (!Number.isFinite(n)) return a.slice(0, 12)
  return n.toLocaleString('en-US', { maximumFractionDigits: n >= 1000 ? 0 : n >= 1 ? 2 : 6 })
}

// ---------------------------------------------------------------- identity
export function Face({ account, profile, size = 28, idx }: { account: string; profile?: Profile | null; size?: number; idx?: { accountKind?: AccountKind; accountLabel?: string | null } | null }) {
  const name = labelFor(account, profile, idx)
  return <Character addr={account} avatarUrl={profile?.avatarUrl} size={size} title={`${name.label} · ${shortAddr(account)}`} />
}

/**
 * "This name was invented." A wallet nobody has signed a profile for reads as
 * "Amber Otter" like any chosen name, and the difference matters when the name
 * is attached to a claim — so it is said, not implied by a dimming.
 */
export const AutoTag = () => <Tip tip={<><b>Generated name.</b> {AUTO_TITLE[0].toUpperCase() + AUTO_TITLE.slice(1)}.</>}><i className="pill auto">auto</i></Tip>

/** A face and a name, linking to the wallet page. The index's word for an address beats a made-up one. */
export function Who({ account, profile, size = 28, idx, sub, plain }: {
  account: string
  profile?: Profile | null
  size?: number
  idx?: { accountKind?: AccountKind; accountLabel?: string | null } | null
  sub?: React.ReactNode
  /** no link — inside a row that is itself a link */
  plain?: boolean
}) {
  const name = labelFor(account, profile, idx)
  const spec = specFor(account, profile?.avatarUrl)
  const bad = profile?.avatarUrl ? unearned(spec, profile.systemTags ?? []) : []
  const inner = (
    <>
      <Face account={account} profile={profile} size={size} idx={idx} />
      <span className="wn">
        <b>{name.label}<TopCrown tags={profile?.systemTags} />{bad.length > 0 && <i className="unearned" title={`claims ${bad.map((g) => g.why).join(', ')}`}>!</i>}</b>
        {sub != null ? <small>{sub}</small> : name.generated && <small className="t40">{shortAddr(account)}</small>}
      </span>
      {name.generated && <AutoTag />}
      {name.kind && name.kind !== 'eoa' && name.kind !== 'unknown' && name.kind !== 'contract' && <span className={`pill kind ${name.kind}`}>{name.kind}</span>}
      {profile?.xHandle && <span className="xtag" title={`linked to @${profile.xHandle} on X`}>𝕏</span>}
      {profile?.tags?.includes('paper') && <span className="pill paper" title="A paper account: play money on real rates (tickets/0006)">paper</span>}
    </>
  )
  return plain ? <span className="who">{inner}</span> : <a className="who" href={`#/w/${account}`} onClick={(e) => e.stopPropagation()}>{inner}</a>
}

/** Badges the index minted. Self-claimed profile tags are shown quieter, never here. */
export const TAG_LABEL: Record<string, string> = {
  'held-180d': '180 days in',
  'never-liquidated': 'never liquidated',
  early: 'early',
  'size-whale': '$1m+ deposited',
  'size-large': '$100k+ deposited',
}
/**
 * What each badge exactly means — the index's rule, in words (pos-indexer
 * `refreshBadges`). Every one is computed from the ledger, recomputed on a
 * schedule, and cannot be claimed, bought or transferred.
 */
export const TAG_HELP: Record<string, string> = {
  'held-180d': 'Has a supply position worth at least $100 that has been open for more than 180 days.',
  'never-liquidated': 'Holds at least one position worth $100 or more, and no position of this address has ever been liquidated. The badge is removed the moment one is.',
  early: 'Was among the first 100 accounts to enter at least one market the index tracks.',
  'size-whale': 'Has deposited over $1m in total, lifetime, summed across every market at the price at each deposit. Vaults and protocol contracts are excluded.',
  'size-large': 'Has deposited over $100k in total, lifetime, summed across every market at the price at each deposit. Vaults and protocol contracts are excluded.',
}
const BADGE_FOOT = 'Earned from the on-chain record — it cannot be claimed or bought.'
export function Badge({ tag, evidence }: { tag: string; evidence?: unknown }) {
  const crown = parseCrown(tag)
  if (crown) return <CrownBadge crown={crown} evidence={evidence as CrownEvidence | undefined} />
  const label = TAG_LABEL[tag] ?? tag
  return (
    <Tip tip={<><b>{label}</b> — {TAG_HELP[tag] ?? 'A badge the index computed from this address\'s history.'} <span className="t40">{BADGE_FOOT}</span></>}>
      <i className="badge-tag">{label}</i>
    </Tip>
  )
}
const tagLabel = (t: string) => { const c = parseCrown(t); return c ? crownTitle(c) : TAG_LABEL[t] ?? t }
export function Badges({ tags, evidence, max = 3 }: { tags?: string[] | null; evidence?: { tag: string; evidence: unknown }[] | null; max?: number }) {
  if (!tags?.length) return null
  // crowns first, the overall one before the chains', gold before bronze
  const sorted = [...tags].sort((a, b) => crownOrder(a) - crownOrder(b))
  const ev = new Map((evidence ?? []).map((e) => [e.tag, e.evidence]))
  const rest = sorted.slice(max)
  return (
    <span className="badges">
      {sorted.slice(0, max).map((t) => <Badge key={t} tag={t} evidence={ev.get(t)} />)}
      {rest.length > 0 && <Tip tip={<>Also: {rest.map(tagLabel).join(', ')}.</>}><i className="badge-tag more">+{rest.length}</i></Tip>}
    </span>
  )
}

// ---------------------------------------------------------------- crowns
/**
 * Places 1–3 of the wallet APR board, overall and per chain (pos-indexer
 * 0059). The index mirrors each into the holder's badges as
 * `crown.<scope>.<place>` and deletes it the run they lose it, so a crown is
 * always the podium as it stands — never a title someone keeps.
 */
export interface Crown { scope: string; place: number }
interface CrownEvidence { since?: string; aprPct?: number | null; navUsd?: number | null }
/** The title of each place. One line to change. */
const CROWN_TITLES = ['Yield King', 'Yield Prince', 'Yield Duke']
const METAL = ['gold', 'silver', 'bronze']

export function parseCrown(tag: string): Crown | null {
  const m = /^crown\.([^.]+)\.([1-3])$/.exec(tag)
  return m ? { scope: m[1], place: Number(m[2]) } : null
}
/** "Yield King", "Base Yield Prince". */
export const crownTitle = (c: Crown) =>
  `${c.scope === 'all' ? '' : chainLabel(c.scope) + ' '}${CROWN_TITLES[c.place - 1] ?? `#${c.place}`}`
const crownOrder = (tag: string) => {
  const c = parseCrown(tag)
  return c ? (c.scope === 'all' ? 0 : 10) + c.place : 100
}
const crownRule = (c: Crown) =>
  `Place ${c.place} of the wallet APR board${c.scope === 'all' ? ' across every chain' : ` on ${chainLabel(c.scope)}, ranked on this wallet's positions there alone`} — net carry on equity at the 24 h mean rates, people only, positions that are not a takeable yield left out, NAV of $10k or more. A place changes hands once someone has held it for two hours, and the crown goes the run it is lost.`

/** The crown mark: a metal per place. */
export function CrownIcon({ place, size = 14, title }: { place: number; size?: number; title?: string }) {
  return (
    <svg className={`crown ${METAL[place - 1] ?? 'bronze'}`} width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={title ?? CROWN_TITLES[place - 1]}>
      {title && <title>{title}</title>}
      <path d="M3 8.5l4.5 4 4.5-7 4.5 7 4.5-4-2 10H5l-2-10z" fill="currentColor" />
      <rect x="5" y="19.5" width="14" height="2" rx="1" fill="currentColor" />
      <circle cx="3" cy="8" r="1.6" fill="currentColor" /><circle cx="12" cy="4.5" r="1.6" fill="currentColor" /><circle cx="21" cy="8" r="1.6" fill="currentColor" />
    </svg>
  )
}

function CrownBadge({ crown, evidence }: { crown: Crown; evidence?: CrownEvidence }) {
  const title = crownTitle(crown)
  return (
    <Tip tip={<>
      <b>{title}</b> — {crownRule(crown)}
      {evidence?.since && <> Holding it since {new Date(evidence.since).toLocaleDateString()}{evidence.aprPct != null && <>, at {pct(evidence.aprPct)} APR</>}.</>}
      {' '}<span className="t40">{BADGE_FOOT}</span>
    </>}>
      <i className={`badge-tag crowned ${METAL[crown.place - 1]}`}><CrownIcon place={crown.place} size={11} />{title}</i>
    </Tip>
  )
}

/** The best crown a wallet wears, as a mark beside its name. */
export function TopCrown({ tags }: { tags?: string[] | null }) {
  const best = tags?.map(parseCrown).filter((c): c is Crown => !!c)
    .sort((a, b) => a.place - b.place || (a.scope === 'all' ? -1 : b.scope === 'all' ? 1 : 0))[0]
  if (!best) return null
  return <CrownIcon place={best.place} size={13} title={crownTitle(best)} />
}

// ---------------------------------------------------------------- actions
const KIND_WORD: Record<string, string> = {
  deposit: 'deposit', supply: 'deposit', mint: 'deposit',
  withdraw: 'withdraw', redeem: 'withdraw', burn: 'withdraw',
  borrow: 'borrow', repay: 'repay',
  liquidated: 'liquidated', liquidate: 'liquidated',
  transfer: 'transfer', accrual: 'accrual', snapshot: 'snapshot',
}
const KIND_CLASS: Record<string, string> = {
  deposit: 'k-in', withdraw: 'k-out', borrow: 'k-borrow', repay: 'k-repay', liquidated: 'k-liq', transfer: 'k-move',
}
export const kindWord = (k: string) => KIND_WORD[k] ?? k
/** A row's action as a pill with its own hue; the side is dropped when the action already implies it. */
export function Action({ kind, side }: { kind: string; side?: string }) {
  const w = kindWord(kind)
  const cls = KIND_CLASS[w] ?? 'k-move'
  const showSide = side === 'collateral' || side === 'share'
  return <span className="act"><span className={`pill ${cls}`}>{w}</span>{showSide && <span className="sidechip">{side === 'share' ? 'share' : 'coll'}</span>}</span>
}

export { describeBundle, describeTx } from '@yieldcircle/core/model/moves'

// ---------------------------------------------------------------- follow
export function FollowButton({ kind, target, small, label, quiet }: {
  kind: Follow['targetKind']
  target: string
  small?: boolean
  label?: string
  /** not the primary action here — something else on the row is */
  quiet?: boolean
}) {
  const { account, follow } = useSocialWrite()
  const f = useMyFollows(account)
  const pending = usePending()
  const batched = useBatchSupported()
  const refresh = useSocialRefresh()
  const [busy, setBusy] = React.useState(false)
  const [err, setErr] = React.useState<string | null>(null)
  const on = f.isFollowing(kind, target)
  const queued = f.isPending(kind, target)
  const mine = kind === 'wallet' && account && normAddr(target) === account
  if (mine) return null
  const go = async (e: React.MouseEvent) => {
    e.stopPropagation(); e.preventDefault()
    if (!account) { setErr('connect a wallet to follow'); return }
    // no wallet prompt: the follow joins the pending queue, signed later with
    // everything else from the profile sheet (docs/social.md §17)
    if (batched) { pending.stageFollow(kind, target, !on, f.serverFollowing(kind, target)); return }
    setBusy(true); setErr(null)
    try { await follow(kind, target, !on); refresh.follows(account) }
    catch (x) { setErr((x as Error).message.slice(0, 80)) }
    finally { setBusy(false) }
  }
  const fault = err ?? pending.queue.errors[entryKey(kind, target)]
  return (
    <button className={`btn ${small ? 'sm' : ''} ${on || quiet ? '' : 'pri'} follow${queued ? ' queued' : ''}`} onClick={go} disabled={busy}
      title={fault ?? (queued ? 'Not signed yet — apply it from your profile, top left' : undefined)}>
      {busy ? '…' : on ? 'Following' : label ?? 'Follow'}
    </button>
  )
}

/** 💬 n — the one affordance that turns a row into a place where people talk. */
export function Comments({ n, onClick, active }: { n: number; onClick?: (e: React.MouseEvent) => void; active?: boolean }) {
  return (
    <button className={`cmt${n ? ' has' : ''}${active ? ' on' : ''}`} onClick={(e) => { e.stopPropagation(); onClick?.(e) }} aria-label={n ? `${n} comments` : 'comment'}>
      <Bubble />{n > 0 && <span>{n}</span>}
    </button>
  )
}
const Bubble = () => (
  <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden><path d="M2.6 2h10.8a1.6 1.6 0 0 1 1.6 1.6v6.2a1.6 1.6 0 0 1-1.6 1.6H7l-3.6 3v-3H2.6A1.6 1.6 0 0 1 1 9.8V3.6A1.6 1.6 0 0 1 2.6 2z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>
)

/**
 * The author's skin in the game, read from the index at write time. Not a
 * claim — a balance. The service stores an object (`AuthorStake`); this used
 * to take a number and was handed that object, which rendered nothing useful.
 * On a loop's thread only `legs: 2` — both legs of THIS loop — says "in this
 * loop"; the collateral alone is said as what it is.
 */
export function Stake({ stake }: { stake?: AuthorStake | null }) {
  const l = stakeLine(stake)
  return l ? <span className="stake" title={l.title}>{l.text}</span> : null
}
export { usd, usdShort }
