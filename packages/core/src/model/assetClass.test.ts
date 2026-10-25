import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseAssetClassParam } from './assetClass'

/**
 * `assetClass.ts` is a verbatim copy of pos-indexer's classifier
 * (`pnpm asset-class` is the same check with a `--write`). Skipped when the
 * sibling repo is not on disk.
 */
// the repo root: packages/core/src/model → ../../../..; pos-indexer is its sibling
const here = new URL('../../../..', import.meta.url).pathname
const source = join(process.env.POS_INDEXER ?? join(here, '../pos-indexer'), 'packages/position-store/src/assetClass.ts')

describe('assetClass copy', () => {
  it.skipIf(!existsSync(source))('is byte-identical to pos-indexer', () => {
    expect(readFileSync(join(here, 'packages/core/src/model/assetClass.ts'), 'utf8')).toBe(readFileSync(source, 'utf8'))
  })
  it('reads the alias the lead chip sends', () => {
    expect(parseAssetClassParam('stocks')).toEqual(['stock', 'etf', 'pre-ipo'])
  })
})
