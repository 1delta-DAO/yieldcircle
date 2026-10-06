import { Shell } from './ui/Shell'
import { Earn } from './ui/Earn'
import { Home } from './ui/Home'
import { AssetPage } from './ui/AssetPage'
import { Wallet } from './ui/Wallet'
import { Market } from './ui/Market'
import { Curator } from './ui/Curator'
import { TokenPage, TokenBook } from './ui/TokenPage'
import { Board } from './ui/Board'
import { ProfilePage } from './ui/Profile'
import { Alerts } from './ui/Alerts'
import { Landing } from './ui/Landing'
import { Deck } from './ui/Deck'
import { Start, useSeenStart } from './ui/Start'
import { useApp, useRoute } from './state/AppState'
import { GROUPS } from './model/assets'

export default function App() {
  const r = useRoute()
  const { isConnected } = useApp()
  // a first visit without a wallet lands on the beginner dashboard instead of
  // the feed; connecting — or choosing the feed from it — makes `#/` the home
  const seenStart = useSeenStart()
  const group = GROUPS.find((g) => g.id === r.group)
  if (r.view === 'landing') return <Landing /> // full-bleed, no Shell — a pitch, not a page of the app
  if (r.view === 'deck') return <Deck /> // same deal: the investor deck presents without the Shell
  return (
    <Shell>
      {r.view === 'wallet' && r.addr ? <Wallet key={r.addr} addr={r.addr} />
        : r.view === 'market' && r.uid ? <Market key={r.uid} uid={r.uid} />
        : r.view === 'curator' && r.curatorId ? <Curator key={r.curatorId} id={r.curatorId} />
        : r.view === 'token' ? (r.token ? <TokenPage key={r.token} group={r.token} /> : <TokenBook />)
        : r.view === 'board' ? <Board window={r.t} by={r.by} />
        : r.view === 'me' ? <ProfilePage />
        : r.view === 'alerts' ? <Alerts />
        : group ? <AssetPage key={group.id} group={group} route={r} />
        : r.view === 'earn' ? <Earn />
        : r.view === 'start' ? <Start />
        : !seenStart && !isConnected ? <Start />
        : <Home tab={r.t} />}
    </Shell>
  )
}
