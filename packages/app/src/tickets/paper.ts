import { useSession } from '../session'
import type { PaperLedger, PriceFn } from '@yieldcircle/core/model/paper'

const NO_PRICE: PriceFn = () => undefined
const NO_ACT = async (): Promise<unknown> => { throw new Error('Sign in to a paper account first.') }
/** The paper account as a ticket reads it, with every field present: inactive and price-less where there is none (the phone, today). */
export function usePaperView() {
  const p = useSession().paper
  return { active: !!p?.active, price: p?.price ?? NO_PRICE, ledger: (p?.ledger ?? null) as PaperLedger | null, session: p?.session ?? null, act: p?.act ?? NO_ACT }
}
