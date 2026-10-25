#!/usr/bin/env node
/**
 * The phone app, with the repo's ONE `.env` (docs/mobile.md).
 *
 * Expo only exposes `EXPO_PUBLIC_*` to the app; the web names the same values `VITE_*`. This reads
 * the root `.env`, hands every `VITE_X` to Expo as `EXPO_PUBLIC_X` and runs the step — so a key
 * lives in one place and there is no `mobile/.env` to keep in step. Only `VITE_*` crosses over:
 * whatever else `.env` holds (FAL_KEY …) is a secret and never reaches a bundle. `EXPO_PUBLIC_*`
 * already in the shell wins over `.env`.
 *
 *   pnpm mobile [--tunnel]          Metro for the dev build on your phone (the everyday step); flags go to
 *                                   `expo start` — `--tunnel` when the phone cannot reach this machine on the LAN
 *   pnpm mobile setup [android|ios] first time: EAS login + project, build the dev client, start Metro
 *   pnpm mobile build [android|ios] (re)build the dev client on EAS — after a native change
 *   pnpm mobile device              register an iPhone for iOS dev builds (once per phone, then rebuild)
 *   pnpm mobile go [--tunnel]       try it in Expo Go instead: no build, no Apple account; wallets connect
 *                                   but do not hand back (Expo Go is not `yieldcircle://`) and none is detected
 *   pnpm mobile run [android|ios]   build + install the dev client locally (Android SDK / Xcode)
 *   pnpm mobile bundle              bundle both platforms, no device (the CI-style check)
 *   pnpm mobile env                 what the app would get (values masked)
 *   pnpm mobile env:push            copy the values to EAS, for preview/production builds
 *
 * A dev build carries native code only; its JS — and so the keys — comes from Metro on this
 * machine. Preview and production builds embed the JS on EAS's servers, which never see this
 * `.env`: `env:push` puts the same values there.
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseEnv } from 'node:util'

const ROOT = join(import.meta.dirname, '..')
const MOBILE = join(ROOT, 'mobile')
const EAS = ['--yes', 'eas-cli']

/** `.env`'s `VITE_X` as `EXPO_PUBLIC_X`; nothing else. */
function publicEnv() {
  const file = join(ROOT, '.env')
  const raw = existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {}
  const out = {}
  for (const [k, v] of Object.entries(raw)) if (k.startsWith('VITE_') && v) out[`EXPO_PUBLIC_${k.slice(5)}`] = v
  for (const [k, v] of Object.entries(process.env)) if (k.startsWith('EXPO_PUBLIC_') && v) out[k] = v
  return out
}

const mask = (v) => (v.length <= 8 ? '•'.repeat(v.length) : `${v.slice(0, 4)}…${v.slice(-4)}`)

/** Run in mobile/ with the mapped environment; exit on failure. */
function run(cmd, args, { env = {}, allowFail = false } = {}) {
  console.log(`\n› ${cmd} ${args.join(' ')}`)
  const r = spawnSync(cmd, args, { cwd: MOBILE, stdio: 'inherit', env: { ...process.env, ...env } })
  if (r.status !== 0 && !allowFail) process.exit(r.status ?? 1)
  return r.status === 0
}

/**
 * Metro, with the first bundle built before the phone asks. A cold bundle takes Metro longer than
 * the Expo tunnel waits, so the phone's first load through `--tunnel` ended in "gateway timeout";
 * here the script asks Metro for the iOS and Android bundles itself as soon as it is up, so the
 * phone's request finds them cached — and on the LAN the first load is no longer slow either.
 */
function serve(args, env) {
  console.log(`\n› npx expo start ${args.join(' ')}`)
  const child = spawn('npx', ['expo', 'start', ...args], { cwd: MOBILE, stdio: 'inherit', env: { ...process.env, ...env } })
  child.on('exit', (code) => process.exit(code ?? 0))
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig))
  const i = args.indexOf('--port')
  warm(i >= 0 ? Number(args[i + 1]) : 8081)
}

async function warm(port) {
  const base = `http://localhost:${port}`
  for (let t = 0; t < 180; t++) {
    const up = await fetch(`${base}/status`).then((r) => r.text()).catch(() => '')
    if (up.includes('running')) break
    await new Promise((r) => setTimeout(r, 1000))
  }
  for (const platform of ['ios', 'android']) {
    const t0 = Date.now()
    try {
      const m = await fetch(base, { headers: { 'expo-platform': platform, accept: 'application/expo+json,application/json' } }).then((r) => r.json())
      // the manifest names the bundle on the address the phone uses (the tunnel or the LAN); ask Metro directly
      const u = new URL(m.launchAsset.url)
      await fetch(`${base}${u.pathname}${u.search}`).then((r) => r.arrayBuffer())
      console.log(`\n› ${platform} bundle ready (${Math.round((Date.now() - t0) / 1000)} s) — open it on the phone now`)
      // the tunnel's address is new on every start: Expo Go's "recently opened" entries from an earlier
      // run point at a dead tunnel and answer "gateway timeout" — always open this one
      // a tunnel answers on https only: `exps://` (Expo Go's https); `exp://` goes out as plain http
      // and, from an iPhone, failed with "gateway timeout" although Safari reached the same host
      const lan = /^\d+\.\d+\.\d+\.\d+(:\d+)?$|^localhost/.test(u.host)
      if (platform === 'ios') console.log(`› address for this run: ${lan ? 'exp' : 'exps'}://${u.host}   (Expo Go → "Enter URL manually"; older entries in its history are dead)`)
    } catch (e) {
      console.log(`\n› could not pre-build the ${platform} bundle (${e.message}); the phone's first load builds it instead`)
    }
  }
}

const quiet = (cmd, args) => spawnSync(cmd, args, { cwd: MOBILE, encoding: 'utf8' })

function platformArg(v) {
  const p = v ?? 'android'
  if (p !== 'android' && p !== 'ios') { console.error(`platform is android or ios, not "${p}"`); process.exit(1) }
  return p
}

function requireWalletConnect(env) {
  if (env.EXPO_PUBLIC_WC_PROJECT_ID) return
  console.error('VITE_WC_PROJECT_ID is not set in the root .env — the app would start, but no wallet can connect.')
  process.exit(1)
}

/** EAS login (interactive when needed) and the EAS project id in app.json (`eas init` writes it once). */
function easReady() {
  if (quiet('npx', [...EAS, 'whoami']).status !== 0) run('npx', [...EAS, 'login'])
  const app = JSON.parse(readFileSync(join(MOBILE, 'app.json'), 'utf8'))
  if (!app.expo?.extra?.eas?.projectId) run('npx', [...EAS, 'init'])
}

// `pnpm mobile --tunnel` is `start --tunnel`
const argv = process.argv.slice(2)
const [cmd, ...rest] = !argv.length || argv[0].startsWith('-') ? ['start', ...argv] : argv
const arg = rest[0]
const env = publicEnv()

switch (cmd) {
  case 'start':
    requireWalletConnect(env)
    serve(['--dev-client', ...rest], env)
    break

  case 'setup': {
    requireWalletConnect(env)
    const p = platformArg(arg)
    easReady()
    if (p === 'ios') console.log('\niOS: the dev build installs only on phones registered BEFORE it is built — `pnpm mobile device` first if this one is new.')
    // the dev client needs no keys (its JS comes from Metro), so the cloud build gets none
    run('npx', [...EAS, 'build', '--profile', 'development', '--platform', p])
    console.log('\nInstall the build from the link above (or the QR code), then open it: Metro starts now.')
    serve(['--dev-client'], env)
    break
  }

  case 'build':
    easReady()
    run('npx', [...EAS, 'build', '--profile', 'development', '--platform', platformArg(arg)])
    break

  case 'go':
    requireWalletConnect(env)
    // the QR opens a chooser page (the project has expo-dev-client); its "Development Build" button
    // asks this Expo Go server for a dev-client link it cannot make: an empty 404, which Safari saves as a file
    console.log('\nExpo Go: scan the QR code with the iPhone camera and tap "Expo Go" on the page that opens (not "Development Build"),')
    console.log('or in Expo Go: "Enter URL manually" → the exp:// address below. After approving in the wallet, switch back by hand.')
    serve(['--go', ...rest], env)
    break

  case 'device':
    easReady()
    // prints a link / QR code: open it on the iPhone and install the profile it offers
    run('npx', [...EAS, 'device:create'])
    console.log('\nRegistered phones get into the NEXT build: `pnpm mobile build ios`.')
    break

  case 'run':
    requireWalletConnect(env)
    run('npx', ['expo', `run:${platformArg(arg)}`], { env })
    break

  case 'bundle':
    run('npx', ['expo', 'export', '--platform', 'ios', '--platform', 'android', '--output-dir', 'dist'], { env })
    break

  case 'env':
    if (!Object.keys(env).length) console.log('nothing: no VITE_* in the root .env')
    for (const [k, v] of Object.entries(env)) console.log(`${k}=${mask(v)}`)
    break

  case 'env:push':
    easReady()
    for (const [k, v] of Object.entries(env)) {
      // plaintext, not secret: EXPO_PUBLIC_* ships inside the app anyway
      run('npx', [...EAS, 'env:create', '--name', k, '--value', v, '--environment', 'preview', '--environment', 'production', '--visibility', 'plaintext', '--force', '--non-interactive'])
    }
    break

  default:
    console.error(`unknown command "${cmd}" — start | setup | build | device | go | run | bundle | env | env:push`)
    process.exit(1)
}
