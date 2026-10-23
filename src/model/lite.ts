/**
 * Lite's rules (docs/lite.md, docs/lite-plan.md): which strategies Lite shows, what it calls them,
 * the three lines its ticket says, and the streak and points of its You page. Pure functions over
 * what `useBook` already holds — Lite fetches nothing of its own, and this is the only place its
 * rules live.
 */
import { deskOf, groupOf, nameOf, type GroupId } from './assets'
import { isSavings } from './nature'
import { liqBuffer } from './leverage'
import type { LoopStrategy, SimpleStrategy, Strategy } from './strategies'
import type { Holding } from './positions'

/** The categories Lite has: no Stocks, no Borrow (owner's call, 2026-10-23). */
export const LITE_GROUPS: GroupId[] = ['USD', 'ETH', 'BTC', 'MORE']
/** The strictest of Pro's size floors: a simple user cannot judge a thin pool. */
export const LITE_MIN_TVL = 2_000_000
/** The API's 1–5 score, capped: Lite has no word for "unrated" or "very high". */
export const LITE_MAX_RISK = 4
/**
 * The least a Lite loop may leave between its price and liquidation at the leverage Lite opens it
 * at (the Balanced tier). An e-mode venue's range runs to 25×, whose Balanced tier is ~1 % from
 * the line: a number someone who never chose a leverage must not be handed. Pro still has them.
 */
export const LITE_MIN_BUFFER = 0.03
/** How many rows a Lite list shows before "Show all": the best of a category fits one screen. */
export const LITE_LIST_ROWS = 12

/**
 * A strategy Lite can offer and its three-line ticket can carry: a saving (never a perp LP or a
 * managed fund, whose rate is a past result), rated, with real size, and no date to pick — no
 * fixed-rate book, no maturity picker, no fixed-term or dated debt. A PT and a PT loop stay: their
 * date is one fact the ticket says, not a choice it asks for, and they are where the steadiest high
 * rates are.
 */
export function liteEligible(s: Strategy): boolean {
  if (!LITE_GROUPS.includes(s.group) || s.hide) return false
  if (!isSavings(s.nature) || !s.rated || s.riskScore > LITE_MAX_RISK) return false
  if (!(s.tvlUsd >= LITE_MIN_TVL) || !(s.rate > 0)) return false
  if (s.kind === 'simple') return !s.book && !s.dates?.length && !s.passthrough && s.canDeposit !== false
  return !s.terms?.length && !s.tenors?.length && !s.dueAt && !s.dates?.length && s.collateralYields && s.tiers.balanced > 1
    && liqBuffer(s.liqLtv, s.tiers.balanced) >= LITE_MIN_BUFFER
}

/** What the money is, in words a Lite reader knows: `USDC`, `Dollars via Ethena`, `Ether`, `Bitcoin via Lombard`. */
export function moneyWord(asset: string, group: GroupId = groupOf(asset)): string {
  const d = deskOf(asset)
  const family = group === 'USD' ? 'Dollars' : group === 'ETH' ? 'Ether' : group === 'BTC' ? 'Bitcoin' : null
  // a desk learned at runtime is keyed `ISSUER:BASE` (`OKX:BTC`, `learnDesk`): no ticker to show, so its issuer
  if (family && asset.includes(':')) return `${family} via ${d?.name && !d.name.includes(':') ? d.name : issuerWords(asset.split(':')[0])}`
  if (!family || !d) return nameOf(asset)
  if (d.kind === 'plain') return family
  // an issued coin is known by its ticker (USDC, cbBTC); a yield coin by whose it is
  if (d.kind === 'issued') return d.sym
  return `${family} via ${d.name}`
}
/** The debt, in words: a dollar loan is "dollars", whichever stablecoin it is; a loop is one money, so a SOL loop borrows SOL. */
export function debtWord(s: LoopStrategy): string {
  return s.group === 'USD' ? 'dollars' : s.group === 'ETH' ? 'ether' : s.group === 'BTC' ? 'bitcoin' : nameOf(s.asset)
}
/** `ava-labs` → `Ava Labs`, `okx` → `OKX`: an issuer id said as a name. */
function issuerWords(id: string): string {
  const w = id.replace(/^sym:/, '').split(/[-_\s]+/).filter(Boolean)
  // one short word is an acronym (OKX); several are a name (Ava Labs), whatever case the key came in
  if (w.length === 1 && w[0].length <= 4) return w[0].toUpperCase()
  return w.map((x) => x.charAt(0).toUpperCase() + x.slice(1).toLowerCase()).join(' ')
}

/** `×3.4`: the leverage Lite opens a loop at (the Balanced tier), for the row and the ticket. */
export const leverTag = (lev: number) => `×${(Math.round(lev * 10) / 10).toFixed(lev >= 10 ? 0 : 1)}`

const DAY = 86_400
const dayMonth = (t: number) => new Date(t * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

/** A row's two lines: what it is, and how it earns — never a venue, never a chain. */
export function plainName(s: Strategy): { title: string; sub: string } {
  const title = moneyWord(s.asset, s.group)
  if (s.kind === 'loop') {
    const end = s.expiry ? ` · until ${dayMonth(s.expiry)}` : ''
    return { title, sub: `Levered ${leverTag(s.tiers.balanced)} · borrows ${debtWord(s)}${end}` }
  }
  return { title, sub: SIMPLE_SUB[s.source]?.(s) ?? 'Earns interest' }
}
const SIMPLE_SUB: Record<string, (s: SimpleStrategy) => string> = {
  lending: () => 'Lent to borrowers',
  vault: () => 'A vault lends it for you',
  savings: () => 'Savings rate',
  staking: () => 'Staking rewards',
  fixed: (s) => (s.maturity ? `Fixed rate until ${dayMonth(s.maturity)}` : 'Fixed rate'),
}

/** What a row is, in one phrase, for the ticket's trust line: never a claim the app cannot check. */
export function trustKind(s: Strategy): string {
  if (s.kind === 'loop') return 'Both legs in one lending market'
  return s.source === 'vault' ? 'A curated lending vault' : s.source === 'savings' ? 'A savings contract' : s.source === 'staking' ? 'Staking' : s.source === 'fixed' ? 'A fixed-rate token' : 'A lending market'
}
export const brandOf = (s: Strategy) => { const b = (s.kind === 'loop' ? s.venue : s.brand) ?? ''; return b.charAt(0).toUpperCase() + b.slice(1) }

export interface LiteRow {
  s: Strategy
  title: string
  sub: string
  /** the reader runs it */
  yours: boolean
  /** the same thing elsewhere (another venue or chain), worse — Pro's Details lists them */
  also: number
}

/**
 * One list per category, deposits and loops mixed (docs/lite.md §4). One row per thing in words
 * and kind — "USDC on Aave" and "USDC on Morpho" are one choice here, the better one — except
 * what the reader already runs, which always keeps its own row. Sorted by risk, then by the
 * STEADY rate (`rank`): a one-night spike never leads, and a loop never jumps a safer row.
 */
export function liteMenu(all: Strategy[], rank: (s: Strategy) => number, held: Set<string> = new Set()): LiteRow[] {
  const best = new Map<string, LiteRow>()
  const mine: LiteRow[] = []
  for (const s of all) {
    if (!liteEligible(s)) continue
    const { title, sub } = plainName(s)
    if (held.has(s.id)) { mine.push({ s, title, sub, yours: true, also: 0 }); continue }
    const k = `${s.group}|${title}|${s.kind}|${s.kind === 'simple' && s.maturity ? 'dated' : s.kind === 'loop' && s.expiry ? 'dated' : ''}`
    const cur = best.get(k)
    if (!cur) best.set(k, { s, title, sub, yours: false, also: 0 })
    else if (rank(s) > rank(cur.s)) best.set(k, { s, title, sub, yours: false, also: cur.also + 1 })
    else cur.also++
  }
  return [...mine, ...best.values()].sort((a, b) => a.s.risk - b.s.risk || rank(b.s) - rank(a.s))
}

// ---------------------------------------------------------------- the three lines

export type Tone = '' | 'ok' | 'warn' | 'bad'
export interface Line { k: string; v: string; s: string; tone: Tone }
export interface ThreeLines { earn: Line; lose: Line; cost: Line }

const pct = (x: number, d = 2) => `${x < 0 ? '−' : ''}${Math.abs(x).toFixed(d)}%`
const money = (x: number) => {
  const a = Math.abs(x)
  const v = a >= 1000 ? Math.round(a).toLocaleString('en-US') : a >= 10 ? a.toFixed(0) : a.toFixed(2)
  return `${x < 0 ? '−' : ''}$${v}`
}
export const daysPlain = (d: number) => (d < 1 ? 'under a day' : d < 1.5 ? '1 day' : `${Math.round(d)} days`)

/** The Earn line: the rate and what it pays a month on the amount typed. */
export function earnLine(rate: number, amountUsd: number, more?: string): Line {
  const monthly = amountUsd * rate / 100 / 12
  return { k: 'Earn', v: `${pct(rate)} a year`, s: [amountUsd > 0 ? `≈ ${money(monthly)} a month on ${money(amountUsd)}` : 'type an amount to see it in dollars', more].filter(Boolean).join(' · '), tone: rate >= 3 ? 'ok' : rate < 0 ? 'bad' : '' }
}

/**
 * A loop's three lines, at the leverage Lite opens it at. The loss is said as the move that
 * liquidates (`drop`, from `liqBuffer`), against the debt in words: "if Dollars via Ethena trade
 * 7.0% under the dollar". The cost is the quote's entry cost and how long the loop takes to earn
 * it back; until a quote is in, it says so instead of a number.
 */
export function loopLines(p: { net: number; amountUsd: number; lev: number; drop: number; holds: string; debt: string; dollarDebt: boolean; expiry?: number; cost: number | null; payback: number | null; quoting: boolean }): ThreeLines {
  const earn = earnLine(p.net, p.amountUsd, leverTag(p.lev) + ' levered')
  const under = p.dollarDebt ? 'under the dollar' : `against ${p.debt}`
  const lose: Line = {
    k: 'Can lose',
    v: `If ${p.holds} drops ${pct(p.drop * 100, 1)}`,
    s: `${under}: the loop is liquidated${p.expiry ? `. It ends on ${dayMonth(p.expiry)}: close or roll it then` : ''}`,
    tone: p.drop < 0.05 ? 'bad' : p.drop < 0.1 ? 'warn' : '',
  }
  const cost: Line = p.cost == null
    ? { k: 'Costs', v: p.quoting ? 'Pricing the entry…' : p.amountUsd > 0 ? 'No quote at this size' : '—', s: 'the swap that builds the loop', tone: '' }
    : { k: 'Costs', v: `${money(p.cost)} to enter`, s: p.payback == null ? 'never earned back at this rate' : `earned back in ${daysPlain(p.payback)}`, tone: p.payback == null ? 'bad' : p.payback > 30 ? 'warn' : '' }
  return { earn, lose, cost }
}

/** A deposit's three lines: the rate, the way out (from `exitTerms`), and the cost to get in. */
export function depositLines(p: { rate: number; amountUsd: number; exitWord: string; exitWhen: string; tight: boolean; maturity?: number; booked: boolean; rewards: number }): ThreeLines {
  const earn = earnLine(p.rate, p.amountUsd, p.maturity ? `fixed until ${dayMonth(p.maturity)}` : p.rewards > 0.05 ? `incl. ${pct(p.rewards)} rewards that can stop` : 'variable')
  // a PT is worth its face on its date; before it, it sells at whatever the market pays
  const lose: Line = p.maturity
    ? { k: 'Can lose', v: `Locked in until ${dayMonth(p.maturity)}`, s: 'selling before then is at the market price, which can be lower than you paid', tone: '' }
    : {
      k: 'Can lose',
      v: p.tight ? 'Exit is tight right now' : `Out: ${p.exitWord.toLowerCase()}`,
      s: p.tight ? 'most of the market is lent out; a big withdrawal waits for repayments' : `${p.exitWhen}. What can go wrong is the venue or the coin, not a market price`,
      tone: p.tight ? 'warn' : '',
    }
  const cost: Line = { k: 'Costs', v: p.booked ? 'A small swap to buy it' : 'Only the network fee', s: p.booked ? 'bought on a market, sold back on one' : 'nothing to enter or leave', tone: '' }
  return { earn, lose, cost }
}

// ---------------------------------------------------------------- streak and points

/** One day the reader had money at work, as the app saw it that day: local date, dollars at work. */
export interface DayMark { d: string; work: number }
/** The money a day needs at work to count. */
export const STREAK_MIN_USD = 10
const KEEP_DAYS = 400

/** `2026-10-23`, in the reader's own day. */
export function dayKey(t: number | Date = Date.now()): string {
  const x = typeof t === 'number' ? new Date(t) : t
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}
const prevDay = (d: string) => { const [y, m, dd] = d.split('-').map(Number); return dayKey(new Date(y, m - 1, dd - 1)) }

/** Note today: the day's highest money at work wins, the log keeps the last ~13 months. */
export function noteDay(log: DayMark[], d: string, work: number): DayMark[] {
  if (!(work >= STREAK_MIN_USD)) return log
  const cur = log.find((x) => x.d === d)
  if (cur && cur.work >= work) return log
  const next = [...log.filter((x) => x.d !== d), { d, work }].sort((a, b) => (a.d < b.d ? -1 : 1))
  return next.slice(-KEEP_DAYS)
}

/** Days in a row with money at work, ending today — or yesterday, so a streak survives until today is noted. */
export function streakOf(log: DayMark[], today: string): number {
  const days = new Set(log.filter((x) => x.work >= STREAK_MIN_USD).map((x) => x.d))
  let d = days.has(today) ? today : prevDay(today)
  let n = 0
  while (days.has(d)) { n++; d = prevDay(d) }
  return n
}

/**
 * Points (a preview, docs/lite-plan.md phase 4): one a day per $100 at work, capped at $1m a day so
 * one whale's day is not a season, plus five for every day of a streak past the first week.
 * Counted on this device from what the live book showed each day.
 */
export function pointsOf(log: DayMark[]): number {
  let pts = 0, run = 0, prev: string | null = null
  for (const x of [...log].sort((a, b) => (a.d < b.d ? -1 : 1))) {
    if (x.work < STREAK_MIN_USD) continue
    run = prev && prevDay(x.d) === prev ? run + 1 : 1
    prev = x.d
    pts += Math.floor(Math.min(x.work, 1_000_000) / 100) + (run > 7 ? 5 : 0)
  }
  return pts
}

/** A days-held number in words for the You page's tile. */
export const streakWord = (n: number) => (n === 0 ? 'no streak yet' : n === 1 ? '1 day' : `${n} days`)

export const isDated = (s: Strategy) => (s.kind === 'simple' ? !!s.maturity : !!s.expiry)
export const DAY_S = DAY

const sameUid = (a: string | undefined, b: string | undefined) => !!a && !!b && a.toLowerCase() === b.toLowerCase()
/** A held position is this strategy (the asset page's own rule): a deposit by its earn uid, a loop by its two markets. */
export function holdingMatches(s: Strategy, h: Holding): boolean {
  if (h.kind !== s.kind) return false
  if (s.kind === 'simple') return h.earnUid === s.earnUid
  return sameUid(h.collateralUid ?? h.earnUid, s.marketLongUid) && (!h.debtUid || sameUid(h.debtUid, s.marketShortUid))
}
