/**
 * What an asset is and who stands behind it, put together for an asset page or a ticket
 * (docs/assets.md). It draws on three sources: the asset's note (`assetNotes.ts`, written in
 * token-lists), the issuer's profile (`data/issuers.json`, written here: legal entity, structure,
 * country, links), and, for a strategy, the parts it is made of: what it holds, what it borrows and
 * how it earns. Everything here is pure. The notes are passed in because the apps lazy-load them.
 */
import ISSUERS from '../data/issuers.json'
import { noteOf, type AssetNote } from './assetNotes'
import { canonGroup } from './assetGroup'
import { mechanismDetail, mechanismOfGroup, mechanismSubjectOfGroup, MECHANISM_WORDS, type Mechanism } from './mechanism'
import { mechanismDetailOf } from './lite'
import { isSavings } from './nature'
import { pct, usdShort } from './format'
import type { Strategy } from './strategies'

export interface Link { label: string; url: string }
/** One line of a card: `Country · Cayman Islands`. `icon` names the mark the apps draw beside it. */
export interface Fact { k: string; v: string; icon: 'entity' | 'structure' | 'country' | 'platform' | 'regulator' | 'backing' | 'yield' | 'exit' | 'kind' }

/**
 * An issuer's company details, keyed by token-lists' issuer id (`props.issuer.id`: `hastra`,
 * `circle`, `ethena`). Write only what a source states, and name that source in `source`.
 */
export interface IssuerProfile {
  name: string
  /** other spellings a note's free-text `issuer` uses (`Sky (formerly MakerDAO)` → `MakerDAO`) */
  aliases?: string[]
  entity?: string
  structure?: string
  country?: string
  /** the platform or product family the asset is issued through */
  platform?: string
  regulator?: string
  /** a sentence or two: who they are and how the money moves */
  about?: string
  links?: Link[]
  /** ISO day the facts were last checked */
  checked?: string
  source?: string
}

/** The issuer as a card: a profile where one is written, else the name alone (`profiled` false). */
export interface IssuerCard {
  id?: string
  name: string
  /** under the name: `Signum Ltd. · Cayman Islands company limited by shares`, or the note's own words */
  sub?: string
  about?: string
  facts: Fact[]
  links: Link[]
  checked?: string
  profiled: boolean
}

export interface IssuerRef { id?: string | null; name?: string | null; kind?: string | null }

const PROFILES = ISSUERS as Record<string, IssuerProfile>
/** How a group earns: its note's word where the note says, else the build's table (`mechanisms.json`). */
const mechanismIn = (notes: Record<string, AssetNote> | undefined, group: string, symbol?: string): Mechanism | undefined => {
  const m = noteOf(notes, group, symbol)?.mechanism
  return m && m in MECHANISM_WORDS ? (m as Mechanism) : mechanismOfGroup(group)
}
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
/** A note's free-text issuer cut down to the name: `Hastra / Figure (YLDS)` → `Hastra`. */
export const issuerNameOf = (raw: string) => raw.split(/\s+\/\s+|\s*\(/)[0].trim()

/** The written profile for an issuer: by id, else by name or an alias. */
export function issuerProfile(ref: IssuerRef): { id: string; p: IssuerProfile } | undefined {
  if (ref.id && PROFILES[ref.id]) return { id: ref.id, p: PROFILES[ref.id] }
  const n = ref.name ? norm(issuerNameOf(ref.name)) : ''
  if (!n) return undefined
  for (const [id, p] of Object.entries(PROFILES)) if (norm(id) === n || norm(p.name) === n || p.aliases?.some((a) => norm(a) === n)) return { id, p }
  return undefined
}

const KIND_WORD: Record<string, string> = { protocol: 'Protocol, run on-chain', institution: 'Company with a redemption desk', cex: 'Exchange' }

export function issuerCard(ref: IssuerRef): IssuerCard | null {
  const hit = issuerProfile(ref)
  if (!hit) {
    const raw = ref.name?.trim()
    if (!raw) return null
    const name = issuerNameOf(raw)
    const kind = ref.kind ? KIND_WORD[ref.kind] : undefined
    return { id: ref.id ?? undefined, name, sub: raw !== name ? raw : undefined, facts: kind ? [{ k: 'Kind', v: kind, icon: 'kind' }] : [], links: [], profiled: false }
  }
  const { id, p } = hit
  const facts: Fact[] = []
  const add = (k: string, v: string | undefined, icon: Fact['icon']) => { if (v) facts.push({ k, v, icon }) }
  add('Legal entity', p.entity, 'entity')
  add('Legal structure', p.structure, 'structure')
  add('Country', p.country, 'country')
  add('Regulated by', p.regulator, 'regulator')
  add('Platform', p.platform, 'platform')
  return { id, name: p.name, sub: [p.entity, p.structure].filter(Boolean).join(' · ') || undefined, about: p.about, facts, links: p.links ?? [], checked: p.checked, profiled: true }
}

// ---------------------------------------------------------------- links

const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, '') } catch { return u } }
const RESERVES = /proof[-_ ]?of[-_ ]?reserves?|transparen|attestation|\breserves?\b/i
/**
 * A link's words: a reserves page says so; otherwise the host, or, where two links share a host,
 * the page (`what is auto` rather than help.hastra.io twice).
 */
export function linkLabel(u: string, all: string[] = [u]): string {
  if (RESERVES.test(u)) return 'Transparency and proof of reserves'
  const host = hostOf(u)
  if (all.filter((x) => hostOf(x) === host).length < 2) return host
  try {
    const tail = new URL(u).pathname.split('/').filter(Boolean).pop() ?? ''
    return decodeURIComponent(tail).replace(/\.(md|html?)$/, '').replace(/[-_()]+/g, ' ').trim() || host
  } catch { return host }
}
export const linksOf = (urls: string[] | undefined): Link[] => (urls ?? []).map((u, _, all) => ({ label: linkLabel(u, all), url: u }))

// ---------------------------------------------------------------- an asset

export interface AssetFacts {
  group: string
  symbol: string
  /** one line */
  what?: string
  /** a few sentences, where someone has written them */
  body?: string
  /** Backed by, Yield comes from, Way out */
  facts: Fact[]
  /** something is off (price, contract, identity) */
  caveat?: string
  links: Link[]
  checked?: string
  confidence?: AssetNote['confidence']
  issuer: IssuerCard | null
  /** how it earns, where token-lists names a mechanism for it */
  earns?: { id: Mechanism; name: string; how: string; risk: string }
}

/**
 * One asset: its note, its issuer and how it earns. `issuer` is what the caller knows of it (the
 * index's `issuer` / `issuerName`, a strategy's desk id); the note's free-text issuer fills the gaps.
 */
export function assetFacts(notes: Record<string, AssetNote> | undefined, group: string, symbol: string, issuer: IssuerRef = {}): AssetFacts {
  const n = noteOf(notes, group, symbol)
  const facts: Fact[] = []
  if (n?.backing) facts.push({ k: 'Backed by', v: n.backing, icon: 'backing' })
  // null is a statement (it earns nothing itself), undefined is nobody having said
  if (n?.yieldSource) facts.push({ k: 'Yield comes from', v: n.yieldSource, icon: 'yield' })
  else if (n?.yieldSource === null && n.source === 'curated') facts.push({ k: 'Yield comes from', v: 'nothing: it earns nothing itself', icon: 'yield' })
  if (n?.redemption) facts.push({ k: 'Way out', v: n.redemption, icon: 'exit' })
  const card = issuerCard({ id: issuer.id, name: issuer.name ?? n?.issuer, kind: issuer.kind })
  // a card that is only a name: the note's longer words say more (`Hastra (incubated by Figure …)`)
  if (card && !card.profiled && n?.issuer && n.issuer !== card.name) card.sub = n.issuer
  const own = linksOf(n?.links)
  const m = mechanismIn(notes, group, symbol)
  return {
    group: canonGroup(group), symbol, what: n?.what, body: n?.body, facts, caveat: n?.verify,
    // the issuer's card carries its own links: not twice
    links: own.filter((l) => !card?.links.some((c) => c.url === l.url)),
    checked: n?.updated, confidence: n?.confidence, issuer: card,
    earns: m ? { id: m, ...mechanismDetail(m, mechanismSubjectOfGroup(group)) } : undefined,
  }
}

// ---------------------------------------------------------------- a strategy

/**
 * One part of a strategy, as a section of its ticket: an asset it holds or borrows (with that
 * asset's facts and issuer, and its page), or how it works. `lines` are the strategy's own words
 * about that part.
 */
export interface AboutPart {
  role: 'holds' | 'deposit' | 'borrows' | 'how'
  title: string
  group?: string
  symbol?: string
  logo?: string
  facts?: AssetFacts
  lines: string[]
}

/**
 * The asset-strategy section: the collateral (or the deposit) as an asset, with its issuer and
 * yield; for a loop, the money it borrows and what that costs; then how the whole thing earns.
 */
export function strategyAbout(s: Strategy, notes: Record<string, AssetNote> | undefined): AboutPart[] {
  const parts: AboutPart[] = []
  // the row's own reading, else the note of what it holds
  const m0 = !mechanismDetailOf(s) && s.assetGroup ? mechanismIn(notes, s.assetGroup) : undefined
  const how: { name: string; how: string; risk: string; shape?: string } | null = mechanismDetailOf(s) ?? (m0 ? mechanismDetail(m0, mechanismSubjectOfGroup(s.assetGroup)) : null)
  if (s.kind === 'loop') {
    parts.push({ role: 'holds', title: `What you hold · ${s.holds}`, group: s.assetGroup, symbol: s.holds, logo: s.logoLong,
      facts: s.assetGroup ? assetFacts(notes, s.assetGroup, s.holds, { id: s.desk }) : undefined,
      lines: [`Put up as collateral on ${s.venue.split(' · ')[0]}; you earn its rate on all of it, the borrowed part included.`] })
    const borrows = [`You pay about ${pct(s.borSpot)} a year on what is borrowed${s.terms ? ', fixed for the term you pick' : ', and the rate moves with demand'}.`]
    borrows.push(s.desk && isSavings(s.nature)
      ? `A dollar debt against a dollar: ${s.debt} is a rate you pay, not a price you hold. Only ${s.holds} losing its peg can bring liquidation near.`
      : `You owe ${s.debt} and hold ${s.holds}, whose price moves on its own: leverage multiplies that move as well as the rate.`)
    if (s.borrowLiquidityUsd > 0) borrows.push(`${usdShort(s.borrowLiquidityUsd)} is free to borrow in the market now.`)
    parts.push({ role: 'borrows', title: `What you borrow · ${s.debt}`, group: s.debtGroup, symbol: s.debt, logo: s.logoShort,
      facts: s.debtGroup ? assetFacts(notes, s.debtGroup, s.debt) : undefined, lines: borrows })
  } else {
    // a vault or a PT leaves you holding its own token: that token first, then what goes into it
    const share = !!s.shareGroup && canonGroup(s.shareGroup) !== canonGroup(s.assetGroup ?? '')
    if (share) parts.push({ role: 'holds', title: `What you hold · ${s.holds}`, group: s.shareGroup, symbol: s.holds, logo: s.shareLogo ?? s.logo,
      facts: assetFacts(notes, s.shareGroup!, s.holds, { id: s.desk }), lines: [`What ${s.via} hands you for the deposit; it grows with what the deposit earns.`] })
    const dep = s.assetGroup ? assetFacts(notes, s.assetGroup, s.assetSymbol, share ? {} : { id: s.desk }) : undefined
    if (!share || dep?.what) parts.push({ role: 'deposit', title: `What you put in · ${s.assetSymbol}`, group: s.assetGroup, symbol: s.assetSymbol, logo: s.tokenLogo,
      facts: dep, lines: share ? [] : [`Deposited on ${s.via}.`] })
  }
  if (how) parts.push({ role: 'how', title: `How it earns · ${how.name}`, lines: [how.how, ...(how.shape ? [how.shape] : []), how.risk] })
  return parts
}

// ---------------------------------------------------------------- similar assets

export interface SimilarAsset {
  group: string
  symbol: string
  logo?: string
  /** whose it is, in a word */
  issuer?: string
  /** the largest market the catalogue lists for it: a floor on its size, never its supply */
  largestUsd: number
  mechanism: Mechanism
  word: string
}

/**
 * Assets that earn the same way (token-lists' `mechanism`), from the strategies the app already
 * holds: same money first, then the largest. Empty where the asset has no mechanism.
 */
export function similarAssets(group: string, strategies: Strategy[], notes: Record<string, AssetNote> | undefined, max = 6): SimilarAsset[] {
  const own = canonGroup(group)
  const m = mechanismIn(notes, own)
  if (!m) return []
  const money = strategies.find((s) => s.assetGroup && canonGroup(s.assetGroup) === own)?.group
  const by = new Map<string, SimilarAsset & { money: string }>()
  const see = (g: string | undefined, symbol: string, logo: string | undefined, usd: number, money: string) => {
    if (!g) return
    const k = canonGroup(g)
    if (k === own || mechanismIn(notes, k) !== m) return
    const x = by.get(k)
    if (x) { if (usd > x.largestUsd) x.largestUsd = usd; x.logo ??= logo; return }
    const iss = noteOf(notes, k, symbol)?.issuer
    by.set(k, { group: k, symbol, logo, issuer: iss ? issuerNameOf(iss) : undefined, largestUsd: usd, mechanism: m, word: MECHANISM_WORDS[m].word, money })
  }
  for (const s of strategies) {
    if (s.kind === 'loop') see(s.assetGroup, s.holds, s.logoLong, s.tvlUsd, s.group)
    else {
      see(s.assetGroup, s.assetSymbol, s.tokenLogo, s.tvlUsd, s.group)
      see(s.shareGroup, s.holds, s.shareLogo ?? s.logo, s.tvlUsd, s.group)
    }
  }
  return [...by.values()]
    .sort((a, b) => Number(b.money === money) - Number(a.money === money) || b.largestUsd - a.largestUsd)
    .slice(0, max)
    .map(({ money: _, ...x }) => x)
}
