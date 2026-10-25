import React from 'react'
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native'
import { router } from 'expo-router'
import { useAppKit } from '@reown/appkit-react-native'
import Svg, { Path } from 'react-native-svg'
import { normaliseDecimal, type Amount } from '@yieldcircle/core/model/amount'
import { cents } from '@yieldcircle/core/model/format'
import type { Line, ThreeLines } from '@yieldcircle/core/model/lite'
import type { Ladder, Step } from '@yieldcircle/app/ladder'
import { useTrace, isDone } from '@yieldcircle/app/sdk/txTrace'
import { phaseWords, useNow } from '@yieldcircle/app/sdk/txWords'
import { chainLabel } from '@yieldcircle/app/sdk/queries'
import type { ValueCheck } from '@yieldcircle/app/tickets/valueCheck'
import { C } from '../theme'
import { Btn, LeverPill } from '../ui/bits'
import { Txt } from '../ui/Txt'

/**
 * The ticket's pieces, as the web draws them (app.css / lite.css `.ticket`, `.lite-ticket`): the
 * head, sections, the amount box, the three lines, the cells, the one button and its ladder.
 */

/** The ticket's head (`.th`): the face, what it is, a lever tag, close. */
export function TicketHead({ face, title, sub, subTone, pnl, lever, onShare, onClose }: { face: React.ReactNode; title: string; sub?: string; subTone?: string; /** what the position made since it was opened (`pnlLine`) */ pnl?: { text: string; tone: 'ok' | 'bad' } | null; lever?: string; /** a held position's Copy link (`sharePosition`) */ onShare?: (() => void) | null; onClose: () => void }) {
  return (
    <View style={st.th}>
      {face}
      <View style={{ flex: 1 }}>
        <Txt s={16} w={600} lh={20}>{title}</Txt>
        {!!sub && <Txt s={12.5} c={subTone === 'bad' ? C.bad : subTone === 'warn' ? C.warn : C.tx50} style={{ marginTop: 2 }}>{sub}</Txt>}
        {!!pnl && <Txt s={12.5} c={pnl.tone === 'ok' ? C.ok : C.bad} style={{ marginTop: 2 }}>{pnl.text}</Txt>}
      </View>
      {lever && <LeverPill text={lever} />}
      {onShare && (
        <Pressable onPress={onShare} hitSlop={6} style={({ pressed }) => [st.share, pressed && { backgroundColor: C.b400 }]} accessibilityLabel="Share">
          <Svg width={15} height={15} viewBox="0 0 20 20" fill="none" stroke={C.tx70} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><Path d="M10 12.5V3M6.5 6.5 10 3l3.5 3.5M5 10v5.5a1.5 1.5 0 0 0 1.5 1.5h7a1.5 1.5 0 0 0 1.5-1.5V10" /></Svg>
          <Txt s={12.5} w={500} c={C.tx70}>Share</Txt>
        </Pressable>
      )}
      <Pressable onPress={onClose} hitSlop={8} style={st.x} accessibilityLabel="Close"><Txt s={16} c={C.tx50}>✕</Txt></Pressable>
    </View>
  )
}

/** A section (`.tsec`): 12 / 16 padding, a hairline under it. */
export function Sec({ children, plain, style }: { children: React.ReactNode; plain?: boolean; style?: object }) {
  return <View style={[st.sec, plain && { borderBottomWidth: 0 }, style]}>{children}</View>
}
export const Lbl = ({ children }: { children: React.ReactNode }) => <Txt s={12} w={600} c={C.tx50} style={{ marginBottom: 6 }}>{children}</Txt>

/** The amount (`.amt`): typed as the web types it — a comma or a dot, the text kept as typed — the unit and Max beside it. */
/** `soft`: the Get sheet's (`.get .amt`) — filled, borderless, smaller. */
export function AmountBox({ unit, value, onChange, onMax, soft }: { unit: string; value: Amount; onChange: (a: Amount) => void; onMax?: () => void; soft?: boolean }) {
  const [text, setText] = React.useState(value.text)
  const emitted = React.useRef(value.text)
  React.useEffect(() => { if (value.text !== emitted.current) { emitted.current = value.text; setText(value.text) } }, [value.text])
  return (
    <View style={[st.amt, soft && st.amtSoft]}>
      {unit === '$' && <Txt s={13} mono c={C.tx50}>$</Txt>}
      <TextInput
        value={text}
        keyboardType="decimal-pad"
        inputMode="decimal"
        accessibilityLabel="Amount"
        onChangeText={(raw) => { const r = raw.replace(/[^0-9.,\s]/g, ''); setText(r); const t = normaliseDecimal(r); const c = t === '' || t === '.' ? '0' : t; emitted.current = c; onChange({ text: c }) }}
        onBlur={() => { const t = normaliseDecimal(text); setText(t === '' || t === '.' ? '0' : t.endsWith('.') ? t.slice(0, -1) : t) }}
        style={[st.input, soft && { fontSize: 16 }]}
        placeholderTextColor={C.tx40}
      />
      {unit !== '$' && <Txt s={13} mono c={C.tx50}>{unit}</Txt>}
      {onMax && <Pressable onPress={onMax} style={st.max} hitSlop={6}><Txt s={11} w={600} c={C.primary} style={{ letterSpacing: 0.66, textTransform: 'uppercase' }}>Max</Txt></Pressable>}
    </View>
  )
}
/** Under the amount (`.amt-sub`): in dollars, and what the wallet holds. */
export function AmtSub({ left, right, warn }: { left?: string; right?: string; warn?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, gap: 8 }}>
      <Txt s={12} mono c={C.tx50}>{left ?? ''}</Txt>
      <Txt s={12} mono c={C.tx50} style={{ flexShrink: 1, textAlign: 'right' }}>{right ?? ''}{warn ? <Txt s={12} mono c={C.warn}> · {warn}</Txt> : null}</Txt>
    </View>
  )
}
/** A quarter, half or all of what the wallet holds (`.lite-presets`). */
export function Presets({ onPick }: { onPick: (pct: number) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
      {[25, 50, 100].map((p) => (
        <Pressable key={p} onPress={() => onPick(p)} style={st.pctb}><Txt s={12} mono c={C.tx50}>{p === 100 ? 'All' : `${p}%`}</Txt></Pressable>
      ))}
    </View>
  )
}

const TONE: Record<string, string> = { ok: C.ok, warn: C.warn, bad: C.bad }
/** The three lines (`.lite-lines`): what you earn, what you can lose, what it costs to get in. */
export function Lines({ l }: { l: ThreeLines }) {
  return (
    <Sec>
      <View style={st.lines}>
        <LineRow l={l.earn} hero />
        <LineRow l={l.lose} />
        <LineRow l={l.cost} />
      </View>
    </Sec>
  )
}
function LineRow({ l, hero }: { l: Line; hero?: boolean }) {
  return (
    <View style={[st.ll, hero && { backgroundColor: '#0b0b0e' }]}>
      <Txt s={12} w={600} c={C.tx50} style={{ width: 80, paddingTop: 2 }}>{l.k}</Txt>
      <View style={{ flex: 1, gap: 1 }}>
        <Txt s={hero ? 24 : 15} w={600} lh={hero ? 29 : undefined} c={TONE[l.tone] ?? C.tx} style={{ fontVariant: ['tabular-nums'] }}>{l.v}</Txt>
        <Txt s={12} c={C.tx50} lh={17}>{l.s}</Txt>
      </View>
    </View>
  )
}

/** Figures in cells (`.cells`): a hero across the top, the rest two a row. */
export function Cells({ hero, cells }: { hero?: { k: string; v: React.ReactNode; s?: string; tone?: string }; cells: { k: string; v: React.ReactNode; s?: string; tone?: string }[] }) {
  return (
    <Sec>
      <View style={st.cells}>
        {hero && <View style={[st.c, { width: '100%', backgroundColor: '#0d0d0d' }]}>
          <Txt s={10.5} w={600} c={C.tx70} style={st.k}>{hero.k}</Txt>
          <Txt s={30} w={500} mono lh={33} c={TONE[hero.tone ?? ''] ?? C.tx}>{hero.v}</Txt>
          {!!hero.s && <Txt s={11} mono c={C.tx50} numberOfLines={1}>{hero.s}</Txt>}
        </View>}
        {cells.map((c) => (
          <View key={c.k} style={[st.c, { width: '49.85%', flexGrow: 1 }]}>
            <Txt s={10.5} w={600} c={C.tx50} style={st.k}>{c.k}</Txt>
            <Txt s={16} mono c={TONE[c.tone ?? ''] ?? C.tx}>{c.v}</Txt>
            {!!c.s && <Txt s={11} mono c={C.tx50} numberOfLines={1}>{c.s}</Txt>}
          </View>
        ))}
      </View>
    </Sec>
  )
}

/** A loss big enough to confirm before signing (`LossAck`): said in cents, one tap to accept. */
export function LossAck({ v, what, advice }: { v: ValueCheck; what: string; advice: string }) {
  if (!v.severe) return null
  return (
    <View style={st.ack}>
      <Txt s={12.5} c={C.tx70}><Txt s={12.5} w={700} c={C.bad}>{what} loses {cents(-v.diff)} ({(Math.abs(v.impact) * 100).toFixed(Math.abs(v.impact) < 0.1 ? 2 : 1)}%)</Txt> of what you put in. {advice}</Txt>
      <Pressable onPress={() => v.setAcked(!v.acked)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
        <View style={[st.box, v.acked && { backgroundColor: C.primary, borderColor: C.primary }]}>{v.acked && <Txt s={11} w={700} c={C.primaryInk} lh={13}>✓</Txt>}</View>
        <Txt s={12.5}>I accept losing {cents(-v.diff)}</Txt>
      </Pressable>
    </View>
  )
}

/** The way in when the wallet is short (`GetLine`, `.getline`): a card with a swap mark, what to do, and "Get X →". */
export function GetLine({ account, short, symbol, onOpen }: { account?: string; short: boolean; symbol: string; onOpen: () => void }) {
  if (!account) return null
  return (
    <Pressable onPress={onOpen} style={({ pressed }) => [st.getline, pressed && { backgroundColor: C.b400 }]}>
      <View style={st.glIc}>
        <Svg width={18} height={18} viewBox="0 0 20 20" fill="none" stroke={C.tx70} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><Path d="M3 7h11l-3-3M17 13H6l3 3" /></Svg>
      </View>
      <View style={{ flex: 1 }}>
        <Txt s={13} w={600} lh={18.85} c={short ? C.primary : C.tx}>{short ? `Don't have enough ${symbol}?` : `Get more ${symbol}`}</Txt>
        <Txt s={11.5} c={C.tx50} lh={15}>{short ? 'Swap or bridge it from anything you hold, on any chain.' : 'from another asset or chain'}</Txt>
      </View>
      <Txt s={12.5} w={600} c={C.primary}>Get {symbol.length > 8 ? 'it' : symbol} →</Txt>
    </Pressable>
  )
}

/** The bottom of the ticket (`Action`): one button, then the ladder once it is built. */
export function Action({ ladder: l, label, account, isConnected, disabled, risky, blockedNote, chainId }: { ladder: Ladder; label: string; account?: string; isConnected: boolean; disabled: boolean; risky?: boolean; blockedNote?: string; chainId: string }) {
  const { open } = useAppKit()
  if (!l.bundle) return (
    <View style={st.cta}>
      {!!l.err && <Txt s={12.5} c={C.bad} style={{ marginBottom: 8 }}>{l.err}</Txt>}
      {!account ? <>
          <Btn wide title="Connect a wallet to continue" onPress={() => open()} />
          <View style={{ height: 8 }} />
          <Btn wide kind="paper" title="Or try it with paper money" onPress={() => router.push('/paper')} />
        </>
        // someone else's address on screen (the browser render's `?as=`): nothing to sign with
        : !isConnected ? <Btn wide kind="plain" disabled title={`Viewing ${account.slice(0, 6)}… · connect to sign`} />
        : !l.isConnected ? <Btn wide kind="plain" disabled title="Connect a wallet to sign" />
        : <Btn wide title={l.busy ? 'Building…' : blockedNote ?? (risky ? `${label} anyway` : label)} kind={risky ? 'risky' : 'pri'} disabled={disabled || l.busy} onPress={() => l.start(label)} />}
      <Txt s={11.5} c={C.tx40} lh={16.7} style={{ marginTop: 8 }}>The API builds the exact calls (approvals, then the action); nothing is sent until you sign — once, where your wallet batches them. Gas on {chainLabel(chainId)}.</Txt>
    </View>
  )
  return (
    <View style={st.cta}>
      <Lbl>{l.settled ? 'Done' : l.finished ? 'Updating your positions…' : l.signing ? 'Confirm in your wallet' : l.pending ? 'Waiting for the block…' : 'Sign in your wallet'}</Lbl>
      <View style={{ gap: 8 }}>
        {l.bundle.steps.map((s, i, all) => {
          const on = l.together ? l.together.includes(s) : s === l.next
          const quiet = !!s.hash && all.slice(i + 1).some((o) => o.hash === s.hash)
          return <StepRow key={i} st={s} n={i + 1} on={on} signing={l.signing && on} quiet={quiet} />
        })}
      </View>
      {!!l.err && <Txt s={12.5} c={C.bad} style={{ marginTop: 8 }}>{l.err}</Txt>}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        <View style={{ flex: 1 }}>
          {l.finished
            ? <Btn wide title={l.settled ? 'See your positions' : 'Updating your positions…'} disabled={!l.settled} onPress={() => { router.dismissAll(); router.replace('/') }} />
            : <Btn wide disabled={!!l.pending || l.switching} onPress={l.signing ? l.reopen : l.sendNext}
                title={l.switching ? 'Switching…' : l.wrongChain ? `Switch wallet to ${chainLabel(chainId)}` : l.signing ? 'Open your wallet to confirm' : l.pending ? 'Waiting for the block…' : l.together ? `Send all ${l.together.length} in one` : `Send ${l.done + 1} of ${l.total}`} />}
        </View>
        <Btn kind="plain" title="Reset" disabled={!!l.pending} onPress={l.reset} />
      </View>
    </View>
  )
}

/** One step of the ladder (`.steps li`): its number, a spinner while out, where its transaction is. */
function StepRow({ st: s, n, on, signing, quiet }: { st: Step; n: number; on: boolean; signing: boolean; quiet?: boolean }) {
  const t = useTrace(s.hash)
  const now = useNow(!!t && !isDone(t))
  const flying = !!t && !isDone(t)
  const w = t ? phaseWords(t, now) : null
  const showNote = !!t && !quiet && !(t.phase === 'settled' && !t.note && !t.received?.length)
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={[st.stepI, s.done && !flying ? { backgroundColor: C.ok, borderColor: C.ok } : on ? { borderColor: C.primary } : null]}>
        {flying || signing ? <ActivityIndicator size="small" color={C.primary} style={{ transform: [{ scale: 0.6 }] }} /> : <Txt s={10.5} mono c={s.done ? '#000' : on ? C.primary : C.tx50} lh={13}>{s.done ? '✓' : n}</Txt>}
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Txt s={13} c={on ? C.tx : s.done ? C.tx70 : C.tx50}>{s.label}</Txt>
        {signing ? <Txt s={11.5} c={C.tx50}>Confirm in your wallet</Txt>
          : showNote && w ? <Txt s={11.5} c={w.tone === 'bad' ? C.bad : w.tone === 'warn' ? C.warn : C.tx50}>{w.head}{w.detail ? ` · ${w.detail}` : ''}</Txt> : null}
      </View>
    </View>
  )
}

/** Where the money sits, as one trust line (`.lite-trust`). */
export function Trust({ left, right }: { left: string; right?: string }) {
  return (
    <View style={st.trust}>
      <Txt s={12} c={C.tx70} style={{ flex: 1 }}>{left}</Txt>
      {!!right && <Txt s={12} c={C.tx50}>{right}</Txt>}
    </View>
  )
}

/** Every number and choice for this strategy (`.lite-details`). */
export function Details({ what, onOpen, title = 'Details' }: { what: string; onOpen: () => void; title?: string }) {
  return (
    <Pressable onPress={onOpen} style={st.details}>
      <View style={{ flex: 1 }}>
        <Txt w={700}>{title}</Txt>
        <Txt s={11.5} c={C.tx50}>{what}</Txt>
      </View>
      <Txt c={C.tx50}>›</Txt>
    </Pressable>
  )
}

/** A plain sentence in a section (`.plain`). */
export const Plain = ({ children, tone }: { children: React.ReactNode; tone?: 'warn' | 'dim' }) => <Txt s={13} c={tone === 'warn' ? C.warn : tone === 'dim' ? C.tx50 : C.tx70} lh={19}>{children}</Txt>

const st = StyleSheet.create({
  th: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingTop: 14, paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: C.line, backgroundColor: C.b200 },
  share: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 30, paddingHorizontal: 10, borderRadius: 999, backgroundColor: C.b300, marginTop: -3 },
  x: { width: 32, height: 32, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: -4, marginRight: -6 },
  sec: { paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: C.line },
  amt: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingHorizontal: 12, backgroundColor: '#000', borderWidth: 1, borderColor: C.line2, borderRadius: 12 },
  amtSoft: { minHeight: 42, borderWidth: 0, borderRadius: 14, backgroundColor: C.b300 },
  input: { flex: 1, color: C.tx, fontFamily: 'IBMPlexMono_400Regular', fontSize: 20, paddingVertical: 6, paddingHorizontal: 2 },
  max: { minHeight: 32, paddingHorizontal: 6, justifyContent: 'center' },
  pctb: { minHeight: 30, paddingVertical: 2, paddingHorizontal: 12, borderWidth: 1, borderColor: C.line2, borderRadius: 5, justifyContent: 'center' },
  lines: { borderRadius: 12, backgroundColor: C.line, gap: 1, overflow: 'hidden' },
  ll: { flexDirection: 'row', gap: 12, paddingVertical: 11, paddingHorizontal: 14, backgroundColor: C.b200 },
  cells: { flexDirection: 'row', flexWrap: 'wrap', gap: 1, backgroundColor: C.line, borderWidth: 1, borderColor: C.line, borderRadius: 12, overflow: 'hidden' },
  c: { backgroundColor: C.b200, paddingVertical: 10, paddingHorizontal: 12, gap: 1 },
  k: { letterSpacing: 0.63, textTransform: 'uppercase' },
  ack: { marginTop: 10, borderWidth: 1, borderColor: 'rgba(229,83,75,0.5)', borderRadius: 12, padding: 12 },
  box: { width: 18, height: 18, borderRadius: 4, borderWidth: 1, borderColor: C.line2, alignItems: 'center', justifyContent: 'center' },
  cta: { paddingVertical: 12, paddingHorizontal: 16, backgroundColor: C.b200, borderBottomWidth: 1, borderBottomColor: C.line },
  stepI: { width: 20, height: 20, borderRadius: 10, borderWidth: 1, borderColor: C.line2, alignItems: 'center', justifyContent: 'center' },
  getline: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, marginTop: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, backgroundColor: C.b300 },
  glIc: { width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center' },
  trust: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: C.line },
  details: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.b300, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, marginHorizontal: 16, marginTop: 14, marginBottom: 14 },
})
