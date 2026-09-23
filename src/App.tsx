import { Shell } from './ui/Shell'
import { Explorer } from './ui/Explorer'
import { Home } from './ui/Home'
import { AssetPage } from './ui/AssetPage'
import { Feed } from './ui/Feed'
import { Wallet } from './ui/Wallet'
import { Market } from './ui/Market'
import { Curator } from './ui/Curator'
import { Board } from './ui/Board'
import { ProfilePage } from './ui/Profile'
import { Alerts } from './ui/Alerts'
import { useRoute } from './state/AppState'
import { GROUPS } from './model/assets'

export default function App() {
  const r = useRoute()
  const group = GROUPS.find((g) => g.id === r.group)
  return (
    <Shell>
      {r.view === 'feed' ? <Feed tab={r.t} />
        : r.view === 'wallet' && r.addr ? <Wallet key={r.addr} addr={r.addr} />
        : r.view === 'market' && r.uid ? <Market key={r.uid} uid={r.uid} />
        : r.view === 'curator' && r.curatorId ? <Curator key={r.curatorId} id={r.curatorId} />
        : r.view === 'board' ? <Board window={r.t} />
        : r.view === 'me' ? <ProfilePage />
        : r.view === 'alerts' ? <Alerts />
        : group ? <AssetPage key={group.id} group={group} route={r} />
        : r.view === 'explore' ? <Explorer />
        : <Home />}
    </Shell>
  )
}
