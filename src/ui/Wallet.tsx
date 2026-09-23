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
import { useAccountFlows, useAccountTxs, useCuratorsByAccount, useIndexPositions } from '../index/queries'
import { useFollowers, useProfile, useProfiles } from '../social/queries'
import { Badges, FollowButton, Money, Who, Ago, describeTx, tokens } from './social-bits'
import { CuratorMark, curatorHref, curatorLabel } from './CuratorFilter'
import { Character, specFor, unearned } from '../identity/character'
import { autoName, shortAddr } from '../identity/name'
import { Sk, Tok, TxLink, pct, usd, usdShort } from './bits'
import { indexChainLabel } from '../index/types'
import { Thread } from './Thread'
import { chainLabel } from '../sdk/queries'
import { primaryLeg } from './Feed'

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
  const pos = useIndexPositions(isMe ? undefined : addr)
  const flows = useAccountFlows(addr, 30)
  const txs = useAccountTxs(addr, undefined, 40)
  const rows = pos.data?.positions ?? []
  const spec = specFor(addr, profile?.avatarUrl)
  const bad = profile?.avatarUrl ? unearned(spec, profile.systemTags ?? []) : []
  const f = flows.data?.totals

  return (
    <>
      <a className="crumb" href="#/feed">‹ Feed</a>
      <header className="wcard">
        <Character addr={addr} avatarUrl={profile?.avatarUrl} size={72} />
        <div className="wc-t">
          <h1>{profile?.handle ? `@${profile.handle}` : profile?.displayName || autoName(addr)}</h1>
          <div className="sub mono">{shortAddr(addr)}{profile?.xHandle && <> · <a className="pri" href={`https://x.com/${profile.xHandle}`} target="_blank" rel="noreferrer">𝕏 @{profile.xHandle}</a></>}</div>
          {profile?.bio && <p className="wc-bio">{profile.bio}</p>}
          <div className="wc-tags">
            {desk && <CuratorMark c={desk} sub />}
            <Badges tags={profile?.systemTags} max={4} />
            {profile?.tags?.map((t) => <i key={t} className="badge-tag self" title="self-declared">{t}</i>)}
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
          This address {desk.via === 'vault' ? 'is one of' : 'controls'}{' '}
          <a className="pri" href={curatorHref(desk.curatorId)}>{curatorLabel(desk)}</a>’s {desk.nVaults} vault
          {desk.nVaults === 1 ? '' : 's'} — what it does here is an allocation decision for its depositors, not a
          wallet's own trade. {desk.verified ? 'It is listed in a curator registry we read.' : 'No curator registry we read names it, which is a fact about the registry.'}
        </div>
      )}

      <div className="wstats">
        <Stat k="Net value" v={isMe ? '—' : usd(pos.data?.totals.navUsd)} s={isMe ? 'on the live path' : `${rows.length} position${rows.length === 1 ? '' : 's'}`} loading={!isMe && pos.isLoading} />
        <Stat k="Deposited · 30d" v={usdShort(f?.depositedUsd)} s={f ? `withdrew ${usdShort(f.withdrawnUsd)}` : ''} loading={flows.isLoading} />
        <Stat k="Borrowed · 30d" v={usdShort(f?.borrowedUsd)} s={f ? `repaid ${usdShort(f.repaidUsd)}` : ''} loading={flows.isLoading} />
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
            {rows.length > 0 && (
              <table className="tbl strat-t">
                <colgroup><col /><col style={{ width: 110 }} /><col className="hide-m" style={{ width: 90 }} /><col style={{ width: 28 }} /></colgroup>
                <thead><tr><th>Market</th><th className="r">Value</th><th className="r hide-m">Rate</th><th /></tr></thead>
                <tbody>{rows.map((r) => (
                  <tr key={`${r.marketUid}:${r.side}:${r.posId}`} onClick={() => { location.hash = marketHref(r.marketUid) }}>
                    <td><div className="nm"><Tok sym={r.symbol ?? '?'} logo={r.assetLogo ?? undefined} /><span><b>{r.marketName ?? r.symbol}</b> <span className="t50">· {r.lenderName ?? r.lenderKey}</span></span>{r.side === 'borrow' && <span className="pill k-borrow">debt</span>}</div>
                      <small className="hide-m">{indexChainLabel(r.chainId, chainLabel)}{r.accrual?.exact ? ' · accrual exact' : r.accrual ? ' · accrual ≈' : ''}</small></td>
                    <td className="r"><Money usd={r.amountUsd} status={r.usdStatus} fromIndex={r.amountFromIndex} amount={r.amount} symbol={r.symbol} /><small>{r.amount ? `${tokens(r.amount)} ${r.symbol ?? ''}` : ''}</small></td>
                    <td className="r hide-m">{r.aprNow != null ? <span className="ok">{pct(r.aprNow)}</span> : <span className="t40">—</span>}</td>
                    <td className="r t40">›</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
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
