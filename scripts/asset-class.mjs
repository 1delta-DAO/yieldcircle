/**
 * `src/model/assetClass.ts` is a VERBATIM copy of pos-indexer's
 * `packages/position-store/src/assetClass.ts` (the asset-class filter's
 * classifier: classes, aliases, match modes, the param parsers): the chips
 * here offer exactly the words both indexes accept.
 *
 *   pnpm asset-class            # does the copy match the source? (exit 1 if not)
 *   pnpm asset-class --write    # take the source over the copy
 *
 * The source is `../pos-indexer` unless POS_INDEXER points elsewhere; when it
 * is not on disk the check is skipped (exit 0), as a CI box without the
 * sibling repo has nothing to compare against.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const here = new URL('..', import.meta.url).pathname
const copy = join(here, 'packages/web/src/model/assetClass.ts')
const source = join(process.env.POS_INDEXER ?? join(here, '../pos-indexer'), 'packages/position-store/src/assetClass.ts')
if (!existsSync(source)) {
  console.log('asset-class: no source at', source, '— skipped')
  process.exit(0)
}
const mine = readFileSync(copy, 'utf8')
const theirs = readFileSync(source, 'utf8')
if (mine === theirs) {
  console.log('asset-class: in step with', source)
} else if (process.argv.includes('--write')) {
  writeFileSync(copy, theirs)
  console.log('asset-class: copied from', source)
} else {
  console.error('asset-class: src/model/assetClass.ts differs from', source, '— run `pnpm asset-class --write`')
  process.exit(1)
}
