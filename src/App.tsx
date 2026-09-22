import { Shell } from './ui/Shell'
import { Explorer } from './ui/Explorer'
import { AssetPage } from './ui/AssetPage'
import { useRoute } from './state/AppState'
import { GROUPS } from './model/assets'

export default function App() {
  const r = useRoute()
  const group = GROUPS.find((g) => g.id === r.group)
  return <Shell>{group ? <AssetPage key={group.id} group={group} route={r} /> : <Explorer />}</Shell>
}
