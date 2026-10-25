/**
 * Why a fixed rate is what it is: the order book behind it.
 *
 * A Midnight or Term market has no utilisation curve (`/lending/irm` answers nothing for them),
 * so the curve popover could only say "there is no curve". Its rate is the book's instead: a ladder
 * of offers, each a lot at its own rate, and a size pays the average of the lots it takes. That is
 * the thing to see before sizing — how much sits at the quoted rate, and how fast it falls off.
 *
 * Drawn as a ladder, not a depth chart: these books are a few lots, often one small lot at the
 * top and one enormous one below (Base's cbBTC/USDC Dec-25 borrow side: $101, $50, then $19m), and
 * on a linear axis the lots that set the quoted rate would be invisible. Bars are log-scaled for
 * the same reason; the numbers beside them are exact.
 */
import React from 'react'
import { bookAprAt, bookDepth, useLendingBooks } from '../sdk/queries'
import type { LendingBook } from '../sdk/types'
import { Popover, Sk, num, pct, usdShort } from './bits'

/** `lend`: the borrowers' offers a deposit fills. `borrow`: the lenders' offers a loan — or a lender's early sale — fills. */
export type BookSide = 'lend' | 'borrow'
const SHOWN = 8

/**
 * A redemption queue (Liquity family, Flex — `pricing: 'queue'`): the same ladder, but a level is
 * debt that already exists at that rate, lowest first, and the lowest is redeemed first. Nothing
 * fills; the rows at or below `rate` are the debt ahead of a loan at that rate.
 */
function QueueLadder({ book, rate, money }: { book: LendingBook; rate?: number; money: (x: number) => string }) {
  const max = Math.max(...book.levels.map((l) => l.assets), 1e-9)
  const bar = (a: number) => `${Math.max(4, (Math.log10(1 + a) / Math.log10(1 + max)) * 100)}%`
  const total = book.totalDebt ?? book.levels.at(-1)?.cumulativeAssets ?? 0
  const ahead = rate != null ? book.levels.filter((l) => l.aprPct <= rate + 1e-9).reduce((t, l) => t + l.assets, 0) : null
  const youAt = rate != null ? book.levels.findIndex((l) => l.aprPct > rate + 1e-9) : -1
  const you = rate != null && <tr className="you"><td className="r">{pct(rate)}</td><td colSpan={2}>your loan</td></tr>
  return (
    <>
      <p style={{ marginTop: 0 }}>Every loan here at its own rate, lowest first. A redemption takes the lowest rates first — so what sits above a rate is what is redeemed before it.</p>
      <table className="book-t"><tbody>
        {book.levels.map((l, i) => (
          <React.Fragment key={i}>
            {i === youAt && you}
            <tr className={rate != null && l.aprPct <= rate + 1e-9 ? 'ahead' : undefined}>
              <td className="r">{pct(l.aprPct)}</td>
              <td className="bar"><i style={{ width: bar(l.assets) }} /></td>
              <td className="r">{money(l.assets)}</td>
            </tr>
          </React.Fragment>
        ))}
        {youAt === -1 && you}
      </tbody></table>
      <p>{ahead != null ? <><b>{money(ahead)}</b> of {money(total)} is redeemed before a loan at {pct(rate!)}.</> : <>{money(total)} borrowed here in all.</>}</p>
      <p className="foot">Redemption is not a liquidation: the collateral is taken at its price to pay the debt down, with no penalty — the position is gone, not the money. The queue moves as others open, repay and change their rates.</p>
    </>
  )
}

function Ladder({ book, side, size, money, act }: { book: LendingBook; side: BookSide; size: number; money: (x: number) => string; act: string }) {
  const depth = bookDepth(book)
  const at = bookAprAt(book, size)
  const max = Math.max(...book.levels.map((l) => l.assets), 1e-9)
  const bar = (a: number) => `${Math.max(4, (Math.log10(1 + a) / Math.log10(1 + max)) * 100)}%`
  const shown = book.levels.slice(0, SHOWN), rest = book.levels.slice(SHOWN)
  const restAssets = rest.reduce((t, l) => t + l.assets, 0)
  // how much of each lot this size takes (marginal); a uniform book fills one rate for all of it
  let left = size
  const take = shown.map((l) => { const t = Math.max(0, Math.min(left, l.assets)); left -= t; return l.assets > 0 ? t / l.assets : 0 })
  return (
    <>
      <p style={{ marginTop: 0 }}>
        {side === 'lend' ? <>Borrowers’ offers, best rate first: what a deposit fills.</> : <>Lenders’ offers, cheapest first: what a loan — or a lender selling early — fills.</>}
      </p>
      <table className="book-t"><tbody>
        {shown.map((l, i) => (
          <tr key={i} className={book.pricing === 'marginal' && take[i] > 0 ? 'on' : undefined}>
            <td className="r">{pct(l.aprPct)}</td>
            <td className="bar"><i style={{ width: bar(l.assets) }}>{book.pricing === 'marginal' && take[i] > 0 && <b style={{ width: `${Math.min(100, take[i] * 100)}%` }} />}</i></td>
            <td className="r">{money(l.assets)}</td>
          </tr>
        ))}
        {rest.length > 0 && <tr className="more"><td colSpan={3}>+ {rest.length} more offer{rest.length === 1 ? '' : 's'}, {money(restAssets)} down to {pct(rest[rest.length - 1].aprPct)}</td></tr>}
      </tbody></table>
      <p>
        {!(size > 0) ? <>The book holds <b>{money(depth)}</b> in all.</>
          : at == null ? <>{act} {money(size)} is more than the whole book: <b>{money(depth)}</b> can be filled right now.</>
          : <>{act} <b>{money(size)}</b> fills at <b>{pct(at)}</b>{book.pricing === 'marginal' && take.filter((t) => t > 0).length > 1 ? `, the average of the ${take.filter((t) => t > 0).length} offers it takes` : ''} — of {money(depth)} on the book.</>}
      </p>
      <p className="foot">
        {book.pricing === 'marginal' ? 'Each offer is a lot at its own rate; a size pays the average of the lots it takes, best first.' : 'One rate for the whole trade: the offer whose running total covers the size.'}
        {' '}The book moves between this read and a fill; the transaction takes the offers standing then.
      </p>
    </>
  )
}

/**
 * The opener, the curve popover's twin for a market priced by a book. `uid` is the loan token's
 * market; `size` is in that token. The same query as the ticket's own book read, so opening it
 * costs nothing more.
 */
export function BookLink({ uid, side, size, symbol, price, act = 'This size', label = 'the book', rate }: { uid: string | null | undefined; side: BookSide; size: number; symbol: string; /** shown in dollars when the token is one (price ≈ 1) or a price is known */ price?: number; act?: string; label?: string; /** a redemption queue: the rate whose debt-ahead to mark */ rate?: number }) {
  const ref = React.useRef<HTMLButtonElement>(null)
  const [open, setOpen] = React.useState(false)
  const [q] = useLendingBooks(uid ? [uid] : [], side)
  if (!uid) return null
  const money = (x: number) => (price ? usdShort(x * price) : `${num(x, x >= 100 ? 0 : 4)} ${symbol}`)
  return (
    <>
      <button ref={ref} type="button" className="irm-l" aria-expanded={open} onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}>
        <svg viewBox="0 0 24 16" width="17" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M2 3h8M2 8h14M2 13h20" />
        </svg>
        {label}
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={320}>
        <div className="pop-text irm">
          {q?.pending ? <Sk w={200} h={100} />
            : q?.book?.pricing === 'queue' ? (q.book.levels.length ? <QueueLadder book={q.book} rate={rate} money={money} /> : <p>Nobody borrows here yet: any loan opened now is first in line for a redemption, at any rate.</p>)
            : q?.book?.levels.length ? <Ladder book={q.book} side={side} size={size} money={money} act={act} />
            : <p>{q?.failed ? 'The book could not be read right now.' : side === 'lend' ? 'Nobody is borrowing on this book right now: there is no offer to lend into.' : 'Nobody is lending on this book right now.'}</p>}
        </div>
      </Popover>
    </>
  )
}
