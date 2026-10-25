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
import { usdShort } from './format'
import type { Proof } from './activity'

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

/** The money's family word, for the three monies Lite names by whose they are. */
export const familyOf = (group: GroupId): string | null => (group === 'USD' ? 'Dollars' : group === 'ETH' ? 'Ether' : group === 'BTC' ? 'Bitcoin' : null)
/**
 * A title split for the row: `Dollars via 3Jane` is the money's icon (hover: the whole phrase) and
 * `3Jane`; `USDC` or `Ether` stays whole, with no icon — the word already is the money.
 */
export function splitTitle(title: string): { short: string; via: boolean } {
  const m = /^(Dollars|Ether|Bitcoin) via (.+)$/.exec(title)
  return m ? { short: m[2], via: true } : { short: title, via: false }
}
/** What the money is, in words a Lite reader knows: `USDC`, `Dollars via Ethena`, `Ether`, `Bitcoin via Lombard`. */
export function moneyWord(asset: string, group: GroupId = groupOf(asset)): string {
  const d = deskOf(asset)
  const family = group === 'USD' ? 'Dollars' : group === 'ETH' ? 'Ether' : group === 'BTC' ? 'Bitcoin' : null
  // a desk learned at runtime is keyed `ISSUER:BASE` (`OKX:BTC`, `learnDesk`): no ticker to show, so its issuer
  if (family && asset.includes(':')) return `${family} via ${d?.name && !d.name.includes(':') ? d.name : issuerWords(asset.split(':')[0])}`
  if (!family || !d) return nameOf(asset)
  if (d.kind === 'plain') return family
  // a desk the API named at runtime (`learnDesk`, keyed by its id, no colour of its own): a token
  // nobody is named for keeps its ticker; one with an issuer says whose it is, never the id
  if (!d.color) return d.kind === 'unknown' ? d.sym.replace(/\?$/, '') : `${family} via ${d.name && d.name.toUpperCase() !== d.name ? d.name : issuerWords(d.id)}`
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
  let title = moneyWord(s.asset, s.group)
  if (s.kind === 'loop') {
    // an issued desk is known by its ticker (pUSD) — but a loop on one of its PRODUCTS (nOPAL, Nest's
    // vault token) is not a pUSD loop: it is Nest's, and the row says what it holds
    const d = deskOf(s.asset), fam = familyOf(s.group)
    const product = !!d && !!fam && d.kind === 'issued' && s.holds.toUpperCase() !== d.sym.toUpperCase()
    if (product) title = `${fam} via ${d.name}`
    const end = s.expiry ? ` · until ${dayMonth(s.expiry)}` : ''
    return { title, sub: `${product ? `Holds ${s.holds} · levered` : 'Levered'} ${leverTag(s.tiers.balanced)} · borrows ${debtWord(s)}${end}` }
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
  // "Ethena's dollar", "ether.fi's ether": whose coin can fall, against the plain money it borrows
  const { short, via } = splitTitle(p.holds)
  const fam = /^(Dollars|Ether|Bitcoin)/.exec(p.holds)?.[1]
  const coin = via && fam ? `${short}’s ${fam === 'Dollars' ? 'dollar' : fam.toLowerCase()}` : p.holds
  const under = p.dollarDebt ? 'under the dollar' : `against plain ${p.debt}`
  const lose: Line = {
    k: 'Can lose',
    v: `If ${coin} drops ${pct(p.drop * 100, 1)}`,
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

// ---------------------------------------------------------------- managing a position

/**
 * How far a position's price can fall before it is liquidated, from the health the venue reports:
 * HF = collateral · threshold / debt, so the line is crossed after a fall of 1 − 1/HF. The same for
 * a loop and a loan. Null when nothing is owed or the venue reports no health.
 */
export const bufferOfHealth = (health: number | null | undefined): number | null => (health != null && Number.isFinite(health) && health > 0 ? Math.max(0, 1 - 1 / health) : null)

/** Lite's "Lower risk" targets: the leverage that leaves 5 %, 10 % and 20 % to liquidation, where that is below today's. */
export const SAFER_STEPS = [
  { buffer: 0.05, word: 'A little safer' },
  { buffer: 0.1, word: 'Safer' },
  { buffer: 0.2, word: 'Much safer' },
] as const
export function saferTargets(Lnow: number, liqLtv: number | null | undefined, minL = 1): { L: number; buffer: number; word: string }[] {
  if (!liqLtv || !(liqLtv > 0) || !(Lnow > 1.05)) return []
  const out: { L: number; buffer: number; word: string }[] = []
  for (const st of SAFER_STEPS) {
    // liqBuffer(lt, L) = 1 − ((L−1)/L)/lt ≥ b  ⇔  L ≤ 1 / (1 − (1−b)·lt)
    const den = 1 - (1 - st.buffer) * liqLtv
    const L = den > 0 ? Math.floor((1 / den) * 100) / 100 : Infinity
    if (L < Lnow - 0.05 && L >= Math.max(1.05, minL)) out.push({ L, buffer: st.buffer, word: st.word })
  }
  return out
}

/** A position's second line on You, in words: what it is and how far from the line. */
export function holdingLine(h: Pick<Holding, 'kind' | 'leverage' | 'health' | 'directional'>): { text: string; tone: Tone } {
  const b = bufferOfHealth(h.health)
  const line = b == null ? '' : ` · ${pct(b * 100, b < 0.1 ? 1 : 0)} from liquidation`
  const tone: Tone = b == null ? '' : b < 0.05 ? 'bad' : b < 0.1 ? 'warn' : ''
  if (h.directional) return { text: `A price bet${line}`, tone }
  if (h.kind === 'borrow') return { text: `A loan${line}`, tone }
  if (h.kind === 'loop') return { text: `Levered ${leverTag(h.leverage ?? 1)}${line}`, tone }
  return { text: 'Earning', tone: '' }
}

// ---------------------------------------------------------------- the leaderboard

/** What the board ranks by (docs/lite.md §6): the rate a wallet earns on all its money now, or the dollars a day. */
export type BoardSort = 'apr' | 'perDay'
export interface BoardWallet { account: string; rank: number; value: number; navUsd: number; positions: number; label?: string | null }
/**
 * The wallet board, cut for Lite: wallets with a figure, ranked by one number. No lifetime
 * total — a wallet's PnL sum is mostly what its coins did against the dollar, and the board's
 * job here is "who earns, on what": each position's own PnL is one tap away.
 */
export function boardWallets(rows: { account: string; netAprPct: number | null; perDayUsd: number | null; navUsd: number; nCounted: number; accountLabel?: string | null }[], sort: BoardSort, only?: Set<string>): BoardWallet[] {
  const v = (r: (typeof rows)[number]) => (sort === 'apr' ? r.netAprPct : r.perDayUsd)
  return rows
    .filter((r) => v(r) != null && Number.isFinite(v(r)!) && r.nCounted > 0 && (!only || only.has(r.account.toLowerCase())))
    .sort((a, b) => v(b)! - v(a)!)
    .map((r, i) => ({ account: r.account, rank: i + 1, value: v(r)!, navUsd: r.navUsd, positions: r.nCounted, label: r.accountLabel }))
}

export interface BoardPosition { key: string; strategyKey: string; title: string; sub: string; pnlUsd: number; aprPct: number | null; equityUsd: number | null; since: string | null }
/**
 * One wallet's positions with what each MADE (the index's PnL book), best first. Named in Lite's
 * words when Lite carries the strategy (`liteTitle`), else by what it holds; a position the index
 * has not drawn yet is left out rather than shown as zero.
 */
export function boardPositions(
  book: { positions: { key: string; strategyKey: string; pnlUsd: number | null; pnlAprPct: number | null; equityUsd: number | null; since: string | null; status: string }[]; strategies: { key: string; kind: string; held: string[]; debt: string[]; market?: string | null; protocol: string | null }[] },
  liteTitle: (strategyKey: string) => string | null,
): BoardPosition[] {
  const strat = new Map(book.strategies.map((s) => [s.key, s]))
  return book.positions
    .filter((p) => p.pnlUsd != null && Number.isFinite(p.pnlUsd) && p.status === 'ok')
    .map((p) => {
      const s = strat.get(p.strategyKey)
      const held = s?.protocol?.startsWith('vault.') && s.market && !s.debt.length ? s.market : (s?.held ?? []).slice(0, 2).join(' + ') || 'A position'
      const loop = !!s?.debt.length
      return {
        key: p.key, strategyKey: p.strategyKey,
        title: liteTitle(p.strategyKey) ?? held,
        sub: loop ? `Levered · borrows ${s!.debt.slice(0, 2).join(' + ')}` : 'Deposit',
        pnlUsd: p.pnlUsd!, aprPct: p.pnlAprPct, equityUsd: p.equityUsd, since: p.since,
      }
    })
    .sort((a, b) => b.pnlUsd - a.pnlUsd)
}

export interface BoardStrategy {
  key: string
  kind: 'loop' | 'deposit' | 'position'
  title: string
  sub: string
  /** the colour of the money it is in, when Lite knows it (`GROUPS`), else none */
  color: string | null
  /** the rate the holders earn, weighted by their equity (`apr`), or the dollars a day they earn together (`perDay`) */
  value: number
  wallets: number
  equityUsd: number
  faces: string[]
  /** what it holds and what it borrows, with their marks: the Lite row's where Lite carries it, else the index's own */
  held: { symbol: string; logo?: string }
  debt: { symbol: string; logo?: string } | null
  /** the best position: who, at what, on how much */
  best: { account: string; aprPct: number | null; leverage: number | null; equityUsd: number } | null
  levRange: string | null
  since: string | null
}
/**
 * The strategy board, cut for Lite: one row per strategy — what is run, not who runs it twice —
 * named in Lite's words where Lite carries it, with the crowd behind it. Ranked by the holders'
 * rate or by the dollars a day they earn together. A strategy one wallet alone runs is left out
 * (`BOARD_MIN_WALLETS`): Lite's board is what people do, and one person is a position, not a
 * strategy — Pro's board still lists it.
 */
export const BOARD_MIN_WALLETS = 2
export function boardStrategies(
  rows: { account: string; netAprPct: number | null; leverage: number | null; equityUsd: number; legs: { side: string; symbol: string | null; marketName?: string | null; logoUri?: string | null }[]; strategy: { key: string; kind: 'loop' | 'deposit' | 'position'; wallets: number; equityUsd: number; aprPct: number | null; perDayUsd: number | null; leverageMin: number | null; leverageMax: number | null; faces: string[]; firstSince: string | null } }[],
  sort: BoardSort,
  lite: (strategyKey: string) => { title: string; sub: string; color: string; held: { symbol: string; logo?: string }; debt: { symbol: string; logo?: string } | null } | null,
): BoardStrategy[] {
  const v = (r: (typeof rows)[number]) => (sort === 'apr' ? r.strategy.aprPct : r.strategy.perDayUsd)
  const isDebt = (s: string) => s === 'borrow' || s === 'debt'
  return rows
    .filter((r) => v(r) != null && Number.isFinite(v(r)!) && v(r)! > 0 && r.strategy.wallets >= BOARD_MIN_WALLETS)
    .sort((a, b) => v(b)! - v(a)!)
    .map((r) => {
      const g = r.strategy
      const l = lite(g.key)
      const hl = r.legs.find((x) => !isDebt(x.side)), dl = r.legs.find((x) => isDebt(x.side))
      const held = hl?.symbol, debt = dl?.symbol
      const lo = g.leverageMin, hi = g.leverageMax
      const levRange = g.kind === 'loop' && hi && hi > 1.05 ? (lo && Math.round((hi - lo) * 10) > 1 ? `${leverTag(lo)}–${leverTag(hi).slice(1)}` : leverTag(hi)) : null
      return {
        key: g.key, kind: g.kind,
        title: l?.title ?? held ?? 'A position',
        sub: l?.sub ?? (g.kind === 'loop' ? `Levered · borrows ${debt ?? '?'}` : g.kind === 'deposit' ? 'Deposit' : 'A position'),
        color: l?.color ?? null,
        value: v(r)!, wallets: g.wallets, equityUsd: g.equityUsd, faces: g.faces,
        held: l?.held ?? { symbol: held ?? '?', logo: hl?.logoUri ?? undefined },
        debt: l?.debt ?? (g.kind === 'loop' && dl ? { symbol: dl.symbol ?? '?', logo: dl.logoUri ?? undefined } : null),
        best: { account: r.account, aprPct: r.netAprPct, leverage: r.leverage, equityUsd: r.equityUsd },
        levRange, since: g.firstSince,
      }
    })
}

// ---------------------------------------------------------------- what you made

export interface PnlSummary {
  total: number
  /** what farming made: interest, staking, a token's own growth — the PnL without the money's price move */
  yield: number | null
  /** the rest: the held money moving against the dollar */
  price: number | null
  aprPct: number | null
  /** of the yield and the price move, how much of the total each is (0–1), for a split bar; null without a yield figure */
  split: { yield: number; price: number } | null
  /** on how many positions, of how many */
  on: number
  of: number
  /** one plain sentence saying where the money came from */
  word: string
}
/**
 * A wallet's PnL book, in three numbers a Lite reader can use: what you made, how much of that was
 * farming and how much was the coin's price, and on how many positions the index has a record. The
 * sentence says the shape of it ("mostly farming", "a price move did most of it") so the split bar
 * has words.
 */
export function pnlSummary(b: { total: { pnlUsd: number; yieldUsd: number | null; directionalUsd: number | null; pnlAprPct: number | null }; coverage: { positions: number; withPnl: number } }): PnlSummary | null {
  const t = b.total
  if (!b.coverage.withPnl) return null
  const y = t.yieldUsd, p = t.directionalUsd ?? (y != null ? t.pnlUsd - y : null)
  const mag = (y != null ? Math.abs(y) : 0) + (p != null ? Math.abs(p) : 0)
  const split = y != null && p != null && mag > 0 ? { yield: Math.abs(y) / mag, price: Math.abs(p) / mag } : null
  let word = t.pnlUsd >= 0 ? 'Up since you opened these positions.' : 'Down since you opened these positions.'
  if (split) {
    const farm = y! >= 0 ? 'farming made' : 'farming lost', px = p! >= 0 ? 'prices added' : 'prices took'
    word = split.yield >= 0.8 ? `Almost all of it is farming: ${farm} ${money(Math.abs(y!))}.`
      : split.price >= 0.8 ? `Mostly the coin's price: ${px} ${money(Math.abs(p!))}, ${farm} ${money(Math.abs(y!))}.`
      : `${farm.charAt(0).toUpperCase() + farm.slice(1)} ${money(Math.abs(y!))} and ${px} ${money(Math.abs(p!))}.`
  }
  return { total: t.pnlUsd, yield: y, price: p, aprPct: t.pnlAprPct, split, on: b.coverage.withPnl, of: b.coverage.positions, word }
}
/** `+$312` / `−$40`, whole dollars past ten; a zero is `$0`, not `+$0.00`. */
export const signedMoney = (v: number) => (Math.abs(v) < 0.005 ? '$0' : (v < 0 ? '−' : '+') + money(Math.abs(v)))

/** "12 people · $4.1m": who holds it, read off the chain (wallets ≥ $1k), or nothing. */
export function heldBy(p: Proof | null) {
  return p && p.wallets > 0 ? `${p.wallets}${p.wallets >= 3 ? '+' : ''} ${p.wallets === 1 ? 'person runs' : 'people run'} this · ${usdShort(p.totalUsd)}` : ''
}

/** What Lite calls each category: the money, not the group code. */
export const LITE_NAME: Record<string, { name: string; line: string }> = {
  USD: { name: 'Dollars', line: 'Earn on dollars. Levered rows say ×, and the safest come first.' },
  ETH: { name: 'Ether', line: 'Earn on ether and staked ether, in ether.' },
  BTC: { name: 'Bitcoin', line: 'Earn on bitcoin, in bitcoin.' },
  MORE: { name: 'More', line: 'Other coins and currencies: BNB, AVAX, SOL, the euro, gold.' },
}

/** The Lite ticket's actions on a strategy and, when the wallet holds it, its position (docs/lite.md §5). */
export type LiteMode = 'add' | 'reduce' | 'close'
/**
 * Which tabs Lite's ticket shows and which it opens on. Adding is opening Lite's own strategy: only
 * on a row Lite offers. A held loop is added to, made safer or closed; a deposit added to or
 * withdrawn from — and a position close to the line opens on "Lower risk". `mode0`: what the link
 * asked for (`add`, `close`, anything else is a reduce).
 */
export function liteModes(s: Strategy | null, h: Holding | null, mode0?: string): { canAdd: boolean; isLoop: boolean; start: LiteMode; tabs: { id: LiteMode; word: string }[] } {
  const canAdd = !!s && liteEligible(s)
  const isLoop = (s?.kind ?? h?.kind) === 'loop'
  const risky = (bufferOfHealth(h?.health) ?? 1) < 0.1
  const start: LiteMode = !h ? 'add' : mode0 === 'close' ? 'close' : mode0 && mode0 !== 'add' ? 'reduce' : canAdd && !risky ? 'add' : 'reduce'
  const tabs: { id: LiteMode; word: string }[] = !h ? [] : isLoop
    ? [...(canAdd ? [{ id: 'add' as const, word: 'Add' }] : []), { id: 'reduce', word: 'Lower risk' }, { id: 'close', word: 'Close' }]
    : [...(canAdd ? [{ id: 'add' as const, word: 'Add' }] : []), { id: 'reduce', word: 'Withdraw' }]
  return { canAdd, isLoop, start, tabs }
}
