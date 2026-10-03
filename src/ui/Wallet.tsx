/**
 * A wallet as a person: character, name, badges, what they hold, what they
 * moved, and a thread on them.
 *
 * The index is the source here — and only here. **The connected wallet's own
 * positions are never read from it** (the index's own hard rule): they stay on
 * the live allocator path, which is what the balance chip in the header shows. On your
 * own page this shows your history, which is exactly what the index is for,
 * and points at that chip for the live numbers.
 */
import React from 'react'
import { accountCarry } from '../model/accountCarry'
import { useMenu, type Menu } from './useMenu'
import { parseUid, uidOf } from '../model/uid'
import type { Strategy } from '../model/strategies'
import { useAccount } from 'wagmi'
import { go, marketHref, useApp, walletHref } from '../state/AppState'
import { useAccountFlows, useAccountTxs, useCuratorsByAccount, useIndexPositions, useVaultsAt } from '../index/queries'
import { useFollowers, useProfile, useProfiles, useWalletLinks } from '../social/queries'
import { AutoTag, Badges, FollowButton, Impaired, Money, Who, Ago, describeBundle, tokens } from './social-bits'
import { CuratorMark, curatorHref, curatorLabel } from './CuratorFilter'
import { Character, specFor, unearned } from '../identity/character'
import { labelFor, shortAddr } from '../identity/name'
import { isEvmChain, normAddr } from '../model/address'
import { AddrExplorers, CopyButton, Sk, Tip, Tok, TxLink, pct, usd, usdShort } from './bits'
import { indexChainLabel, type AccountIdentity, type FlowsResponse, type IndexPosition, type PositionGroup, type TxBundle, type VaultRow } from '../index/types'
import { Thread } from './Thread'
import { chainLabel } from '../sdk/queries'
import { primaryLeg } from './Feed'
import { TokLink } from './TokenPage'

export function Wallet({ addr }: { addr: string }) {
  const { address } = useAccount()
  const { solSigner } = useApp()
  // "me" is per VM — the EVM signer OR the Solana one — and, once wallet
  // links resolve (docs/wallet-links.md §6 phase 2), any address linked to
  // either. The hard rule (never the index for the connected user's
  // positions) holds across the whole cluster.
  const cluster = useWalletLinks(normAddr(address) ?? solSigner).data
  const isMe = normAddr(address) === addr || (!!solSigner && solSigner === addr)
    || (!!cluster && (cluster.primary === addr || cluster.members.some((m) => m.account === addr)))
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
  /**
   * The chain selector scopes this page like every other one. The account
   * routes take one `chainId` only, so a single chain is asked for
   * server-side and a multi-chain selection is cut here from the full answer
   * (the tape over-fetches so the cut still leaves a page of moves).
   */
  const { chainIds, allChains, chainLabelFor } = useApp()
  const one = !allChains && chainIds.length === 1 ? chainIds[0] : undefined
  const cut = !allChains && !one
  const inScope = React.useCallback((id: string) => allChains || chainIds.includes(id), [allChains, chainIds])
  const pos = useIndexPositions(isMe ? undefined : addr, one)
  // the app's menu, joined by market: what on this profile can be copied
  const menu = useMenu()
  const copyOf = useCopyable(menu)
  const flows = useAccountFlows(addr, 30, one)
  const txsQ = useAccountTxs(addr, one, cut ? 200 : 40)
  const rows = React.useMemo(() => (pos.data?.positions ?? []).filter((r) => inScope(r.chainId)), [pos.data, inScope])
  const groups = React.useMemo(() => pos.data?.groups?.filter((g) => inScope(g.chainId)), [pos.data, inScope])
  const nav = !cut
    ? pos.data?.totals.navUsd
    : groups
      ? groups.reduce((t, g) => t + g.supplyUsd - g.debtUsd, 0)
      : rows.reduce((t, r) => t + (r.amountUsd ?? 0) * (r.side === 'borrow' ? -1 : 1), 0)
  // positions in markets that cannot pay them (tickets/0037): out of `nav`, named here
  const nImpaired = rows.filter((r) => r.valueStatus === 'impaired').length
  /**
   * What the whole account earns (pos-indexer tickets/0057 §E): Σ annual / Σ
   * equity — each position's APR weighted by its share of NAV, so a small
   * high-APR position cannot pass for the account. The index's figure for
   * the whole account; recomputed here only for a chain cut (or an index
   * that predates it), over the same positions the table lists.
   */
  const carry = React.useMemo(() => {
    const t = pos.data?.totals
    const gs = groupsOrLegs(rows, groups)
    const own = accountCarry(gs)
    const c = !cut && t && t.netAprPct !== undefined
      ? { ...own, annualUsd: t.annualUsd ?? null, netAprPct: t.netAprPct ?? null, ratedShare: t.ratedShare ?? own.ratedShare, exact: t.aprExact ?? own.exact }
      : own
    // the position a reader would otherwise read the wallet by: the best rate
    // on positive equity, named with how small a slice of the account it is
    const best = gs
      .filter((g) => g.equityUsd > 0 && g.netAprPct != null)
      .reduce<PositionGroup | null>((a, g) => (a == null || g.netAprPct! > a.netAprPct! ? g : a), null)
    return { ...c, best, bestShare: best && c.navUsd > 0 ? best.equityUsd / c.navUsd : null }
  }, [pos.data, rows, groups, cut])
  const txList = React.useMemo(() => (txsQ.data?.txs ?? []).filter((t) => inScope(t.chainId)).slice(0, 40).map((t) => ownLegs(t, addr)), [txsQ.data, inScope, addr])
  /**
   * What the index calls this address. The responses the page already loads
   * carry `identity` top-level now — answered from the index's name tables
   * directly, so a labelled address with no legs in this window keeps its
   * name. Scanning the legs stays as the fallback against an older index.
   * A labelled address is not a generated name and takes no `auto` tag.
   */
  const idx = React.useMemo<AccountIdentity | null>(
    () =>
      txsQ.data?.identity ??
      pos.data?.identity ??
      (txsQ.data?.txs ?? [])
        .flatMap((t) => t.legs)
        .find((l) => l.account === addr && (l.accountLabel || l.accountKind)) ??
      null,
    [txsQ.data, pos.data, addr],
  )
  const name = labelFor(addr, profile, idx)
  const spec = specFor(addr, profile?.avatarUrl)
  const bad = profile?.avatarUrl ? unearned(spec, profile.systemTags ?? []) : []
  const f = React.useMemo(() => (cut && flows.data ? flowTotals(flows.data.flows.filter((r) => inScope(r.chainId))) : flows.data?.totals), [cut, flows.data, inScope])
  /**
   * An explorer per chain in scope: the ones the index has seen this address
   * on first, busiest first, then the rest of the selection, dimmed.
   */
  const chains = React.useMemo(() => {
    const n = new Map<string, number>()
    const bump = (id: string | undefined, by = 1) => { if (id) n.set(id, (n.get(id) ?? 0) + by) }
    rows.forEach((r) => bump(r.chainId))
    flows.data?.flows.forEach((r) => bump(r.chainId, r.nEvents))
    txsQ.data?.txs.forEach((t) => bump(t.chainId))
    const seen = [...n.entries()].filter(([id]) => inScope(id)).sort((a, b) => b[1] - a[1]).map(([id]) => id)
    return { ids: [...seen, ...chainIds.filter((id) => !n.has(id))], seen: new Set(seen) }
  }, [rows, flows.data, txsQ.data, inScope, chainIds])

  return (
    <>
      <a className="crumb" href="#/">‹ Home</a>
      <header className="wcard">
        <Character addr={addr} avatarUrl={profile?.avatarUrl} size={72} />
        <div className="wc-t">
          <h1>{name.label}{name.generated && <AutoTag />}</h1>
          <div className="sub mono wc-addr"><span title={addr}>{shortAddr(addr)}</span><CopyButton text={addr} /><AddrExplorers addr={addr} chainIds={chains.ids} seen={chains.seen} />{profile?.xHandle && <> · <a className="pri" href={`https://x.com/${profile.xHandle}`} target="_blank" rel="noreferrer">𝕏 @{profile.xHandle}</a></>}</div>
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
        <Stat k="Net value" v={isMe ? '—' : usd(nav)} s={isMe ? 'on the live path' : `${rows.length} position${rows.length === 1 ? '' : 's'}${nImpaired ? ` · ${nImpaired} impaired left out` : ''}`} loading={!isMe && pos.isLoading} />
        <Stat k="Net APR" v={isMe ? '—' : carry.netAprPct == null ? '—' : <span className={carry.netAprPct >= 0 ? 'ok' : 'warn'}>{carry.exact ? '' : '≈ '}{pct(carry.netAprPct)}</span>}
          s={isMe ? 'on the live path' : <AccountAprNote c={carry} />} loading={!isMe && pos.isLoading} />
        <Stat k="Deposited · 30d" v={usdShort(f?.depositedUsd)} s={f ? `net ${usdShort(f.depositedUsd - f.withdrawnUsd)} in` : ''} loading={flows.isLoading} />
        <Stat k="Withdrawn · 30d" v={usdShort(f?.withdrawnUsd)} s="supply taken out" loading={flows.isLoading} />
        <Stat k="Borrowed · 30d" v={usdShort(f?.borrowedUsd)} s={f ? `net ${usdShort(f.borrowedUsd - f.repaidUsd)} drawn` : ''} loading={flows.isLoading} />
        <Stat k="Repaid · 30d" v={usdShort(f?.repaidUsd)} s="debt paid down" loading={flows.isLoading} />
        <Stat k="Moves · 30d" v={f ? String(f.nEvents) : '—'} s={f?.unpriced ? `${f.unpriced} unvalued` : 'valued at the block'} loading={flows.isLoading} />
      </div>

      <section className="sec">
        <div className="sec-h"><h2>Positions</h2><span className="sub">{isMe ? 'Your own positions come from the live path, not the index.' : pos.data?.asOf ? <>read at the index’s cursor · oldest anchor <Ago ts={pos.data.asOf.oldest} /> ago</> : 'from the index'}</span></div>
        {isMe ? (
          <div className="note">The index is for <b>other</b> wallets and for history — never for the connected user’s own positions. Yours are behind the balance in the top right, read live.</div>
        ) : (
          <div className="card">
            {pos.isLoading && <div className="empty"><Sk w={220} /></div>}
            {!pos.isLoading && !rows.length && <div className="empty">The index has no open position for this wallet on {allChains ? 'the chains it follows' : chainLabelFor()}.</div>}
            {rows.length > 0 && <Book rows={rows} groups={groups} navUsd={carry.navUsd} copyOf={copyOf} who={addr} />}
          </div>
        )}
      </section>

      <section className="sec">
        <div className="sec-h"><h2>Moves</h2><span className="sub">every transaction the index decoded, folded per transaction</span></div>
        <div className="card">
          {txsQ.isLoading && <div className="empty"><Sk w={200} /></div>}
          {!txsQ.isLoading && !txList.length && <div className="empty">Nothing on {allChains ? 'the chains the index follows' : chainLabelFor()}.</div>}
          <div className="tape">{txList.map((t) => {
            const l = primaryLeg(t), d = describeBundle(t)
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
        <Stat k="Deposit APR" v={rate == null ? <span className="t40">—</span> : <span className="ok">{pct(rate)}</span>}
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
/**
 * What on this page the reader can COPY: a position the app's own menu can
 * open as the same strategy. Two shapes only, both matched on the exact
 * markets, never on a resemblance:
 *
 *   - a plain deposit — one supply leg, no debt — whose market the menu
 *     lists as a simple strategy;
 *   - a looped pair — one collateral asset against one debt asset — whose
 *     collateral AND debt markets are exactly one loop's long and short leg.
 *
 * A cross-margin basket, a lone debt, collateral posted with no loop, or a
 * market the menu does not list gets no button: the row still opens the
 * market. Uids are compared as stored, then case-folded on EVM chains,
 * where the ref is hex and its case carries nothing.
 */
function useCopyable(menu: Menu) {
  return React.useMemo(() => {
    const simple = new Map<string, Strategy>()
    const loop = new Map<string, Strategy>()
    const fold = (u: string) => (isEvmChain(parseUid(u)?.chainId ?? '') ? u.toLowerCase() : u)
    // everything a ticket can open (AssetPage resolves `s=` against all three):
    // the shown rows, the ones a floor holds back behind the menu's `+`, and
    // the ones the per-asset cap dropped from view
    for (const st of [...menu.all, ...menu.hidden, ...menu.overflow] as Strategy[]) {
      if (st.kind === 'loop') {
        loop.set(`${st.marketLongUid}|${st.marketShortUid}`, st)
        loop.set(`${fold(st.marketLongUid)}|${fold(st.marketShortUid)}`, st)
      } else {
        const u = uidOf(st)
        if (u) {
          simple.set(u, st)
          simple.set(fold(u), st)
        }
      }
    }
    return (legs: IndexPosition[]): Strategy | null => {
      const coll = legs.filter((l) => l.side !== 'borrow')
      const debt = legs.filter((l) => l.side === 'borrow')
      if (coll.length === 1 && debt.length === 0 && coll[0].side !== 'collateral')
        return simple.get(coll[0].marketUid) ?? simple.get(fold(coll[0].marketUid)) ?? null
      if (coll.length === 1 && debt.length === 1) {
        const k = `${coll[0].marketUid}|${debt[0].marketUid}`
        return loop.get(k) ?? loop.get(`${fold(coll[0].marketUid)}|${fold(debt[0].marketUid)}`) ?? null
      }
      return null
    }
  }, [menu.all, menu.hidden, menu.overflow])
}

/** The ticket for that strategy, opened as a copy of `who`'s position — the feed's "Copy this", from a profile. */
function CopyPositionButton({ st, who, lev }: { st: Strategy; who: string; lev?: number | null }) {
  return (
    <button
      type="button"
      className="btn sm pri copyb"
      title={`Open ${st.kind === 'loop' ? 'this loop' : 'this deposit'} as a ticket${lev && lev > 1.05 ? ` — they run it at ${lev.toFixed(1)}×, you choose your own` : ''}`}
      onClick={(e) => {
        e.stopPropagation()
        go(st.group, { u: st.asset, s: st.id, k: st.kind, copy: who })
      }}
    >
      Copy
    </button>
  )
}

/**
 * The positions to show and to sum: the index's `groups`, or — on an older
 * index that answers none — one position per leg, which is exactly what this
 * page showed before and never a blank table. A leg's carry is its value at
 * its own effective rate (a debt's sign makes it a cost).
 */
function groupsOrLegs(rows: IndexPosition[], groups?: PositionGroup[]): PositionGroup[] {
  if (groups?.length) return groups
  return rows.map((r) => {
    const equity = (r.side === 'borrow' ? -1 : 1) * (r.amountUsd ?? 0)
    const rate = r.aprEffective ?? r.aprNow
    return {
      key: `${r.marketUid}|${r.side}|${r.posId}`, chainId: r.chainId, account: r.account, posId: r.posId,
      riskKey: r.marketUid, lenderKey: r.lenderKey, marketUids: [r.marketUid],
      supplyUsd: r.side === 'borrow' ? 0 : r.amountUsd ?? 0, debtUsd: r.side === 'borrow' ? r.amountUsd ?? 0 : 0,
      equityUsd: equity, leverage: null,
      annualUsd: rate == null || r.amountUsd == null ? null : (equity * rate) / 100,
      netAprPct: rate, blend: 'none', reason: null, exact: rate != null && r.amountUsd != null, unpriced: 0,
      legs: [{ marketUid: r.marketUid, side: r.side, posId: r.posId }],
    }
  })
}

/** "0.3 % of NAV" — how much of the account one position is; nothing when the account has no positive NAV */
const navShare = (equityUsd: number, navUsd: number | null | undefined) =>
  navUsd != null && navUsd > 0 ? ` · ${pct((Math.abs(equityUsd) / navUsd) * 100, 1)} of NAV` : ''

function Book({ rows, groups, navUsd, copyOf, who }: { rows: IndexPosition[]; groups?: PositionGroup[]; navUsd?: number | null; copyOf?: (legs: IndexPosition[]) => Strategy | null; who: string }) {
  const byLeg = new Map(rows.map((r) => [`${r.marketUid}|${r.side}|${r.posId}`, r]))
  const gs = groupsOrLegs(rows, groups)
  return (
    <table className="tbl strat-t">
      <colgroup><col /><col style={{ width: 110 }} /><col className="hide-m" style={{ width: 90 }} /><col style={{ width: copyOf ? 74 : 28 }} /></colgroup>
      <thead><tr><th>Position</th><th className="r">Value</th><th className="r hide-m">Rate</th><th /></tr></thead>
      <tbody>
        {gs.map((g) => {
          const found = g.legs.map((l) => byLeg.get(`${l.marketUid}|${l.side}|${l.posId}`)).filter((r): r is IndexPosition => !!r)
          if (found.length === 0) return null
          const st = copyOf?.(found) ?? null
          if (found.length === 1) return <LegRow key={g.key} r={found[0]} share={navShare(g.equityUsd, navUsd)} copy={st ? <CopyPositionButton st={st} who={who} /> : undefined} />
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
              <td className="r"><b>{usd(g.equityUsd)}</b><small>equity{navShare(g.equityUsd, navUsd)}</small></td>
              <td className="r hide-m"><NetRate g={g} /></td>
              <td className="r t40">{st ? <CopyPositionButton st={st} who={who} lev={g.leverage} /> : '›'}</td>
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
function LegRow({ r, sub, share = '', copy }: { r: IndexPosition; sub?: boolean; share?: string; copy?: React.ReactNode }) {
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
      <td className="r">{r.valueStatus === 'impaired' ? <Impaired x={r} /> : <Money usd={r.amountUsd} status={r.usdStatus} fromIndex={r.amountFromIndex} amount={r.amount} symbol={r.symbol} />}<small>{r.amount ? `${tokens(r.amount)} ${r.symbol ?? ''}` : ''}{share}</small></td>
      <td className="r hide-m">{rate != null ? <span className={r.side === 'borrow' ? 'warn' : 'ok'} title={why}>{pct(rate)}</span> : <span className="t40">—</span>}</td>
      <td className="r t40">{copy ?? '›'}</td>
    </tr>
  )
}

/**
 * Under the account's APR: what it is in dollars, how much of the account it
 * covers, and — when the best position is a small slice far above the
 * account — that slice, named, because that is the number a reader would
 * otherwise take for the wallet's.
 */
function AccountAprNote({ c }: { c: ReturnType<typeof accountCarry> & { best: PositionGroup | null; bestShare: number | null } }) {
  if (c.netAprPct == null) return <>{c.positions ? 'no rate on these positions yet' : 'no position'}</>
  const unrated = 1 - c.ratedShare
  const lopsided =
    c.best?.netAprPct != null && c.bestShare != null && c.bestShare < 0.25 &&
    c.best.netAprPct > 2 * Math.max(c.netAprPct, 0.5)
  return (
    <span title="Σ yearly carry ÷ Σ equity: every position's net APR weighted by its share of the account's net value">
      ≈ {usdShort(c.annualUsd)}/yr on the whole account
      {unrated > 0.005 && <span className="t40"> · {pct(unrated * 100, 0)} of NAV has no rate yet</span>}
      {lopsided && <span className="t40"> · best {pct(c.best!.netAprPct)} is {pct(c.bestShare! * 100, 1)} of NAV</span>}
    </span>
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

/** The route's `totals`, summed again over the flow rows a multi-chain selection keeps. */
function flowTotals(rows: FlowsResponse['flows']): FlowsResponse['totals'] {
  const t = { depositedUsd: 0, withdrawnUsd: 0, borrowedUsd: 0, repaidUsd: 0, netSupplyUsd: 0, netBorrowUsd: 0, nEvents: 0, unpriced: 0 }
  for (const r of rows) {
    if (r.side === 'borrow') { t.borrowedUsd += r.inUsd; t.repaidUsd += r.outUsd } else { t.depositedUsd += r.inUsd; t.withdrawnUsd += r.outUsd }
    t.nEvents += r.nEvents
    t.unpriced += r.unpriced
  }
  t.netSupplyUsd = t.depositedUsd - t.withdrawnUsd
  t.netBorrowUsd = t.borrowedUsd - t.repaidUsd
  return t
}

/**
 * A move on a wallet's page is that wallet's part of the transaction. The
 * index answers `accounts=` with WHOLE transactions (a filter keeps a bundle
 * whole), so a liquidator clearing six Midnight borrowers in one tx put the
 * batch's $24 and another borrower's leg on each of the six pages, where this
 * wallet's own part was $0.41. The legs are narrowed to the wallet's and the
 * totals recounted the way pos-indexer's `bundleTransactions` counts them
 * (accruals and pass-throughs out, an unpriced leg counted as such). A bundle
 * with no leg of its own (it matched as a transfer's counterparty) is kept.
 */
function ownLegs(t: TxBundle, addr: string): TxBundle {
  const legs = t.legs.filter((l) => l.account === addr || l.to === addr)
  if (!legs.length || legs.length === t.legs.length) return t
  let volume: number | null = null
  let unpriced = 0
  const kinds: Record<string, number> = {}
  for (const l of legs) {
    const k = l.kind === 'transfer' ? 'transfer' : `${l.side}/${l.kind}`
    kinds[k] = (kinds[k] ?? 0) + 1
    if (l.kind === 'accrual' || l.passthrough) continue
    if (l.amountUsd == null) unpriced++
    else volume = (volume ?? 0) + Math.abs(l.amountUsd)
  }
  // `netUsd` needs the index's inflow / outflow sets; this page does not read it
  return { ...t, legs, kinds, volumeUsd: volume, unpriced, netUsd: null, swap: t.subject?.account === addr ? t.swap : null, subject: t.subject ? { ...t.subject, account: addr, reason: 'wallet', accounts: 1 } : t.subject }
}
