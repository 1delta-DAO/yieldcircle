/**
 * The small pieces every social surface is built from: a face with a name, a
 * follow button, a comment count, an action pill, a time that ages, and money
 * that admits how sure it is. Same discipline as `bits.tsx` — presentation
 * only, no fetching except the one-line hooks that are genuinely per-widget.
 */
import React from 'react'
import { Character, unearned, specFor } from '../identity/character'
import { AUTO_TITLE, labelFor, shortAddr } from '../identity/name'
import { useMyFollows, useSocialRefresh } from '../social/queries'
import { useSocialWrite } from '../social/sign'
import type { Profile } from '../social/types'
import type { AccountKind, TxBundle, UsdStatus } from '../index/types'
import { Tip, usd, usdShort } from './bits'

// ---------------------------------------------------------------- time
/** One shared clock: a hundred ages on a screen tick together and cost one timer. */
let tick = 0
const listeners = new Set<() => void>()
setInterval(() => { tick++; listeners.forEach((l) => l()) }, 15_000)
function useClock() {
  const [, set] = React.useState(0)
  React.useEffect(() => { const l = () => set(tick); listeners.add(l); return () => { listeners.delete(l) } }, [])
}
export function ago(ts: string | number | undefined): string {
  if (ts == null) return ''
  const t = typeof ts === 'number' ? ts : Date.parse(ts)
  if (!Number.isFinite(t)) return ''
  const s = Math.max(0, (Date.now() - t) / 1000)
  if (s < 45) return 'now'
  if (s < 3600) return `${Math.round(s / 60)}m`
  if (s < 86400) return `${Math.round(s / 3600)}h`
  if (s < 86400 * 30) return `${Math.round(s / 86400)}d`
  if (s < 86400 * 365) return `${Math.round(s / (86400 * 30))}mo`
  return `${(s / (86400 * 365)).toFixed(1)}y`
}
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
        <b>{name.label}{bad.length > 0 && <i className="unearned" title={`claims ${bad.map((g) => g.why).join(', ')}`}>!</i>}</b>
        {sub != null ? <small>{sub}</small> : name.generated && <small className="t40">{shortAddr(account)}</small>}
      </span>
      {name.generated && <AutoTag />}
      {name.kind && name.kind !== 'eoa' && name.kind !== 'unknown' && name.kind !== 'contract' && <span className={`pill kind ${name.kind}`}>{name.kind}</span>}
      {profile?.xHandle && <span className="xtag" title={`linked to @${profile.xHandle} on X`}>𝕏</span>}
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
export function Badge({ tag }: { tag: string }) {
  const label = TAG_LABEL[tag] ?? tag
  return (
    <Tip tip={<><b>{label}</b> — {TAG_HELP[tag] ?? 'A badge the index computed from this address\'s history.'} <span className="t40">{BADGE_FOOT}</span></>}>
      <i className="badge-tag">{label}</i>
    </Tip>
  )
}
export function Badges({ tags, max = 3 }: { tags?: string[] | null; max?: number }) {
  if (!tags?.length) return null
  const rest = tags.slice(max)
  return (
    <span className="badges">
      {tags.slice(0, max).map((t) => <Badge key={t} tag={t} />)}
      {rest.length > 0 && <Tip tip={<>Also: {rest.map((t) => TAG_LABEL[t] ?? t).join(', ')}.</>}><i className="badge-tag more">+{rest.length}</i></Tip>}
    </span>
  )
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

/**
 * What one transaction DID, in one phrase.
 *
 * The index labels a bundle's legs `<side>/<kind>` (`supply/deposit`,
 * `borrow/borrow`), or just `transfer`. A loop arrives as a deposit AND a
 * borrow in the same transaction, and calling that "opened a loop" rather than
 * listing both is the difference between a feed and a log.
 */
/**
 * What happened, in a word. `desk` re-words it for a curated vault acting on
 * its depositors' behalf: a vault that moves money between two markets is
 * reallocating, and calling that "rebalanced" reads as a trader's decision
 * when it is an allocation decision made for other people's money.
 */
export function describeTx(kinds: Record<string, number>, desk?: boolean): { verb: string; cls: string } {
  if (desk) {
    const d = describeTx(kinds)
    const DESK: Record<string, string> = { rebalanced: 'reallocated', deposited: 'allocated', withdrew: 'pulled out', moved: 'moved funds' }
    return { ...d, verb: DESK[d.verb] ?? d.verb }
  }
  return plainVerb(kinds)
}
/**
 * {@link describeTx} for a whole bundle: a swap the index found (a venue
 * wrapping one lending receipt and unwrapping another, or a wallet's
 * collateral swap) reads as one, and a token issuer's reserve reads as the
 * token being minted or redeemed rather than as a wallet depositing.
 */
export function describeBundle(t: Pick<TxBundle, 'kinds' | 'subject' | 'swap'>): { verb: string; cls: string } {
  const side = (x: { symbol: string | null; assetGroup: string | null }[]) => x.map((s) => s.symbol ?? s.assetGroup ?? '?').join(' + ')
  if (t.swap) return { verb: `swapped ${side(t.swap.from)} → ${side(t.swap.to)}`, cls: 'k-move' }
  if (t.subject?.reason === 'wrapper') {
    const d = plainVerb(t.kinds)
    const W: Record<string, string> = { deposited: 'backed a mint', withdrew: 'paid a redemption' }
    return { ...d, verb: W[d.verb] ?? d.verb }
  }
  return describeTx(t.kinds, t.subject?.reason === 'desk')
}
function plainVerb(kinds: Record<string, number>): { verb: string; cls: string } {
  const bare = new Set<string>()
  for (const k of Object.keys(kinds)) bare.add(k.includes('/') ? k.slice(k.indexOf('/') + 1) : k)
  const has = (...ks: string[]) => ks.some((k) => bare.has(k))
  if (has('liquidated', 'liquidate')) return { verb: 'was liquidated', cls: 'k-liq' }
  const inSide = has('deposit', 'supply', 'mint')
  const outSide = has('withdraw', 'redeem', 'redeemed', 'burn')
  if (inSide && has('borrow')) return { verb: 'opened a loop', cls: 'k-borrow' }
  if (outSide && has('repay')) return { verb: 'closed a loop', cls: 'k-repay' }
  if (has('borrow')) return { verb: 'borrowed', cls: 'k-borrow' }
  if (has('repay')) return { verb: 'repaid', cls: 'k-repay' }
  if (inSide && outSide) return { verb: 'rebalanced', cls: 'k-move' }
  if (inSide) return { verb: 'deposited', cls: 'k-in' }
  if (outSide) return { verb: 'withdrew', cls: 'k-out' }
  if (has('transfer', 'transfer_in', 'transfer_out')) return { verb: 'moved', cls: 'k-move' }
  if (has('accrual')) return { verb: 'accrued', cls: 'k-move' }
  return { verb: [...bare][0] ?? 'moved', cls: 'k-move' }
}

// ---------------------------------------------------------------- follow
export function FollowButton({ kind, target, small, label, quiet }: {
  kind: 'wallet' | 'market' | 'curator'
  target: string
  small?: boolean
  label?: string
  /** not the primary action here — something else on the row is */
  quiet?: boolean
}) {
  const { account, follow } = useSocialWrite()
  const f = useMyFollows(account)
  const refresh = useSocialRefresh()
  const [busy, setBusy] = React.useState(false)
  const [err, setErr] = React.useState<string | null>(null)
  const on = f.isFollowing(kind, target)
  const mine = kind === 'wallet' && account && target.toLowerCase() === account
  if (mine) return null
  const go = async (e: React.MouseEvent) => {
    e.stopPropagation(); e.preventDefault()
    if (!account) { setErr('connect a wallet to follow'); return }
    setBusy(true); setErr(null)
    try { await follow(kind, target, !on); refresh.follows(account) }
    catch (x) { setErr((x as Error).message.slice(0, 80)) }
    finally { setBusy(false) }
  }
  return (
    <button className={`btn ${small ? 'sm' : ''} ${on || quiet ? '' : 'pri'} follow`} onClick={go} disabled={busy} title={err ?? undefined}>
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

/** The author's skin in the game, read from the index at write time. Not a claim — a balance. */
export function Stake({ usd: v }: { usd?: number | null }) {
  if (v == null || v < 1) return null
  return <span className="stake" title="what the author held in this market when they wrote it">holds {usdShort(v)}</span>
}
export { usd, usdShort }
