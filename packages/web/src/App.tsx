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
import { Start } from './ui/Start'
import { BorrowPage } from './ui/BorrowPage'
import { useRoute } from './state/AppState'
import { GROUPS } from '@yieldcircle/core/model/assets'
import { LiteHome } from './ui/lite/LiteHome'
import { LiteEarn } from './ui/lite/LiteEarn'
import { LiteYou } from './ui/lite/LiteYou'
import { LiteBoard } from './ui/lite/LiteBoard'

export default function App() {
  const r = useRoute()
  // the app is open to every visitor, beta access or not, paper or not: browsing needs neither, and
  // only real trading stays behind the waitlist (`realTradingGated`). The join page is `#/join` only
  if (r.view === 'join') return <Join />
  const group = GROUPS.find((g) => g.id === r.group)
  // Lite (docs/lite.md): four pages over the same catalogue, book and tickets
  if (r.lite) return (
    <Shell>
      {r.view === 'you' ? <LiteYou />
        : r.view === 'board' ? <LiteBoard sort={r.t === 'perDay' ? 'perDay' : 'apr'} by={r.by === 'wallet' ? 'wallet' : 'strategy'} />
        : group ? <LiteEarn key="earn" group={group} route={r} />
        : r.view === 'earn' ? <LiteEarn key="earn" route={r} />
        : <LiteHome />}
    </Shell>
  )
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
        : r.view === 'borrow' ? <BorrowPage route={r} />
        : r.view === 'feed' ? <Home tab={r.t} />
        : <Start />}
    </Shell>
  )
}
