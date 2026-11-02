import { usdShort } from '../model/format'
import type { AuthorStake } from './types'

/** The reactions a thread offers, in the order both apps show them. */
export const REACTIONS: { kind: string; glyph: string; title: string; word: string }[] = [
  { kind: 'like', glyph: '♥', title: 'like', word: 'like' },
  { kind: 'agree', glyph: '✓', title: 'makes sense', word: 'agree' },
  { kind: 'risky', glyph: '⚠', title: 'looks risky', word: 'risky' },
]

/**
 * The author's skin in the game, read from the index at write time — not a claim, a balance —
 * as one line and its longer explanation. On a loop's thread only `legs: 2` (both legs of THIS
 * loop) says "in this loop"; the collateral alone is said as what it is. Null under a dollar.
 */
export function stakeLine(x: AuthorStake | null | undefined): { text: string; title: string } | null {
  if (!x || 'holder' in x) return null
  if (x.kind === 'loop' && x.legs === 2) {
    if (x.netUsd == null || x.collateralUsd == null || x.collateralUsd < 1) return null
    return { text: `in this loop · ${usdShort(x.netUsd)} net`, title: `in this loop when they wrote it: ${usdShort(x.collateralUsd)} collateral, ${usdShort(x.debtUsd)} owed` }
  }
  const v = x.amountUsd
  if (v == null || v < 1) return null
  return {
    text: `holds ${usdShort(v)}${x.kind === 'loop' ? ' of the collateral' : ''}`,
    title: x.kind === 'loop' ? 'what the author held in the collateral market when they wrote it, without the borrow that makes it this loop' : 'what the author held in this market when they wrote it',
  }
}
