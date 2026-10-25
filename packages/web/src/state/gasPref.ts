import { DEFAULT_GAS_PREF, isGasPref, type GasPref } from '@yieldcircle/core/model/destGas'

/** Destination gas preference (`core/model/destGas.ts`), kept per browser. */
const LS = 'yc.destGas'
export function loadGasPref(): GasPref {
  try {
    const p: unknown = JSON.parse(localStorage.getItem(LS) ?? 'null')
    if (isGasPref(p)) return p
  } catch { /* private mode / junk */ }
  return DEFAULT_GAS_PREF
}
export function saveGasPref(p: GasPref) { try { localStorage.setItem(LS, JSON.stringify(p)) } catch { /* private mode */ } }
