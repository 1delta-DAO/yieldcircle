/**
 * One profile, several wallets (docs/wallet-links.md, tickets/0021): the manage section — Pro's
 * `#/me` and Lite's You — and the group as every profile page shows it. Signed links only: each
 * row here was signed by both wallets, so nothing else (a curated grouping) may render as one.
 */
import React from 'react'
import { labelFor, shortAddr } from '@yieldcircle/core/identity/name'
import { normAddr } from '@yieldcircle/core/model/address'
import { SOCIAL_LINKS_READY } from '../social/api'
import type { AccountEntity } from '@yieldcircle/core/index/api'
import { useAccountEntity } from '@yieldcircle/app/index/queries'
import { useProfile, useSocialRefresh, useWalletLinks } from '../social/queries'
import type { Profile } from '../social/types'
import { useSocialWrite } from '../social/sign'
import { liteWalletHref, useApp, useRoute, walletHref } from '../state/AppState'
import { ChainMark } from './ChainMark'

const vmOf = (a: string) => (a.startsWith('0x') ? 'evm' : 'svm')
const mark = (a: string) => <ChainMark chainId={vmOf(a) === 'svm' ? 'solana' : '1'} size={15} />

/**
 * The manage section, for the connected wallet `account`: the group as rows with Unlink, and the
 * add flow — two signatures, the profile wallet's then the Solana wallet's, posted together. v1
 * links the ONE wallet the app holds beside wagmi's (the Solana one); a second EVM wallet needs
 * the account-switch flow (tickets/0021 step 3). When `account` is itself a member, adding from it
 * would be refused (no chains), so it says whose it is and offers only its own Unlink.
 */
export function LinkedWallets({ account }: { account: string }) {
  const me = normAddr(account) ?? account
  const links = useWalletLinks(me)
  const { signer, solSigner } = useApp()
  const { linkWallet, unlinkWallet } = useSocialWrite()
  const refresh = useSocialRefresh()
  const [busy, setBusy] = React.useState<string | null>(null)
  const [err, setErr] = React.useState<string | null>(null)
  const run = async (label: string, f: () => Promise<unknown>) => {
    setBusy(label); setErr(null)
    try { await f(); refresh.links() }
    catch (e) { const m = (e as Error).message; setErr(/rejected|denied/i.test(m) ? 'signature rejected' : m) }
    finally { setBusy(null) }
  }
  const primary = links.data?.primary ?? me
  const primaryProfile = useProfile(primary).data?.profile ?? null
  if (!SOCIAL_LINKS_READY) return null
  const members = links.data?.members ?? []
  const isPrimary = primary === me
  const primaryName = labelFor(primary, primaryProfile).label
  const unlink = (m: string) => run(m, () => unlinkWallet(m, primary))
  // only a wallet whose key is at hand can sign its half of an unlink
  const canSign = (a: string) => a === signer || a === solSigner
  const linkedAlready = !!solSigner && (members.some((m) => m.account === solSigner) || solSigner === primary)
  const foot = (
    <p className="foot" style={{ marginTop: 8 }}>
      Linking is public: it ties these wallets' histories together for everyone, and unlinking later
      does not undo what others saw. Two signatures — one from each wallet — and no gas.
    </p>
  )
  if (links.isLoading) return <p className="foot" style={{ marginTop: 0 }}>Reading your wallets…</p>
  if (!isPrimary) return (
    <>
      <p className="foot" style={{ marginTop: 0 }}>
        {shortAddr(me)} is one of <a href={walletHref(primary)}>{primaryName}</a>’s wallets. Add wallets from {shortAddr(primary)}, the profile’s own.
      </p>
      <div className="actions" style={{ marginTop: 10 }}>
        <button className="btn" disabled={!!busy} onClick={() => void unlink(me)}>{busy === me ? 'Signing…' : `Unlink ${shortAddr(me)}`}</button>
      </div>
      {err && <div className="err" style={{ marginTop: 8 }}>{err}</div>}
    </>
  )
  return (
    <>
      {members.length > 0 ? (
        <ul className="txlist" aria-label="Linked wallets">
          {members.map((m) => (
            <li key={m.account} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {mark(m.account)}
              <a className="mono" href={walletHref(m.account)}>{shortAddr(m.account)}</a>
              <span className="sp" />
              <button className="btn sm" disabled={!!busy || !(canSign(primary) || canSign(m.account))} onClick={() => void unlink(m.account)}>
                {busy === m.account ? 'Signing…' : 'Unlink'}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="foot" style={{ marginTop: 0 }}>No linked wallets yet.</p>
      )}
      {solSigner && !linkedAlready && isPrimary && vmOf(me) === 'evm' && (
        <div className="actions" style={{ marginTop: 10 }}>
          <button className="btn pri" disabled={!!busy} onClick={() => void run('add', () => linkWallet(solSigner))}>
            {busy === 'add' ? 'Signing…' : `Link ${shortAddr(solSigner)} (Solana)`}
          </button>
        </div>
      )}
      {vmOf(me) === 'svm'
        ? <p className="foot">Linking starts from an EVM profile today: connect your EVM wallet too and link this one from there.</p>
        : !solSigner && <p className="foot">Connect a Solana wallet in the wallet sheet, then link it here.</p>}
      {err && <div className="err" style={{ marginTop: 8 }}>{err}</div>}
      {foot}
    </>
  )
}

/**
 * The group on a profile page, Lite or Pro: every wallet of the profile as a chip, the open one
 * marked, and on a member's page whose it is. Nothing for an address with no links.
 */
export function ProfileWallets({ addr }: { addr: string }) {
  const lite = useRoute().shell === 'lite'
  const a = normAddr(addr) ?? addr
  const links = useWalletLinks(a).data
  const primary = links?.primary ?? a
  const p = useProfile(primary).data?.profile ?? null
  const entity = useAccountEntity(a.startsWith('0x') ? a : undefined).data ?? null
  const href = lite ? liteWalletHref : walletHref
  const signed = !!links?.members.length
  // the curated group (tickets/0021 step 4), only when there is more than this wallet in it
  const curated = entity && entity.addresses.length > 1 ? entity : null
  if (!signed && !curated) return null
  return (
    <>
      {curated && <CuratedWallets addr={a} e={curated} href={href} />}
      {signed && <SignedWallets a={a} primary={primary} p={p} members={links!.members.map((m) => m.account)} href={href} />}
    </>
  )
}

/**
 * The group YieldCircle made by hand from public evidence (the index's seed entities): named as
 * such, in words and in its own look, so it is never read as the wallets' own claim. Each chip
 * carries the evidence it was grouped on; the open wallet is marked.
 */
function CuratedWallets({ addr, e, href }: { addr: string; e: AccountEntity; href: (a: string) => string }) {
  const kind = e.kind === 'person' ? 'one person' : e.kind === 'exploiter' ? 'one exploit' : 'one desk'
  const all = e.addresses.map((x) => x.address.toLowerCase())
  const here = all.includes(addr)
  return (
    <div className={`pw curated${e.kind === 'exploiter' ? ' warn' : ''}`} aria-label="Wallets grouped by YieldCircle">
      <span className="pw-h t50">
        <b>{e.name}</b> · {all.length} wallets{here ? ', this one among them' : ''} · {kind}
        <span className="pill" title={`Grouped by YieldCircle from public evidence (name tags, on-chain flows) — each chip says its own. The wallets did not sign this; a signed link looks different and says so.${e.note ? `\n\n${e.note}` : ''}`}> grouped from evidence</span>
      </span>
      <span className="pw-c">
        {e.addresses.map((w) => {
          const x = w.address.toLowerCase()
          return (
            <a key={x} className="chip" href={href(x)} aria-current={x === addr ? 'page' : undefined} title={w.evidence ?? undefined}>
              {mark(x)}<span className="mono">{shortAddr(x)}</span>
            </a>
          )
        })}
      </span>
    </div>
  )
}

function SignedWallets({ a, primary, p, members, href }: { a: string; primary: string; p: Profile | null; members: string[]; href: (a: string) => string }) {
  const all = [primary, ...members]
  return (
    <div className="pw" aria-label="This profile's wallets">
      <span className="pw-h t50">
        {primary === a ? `${all.length} wallets, one profile` : <>One of <a href={href(primary)}>{labelFor(primary, p).label}</a>’s {all.length} wallets</>}
        <span title="Each wallet here signed the link, and so did the profile's own."> · each signed</span>
      </span>
      <span className="pw-c">
        {all.map((w) => (
          <a key={w} className="chip" href={href(w)} aria-current={w === a ? 'page' : undefined}>
            {mark(w)}<span className="mono">{shortAddr(w)}</span>{w === primary && <span className="c">profile</span>}
          </a>
        ))}
      </span>
    </div>
  )
}
