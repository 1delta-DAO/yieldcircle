import React from 'react'
import { DAY_S, dayMonth } from '@yieldcircle/core/model/ticket'
import { dateOf, type LoopStrategy, type SimpleStrategy, type Strategy } from '@yieldcircle/core/model/strategies'
import { lendRoll, listaRollSources, loanRoll, ROLL_HEADROOM } from '@yieldcircle/core/model/roll'
import { toRaw } from '@yieldcircle/core/model/leverage'
import { isSavings } from '@yieldcircle/core/model/nature'
import type { Holding } from '@yieldcircle/core/model/positions'
import { earnDeposit, earnWithdraw, loopMigrate, loopRefinance, midnightSell } from '@yieldcircle/core/sdk/api'
import { bookAprAt, chainLabel, useLendingBooks } from '@yieldcircle/app/sdk/queries'
import { stepsFrom, useTicketLadder, type Step } from '@yieldcircle/app/ladder'
import { useRollTargets } from '@yieldcircle/app/tickets/roll'
import { slippageFor, useSettings } from '@yieldcircle/app/state/Settings'
import { useApp } from '../state/AppState'
import { useSticky } from '../state/sticky'
import { Info, Sk, num, pct, usd, usdShort } from './bits'
import { BookLink } from './Book'
import { Action } from './Ticket'

/** Paper keeps no roll op (`rollKindOf` offers none there); a ladder still needs a plan, and this one says why. */
const noPaper = async (): Promise<never> => { throw new Error('Rolling is not on paper yet: withdraw, then lend to the later date.') }

/**
 * The Roll tab of a held fixed-term position (`model/roll.ts`): the same money, a later date or a
 * new term, without taking it out by hand. Which panel depends on what is held.
 */
export function RollTicket({ s, h }: { s: Strategy; h: Holding }) {
  const r = useRollTargets(s, h)
  if (r.kind === 'lend') return r.src ? <RollLend h={h} src={r.src} targets={r.lend} loading={r.loading} /> : <div className="tsec plain t50">Reading the book's dates…</div>
  if (r.kind === 'midnight-loan') return <RollLoan s={s.kind === 'loop' ? s : null} h={h} targets={r.loan} loading={r.loading} />
  if (r.kind === 'lista-loan' && s.kind === 'loop' && s.terms?.length) return <RollTerm s={s} h={h} />
  return null
}

/** The later dates as the picker shows them: the date, and what it pays (or costs) at this size. */
function Dates<T extends { id: string }>({ items, on, onPick, when, rate, label }: { items: T[]; on: T | null; onPick: (id: string) => void; when: (t: T) => number; rate: (t: T) => number | null; label: string }) {
  return <div className="seg terms" role="radiogroup" aria-label={label} style={{ marginBottom: 10 }}>{items.map((t) => { const x = rate(t); return <button key={t.id} role="radio" aria-checked={t.id === on?.id} aria-pressed={t.id === on?.id} onClick={() => onPick(t.id)}>{dayMonth(when(t))}<span className="c">{x == null ? 'full' : pct(x)}</span></button> })}</div>
}

/**
 * A fixed-rate deposit moved to a later date of the same book. Before its date the face is sold to
 * the book (Midnight); after it, redeemed (Midnight, Term). Then what came back is lent to the later
 * date. Two builds in one ladder: a wallet that batches sends them as one atomic call; otherwise the
 * sale lands first, and a lend that then reverts leaves the money in the wallet — said on the step.
 */
function RollLend({ h, src, targets, loading }: { h: Holding; src: SimpleStrategy; targets: SimpleStrategy[]; loading: boolean }) {
  const { actorOn, isConnected } = useApp()
  const account = actorOn(h.chainId)
  const book = src.book!
  const now = Date.now() / 1000
  const matured = now >= src.maturity!
  const locked = !matured && !book.earlyExit
  const [toId, setToId] = useSticky<string>(`t:${h.key}:roll`, targets[0]?.id ?? '')
  const to = targets.find((t) => t.id === toId) ?? targets[0] ?? null
  const face = h.amount
  const px = h.amount > 0 ? h.valueUsd / h.amount : 0
  // the sale: the held date's lenders buy the face at their rate for the days left
  const [sb] = useLendingBooks(!matured && book.earlyExit ? [src.marketUid ?? src.earnUid] : [], 'borrow')
  const sellApr = sb?.book ? bookAprAt(sb.book, face) : null
  // the later dates' borrowers: what each pays the amount the sale fetches
  const lendBooks = useLendingBooks(targets.map((t) => t.marketUid ?? t.earnUid), 'lend')
  const rateAt = (t: SimpleStrategy, a: number) => { const b = lendBooks.find((x) => x.uid === (t.marketUid ?? t.earnUid))?.book; return b ? bookAprAt(b, a) : t.rate }
  const est = lendRoll({ face, now, from: src.maturity!, to: to?.maturity ?? now, sellApr, lendApr: null })
  const lendApr = to && est.lend != null ? rateAt(to, est.lend) : null
  const r = lendRoll({ face, now, from: src.maturity!, to: to?.maturity ?? now, sellApr, lendApr })
  const noBids = !matured && book.earlyExit && !!sb && !sb.pending && !sb.failed && sellApr == null
  const full = !!to && r.lend != null && lendApr == null
  const faceRaw = h.amountRaw ?? toRaw(face, h.decimals)
  const lendRaw = r.lend != null ? toRaw(r.lend, h.decimals) : ''
  const exitWord = matured ? 'Withdraw' : 'Sell to the book'
  // what the roll IS, never what it is priced at: a sale that lands first moves the book and the holding, and a
  // key change would drop the ladder before its lend step (`start` builds from the render it is pressed in)
  const key = ['roll', h.key, to?.id ?? '', account ?? ''].join('|')
  const ladder = useTicketLadder(key, h.chainId, async () => {
    if (!to || !lendRaw) throw new Error('Pick a date to roll into.')
    if (locked) throw new Error(`Locked until ${dateOf(src.maturity!)}.`)
    const [out, into] = await Promise.all([
      matured ? earnWithdraw({ earnUid: src.earnUid, amountRaw: faceRaw, operator: account!, isAll: true, accountId: h.accountId })
        : midnightSell({ chainId: h.chainId, lender: book.lender, amountRaw: faceRaw, operator: account! }),
      earnDeposit({ earnUid: to.earnUid, amountRaw: lendRaw, operator: account! }),
    ])
    // the exit only fills the wallet; the lend is the step the positions wait for
    const exit: Step[] = stepsFrom(out.actions, exitWord, h.chainId).map((st) => ({ ...st, moves: 'balances' }))
    const lend = stepsFrom(into.actions, `Lend to ${dayMonth(to.maturity!)}`, h.chainId)
      .map((st) => (st.kind === 'permission' ? st : { ...st, onFail: `The lend to ${dateOf(to.maturity!)} reverted. The ${matured ? 'withdrawal' : 'sale'} before it went through: the ${h.symbol} is in your wallet. Lend it to that date from the book's Add.` }))
    return [...exit, ...lend]
  }, [src.earnUid, src.marketUid, to?.earnUid, to?.marketUid], [{ address: h.assetAddress ?? src.assetAddress, symbol: h.symbol }], noPaper)
  if (!targets.length) return (
    <div className="tsec"><div className="plain t50">{loading ? 'Reading the book’s dates…' : <>No later date of this book takes a deposit right now: none has a borrower offering. {matured ? 'Withdraw it, and lend it again once one opens.' : `It is repaid on ${dateOf(src.maturity!)} either way.`}</>}</div></div>
  )
  return (
    <>
      <div className="tsec">
        {locked && <div className="caution" style={{ marginBottom: 10 }}><b>Rolls from {dateOf(src.maturity!)}.</b> {src.brand} has no exit before the date, so nothing can move until then. After it, this tab redeems the face and lends it to the date you pick here, in one go.</div>}
        <span className="lbl">Roll to <Info label="Rolling a fixed-rate loan">
          <p style={{ margin: '0 0 6px' }}>Your {num(face, 2)} {h.symbol} is repaid on {dateOf(src.maturity!)}. Rolling moves it to a later date of the same book: same borrowers and collateral, a new date and rate.</p>
          <p style={{ margin: '0 0 6px' }}>{matured ? 'The date has passed, so the face is redeemed whole and lent again.' : <>Before the date it is <b>sold</b> to the lenders on this book, who pay the face discounted at their rate for the days left — less than the face, and less than you put in if rates have risen. {pct(ROLL_HEADROOM * 100, 1)} of that estimate stays in your wallet, so the lend never asks for more than the sale paid.</>}</p>
          <p style={{ margin: 0 }}>Your wallet sends both as one transaction where it can; otherwise as two, the {matured ? 'withdrawal' : 'sale'} first.</p></Info></span>
        <Dates items={targets} on={to} onPick={setToId} when={(t) => t.maturity!} rate={(t) => rateAt(t, r.lend ?? face)} label="Roll to" />
      </div>
      <div className="tsec"><div className="cells">
        <div className="c hero"><span className="k">Repaid on {to ? dayMonth(to.maturity!) : '—'}</span><span className="v">{locked ? '—' : r.newFace != null ? usd(r.newFace * px) : sb?.pending || lendBooks.some((b) => b.pending) ? <Sk w={60} /> : '—'}</span>
          <span className="s">{locked ? `after ${dateOf(src.maturity!)}` : r.newFace != null && lendApr != null ? `${num(r.newFace, 2)} ${h.symbol} · fixed ${pct(lendApr)}` : full ? 'more than that date takes now' : ''}</span>
          {to && <BookLink uid={to.marketUid ?? to.earnUid} side="lend" size={r.lend ?? face} symbol={h.symbol} price={px || undefined} act="Lending" />}</div>
        <div className="c"><span className="k">{matured ? 'Redeemed' : 'Sold for'}</span><span className="v">{locked ? '—' : r.proceeds != null ? usd(r.proceeds * px) : sb?.pending ? <Sk w={60} /> : '—'}</span>
          <span className="s">{locked ? 'locked' : matured ? `${num(face, 2)} ${h.symbol} face` : sellApr != null ? `at ${pct(sellApr)} · face ${num(face, 2)} ${h.symbol}` : noBids ? 'no lender is buying it now' : sb?.failed ? 'the book could not be read' : 'reading the book…'}</span>
          {!matured && book.earlyExit && <BookLink uid={src.marketUid ?? src.earnUid} side="borrow" size={face} symbol={h.symbol} price={px || undefined} act="Selling" />}</div>
        <div className="c"><span className="k">Or wait</span><span className="v">{usd(face * px)}</span><span className="s">repaid {dateOf(src.maturity!)}</span></div>
        {r.left != null && r.left > 0 && !locked && <div className="c"><span className="k">To your wallet</span><span className="v">{usd(r.left * px)}</span><span className="s">≈ {num(r.left, 2)} {h.symbol} kept back</span></div>}
      </div></div>
      <Action ladder={ladder} label={locked ? `Rolls from ${dayMonth(src.maturity!)}` : to ? `Roll to ${dayMonth(to.maturity!)} · ${num(face, 2)} ${h.symbol}` : 'Pick a date'} account={account} isConnected={isConnected} disabled={locked || !to || !lendRaw || noBids || full}
        blockedNote={locked ? `${src.brand} repays after ${dateOf(src.maturity!)}; nothing moves before.` : noBids ? 'Nobody on this book is buying it right now: wait, or roll after the date.' : full ? `The ${dayMonth(to!.maturity!)} book takes less than this right now: pick another date.` : undefined} chainId={h.chainId} fee="deposit" />
    </>
  )
}

/**
 * A loop whose Midnight debt falls due, moved to a later date of the same pair in ONE transaction
 * (`loopMigrate`): a flash repays what is owed, the collateral moves to the later market, and that
 * market's lenders fund the new loan. The new face is today's face plus the new book's rate to its date.
 */
function RollLoan({ s, h, targets, loading }: { s: LoopStrategy | null; h: Holding; targets: LoopStrategy[]; loading: boolean }) {
  const { actorOn, isConnected } = useApp()
  const account = actorOn(h.chainId)
  const now = Date.now() / 1000
  const [toId, setToId] = useSticky<string>(`t:${h.key}:roll`, targets[0]?.id ?? '')
  const to = targets.find((t) => t.id === toId) ?? targets[0] ?? null
  const owed = h.debtAmount ?? 0
  const debt = h.debtSymbol ?? s?.debt ?? 'debt'
  const books = useLendingBooks(targets.map((t) => t.marketShortUid), 'borrow')
  // a book not read (yet) prices at the row's top of book; a read one too thin for the size is null
  const bookOf = (t: LoopStrategy) => books.find((x) => x.uid === t.marketShortUid)?.book ?? null
  const borAt = (t: LoopStrategy) => { const b = bookOf(t); return b ? bookAprAt(b, owed) : t.borSpot }
  const apr = to ? borAt(to) : null
  const newOwed = to && apr != null ? loanRoll({ owed, now, to: to.dueAt!, borApr: apr }) : null
  const full = !!to && !!bookOf(to) && apr == null
  const pD = s?.priceShort ?? 1
  const due = h.dueAt ?? s?.dueAt
  const late = due != null && now >= due
  const slip = slippageFor(useSettings().st, s ? isSavings(s.nature) : !h.directional)
  const debtRaw = toRaw(owed, h.debtDecimals ?? 18)
  const key = ['roll', h.key, to?.id ?? '', account ?? ''].join('|')
  const ladder = useTicketLadder(key, h.chainId, async () => {
    if (!to) throw new Error('Pick a date to roll into.')
    const env = await loopMigrate({ source: { collateralMarketUid: h.collateralUid!, debtMarketUid: h.debtUid! }, target: { collateralMarketUid: to.marketLongUid, debtMarketUid: to.marketShortUid }, debtAmountRaw: debtRaw, account: account!, slippageBp: slip, accountId: h.accountId })
    return stepsFrom(env.actions, `Roll to ${dayMonth(to.dueAt!)}`, h.chainId)
  }, [h.collateralUid, h.debtUid, to?.marketLongUid, to?.marketShortUid], [{ address: h.debtAddress, symbol: debt }], noPaper)
  return (
    <>
      <div className="tsec">
        {late && <div className="caution" style={{ marginBottom: 10 }}><b>Past due since {dateOf(due!)}.</b> The loan can be liquidated whatever its health: roll it or repay it now.</div>}
        {!targets.length ? <div className="plain t50">{loading ? 'Reading the later dates…' : <>No later date of this pair has a lender offering right now. {due ? `The ${num(owed, 2)} ${debt} is due ${dateOf(due)}: repay it from Manage, or come back once a later book has offers.` : ''}</>}</div> : <>
          <span className="lbl">Roll to <Info label="Rolling a fixed-date loan">
            <p style={{ margin: '0 0 6px' }}>You owe {num(owed, 2)} {debt}{due ? <> on {dateOf(due)}</> : ''}. Rolling moves the loan to a later date of the same pair, in one transaction: a flash loan repays what you owe, your {h.symbol} moves to the later market, and its lenders fund the new loan, which repays the flash.</p>
            <p style={{ margin: '0 0 6px' }}>Nothing is sold and nothing leaves your wallet. The new amount owed is today's plus the later book's rate to its date.</p>
            <p style={{ margin: 0 }}>What you owe on {due ? dateOf(due) : 'the current date'} is fixed, so rolling early still repays it whole: the interest to that date is paid either way.</p></Info></span>
          <Dates items={targets} on={to} onPick={setToId} when={(t) => t.dueAt!} rate={borAt} label="Roll to" />
        </>}
      </div>
      {to && <div className="tsec"><div className="cells">
        <div className="c hero"><span className="k">You owe on {dayMonth(to.dueAt!)}</span><span className="v">{newOwed != null ? usd(newOwed * pD) : books.some((b) => b.pending) ? <Sk w={60} /> : '—'}</span>
          <span className="s">{newOwed != null && apr != null ? `${num(newOwed, 2)} ${debt} · fixed ${pct(apr)}` : full ? 'more than that date lends now' : ''}</span>
          <BookLink uid={to.marketShortUid} side="borrow" size={owed} symbol={debt} price={s?.priceShort} act="Borrowing" /></div>
        <div className="c"><span className="k">You owe now</span><span className="v">{usd(owed * pD)}</span><span className="s">{num(owed, 2)} {debt}{due ? ` · due ${dayMonth(due)}` : ''}</span></div>
        <div className="c"><span className="k">Collateral</span><span className="v">{num(h.amount, 4)}</span><span className="s">{h.symbol} · moves with it</span></div>
      </div></div>}
      <Action ladder={ladder} label={to ? `Roll to ${dayMonth(to.dueAt!)} · ${num(owed, 2)} ${debt}` : 'No later date'} account={account} isConnected={isConnected} disabled={!to || full}
        blockedNote={full ? `The ${dayMonth(to!.dueAt!)} lenders cannot fund ${num(owed, 2)} ${debt} right now: pick another date.` : undefined} chainId={h.chainId} fee="loop" />
    </>
  )
}

/**
 * A Lista broker loan re-fixed into a new term (`loopRefinance`): one of its fixed loans, or the
 * variable part a finished term left behind. One transaction; the route sizes it from the live debt.
 */
function RollTerm({ s, h }: { s: LoopStrategy; h: Holding }) {
  const { actorOn, isConnected } = useApp()
  const account = actorOn(h.chainId)
  const sources = listaRollSources(h)
  const idOf = (x: { id?: string }) => x.id ?? 'variable'
  const [srcId, setSrcId] = React.useState(idOf(sources[0] ?? {}))
  const src = sources.find((x) => idOf(x) === srcId) ?? sources[0] ?? null
  const terms = s.terms!
  const [termId, setTermId] = useSticky<string>(`t:${h.key}:term`, terms[0].id)
  const term = terms.find((t) => t.id === termId) ?? terms[0]
  const until = Date.now() / 1000 + term.days * DAY_S
  // the debt accrues between the authorization and the re-fix: never in the key
  const key = ['refix', h.key, src ? idOf(src) : '', term.id, account ?? ''].join('|')
  const ladder = useTicketLadder(key, h.chainId, async () => {
    if (!src) throw new Error('Nothing owed to re-fix.')
    const env = await loopRefinance({ debtMarketUid: h.debtUid!, termId: term.id, fromLoanId: src.id, borrowBalanceRaw: toRaw(src.debt, h.debtDecimals ?? 18), operator: account! })
    return stepsFrom(env.actions, `Fix for ${term.days} days`, h.chainId)
  }, [h.debtUid, h.collateralUid], [], noPaper)
  if (!src) return <div className="tsec plain t50">Nothing owed on {h.venue} to re-fix.</div>
  return (
    <>
      <div className="tsec">
        {sources.length > 1 && <>
          <span className="lbl">Which debt <Info label="Fixed and variable parts">Each fixed loan rolls on its own. The variable part is what a finished term left behind: when a term ends the loan is not due, it moves to the market's variable rate until it is fixed again.</Info></span>
          <div className="seg" role="radiogroup" aria-label="Which debt" style={{ marginBottom: 10 }}>{sources.map((x) => <button key={idOf(x)} role="radio" aria-checked={idOf(x) === idOf(src)} aria-pressed={idOf(x) === idOf(src)} onClick={() => setSrcId(idOf(x))}>{x.id ? `Loan ${x.id}` : 'Variable part'}<span className="c" style={{ marginLeft: 6 }}>{usdShort(x.debtUsd)}</span></button>)}</div>
        </>}
        <span className="lbl">Fix it for <Info label="Re-fixing a term">
          <p style={{ margin: '0 0 6px' }}>{s.venue} lends {s.debt} at a rate it sets for each term, the same at any size. Re-fixing repays this debt with a flash loan and opens a new loan at the term you pick, in one transaction. Your collateral does not move.</p>
          <p style={{ margin: 0 }}>{src.id ? 'Rolling a fixed loan before its term ends repays it early: the broker adds a penalty of about half the interest the rest of that term would still pay, and the new loan carries it.' : 'The variable part has no penalty: it is not on a term.'}</p></Info></span>
        <div className="seg terms" role="radiogroup" aria-label="Fixed term">{terms.map((t) => <button key={t.id} role="radio" aria-checked={t.id === term.id} aria-pressed={t.id === term.id} onClick={() => setTermId(t.id)}>{t.days} days<span className="c">{pct(t.apr)}</span></button>)}</div>
      </div>
      <div className="tsec"><div className="cells">
        <div className="c hero"><span className="k">Fixed until {dayMonth(until)}</span><span className="v">{pct(term.apr)}</span><span className="s">on {usd(src.debtUsd)} of {s.debt}</span></div>
        <div className="c"><span className="k">Re-fixed</span><span className="v">{num(src.debt, 2)}</span><span className="s">{s.debt} · {src.id ? `loan ${src.id}` : 'the variable part'}</span></div>
        <div className="c"><span className="k">Where</span><span className="v" style={{ fontSize: 14 }}>{h.venue.split(' · ')[0]}</span><span className="s">{chainLabel(h.chainId)}</span></div>
      </div></div>
      <Action ladder={ladder} label={`Fix ${src.id ? `loan ${src.id}` : 'the variable part'} · ${term.days} days at ${pct(term.apr)}`} account={account} isConnected={isConnected} disabled={false} chainId={h.chainId} fee="loop" />
    </>
  )
}
