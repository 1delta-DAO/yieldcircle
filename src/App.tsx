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
import { Start, startSeen } from './ui/Start'
import { parseRoute, useRoute } from './state/AppState'
import { GROUPS } from './model/assets'
import React from 'react'

export default function App() {
  // the first visit lands on the Start tab instead of the feed: decided once,
  // synchronously before the first render (an effect is too late — Start's own
  // mount marks the visit seen and would swallow the redirect). Start marks
  // the browser, so the Home tab is the feed from then on.
  React.useState(() => { if (!startSeen() && parseRoute().view === 'home') location.hash = '#/start' })
  const r = useRoute()
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
        : <Home tab={r.t} />}
    </Shell>
  )
}
