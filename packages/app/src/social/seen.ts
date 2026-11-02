import { useFeedPage } from '../index/queries'
import { useMyFollows } from './queries'
import { useSocialWrite } from './sign'

/**
 * What the people you follow did since you last looked: the dot on Lite's Home tab. "Looked" is a
 * time kept on this device, written when their moves are on screen.
 */
const SEEN = 'yieldcircle.alerts.seen'
export const readSeen = (): number => { try { return Number(localStorage.getItem(SEEN)) || 0 } catch { return 0 } }
export const writeSeen = (t: number) => { try { localStorage.setItem(SEEN, String(t)) } catch { /* private mode */ } }

/** How many moves by the people you follow are newer than the last look. */
export function useUnseen(): number {
  const { account } = useSocialWrite()
  const f = useMyFollows(account)
  const has = f.wallets.length + f.markets.length > 0
  const feed = useFeedPage({ follower: account, follow: 'all' }, 40, !!account && has)
  const seen = readSeen()
  return (feed.data?.txs ?? []).filter((t) => Date.parse(t.blockTs) > seen).length
}
