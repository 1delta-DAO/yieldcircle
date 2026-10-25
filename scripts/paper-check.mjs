/**
 * `src/model/paper.ts` is the SOURCE of the paper ledger (tickets/0006); pos-indexer applies every
 * signed paper op with a verbatim copy at `packages/social/src/paperModel.ts`, so the server's book
 * and the app's are one function.
 *
 *   pnpm paper-check            # is the copy in step with the source? (exit 1 if not)
 *   pnpm paper-check --write    # write the source over the copy
 *
 * The copy is `../pos-indexer` unless POS_INDEXER points elsewhere.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const here = new URL('..', import.meta.url).pathname
const source = join(here, 'packages/core/src/model/paper.ts')
const copy = join(process.env.POS_INDEXER ?? join(here, '../pos-indexer'), 'packages/social/src/paperModel.ts')
const mine = readFileSync(source, 'utf8')
let theirs = ''
try { theirs = readFileSync(copy, 'utf8') } catch { /* not there yet */ }
if (mine === theirs) {
  console.log('paper-check: in step with', copy)
} else if (process.argv.includes('--write')) {
  writeFileSync(copy, mine)
  console.log('paper-check: copied to', copy)
} else {
  console.error('paper-check:', copy, 'differs from src/model/paper.ts — run `pnpm paper-check --write`, then redeploy social')
  process.exit(1)
}
