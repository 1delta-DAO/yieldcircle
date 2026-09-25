/**
 * A wallet as a person: character, name, badges, what they hold, what they
 * moved, and a thread on them.
 *
 * The index is the source here — and only here. **The connected wallet's own
 * positions are never read from it** (the index's own hard rule): they stay on
 * the live allocator path, which is what the explorer already shows. On your
 * own page this shows your history, which is exactly what the index is for,
 * and points at Explore for the live numbers.
 */
import React from 'react'
import { useAccount } from 'wagmi'
import { marketHref, walletHref } from '../state/AppState'
import { useAccountFlows, useAccountTxs, useCuratorsByAccount, useIndexPositions, useVaultsAt } from '../index/queries'
import { useFollowers, useProfile, useProfiles } from '../social/queries'
import { AutoTag, Badges, FollowButton, Money, Who, Ago, describeTx, tokens } from './social-bits'
import { CuratorMark, curatorHref, curatorLabel } from './CuratorFilter'
import { Character, specFor, unearned } from '../identity/character'
import { labelFor, shortAddr } from '../identity/name'
import { AddrExplorers, CopyButton, Sk, Tip, Tok, TxLink, pct, usd, usdShort } from './bits'
import { indexChainLabel, type AccountIdentity, type IndexPosition, type PositionGroup, type VaultRow } from '../index/types'
import { Thread } from './Thread'
import { chainLabel } from '../sdk/queries'
import { primaryLeg } from './Feed'
import { TokLink } from './TokenPage'

export function Wallet({ addr }: { addr: string }) {
  const { address } = useAccount()
  const isMe = address?.toLowerCase() === addr
  const p = useProfile(addr)
  const profile = p.data?.profile ?? null
  const followers = useFollowers(addr)
  /**
   * Is this address a desk rather than a wallet? A curated vault and the Safe
   * that steers it both appear in the ledger as ordinary addresses — often
   * the largest in a market — and a page that renders them as whales with
   * generated names is telling the reader something false.
   */
  const desk = useCuratorsByAccount([addr]).curatorOf(addr)
  /**
   * …and is it a vault itself? The positions below are the markets it lends
   * INTO; the rate it pays its own depositors is on the share token and was
   * on no page this app served, so someone looking at Felix USDC saw four
   * Morpho legs and no answer to "what does this vault yield".
   */
  const vaults = useVaultsAt(addr).data?.vaults ?? []
  const pos = useIndexPositions(isMe ? undefined : addr)
  const flows = useAccountFlows(addr, 30)
  const txs = useAccountTxs(addr, undefined, 40)
  const rows = pos.data?.positions ?? []
  /**
   * What the index calls this address, read off the rows the page already
   * loaded — every ledger leg is stamped with `accountKind` / `accountLabel`.
   * A labelled address is not a generated name and takes no `auto` tag.
   */
  const idx = React.useMemo<AccountIdentity | null>(
    () =>
      (txs.data?.txs ?? [])
        .flatMap((t) => t.legs)
        .find((l) => l.account === addr && (l.accountLabel || l.accountKind)) ?? null,
    [txs.data, addr],
  )
  const name = labelFor(addr, profile, idx)
  const spec = specFor(addr, profile?.avatarUrl)
  const bad = profile?.avatarUrl ? unearned(spec, profile.systemTags ?? []) : []
  const f = flows.data?.totals
  /** the chains this address has been seen on, busiest first; Ethereum when the index has seen it nowhere */
  const chains = React.useMemo(() => {
    const n = new Map<string, number>()
    const bump = (id: string | undefined, by = 1) => { if (id) n.set(id, (n.get(id) ?? 0) + by) }
    rows.forEach((r) => bump(r.chainId))
    flows.data?.flows.forEach((r) => bump(r.chainId, r.nEvents))
    txs.data?.txs.forEach((t) => bump(t.chainId))
    return n.size ? [...n.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id) : ['1']
  }, [rows, flows.data, txs.data])

  return (
    <>
      <a className="crumb" href="#/feed">‹ Feed</a>
      <header className="wcard">
        <Character addr={addr} avatarUrl={profile?.avatarUrl} size={72} />
        <div className="wc-t">
          <h1>{name.label}{name.generated && <AutoTag />}</h1>
          <div className="sub mono wc-addr"><span title={addr}>{shortAddr(addr)}</span><CopyButton text={addr} /><AddrExplorers addr={addr} chainIds={chains} />{profile?.xHandle && <> · <a className="pri" href={`https://x.com/${profile.xHandle}`} target="_blank" rel="noreferrer">𝕏 @{profile.xHandle}</a></>}</div>
          {profile?.bio && <p className="wc-bio">{profile.bio}</p>}
          <div className="wc-tags">
            {desk && <CuratorMark c={desk} sub />}
            <Badges tags={profile?.systemTags} max={4} />
            {profile?.tags?.map((t) => <Tip key={t} tip={<><b>Self-declared.</b> The owner of this address wrote this tag on their signed profile. Nothing checks it.</>}><i className="badge-tag self">{t}</i></Tip>)}
          </div>
          {bad.length > 0 && <p className="foot warn">This character claims {bad.map((g) => g.why).join(' and ')}, which the index has not confirmed.</p>}
        </div>
        <div className="wc-a">
          {isMe ? <a className="btn sm" href="#/me">Edit profile</a> : <FollowButton kind="wallet" target={addr} />}
          <span className="foot">{followers.data?.followers.length ?? 0} follower{(followers.data?.followers.length ?? 0) === 1 ? '' : 's'}</span>
        </div>
      </header>

      {desk && (
        <div className="note deskn">
          {desk.via === 'vault' ? (
            <>
              This address is one of the {desk.nVaults} vault{desk.nVaults === 1 ? '' : 's'} curated by{' '}
              <a className="pri" href={curatorHref(desk.curatorId)}>{curatorLabel(desk)}</a>
            </>
          ) : (
            <>
              This address is {desk.role ? `the ${desk.role}` : 'an address'} of{' '}
              <a className="pri" href={curatorHref(desk.curatorId)}>{curatorLabel(desk)}</a>, curator of {desk.nVaults} vault
              {desk.nVaults === 1 ? '' : 's'}
            </>
          )}{' '}
          — what it does here is an allocation decision for depositors, not a wallet's own trade. {desk.verified ? 'It is listed in a curator registry we read.' : 'No curator registry we read names it, which is a fact about the registry.'}
        </div>
      )}

      {vaults.map((v) => <VaultCard key={v.marketUid} v={v} />)}

      <div className="wstats">
        <Stat k="Net value" v={isMe ? '—' : usd(pos.data?.totals.navUsd)} s={isMe ? 'on the live path' : `${rows.length} position${rows.length === 1 ? '' : 's'}`} loading={!isMe && pos.isLoading} />
        <Stat k="Deposited · 30d" v={usdShort(f?.depositedUsd)} s={f ? `net ${usdShort(f.depositedUsd - f.withdrawnUsd)} in` : ''} loading={flows.isLoading} />
        <Stat k="Withdrawn · 30d" v={usdShort(f?.withdrawnUsd)} s="supply taken out" loading={flows.isLoading} />
        <Stat k="Borrowed · 30d" v={usdShort(f?.borrowedUsd)} s={f ? `net ${usdShort(f.borrowedUsd - f.repaidUsd)} drawn` : ''} loading={flows.isLoading} />
        <Stat k="Repaid · 30d" v={usdShort(f?.repaidUsd)} s="debt paid down" loading={flows.isLoading} />
        <Stat k="Moves · 30d" v={f ? String(f.nEvents) : '—'} s={f?.unpriced ? `${f.unpriced} unvalued` : 'valued at the block'} loading={flows.isLoading} />
      </div>

      <section className="sec">
        <div className="sec-h"><h2>Positions</h2><span className="sub">{isMe ? 'Your own positions come from the live path, not the index.' : pos.data?.asOf ? <>read at the index’s cursor · oldest anchor <Ago ts={pos.data.asOf.oldest} /> ago</> : 'from the index'}</span></div>
        {isMe ? (
          <div className="note">The index is for <b>other</b> wallets and for history — never for the connected user’s own positions. Yours are on <a className="pri" href="#/">Explore</a>, read live.</div>
        ) : (
          <div className="card">
            {pos.isLoading && <div className="empty"><Sk w={220} /></div>}
            {!pos.isLoading && !rows.length && <div className="empty">The index has no open position for this wallet on the chains it follows.</div>}
            {rows.length > 0 && <Book rows={rows} groups={pos.data?.groups} />}
          </div>
        )}
      </section>

      <section className="sec">
        <div className="sec-h"><h2>Moves</h2><span className="sub">every transaction the index decoded, folded per transaction</span></div>
        <div className="card">
          {txs.isLoading && <div className="empty"><Sk w={200} /></div>}
          {!txs.isLoading && !txs.data?.txs.length && <div className="empty">Nothing on the chains the index follows.</div>}
          <div className="tape">{(txs.data?.txs ?? []).map((t) => {
            const l = primaryLeg(t), d = describeTx(t.kinds)
            return (
              <div key={`${t.chainId}:${t.txHash}`} className="tape-item">
                <a className="tape-row" href={l?.marketUid ? marketHref(l.marketUid) : undefined}>
                  <span className={`verb ${d.cls}`}>{d.verb}</span>
                  <span className="tr-m">{l?.marketName ?? l?.symbol ?? '—'} <span className="t50">{l?.lenderName ?? l?.lenderKey}</span></span>
                  <span className="tr-v"><Money usd={t.volumeUsd ?? l?.amountUsd} status={l?.usdStatus} fromIndex={l?.amountFromIndex} amount={l?.amount} symbol={l?.symbol} short /></span>
                  <span className="tr-t"><Ago ts={t.blockTs} /></span>
                </a>
                <TxLink chainId={t.chainId} hash={t.txHash} />
              </div>
            )
          })}</div>
        </div>
      </section>

      <section className="sec">
        <div className="sec-h"><h2>Wall</h2><span className="sub">a thread on this wallet</span></div>
        <div className="card pad"><Thread kind="wallet" subjectKey={addr} placeholder="Ask them something, or say what you make of the book." /></div>
      </section>
    </>
  )
}

/**
 * What the vault itself pays, for a page opened on a vault's own address.
 *
 * `supplyRate` is the vault's deposit rate as the listing states it — the
 * number a depositor holds, which is NOT any of the rates on the positions
 * below: those are the markets the vault lends INTO, and a Morpho collateral
 * leg reads 0.00 % there by construction. Felix USDC showed four Morpho legs
 * and nowhere its own 3.81 %.
 *
 * `null` is shown in words. Nobody publishing a rate for this vault and the
 * vault paying nothing are different facts, and this card must not turn the
 * first into the second.
 *
 * The share price is deliberately absent: the index stores it RAW (asset per
 * share in raw units), and a vault row carries only the UNDERLYING's
 * decimals, so feUSDC2's 1.047e-12 cannot be unshifted here without guessing
 * the share token's. It belongs on the vault's own page, where the read knows
 * both.
 */
function VaultCard({ v }: { v: VaultRow }) {
  const rate = v.supplyRate
  return (
    <div className="card pad vaultc">
      <div className="sec-h">
        <h2>
          <Tok sym={v.assetSymbol ?? v.symbol ?? '?'} logo={v.assetLogo ?? undefined} size={18} />{' '}
          {v.name ?? v.symbol ?? 'Vault'}
        </h2>
        <span className="sub">
          {v.provider ? `${v.provider} · ` : ''}{indexChainLabel(v.chainId, chainLabel)} · the vault's own numbers
          {v.async ? ' · entering and leaving go through a request' : ''}
          {v.indexTs ? <> · read <Ago ts={v.indexTs} /> ago</> : ''}
        </span>
      </div>
      <div className="vaultc-n">
        <Stat k="Deposit APY" v={rate == null ? <span className="t40">—</span> : <span className="ok">{pct(rate)}</span>}
          s={rate == null ? 'nobody publishes one' : 'what a depositor earns'} />
        <Stat k="TVL" v={usdShort(v.tvlUsd)} s="the whole vault" />
        <Stat k="Holders" v={v.holders.toLocaleString('en-US')}
          s={v.valueUsd != null ? `${usdShort(v.valueUsd)} read here` : 'read by this index'} />
      </div>
      <a className="btn sm" href={marketHref(v.marketUid)}>Open the vault</a>
    </div>
  )
}

/**
 * The book as POSITIONS, not as legs. A loop arrives from the index as a
 * collateral row and a debt row — two rows that share one liquidation — and
 * listing them side by side leaves the reader to net $45,067 against $10,302
 * in their head and to conclude, from two rates of 0.00 % and 4.14 %, that
 * the wallet is paying to lose money. The index folds them (`groups`) and
 * states the equity and the rate ON that equity; the legs stay, one tap down,
 * because the ledger holds legs and a market page joins to them.
 */
function Book({ rows, groups }: { rows: IndexPosition[]; groups?: PositionGroup[] }) {
  const byLeg = new Map(rows.map((r) => [`${r.marketUid}|${r.side}|${r.posId}`, r]))
  // no `groups` (an older index) → every leg is its own position, which is
  // exactly what this page showed before and never a blank table
  const gs: PositionGroup[] = groups?.length
    ? groups
    : rows.map((r) => ({
        key: `${r.marketUid}|${r.side}|${r.posId}`, chainId: r.chainId, account: r.account, posId: r.posId,
        riskKey: r.marketUid, lenderKey: r.lenderKey, marketUids: [r.marketUid],
        supplyUsd: r.side === 'borrow' ? 0 : r.amountUsd ?? 0, debtUsd: r.side === 'borrow' ? r.amountUsd ?? 0 : 0,
        equityUsd: (r.side === 'borrow' ? -1 : 1) * (r.amountUsd ?? 0), leverage: null, annualUsd: null,
        netAprPct: r.aprEffective ?? r.aprNow, blend: 'none', reason: null, exact: true, unpriced: 0,
        legs: [{ marketUid: r.marketUid, side: r.side, posId: r.posId }],
      }))
  return (
    <table className="tbl strat-t">
      <colgroup><col /><col style={{ width: 110 }} /><col className="hide-m" style={{ width: 90 }} /><col style={{ width: 28 }} /></colgroup>
      <thead><tr><th>Position</th><th className="r">Value</th><th className="r hide-m">Rate</th><th /></tr></thead>
      <tbody>
        {gs.map((g) => {
          const found = g.legs.map((l) => byLeg.get(`${l.marketUid}|${l.side}|${l.posId}`)).filter((r): r is IndexPosition => !!r)
          if (found.length === 0) return null
          if (found.length === 1) return <LegRow key={g.key} r={found[0]} />
          const s = sides(found), legs = [...s.coll, ...s.debt], lead = s.coll[0] ?? legs[0]
          return <React.Fragment key={g.key}>
            <tr className="grp" onClick={() => { location.hash = marketHref(lead.marketUid) }}>
              <td>
                <div className="nm">
                  <TokLink group={lead.assetGroup} sym={lead.symbol ?? '?'} logo={lead.assetLogo ?? undefined} />
                  <span><b title={s.basket ? composition(s) : undefined}>{groupLabel(s)}</b> <span className="t50">· {lead.lenderName ?? lead.lenderKey}</span></span>
                  {g.leverage != null && g.leverage > 1.05 && <span className="pill">{g.leverage.toFixed(2)}×</span>}
                  {s.basket && <span className="pill" title="several assets share this account's one health factor">cross-margin</span>}
                </div>
                <small className="hide-m">
                  {indexChainLabel(lead.chainId, chainLabel)} · {usdShort(g.supplyUsd)} {s.debt.length ? 'collateral' : 'supplied'}{s.collSyms.length > 1 ? ` in ${s.collSyms.join(', ')}` : ''}
                  {s.debt.length > 0 && <> over {usdShort(g.debtUsd)} of debt{s.debtSyms.length > 1 ? ` in ${s.debtSyms.join(', ')}` : ''}</>}
                </small>
              </td>
              <td className="r"><b>{usd(g.equityUsd)}</b><small>equity</small></td>
              <td className="r hide-m"><NetRate g={g} /></td>
              <td className="r t40">›</td>
            </tr>
            {legs.map((r) => <LegRow key={`${r.marketUid}:${r.side}:${r.posId}`} r={r} sub />)}
          </React.Fragment>
        })}
      </tbody>
    </table>
  )
}

/**
 * One risk set's legs split by side, each side largest first. The index folds
 * a whole cross-margin account (every Aave reserve backs every debt) into one
 * group, so a side can hold several assets; `basket` says one of them does.
 */
interface Sides { coll: IndexPosition[]; debt: IndexPosition[]; collSyms: string[]; debtSyms: string[]; basket: boolean }
function sides(legs: IndexPosition[]): Sides {
  const big = (a: IndexPosition, b: IndexPosition) => Math.abs(b.amountUsd ?? 0) - Math.abs(a.amountUsd ?? 0)
  const coll = legs.filter((l) => l.side !== 'borrow').sort(big)
  const debt = legs.filter((l) => l.side === 'borrow').sort(big)
  // by symbol, not by leg: a Morpho collateral leg and a supply leg of the same token are one asset
  const syms = (ls: IndexPosition[]) => [...new Set(ls.map((l) => l.symbol ?? '?'))]
  const collSyms = syms(coll), debtSyms = syms(debt)
  return { coll, debt, collSyms, debtSyms, basket: collSyms.length > 1 || debtSyms.length > 1 }
}

/**
 * What the position is, from its own legs: `syrupUSDT / USDT loop` for one
 * asset a side, `basket / WETH` or `cbBTC / basket` once a side holds several
 * — naming only the first would say the account is something it is not. The
 * legs underneath carry the breakdown.
 */
function groupLabel(s: Sides): string {
  const side = (syms: string[]) => (syms.length > 1 ? 'basket' : syms[0])
  if (s.coll.length && s.debt.length) return `${side(s.collSyms)} / ${side(s.debtSyms)}${s.basket ? '' : ' loop'}`
  if (s.coll.length) return s.collSyms.length > 1 ? `${s.collSyms.join(' + ')}` : s.coll[0].marketName ?? s.collSyms[0]
  return s.debtSyms.length > 1 ? `${s.debtSyms.join(' + ')} debt` : s.debt[0].marketName ?? s.debtSyms[0]
}
const composition = (s: Sides) => [s.collSyms.join(', '), s.debtSyms.join(', ')].filter(Boolean).join(' against ')

/**
 * The net rate, or the reason there is none. A refusal is shown in words:
 * a fixed-term loan carries its own rate and a blended figure across terms
 * would be a rate nobody can hold.
 */
function NetRate({ g }: { g: PositionGroup }) {
  if (g.netAprPct == null)
    return <span className="t40" title={g.reason ?? 'no rate for this position yet'}>—</span>
  const cls = g.netAprPct >= 0 ? 'ok' : 'warn'
  const why = `${usd(g.annualUsd ?? 0)} a year on ${usd(g.equityUsd)} of equity${g.exact ? '' : ' — a floor: a leg has no rate yet'}`
  return <span className={cls} title={why}>{pct(g.netAprPct)}{g.exact ? '' : '+'}</span>
}

/**
 * One leg. The rate is the EFFECTIVE one — the pool's plus what the token
 * itself earns — because a Morpho collateral leg pays 0.00 % from the pool
 * and 4.68 % from inside syrupUSDT, and only one of those numbers was ever
 * on this page.
 */
function LegRow({ r, sub }: { r: IndexPosition; sub?: boolean }) {
  const rate = r.aprEffective ?? r.aprNow
  const why = r.intrinsicApr != null
    ? `${pct(r.intrinsicApr)} the token itself${r.intrinsicSource === 'asset' ? ' (from the asset, not this market)' : ''} + ${pct(r.aprNow ?? 0)} the pool`
    : 'the pool’s own rate; nobody publishes a yield for this token'
  return (
    <tr className={sub ? 'leg' : undefined} onClick={() => { location.hash = marketHref(r.marketUid) }}>
      <td>
        <div className="nm">
          {!sub && <TokLink group={r.assetGroup} sym={r.symbol ?? '?'} logo={r.assetLogo ?? undefined} />}
          <span>{sub && <span className="t40">└ </span>}<b>{r.marketName ?? r.symbol}</b> <span className="t50">· {r.lenderName ?? r.lenderKey}</span></span>
          {r.side === 'borrow' && <span className="pill k-borrow">debt</span>}
        </div>
        <small className="hide-m">{indexChainLabel(r.chainId, chainLabel)}{r.accrual?.exact ? ' · accrual exact' : r.accrual ? ' · accrual ≈' : ''}</small>
      </td>
      <td className="r"><Money usd={r.amountUsd} status={r.usdStatus} fromIndex={r.amountFromIndex} amount={r.amount} symbol={r.symbol} /><small>{r.amount ? `${tokens(r.amount)} ${r.symbol ?? ''}` : ''}</small></td>
      <td className="r hide-m">{rate != null ? <span className={r.side === 'borrow' ? 'warn' : 'ok'} title={why}>{pct(rate)}</span> : <span className="t40">—</span>}</td>
      <td className="r t40">›</td>
    </tr>
  )
}

function Stat({ k, v, s, loading }: { k: string; v: React.ReactNode; s?: React.ReactNode; loading?: boolean }) {
  return <div className="wstat"><span className="k">{k}</span><span className="v">{loading ? <Sk w={70} h={18} /> : v}</span>{s != null && <span className="s">{s}</span>}</div>
}

/** A compact list of wallets — the leaderboard and a market's holders both use it. */
export function WalletList({ accounts, right }: { accounts: { account: string; right?: React.ReactNode; sub?: React.ReactNode }[]; right?: string }) {
  const { profile } = useProfiles(accounts.map((a) => a.account))
  return (
    <div className="list">
      {accounts.map((a, i) => (
        <a key={a.account + i} className="row wrow" href={walletHref(a.account)}>
          <span className="rank">{i + 1}</span>
          <Who account={a.account} profile={profile(a.account)} sub={a.sub} plain />
          <span className="sp" />
          <span className="v">{a.right}{right && <small>{right}</small>}</span>
        </a>
      ))}
    </div>
  )
}
