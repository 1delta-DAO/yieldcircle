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
import { Join } from './ui/Join'
import { gated } from './wallet/gate'
import { usePaperSession } from './wallet/paper'
import { Start } from './ui/Start'
import { useRoute } from './state/AppState'
import { GROUPS } from './model/assets'

export default function App() {
  const r = useRoute()
  // no beta access: the join page is the front door, whatever the hash (the hash survives — the gate
  // reloads into it). The full landing page is its own deployment (`landing/`). A paper account is
  // the way in without it (tickets/0006): play money needs no beta, only real trading does
  const paperIn = !!usePaperSession()
  if (r.view === 'join' || (gated() && !paperIn)) return <Join />
  const group = GROUPS.find((g) => g.id === r.group)
  return (
    <Shell>
      {r.view === 'wallet' && r.addr ? <Wallet key={r.addr} addr={r.addr} />
        : r.view === 'market' && r.uid ? <Market key={r.uid} uid={r.uid} />
        : r.view === 'curator' && r.curatorId ? <Curator key={r.curatorId} id={r.curatorId} />
        : r.view === 'token' ? (r.token ? <TokenPage key={r.token} group={r.token} /> : <TokenBook />)
        : r.view === 'board' ? <Board window={r.t} by={r.by} x={r.x} s={r.s} />
        : r.view === 'me' ? <ProfilePage />
        : r.view === 'alerts' ? <Alerts />
        : group ? <AssetPage key={group.id} group={group} route={r} />
        : r.view === 'earn' ? <Earn />
        : r.view === 'feed' ? <Home tab={r.t} />
        : <Start />}
    </Shell>
  )
}
