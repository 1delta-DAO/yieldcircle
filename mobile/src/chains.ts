import React from 'react'
import { CHAINS } from '@yieldcircle/app/sdk/queries'

/**
 * Which chains the phone reads — the web's chain scope (`AppState` `chains`, the profile sheet's
 * Chains): empty is every chain. Kept on the device (the SQLite-backed localStorage) and read by the
 * session, so every shared hook narrows with it.
 */
const KEY = 'yieldcircle.chains'
const ALL = () => CHAINS.map((c) => c.id)
const read = (): string[] => {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as string[]).filter((c) => ALL().includes(c)) : []
  } catch { return [] }
}
let cur = read()
const subs = new Set<() => void>()
function set(next: string[]) {
  cur = next.length === CHAINS.length ? [] : next
  try { localStorage.setItem(KEY, JSON.stringify(cur)) } catch { /* the store is optional */ }
  subs.forEach((f) => f())
}

export function useChains() {
  const chains = React.useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f) } }, () => cur)
  return {
    chains,
    allChains: chains.length === 0,
    /** every chain in scope, resolved — never empty */
    chainIds: chains.length ? chains : ALL(),
    setChains: set,
    // in "All" no single chain is ticked, and ticking one narrows to it
    toggleChain: (c: string) => set(chains.includes(c) ? chains.filter((x) => x !== c) : [...chains, c]),
  }
}
