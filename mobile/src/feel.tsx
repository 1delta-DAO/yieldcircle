import React from 'react'
import { AppState } from 'react-native'
import { router } from 'expo-router'
import { useActivity } from '@yieldcircle/app/sdk/activity'
import { chainLabel } from '@yieldcircle/app/sdk/queries'
import { isDone, type Trace } from '@yieldcircle/app/sdk/txTrace'

/**
 * The two things an action's end does outside the screen (docs/tx-feedback-plan.md, slice 6): a tap
 * in the hand, and a reminder when a bridge should have landed while the app was away.
 *
 * Both are native modules (expo-haptics, expo-notifications) that only a build made after they were
 * added carries. A dev client or TestFlight build from before has neither: the require throws, and
 * here that is caught once and read as "nothing to do" — the same JS runs on every build.
 */
type Haptics = typeof import('expo-haptics')
type Notifs = typeof import('expo-notifications')
const optional = <T,>(load: () => T): (() => T | null) => {
  let m: T | null | undefined
  return () => { if (m === undefined) { try { m = load() } catch { m = null } } return m }
}
const haptics = optional<Haptics>(() => require('expo-haptics'))
const notifs = optional<Notifs>(() => require('expo-notifications'))

/** A success: the notification "success" pattern. A failure: its "error" double knock. A pill landing: one light tap. */
export const feel = {
  won: () => { const h = haptics(); void h?.notificationAsync(h.NotificationFeedbackType.Success).catch(() => {}) },
  lost: () => { const h = haptics(); void h?.notificationAsync(h.NotificationFeedbackType.Error).catch(() => {}) },
  tap: () => { const h = haptics(); void h?.impactAsync(h.ImpactFeedbackStyle.Light).catch(() => {}) },
}

const REMIND = 'bridge:'
/** after the quoted arrival, before saying it should be there: a bridge is rarely early to the second */
const GRACE_MS = 45_000
/** A bridge reminder's words: said as "should have", since the app has not seen it land. */
const words = (t: Trace) => ({
  title: t.paper ? 'Your paper bridge has landed' : 'Your bridge should have landed',
  body: `${t.receipt?.amount ?? t.title.replace(/^(Paper )?[Bb]ridge /, '')} to ${t.bridge ? chainLabel(t.bridge.toChainId) : 'its chain'} · open YieldCircle to see it`,
})

/**
 * While a bridge is on its way: asked once for leave to notify (in front, as the bridge starts — iOS
 * shows the prompt only then); when the app goes to the background, a reminder for each bridge at
 * its quoted arrival; when it comes back, every reminder cancelled — the app sees for itself. A tap
 * on one opens that bridge's end screen. Drawn once, inside the session (`app/_layout.tsx`).
 */
export function BridgeReminders() {
  const a = useActivity()
  const bridges = a.live.filter((t) => !!t.bridge)
  const live = React.useRef(bridges)
  live.current = bridges
  const asked = React.useRef(false)
  React.useEffect(() => {
    if (!bridges.length || asked.current) return
    const n = notifs()
    if (!n) return
    asked.current = true
    void n.getPermissionsAsync().then((p) => (p.status === 'undetermined' ? n.requestPermissionsAsync() : p)).catch(() => {})
  }, [bridges.length])
  React.useEffect(() => {
    const n = notifs()
    if (!n) return
    const cancel = () => n.getAllScheduledNotificationsAsync()
      .then((all) => Promise.all(all.filter((x) => x.identifier.startsWith(REMIND)).map((x) => n.cancelScheduledNotificationAsync(x.identifier))))
      .catch(() => {})
    const app = AppState.addEventListener('change', (s) => {
      if (s === 'active') { void cancel(); return }
      if (s !== 'background') return
      for (const t of live.current) {
        if (isDone(t) || !t.arrivesAt) continue
        const at = Math.max(t.arrivesAt + GRACE_MS, Date.now() + 60_000)
        void n.scheduleNotificationAsync({ identifier: REMIND + t.id, content: { ...words(t), data: { trace: t.id } }, trigger: { type: n.SchedulableTriggerInputTypes.DATE, date: at } }).catch(() => {})
      }
    })
    const tap = n.addNotificationResponseReceivedListener((r) => {
      const id = r.notification.request.content.data?.trace
      if (typeof id === 'string') router.push({ pathname: '/receipt', params: { id } })
    })
    return () => { app.remove(); tap.remove() }
  }, [])
  return null
}
