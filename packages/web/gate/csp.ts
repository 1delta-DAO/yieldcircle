/**
 * The app's Content-Security-Policy (security review #15), sent by `functions/_middleware.ts` on
 * the HTML document — the only response a CSP applies to. Not in `public/_headers`: `connect-src`
 * is every RPC in `core/src/data/rpcs.json` and Pages caps a header there at 2,000 characters.
 * The gate's inline scripts and its one inline handler are allowed by hash, computed from the same
 * `overlay()` the middleware injects, so editing the overlay cannot drift from the policy.
 *
 * Shipped as `Report-Only` until a few days of real sessions show nothing it would block — the
 * wallet connectors are the easy ones to miss (tickets/0022 phase 4). A keyed `VITE_RPC_<id>` or a
 * `VITE_*_BASE_URL` override is included when the same variable is visible to the Functions runtime
 * (Pages → Settings → Variables, which both the build and Functions read).
 */
import RPCS from '@yieldcircle/core/data/rpcs.json'
import { overlay } from './page'

const origin = (u: string | undefined) => { try { return u ? new URL(u).origin : null } catch { return null } }

const SERVICES = [
  'https://allocator.api.1delta.io', 'https://positions.1delta.io', 'https://sol-positions.1delta.io', 'https://social.1delta.io',
  // core/src/sdk/solRpc.ts's public rotation and wallet/wagmi.ts's Tempo
  'https://solana-rpc.publicnode.com', 'https://public.rpc.solanavibestation.com', 'https://solana.leorpc.com', 'https://api.tatum.io', 'https://rpc.tempo.xyz',
]
/** Reown / WalletConnect: the relay (wss), its RPC, the explorer API, pulse and the verify iframe. */
const WC = ['https://*.walletconnect.com', 'https://*.walletconnect.org', 'wss://*.walletconnect.com', 'wss://*.walletconnect.org', 'https://*.reown.com', 'wss://*.reown.com', 'https://*.web3modal.org', 'https://*.web3modal.com']

function rpcOrigins(): string[] {
  const out = new Set<string>()
  const walk = (x: unknown): void => {
    if (typeof x === 'string') { const o = /^(https|wss):\/\//.test(x) ? origin(x) : null; if (o) out.add(o) }
    else if (Array.isArray(x)) x.forEach(walk)
    else if (x && typeof x === 'object') Object.values(x).forEach(walk)
  }
  walk(RPCS)
  return [...out]
}

async function sha(text: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
  return `'sha256-${btoa(String.fromCharCode(...d))}'`
}

/** What the middleware puts into the page: the overlay in both modes and the two flags. */
const INJECTED = () => [overlay({ hidden: true }), overlay({ waitlist: true }), '<script>window.ycGated=true</script>', '<script>window.ycPass=true</script>']

export async function contentSecurityPolicy(env: Record<string, unknown>): Promise<string> {
  const html = INJECTED()
  const scripts = await Promise.all([...new Set(html.flatMap((h) => [...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1])))].map(sha))
  const handlers = await Promise.all([...new Set(html.flatMap((h) => [...h.matchAll(/\son[a-z]+="([^"]*)"/g)].map((m) => m[1])))].map(sha))
  const own = Object.entries(env).filter(([k, v]) => typeof v === 'string' && /^VITE_(.*_BASE_URL|XLINK_URL|RPC_.+)$/.test(k)).map(([, v]) => origin(v as string))
  const connect = [...new Set([...SERVICES, ...own.filter((o): o is string => !!o), ...rpcOrigins()])]
  return [
    "default-src 'self'",
    `script-src 'self' 'wasm-unsafe-eval'${handlers.length ? " 'unsafe-hashes'" : ''} ${[...scripts, ...handlers].join(' ')}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob:",
    `connect-src 'self' ${connect.join(' ')} ${WC.join(' ')}`,
    `frame-src ${WC.filter((w) => w.startsWith('https:')).join(' ')}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ')
}
