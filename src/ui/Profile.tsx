/**
 * The profile editor: a name, a few words, and a character.
 *
 * Everything on this page becomes ONE signed `Profile` message. The character
 * rides in `avatarUrl` as a `yc1:` spec rather than a URL — nothing to upload,
 * nothing to host, nothing to moderate, and the EIP-712 type is untouched.
 * Or, for someone who already has a face elsewhere, the field carries a plain
 * picture URL instead — hosted by them, and never uploaded here.
 *
 * Earned layers are shown but marked: the client is not the gatekeeper, the
 * index is, and a character claiming something its wallet has not earned reads
 * as a claim rather than a badge everywhere it appears.
 */
import React from 'react'
import { useAccount } from 'wagmi'
import { ACCESSORIES, BACKDROPS, CREATURES, Character, EYES, GATED, LAYERS, MOUTHS, PALETTES, MAX_PICTURE_URL, formatSpec, parseSpec, pictureUrl, specOf, unearned, type Spec } from '../identity/character'
import { autoName, shortAddr } from '../identity/name'
import { useProfile, useSocialRefresh } from '../social/queries'
import { useSocialWrite } from '../social/sign'
import { XLink } from './XLink'
import { Badges } from './social-bits'

const COUNTS: Record<keyof Spec, number> = { b: BACKDROPS.length, c: CREATURES.length, e: EYES.length, m: MOUTHS.length, a: ACCESSORIES.length, p: PALETTES.length }

export function ProfilePage() {
  const { address } = useAccount()
  const addr = address?.toLowerCase()
  const p = useProfile(addr)
  const saved = p.data?.profile ?? null
  const { profile: write } = useSocialWrite()
  const refresh = useSocialRefresh()

  const [spec, setSpec] = React.useState<Spec | null>(null)
  const [mode, setMode] = React.useState<'character' | 'picture'>('character')
  const [pic, setPic] = React.useState('')
  const [handle, setHandle] = React.useState('')
  const [displayName, setDisplayName] = React.useState('')
  const [bio, setBio] = React.useState('')
  const [tags, setTags] = React.useState('')
  const [unlisted, setUnlisted] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [err, setErr] = React.useState<string | null>(null)
  const [ok, setOk] = React.useState(false)

  // load once the server has answered; a field the user has touched is never overwritten
  const loaded = React.useRef(false)
  React.useEffect(() => {
    if (loaded.current || !p.data || !addr) return
    loaded.current = true
    setSpec(parseSpec(saved?.avatarUrl) ?? specOf(addr))
    if (pictureUrl(saved?.avatarUrl)) { setMode('picture'); setPic(saved!.avatarUrl!) }
    setHandle(saved?.handle ?? '')
    setDisplayName(saved?.displayName ?? '')
    setBio(saved?.bio ?? '')
    setTags((saved?.tags ?? []).join(', '))
    setUnlisted(saved?.visibility === 'unlisted')
  }, [p.data, addr, saved])

  if (!addr) return <div className="note">Connect a wallet to make a profile. The wallet <b>is</b> the account — there is nothing else to sign up for.</div>
  const s = spec ?? specOf(addr)
  const earned = saved?.systemTags ?? []
  const claims = unearned(s, earned)
  const picOk = pictureUrl(pic) != null

  const save = async () => {
    if (mode === 'picture' && !picOk) { setErr('the picture needs an https:// or ipfs:// link'); return }
    setBusy(true); setErr(null); setOk(false)
    try {
      await write({
        handle: handle.trim().toLowerCase(),
        displayName: displayName.trim(),
        bio: bio.trim(),
        avatarUrl: mode === 'picture' ? pic.trim() : formatSpec(s),
        tags: tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 5),
        visibility: unlisted ? 'unlisted' : 'public',
      })
      refresh.profile(addr); setOk(true)
    } catch (e) {
      const msg = (e as Error).message
      setErr(/rejected|denied/i.test(msg) ? 'signature rejected' : msg)
    } finally { setBusy(false) }
  }

  return (
    <>
      <a className="crumb" href={`#/w/${addr}`}>‹ My page</a>
      <div className="pedit">
        <section className="card pad">
          <div className="sec-h"><h2>Face</h2><span className="sub">{mode === 'character' ? 'drawn from six layers, free, and the same in every client' : 'any image you host, loaded from its link'}</span></div>
          <div className="seg pmode" role="group" aria-label="Face kind">
            <button aria-pressed={mode === 'character'} onClick={() => setMode('character')}>Character</button>
            <button aria-pressed={mode === 'picture'} onClick={() => setMode('picture')}>Picture</button>
          </div>
          {mode === 'character' ? (
            <>
              <div className="pchar">
                <Character addr={addr} spec={s} size={112} />
                <div className="pchar-a">
                  <button className="btn sm" onClick={() => setSpec(roll(earned))}>Surprise me</button>
                  <button className="btn sm ghost" onClick={() => setSpec(specOf(addr))}>Back to default</button>
                  <span className="foot mono">{formatSpec(s)}</span>
                </div>
              </div>
              <div className="players">
                {LAYERS.map((l) => (
                  <Picker key={l.key} label={l.label} names={l.names} value={s[l.key]} earned={earned} layer={l.key}
                    onPick={(i) => setSpec({ ...s, [l.key]: i })} />
                ))}
              </div>
              {claims.length > 0 && (
                <p className="foot warn">This character claims {claims.map((g) => g.why).join(' and ')}. Anyone can draw it, but until the index confirms it your profile is shown with a mark. {earned.length === 0 && 'No badges have been minted for this wallet yet.'}</p>
              )}
            </>
          ) : (
            <>
              <div className="pchar">
                <Character addr={addr} avatarUrl={picOk ? pic : null} size={112} />
                <div className="pchar-a">
                  <span className="foot">{picOk ? 'If the link stops working, your character is shown instead.' : 'Until the link works, your character is shown.'}</span>
                </div>
              </div>
              <label className="field"><span className="lbl">Picture link</span>
                <div className="amt sm"><input value={pic} onChange={(e) => setPic(e.target.value)} maxLength={MAX_PICTURE_URL} placeholder="https://… or ipfs://…" spellCheck={false} /></div>
                <span className="foot">Nothing is uploaded: the link is signed into your profile and every viewer loads the image from its host, which can see their IP. Square images look best.</span>
              </label>
            </>
          )}
          {earned.length > 0 && <div className="wc-tags"><span className="lbl">Earned</span> <Badges tags={earned} max={8} /></div>}
        </section>

        <section className="card pad">
          <div className="sec-h"><h2>Name</h2><span className="sub">without one you are “{autoName(addr)}”</span></div>
          <label className="field"><span className="lbl">Handle</span>
            <div className="amt sm"><span className="u">@</span><input value={handle} onChange={(e) => setHandle(e.target.value.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase())} placeholder="3–20 chars, a–z 0–9 _" maxLength={20} /></div>
            <span className="foot">Taken handles and other wallets’ ENS names are refused by the server.</span>
          </label>
          <label className="field"><span className="lbl">Display name</span>
            <div className="amt sm"><input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={40} placeholder={autoName(addr)} /></div>
          </label>
          <label className="field"><span className="lbl">Bio</span>
            <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={280} rows={3} placeholder="What you are doing with your money, in one line." />
          </label>
          <label className="field"><span className="lbl">Tags</span>
            <div className="amt sm"><input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="stables, delta-neutral, long-only" /></div>
            <span className="foot">Up to five, self-declared — they are shown apart from the earned ones.</span>
          </label>
          <label className="check"><input type="checkbox" checked={unlisted} onChange={(e) => setUnlisted(e.target.checked)} /> <span>Unlisted — keep me off the board and out of discovery. <span className="t40">The chain stays public either way; this is about appearing as a person.</span></span></label>
          <div className="actions">
            <button className="btn pri wide" disabled={busy} onClick={() => void save()}>{busy ? 'Signing…' : 'Sign and save'}</button>
          </div>
          {err && <div className="err">{err}</div>}
          {ok && <p className="foot ok">Saved. One signature, stored with it, re-checkable by anyone.</p>}
          <p className="foot">{shortAddr(addr)} signs this. There is no password and no session to lose.</p>
        </section>

        <section className="card pad">
          <div className="sec-h"><h2>X</h2><span className="sub">optional, and revocable from either side</span></div>
          <XLink account={addr} linked={saved?.xHandle ?? null} />
        </section>
      </div>
    </>
  )
}

function Picker({ label, names, value, onPick, layer, earned }: {
  label: string; names: string[]; value: number; layer: keyof Spec; earned: string[]
  onPick: (i: number) => void
}) {
  const gateOf = (i: number) => GATED.find((g) => g.layer === layer && g.index === i)
  return (
    <div className="player">
      <div className="pl-h"><span className="lbl">{label}</span><span className="t40 mono">{names[value]}</span></div>
      <div className="pl-row">
        <button className="nudge" onClick={() => onPick((value - 1 + COUNTS[layer]) % COUNTS[layer])} aria-label={`previous ${label}`}>‹</button>
        <div className="pl-opts">
          {names.map((n, i) => {
            const g = gateOf(i)
            const locked = g && !earned.includes(g.tag)
            return <button key={n + i} className={`pl-o${i === value ? ' on' : ''}${locked ? ' locked' : ''}`} aria-pressed={i === value}
              title={g ? `${n} — earned: ${g.why}` : n} onClick={() => onPick(i)}>{n}{locked && <i className="lock">•</i>}</button>
          })}
        </div>
        <button className="nudge" onClick={() => onPick((value + 1) % COUNTS[layer])} aria-label={`next ${label}`}>›</button>
      </div>
    </div>
  )
}

/** A random character that claims nothing the wallet has not earned. */
function roll(earned: string[]): Spec {
  const pick = (k: keyof Spec) => {
    const allowed = [...Array(COUNTS[k]).keys()].filter((i) => {
      const g = GATED.find((x) => x.layer === k && x.index === i)
      return !g || earned.includes(g.tag)
    })
    return allowed[Math.floor(Math.random() * allowed.length)]
  }
  return { b: pick('b'), c: pick('c'), e: pick('e'), m: pick('m'), a: pick('a'), p: pick('p') }
}
