/**
 * Alerts that arrive with the tab closed (pos-indexer docs/alerts.md).
 *
 * A rule is a signed `AlertRule`: the social service evaluates it every 30 s
 * against the index and sends what fires to the wallet's linked Telegram
 * chat. The inbox keeps everything that fired, sent or not, so linking
 * Telegram is optional. The chat id is the one private value: the service
 * says only whether a chat is linked.
 *
 * Kinds offered here are the ones the service lists (`/alerts/config`), so
 * an older deployment never gets a rule it would refuse.
 */
import React from 'react'
import { chainLabel } from '@yieldcircle/app/sdk/queries'
import { useMarket } from '@yieldcircle/app/index/queries'
import { indexChainLabel } from '@yieldcircle/core/index/types'
import { isAddr, normAddr } from '@yieldcircle/core/model/address'
import type { AlertKind, AlertNotification, AlertRule, PriceSource } from '@yieldcircle/core/social/api'
import { useAlertInbox, useAlerts, useAlertsConfig, useMyFollows, usePriceSources, useProfiles, useSocialRefresh } from '../social/queries'
import { nonce, useSocialWrite } from '../social/sign'
import { Ago, Who } from './social-bits'
import { num, Sk, usd } from './bits'

const chainName = (id: string | null | undefined) => (id ? indexChainLabel(id, chainLabel) : '')
const errText = (e: unknown) => {
  const m = (e as Error)?.message ?? 'failed'
  return /rejected|denied/i.test(m) ? 'signature rejected' : m.slice(0, 160)
}
const ruleIdFor = (kind: string) => `${kind.toLowerCase()}-${nonce().slice(0, 8)}`

/** What the new-alert form opens on: a route's `?ak=&at=`, or a button on this page. */
export interface AlertPrefill { kind?: string; target?: string }

export function AlertCenter({ account, prefill }: { account: string; prefill?: AlertPrefill }) {
  const cfg = useAlertsConfig()
  const [linking, setLinking] = React.useState(false)
  const mine = useAlerts(account, linking)
  const [form, setForm] = React.useState<AlertPrefill | null>(prefill?.kind ? prefill : null)
  React.useEffect(() => { if (prefill?.kind) setForm(prefill) }, [prefill?.kind, prefill?.target])

  // a service with no alerts answers 404 here: say nothing rather than offer what it cannot take
  if (cfg.isError) return null
  if (!cfg.data) return <div className="card pad" style={{ marginBottom: 14 }}><Sk w={220} /></div>
  const kinds = cfg.data.kinds
  const rules = mine.data?.rules ?? []
  const full = rules.length >= cfg.data.maxRules

  return (
    <>
      <TelegramCard account={account} state={mine.data?.channel.telegram} config={cfg.data.telegram} linking={linking} setLinking={setLinking} />
      <section className="sec" style={{ marginTop: 18 }}>
        <div className="sec-h">
          <h2>Your alerts</h2>
          <span className="sub">{rules.length ? `${rules.length} rule${rules.length === 1 ? '' : 's'}` : ''}</span>
          <span className="sp" />
          {!form && !full && <button className="btn sm pri" onClick={() => setForm({ kind: kinds.includes('following') ? 'following' : 'wallet' })}>New alert</button>}
        </div>
        {form && <NewAlert account={account} kinds={kinds} prefill={form} onDone={() => setForm(null)} />}
        <div className="card">
          {mine.isLoading && <div className="empty"><Sk w={200} /></div>}
          {!mine.isLoading && !rules.length && !form && (
            <div className="empty al-empty">
              No alerts yet.{' '}
              {kinds.includes('following') && <button className="lnk" onClick={() => setForm({ kind: 'following' })}>Tell me when wallets I follow move</button>}
            </div>
          )}
          {rules.map((r) => <RuleRow key={r.ruleId} account={account} rule={r} />)}
        </div>
        {full && <p className="foot">That is the limit of {cfg.data.maxRules} rules. Remove one to add another.</p>}
      </section>
      <Inbox account={account} />
    </>
  )
}

// ---------------------------------------------------------------- Telegram

function TelegramCard({ account, state, config, linking, setLinking }: {
  account: string
  state: 'linked' | 'stopped' | 'blocked' | 'none' | undefined
  config: { enabled: boolean; bot?: string | null; linkUrl?: string | null }
  linking: boolean
  setLinking: (b: boolean) => void
}) {
  const { telegramLink } = useSocialWrite()
  const refresh = useSocialRefresh()
  const [busy, setBusy] = React.useState(false)
  const [err, setErr] = React.useState<string | null>(null)
  const [url, setUrl] = React.useState<string | null>(null)

  // the chat answered `/start`: the link is done, stop asking
  React.useEffect(() => { if (linking && state === 'linked') { setLinking(false); setUrl(null) } }, [linking, state, setLinking])
  // the signed half is good for an hour; after that the button has to sign again
  React.useEffect(() => {
    if (!linking) return
    const t = setTimeout(() => { setLinking(false); setUrl(null) }, 3_600_000)
    return () => clearTimeout(t)
  }, [linking, setLinking])

  if (!config.enabled)
    return <div className="note">Telegram delivery is off on this service. Alerts still collect in the inbox below.</div>

  const begin = async () => {
    if (!config.linkUrl) return
    setBusy(true); setErr(null)
    try {
      const n = nonce()
      await telegramLink(n, 'link')
      setUrl(config.linkUrl + n); setLinking(true)
    } catch (e) { setErr(errText(e)) } finally { setBusy(false) }
  }
  const unlink = async () => {
    setBusy(true); setErr(null)
    try { await telegramLink(nonce(), 'unlink'); refresh.alerts(account) }
    catch (e) { setErr(errText(e)) } finally { setBusy(false) }
  }
  const bot = config.bot ? <b>@{config.bot}</b> : 'the bot'

  return (
    <div className="card pad al-tg">
      <div className="al-tg-h">
        <TgIcon />
        <span className="lbl">Telegram</span>
        {state === 'linked' && <i className="pill run">linked</i>}
        {state === 'stopped' && <i className="pill">stopped</i>}
        {state === 'blocked' && <i className="pill warn">blocked</i>}
        <span className="sp" />
        {state === 'linked'
          ? <button className="btn sm" disabled={busy} onClick={() => void unlink()}>{busy ? '…' : 'Unlink'}</button>
          : !url && <button className="btn sm pri" disabled={busy || !config.linkUrl} onClick={() => void begin()}>{busy ? 'Signing…' : state === 'none' || !state ? 'Link Telegram' : 'Link again'}</button>}
      </div>
      {url ? (
        <div className="al-tg-step">
          <p className="plain">Signed. Now open {bot} and press <b>Start</b>. This page notices on its own.</p>
          <div className="actions">
            <a className="btn sm pri" href={url} target="_blank" rel="noreferrer">Open Telegram ›</a>
            <button className="btn sm ghost" onClick={() => { setUrl(null); setLinking(false) }}>Cancel</button>
            <span className="foot al-wait"><Sk w={10} h={10} /> waiting for Start…</span>
          </div>
          <p className="foot">The link works for an hour and only for this wallet. Telegram never learns your address, and this app never learns your chat.</p>
        </div>
      ) : state === 'linked' ? (
        <p className="foot">Alerts go to your chat with {bot}. Send <code>/stop</code> there to silence them.</p>
      ) : state === 'stopped' ? (
        <p className="foot">You sent <code>/stop</code> to {bot}. Link again to resume. Everything that fired meanwhile is in the inbox.</p>
      ) : state === 'blocked' ? (
        <p className="foot">Telegram says {bot} is blocked. Unblock it, then link again.</p>
      ) : (
        <p className="foot">Get your alerts as Telegram messages. It takes one signature (no gas) and one tap on Start. Without it they still collect in the inbox below.</p>
      )}
      {err && <div className="err">{err}</div>}
    </div>
  )
}

function TgIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden fill="currentColor" className="al-tg-i">
      <path d="M21.9 4.3 18.7 19.4c-.2 1.1-.9 1.3-1.8.8l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.3-5 9.1-8.2c.4-.4-.1-.6-.6-.2L6.2 13 1.4 11.5c-1-.3-1.1-1 .2-1.5L20.5 2.8c.9-.3 1.7.2 1.4 1.5Z" />
    </svg>
  )
}

// ---------------------------------------------------------------- the rules

function RuleRow({ account, rule }: { account: string; rule: AlertRule }) {
  const { alertRule } = useSocialWrite()
  const refresh = useSocialRefresh()
  const [busy, setBusy] = React.useState(false)
  const [err, setErr] = React.useState<string | null>(null)
  const act = async (action: 'remove' | 'pause' | 'resume') => {
    setBusy(true); setErr(null)
    try { await alertRule(rule.ruleId, rule.kind, rule.params, action); refresh.alerts(account) }
    catch (e) { setErr(errText(e)) } finally { setBusy(false) }
  }
  // a one-shot price rule turns itself off when it fires: that is done, not paused
  const done = !rule.enabled && rule.kind === 'price' && rule.fireCount > 0 && !rule.params.repeat
  return (
    <div className={`al-rule${rule.enabled ? '' : ' off'}`}>
      <span className={`al-kind k-${rule.kind}`}>{KIND_LABEL[rule.kind] ?? rule.kind}</span>
      <span className="al-what"><RuleText rule={rule} /></span>
      <span className="al-state">
        {done ? <i className="pill">fired · off</i> : !rule.enabled ? <i className="pill">paused</i> : null}
        {rule.fireCount > 0 && rule.firedAt && <span className="t50">fired {rule.fireCount}× · <Ago ts={rule.firedAt} /></span>}
      </span>
      <span className="al-act">
        {!done && <button className="btn sm ghost" disabled={busy} onClick={() => void act(rule.enabled ? 'pause' : 'resume')}>{rule.enabled ? 'Pause' : 'Resume'}</button>}
        {done && <button className="btn sm ghost" disabled={busy} onClick={() => void alertRule(rule.ruleId, rule.kind, rule.params, 'set').then(() => refresh.alerts(account), (e) => setErr(errText(e)))}>Re-arm</button>}
        <button className="btn sm ghost" disabled={busy} onClick={() => void act('remove')} aria-label="Remove">✕</button>
      </span>
      {err && <div className="err">{err}</div>}
    </div>
  )
}

const KIND_LABEL: Record<string, string> = {
  following: 'Following', walletEvent: 'Wallet', liquidated: 'Liquidation', price: 'Price', move: 'Move', rate: 'Rate',
}

function RuleText({ rule }: { rule: AlertRule }) {
  const p = rule.params as Record<string, string | number | boolean | null>
  const chain = p.chain ? ` on ${chainName(String(p.chain))}` : ''
  const min = Number(p.minUsd) > 0 ? ` ≥ ${usd(Number(p.minUsd))}` : ''
  switch (rule.kind) {
    case 'following':
      return (
        <>
          {p.events === 'liquidations' ? 'Liquidations of' : 'Moves' + min + ' by'} the {rule.watching != null ? <b>{rule.watching}</b> : ''} wallet{rule.watching === 1 ? '' : 's'} you follow{chain}
          <span className="t50"> · with their linked wallets</span>
        </>
      )
    case 'walletEvent':
    case 'liquidated':
      return (
        <>
          <WhoInline account={String(p.account)} />
          {rule.kind === 'liquidated' ? ' is liquidated' : ` moves${min}`}{chain}
          {p.scope === 'profile' && <span className="t50"> · every wallet of the profile</span>}
        </>
      )
    case 'price':
      return (
        <>
          {rule.feed?.name ?? feedShort(String(p.feed))} {p.op} <b>{num(Number(p.level), 6)}</b>
          {rule.feed && <span className="t50"> · now {num(rule.feed.price, 6)} · {chainName(rule.feed.chainId)}</span>}
          {p.repeat ? <span className="t50"> · repeats</span> : <span className="t50"> · once</span>}
        </>
      )
    case 'move':
      return (
        <>
          {rule.feed?.name ?? feedShort(String(p.feed))} {p.direction === 'up' ? '+' : p.direction === 'down' ? '−' : '±'}{p.pct} % in {p.window}
          {rule.feed && <span className="t50"> · {chainName(rule.feed.chainId)}</span>}
        </>
      )
    case 'rate':
      return <><MarketName uid={String(p.market)} /> {p.side} APR {p.op} <b>{p.pct} %</b>{Number(p.holdMin) > 0 && <span className="t50"> · held {p.holdMin} min</span>}</>
  }
  return <>{rule.kind}</>
}
const feedShort = (k: string) => { const [c, a] = k.split(':'); return `feed ${a?.slice(0, 8)}… on ${chainName(c)}` }

function WhoInline({ account }: { account: string }) {
  const { profile } = useProfiles([account])
  return <span className="al-who"><Who account={account} profile={profile(account)} size={18} plain /></span>
}
function MarketName({ uid }: { uid: string }) {
  const m = useMarket(uid)
  const d = m.data
  return <a className="pri" href={`#/m/${encodeURIComponent(uid)}`}>{d ? `${d.marketName ?? d.assetSymbol ?? uid.split(':')[0]} · ${d.lenderName ?? d.lenderKey} · ${chainName(d.chainId)}` : uid.split(':')[0]}</a>
}

// ---------------------------------------------------------------- a new rule

type FormKind = 'following' | 'wallet' | 'price' | 'move' | 'rate'
const FORM_KINDS: { id: FormKind; label: string; needs: AlertKind[] }[] = [
  { id: 'following', label: 'Wallets I follow', needs: ['following'] },
  { id: 'wallet', label: 'A wallet', needs: ['walletEvent', 'liquidated'] },
  { id: 'price', label: 'Price', needs: ['price'] },
  { id: 'move', label: 'Price move', needs: ['move'] },
  { id: 'rate', label: 'Rate', needs: ['rate'] },
]

function NewAlert({ account, kinds, prefill, onDone }: { account: string; kinds: AlertKind[]; prefill: AlertPrefill; onDone: () => void }) {
  const offered = FORM_KINDS.filter((k) => k.needs.every((n) => kinds.includes(n)))
  const start = (prefill.kind === 'walletEvent' || prefill.kind === 'liquidated' ? 'wallet' : prefill.kind) as FormKind
  const [kind, setKind] = React.useState<FormKind>(offered.some((k) => k.id === start) ? start : offered[0]?.id ?? 'wallet')
  const { alertRule } = useSocialWrite()
  const refresh = useSocialRefresh()
  const [busy, setBusy] = React.useState(false)
  const [err, setErr] = React.useState<string | null>(null)
  const [draft, setDraft] = React.useState<{ kind: AlertKind; params: Record<string, unknown> } | null>(null)

  const save = async () => {
    if (!draft) return
    setBusy(true); setErr(null)
    try { await alertRule(ruleIdFor(draft.kind), draft.kind, draft.params, 'set'); refresh.alerts(account); onDone() }
    catch (e) { setErr(errText(e)) } finally { setBusy(false) }
  }
  const target = prefill.kind === start ? prefill.target : undefined

  return (
    <div className="card pad al-new">
      <div className="seg sm al-kinds" role="group" aria-label="Alert on">
        {offered.map((k) => <button key={k.id} aria-pressed={kind === k.id} onClick={() => { setKind(k.id); setErr(null) }}>{k.label}</button>)}
      </div>
      <div className="al-form">
        {kind === 'following' && <FollowingForm account={account} onChange={setDraft} />}
        {kind === 'wallet' && <WalletForm account={account} target={target} onChange={setDraft} />}
        {(kind === 'price' || kind === 'move') && <PriceForm key={kind} move={kind === 'move'} onChange={setDraft} />}
        {kind === 'rate' && <RateForm target={target} onChange={setDraft} />}
      </div>
      <div className="actions">
        <button className="btn sm ghost" onClick={onDone}>Cancel</button>
        <span className="sp" />
        <button className="btn sm pri" disabled={busy || !draft} onClick={() => void save()}>{busy ? 'Signing…' : 'Sign and save'}</button>
      </div>
      {err && <div className="err">{err}</div>}
      <p className="foot">One signature, no gas. Rules are public, like follows. The service checks them every 30 seconds.</p>
    </div>
  )
}

type Draft = { kind: AlertKind; params: Record<string, unknown> } | null

/** a number field that keeps what was typed and reports the parsed value (NaN while unparseable) */
function NumField({ label, value, onChange, unit, placeholder }: { label: string; value: string; onChange: (s: string) => void; unit?: string; placeholder?: string }) {
  return (
    <label className="field al-f">
      <span className="lbl">{label}</span>
      <div className="amt sm"><input inputMode="decimal" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value.replace(',', '.'))} />{unit && <span className="u">{unit}</span>}</div>
    </label>
  )
}
function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="field al-f">
      <span className="lbl">{label}</span>
      <div className="seg sm" role="group" aria-label={label}>
        {options.map(([v, l]) => <button key={v} aria-pressed={value === v} onClick={() => onChange(v)}>{l}</button>)}
      </div>
    </div>
  )
}
/** the ledger kinds' chain filter: free text, a chain id or nothing */
function ChainField({ value, onChange }: { value: string; onChange: (s: string) => void }) {
  return (
    <label className="field al-f">
      <span className="lbl">Chain</span>
      <select className="al-sel" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Every chain</option>
        {['1', '8453', '42161', '10', '56', '43114', '137', '999', '143', '9745'].map((c) => <option key={c} value={c}>{chainName(c)}</option>)}
      </select>
    </label>
  )
}
const posNum = (s: string) => (s.trim() === '' ? 0 : Number(s))

function FollowingForm({ account, onChange }: { account: string; onChange: (d: Draft) => void }) {
  const f = useMyFollows(account)
  const [events, setEvents] = React.useState<'moves' | 'liquidations'>('moves')
  const [min, setMin] = React.useState('1000')
  const [chain, setChain] = React.useState('')
  const signed = f.wallets.filter((w) => f.serverFollowing('wallet', w)).length
  const pending = f.wallets.length - signed
  React.useEffect(() => {
    const minUsd = posNum(min)
    onChange(Number.isFinite(minUsd) && minUsd >= 0 ? { kind: 'following', params: { events, minUsd: events === 'moves' ? minUsd : 0, chain: chain || null } } : null)
  }, [events, min, chain, onChange])
  return (
    <>
      <p className="plain">
        A message whenever a wallet you follow moves: a deposit, withdrawal, borrow, repay or liquidation that the index picks up.
        It follows your list as it changes, so a wallet you follow later is covered without a new rule, and a wallet that belongs to a profile brings the profile's other wallets along.
      </p>
      <p className="foot">
        You follow <b>{signed}</b> wallet{signed === 1 ? '' : 's'}{pending > 0 ? ` (+${pending} not signed yet; they count once you apply them from your profile)` : ''}.
        {signed === 0 && <> Follow some from <a className="pri" href="#/board">the board</a> first.</>}
      </p>
      <div className="al-row">
        <Seg label="Tell me about" value={events} options={[['moves', 'Every move'], ['liquidations', 'Liquidations only']]} onChange={setEvents} />
        {events === 'moves' && <NumField label="Only moves worth at least" value={min} onChange={setMin} unit="$" placeholder="0" />}
        <ChainField value={chain} onChange={setChain} />
      </div>
    </>
  )
}

function WalletForm({ account, target, onChange }: { account: string; target?: string; onChange: (d: Draft) => void }) {
  const [addr, setAddr] = React.useState(target && isAddr(target) ? normAddr(target) : account.startsWith('0x') ? account : '')
  const [events, setEvents] = React.useState<'moves' | 'liquidations'>('moves')
  const [scope, setScope] = React.useState<'wallet' | 'profile'>('profile')
  const [min, setMin] = React.useState('0')
  const [chain, setChain] = React.useState('')
  const a = addr.trim().toLowerCase()
  const ok = /^0x[0-9a-f]{40}$/.test(a)
  const { profile } = useProfiles(ok ? [a] : [])
  React.useEffect(() => {
    const minUsd = posNum(min)
    if (!ok || !Number.isFinite(minUsd) || minUsd < 0) return onChange(null)
    onChange(events === 'liquidations'
      ? { kind: 'liquidated', params: { account: a, scope, chain: chain || null } }
      : { kind: 'walletEvent', params: { account: a, scope, minUsd, chain: chain || null } })
  }, [a, ok, events, scope, min, chain, onChange])
  const mine = a === account
  return (
    <>
      <label className="field al-f">
        <span className="lbl">Wallet</span>
        <div className="amt sm"><input value={addr} placeholder="0x…" spellCheck={false} onChange={(e) => setAddr(e.target.value)} /></div>
      </label>
      {ok && <div className="al-who-line"><Who account={a} profile={profile(a)} size={22} plain />{mine && <span className="t50"> · you</span>}</div>}
      {addr && !ok && <p className="foot warn">An EVM address (0x…). Solana wallets are not covered by alerts yet.</p>}
      <div className="al-row">
        <Seg label="Tell me about" value={events} options={[['moves', 'Every move'], ['liquidations', 'Liquidations only']]} onChange={setEvents} />
        <Seg label="Covering" value={scope} options={[['profile', 'The whole profile'], ['wallet', 'This wallet only']]} onChange={setScope} />
        {events === 'moves' && <NumField label="Only moves worth at least" value={min} onChange={setMin} unit="$" placeholder="0" />}
        <ChainField value={chain} onChange={setChain} />
      </div>
      {scope === 'profile' && <p className="foot">A profile can link several wallets together. This covers all of them, including ones linked later. A wallet with no links is just itself.</p>}
    </>
  )
}

function PriceForm({ move, onChange }: { move: boolean; onChange: (d: Draft) => void }) {
  const [q, setQ] = React.useState('ETH')
  const src = usePriceSources(q)
  const [pick, setPick] = React.useState<PriceSource | null>(null)
  const [op, setOp] = React.useState<'above' | 'below'>('above')
  const [level, setLevel] = React.useState('')
  const [repeat, setRepeat] = React.useState(false)
  const [pctS, setPct] = React.useState('5')
  const [win, setWin] = React.useState<'1h' | '24h'>('1h')
  const [direction, setDirection] = React.useState<'up' | 'down' | 'either'>('either')
  React.useEffect(() => {
    if (!pick) return onChange(null)
    if (move) {
      const pct = Number(pctS)
      return onChange(pct >= 0.1 ? { kind: 'move', params: { feed: pick.feed, pct, window: win, direction } } : null)
    }
    const lv = Number(level)
    onChange(lv > 0 ? { kind: 'price', params: { feed: pick.feed, op, level: lv, repeat } } : null)
  }, [pick, move, op, level, repeat, pctS, win, direction, onChange])
  const choose = (s: PriceSource) => {
    setPick(s)
    // a sensible level to edit from: 5 % away on the side asked
    if (!move && !level) setLevel(String(Number((s.price * (op === 'above' ? 1.05 : 0.95)).toPrecision(4))))
  }
  return (
    <>
      {!pick ? (
        <>
          <label className="field al-f">
            <span className="lbl">Price feed</span>
            <div className="amt sm"><input value={q} placeholder="ETH, BTC, SOL…" onChange={(e) => setQ(e.target.value)} autoFocus /></div>
          </label>
          <div className="al-feeds">
            {src.isLoading && <Sk w={180} />}
            {src.data?.sources.map((s) => (
              <button key={s.feed} className="al-feed" onClick={() => choose(s)}>
                <span>{s.name}</span>
                <span className="t50">{chainName(s.chainId)}</span>
                <span className="sp" />
                <span className="mono">{num(s.price, 6)}</span>
                <span className="t50 al-freq">{s.updatesPerDay >= 24 ? `${Math.round(s.updatesPerDay / 24)}/h` : `${s.updatesPerDay}/day`}</span>
              </button>
            ))}
            {src.data && !src.data.sources.length && <span className="foot">No USD feed matches “{q}”.</span>}
          </div>
          <p className="foot">The lenders' own oracle feeds, as the index stores them. Feeds that update more often answer sooner.</p>
        </>
      ) : (
        <div className="al-picked">
          <b>{pick.name}</b> <span className="t50">· {chainName(pick.chainId)} · now {num(pick.price, 6)} · <Ago ts={pick.updatedAt} /></span>
          <button className="lnk" onClick={() => setPick(null)}>change</button>
        </div>
      )}
      {pick && !move && (
        <div className="al-row">
          <Seg label="When the price is" value={op} options={[['above', 'Above'], ['below', 'Below']]} onChange={setOp} />
          <NumField label="Level" value={level} onChange={setLevel} />
          <label className="al-check"><input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} /> Keep it on after it fires</label>
        </div>
      )}
      {pick && move && (
        <div className="al-row">
          <NumField label="A move of at least" value={pctS} onChange={setPct} unit="%" />
          <Seg label="Within" value={win} options={[['1h', '1 hour'], ['24h', '24 hours']]} onChange={setWin} />
          <Seg label="Direction" value={direction} options={[['either', 'Either'], ['up', 'Up'], ['down', 'Down']]} onChange={setDirection} />
        </div>
      )}
      {pick && !move && <p className="foot">Once by default: it fires the first time the price crosses, then turns itself off. Kept on, it re-arms after the price is back 0.5 % on the other side.</p>}
      {pick && move && <p className="foot">It fires once, and again only after the move has calmed to under half the threshold.</p>}
    </>
  )
}

function RateForm({ target, onChange }: { target?: string; onChange: (d: Draft) => void }) {
  const [uid, setUid] = React.useState(target ?? '')
  const m = useMarket(uid.includes(':') ? uid : undefined)
  const [side, setSide] = React.useState<'supply' | 'borrow'>('borrow')
  const [op, setOp] = React.useState<'above' | 'below'>('above')
  const [pctS, setPct] = React.useState('')
  const [hold, setHold] = React.useState('30')
  const now = m.data ? (side === 'supply' ? m.data.supplyApr : m.data.borrowApr) : null
  React.useEffect(() => {
    const pct = Number(pctS), holdMin = posNum(hold)
    onChange(uid.includes(':') && pctS.trim() !== '' && Number.isFinite(pct) && holdMin >= 0 && holdMin <= 1440
      ? { kind: 'rate', params: { market: uid, side, op, pct, holdMin } } : null)
  }, [uid, side, op, pctS, hold, onChange])
  return (
    <>
      {target ? (
        <div className="al-picked"><MarketName uid={uid} /></div>
      ) : (
        <>
          <label className="field al-f">
            <span className="lbl">Market</span>
            <div className="amt sm"><input value={uid} placeholder="a market id (open a market and press Alert)" spellCheck={false} onChange={(e) => setUid(e.target.value.trim())} /></div>
          </label>
          {m.data && <div className="al-picked"><MarketName uid={uid} /></div>}
        </>
      )}
      <div className="al-row">
        <Seg label="Side" value={side} options={[['borrow', 'Borrow APR'], ['supply', 'Supply APR']]} onChange={setSide} />
        <Seg label="When it is" value={op} options={[['above', 'Above'], ['below', 'Below']]} onChange={setOp} />
        <NumField label="APR" value={pctS} onChange={setPct} unit="%" placeholder={now != null ? now.toFixed(2) : ''} />
        <NumField label="For at least" value={hold} onChange={setHold} unit="min" />
      </div>
      <p className="foot">{now != null ? `Now ${now.toFixed(2)} %. ` : ''}Rates come from the hourly series, so a rule answers within the hour. The hold keeps a one-block spike from firing it.</p>
    </>
  )
}

// ---------------------------------------------------------------- the inbox

function Inbox({ account }: { account: string }) {
  const q = useAlertInbox(account)
  const rows = q.data?.notifications ?? []
  if (!q.isLoading && !rows.length) return null
  return (
    <section className="sec" style={{ marginTop: 18 }}>
      <div className="sec-h"><h2>Fired</h2><span className="sub">newest first, sent to Telegram or not</span></div>
      <div className="card">
        {q.isLoading && <div className="empty"><Sk w={200} /></div>}
        {rows.map((n) => <InboxRow key={n.id} n={n} />)}
      </div>
    </section>
  )
}
const DELIVERY: Record<AlertNotification['delivery'], [string, string]> = {
  sent: ['run', 'sent'],
  pending: ['', 'sending'],
  skipped: ['', 'not sent'],
  failed: ['warn', 'failed'],
}
function InboxRow({ n }: { n: AlertNotification }) {
  const [cls, label] = DELIVERY[n.delivery] ?? ['', n.delivery]
  const d = n.data as { chain?: string; tx?: string; account?: string } | null
  return (
    <div className="al-note">
      <div className="al-note-h">
        <b>{n.title}</b>
        <span className="sp" />
        <i className={`pill ${cls}`} title={n.delivery === 'skipped' ? 'No Telegram chat was linked when it fired' : undefined}>{label}</i>
        <span className="t50"><Ago ts={n.createdAt} /></span>
      </div>
      <div className="t70 al-note-b">
        {n.body}
        {d?.account && <> <a className="pri" href={`#/w/${d.account}`}>wallet ›</a></>}
      </div>
    </div>
  )
}
