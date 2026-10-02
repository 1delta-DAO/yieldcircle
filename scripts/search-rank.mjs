/**
 * `src/search/rank.ts` is a copy of pos-indexer's `packages/position-store/src/search.ts`
 * (tickets/0053): the browser ranks the catalog exactly as `/find` ranks the rest.
 *
 *   pnpm search-rank            # does the copy match the source? (exit 1 if not)
 *   pnpm search-rank --write    # take the source, keep this repo's header
 *
 * The source is `../pos-indexer` unless POS_INDEXER points elsewhere.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const here = new URL('..', import.meta.url).pathname
const copy = join(here, 'src/search/rank.ts')
const source = join(process.env.POS_INDEXER ?? join(here, '../pos-indexer'), 'packages/position-store/src/search.ts')
const mine = readFileSync(copy, 'utf8')
const header = mine.slice(0, mine.indexOf('*/') + 3)
const theirs = readFileSync(source, 'utf8')
if (mine.slice(header.length) === theirs) {
  console.log('search-rank: in step with', source)
} else if (process.argv.includes('--write')) {
  writeFileSync(copy, header + theirs)
  console.log('search-rank: copied from', source)
} else {
  console.error('search-rank: src/search/rank.ts differs from', source, '— run `pnpm search-rank --write`')
  process.exit(1)
}
