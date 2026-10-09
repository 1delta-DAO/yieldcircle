// The landing's Worker, bundled into its Pages output as `_worker.js` (Pages "advanced mode": the
// repo's `functions/` — the app's gate — is ignored for this project). `_routes.json` sends only
// `/gate/*` to it; every other request is a static file and never costs a Worker invocation.
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

const root = fileURLToPath(new URL('.', import.meta.url))
const out = fileURLToPath(new URL('../dist-landing/', import.meta.url))
await build({
  configFile: false,
  root,
  logLevel: 'warn',
  ssr: { target: 'webworker', noExternal: true },
  build: { ssr: 'worker.ts', outDir: out, emptyOutDir: false, target: 'es2022', minify: true, rollupOptions: { output: { entryFileNames: '_worker.js', format: 'es' } } },
})
writeFileSync(out + '_routes.json', JSON.stringify({ version: 1, include: ['/gate/*'], exclude: [] }, null, 2) + '\n')
console.log('dist-landing/_worker.js and _routes.json written')
