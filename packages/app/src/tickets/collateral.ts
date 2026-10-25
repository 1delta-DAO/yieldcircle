import { enableCollateral } from '@yieldcircle/core/sdk/api'
import { needsCollateralOn } from '@yieldcircle/core/model/putUp'
import type { Holding } from '@yieldcircle/core/model/positions'
import { stepsFrom, type Step } from '../ladder'

/**
 * A loop built on a deposit whose collateral flag is off (an Aave supply, `needsCollateralOn`):
 * switching it on is the first step, or the borrow reverts (tickets/0015). Nothing to re-read after
 * it — the lever after it is what moves the position.
 */
export async function collateralOnFirst(h: Holding | null, operator: string): Promise<Step[]> {
  if (!h?.putUp || !h.marketUid || !needsCollateralOn(h)) return []
  const env = await enableCollateral({ marketUid: h.marketUid, operator, accountId: h.accountId })
  return stepsFrom(env.actions, `Use ${h.symbol} as collateral`, h.chainId).map((x) => ({ ...x, moves: 'none' as const }))
}
