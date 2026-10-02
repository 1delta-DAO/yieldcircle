const DEFAULT_BASE_URL = 'https://allocator.api.1delta.io'

/** Base backend URL. Override only for a proxy or a local worker-api. */
export const BACKEND_BASE_URL =
  (import.meta.env.VITE_BACKEND_BASE_URL as string | undefined) ?? DEFAULT_BASE_URL

/**
 * Headers attached to every backend request made through `sdk/http.ts`.
 *
 * **This is the hook for a fork's authentication.** The public endpoint is
 * unauthenticated and rate-limited; a production integration generates a key at
 * https://auth.1delta.io/ and puts it behind a server-side proxy, then points
 * `VITE_BACKEND_BASE_URL` at that proxy. The proxy attaches the key, so nothing
 * secret reaches the browser bundle.
 *
 * If your proxy needs a non-secret header instead — a tenant id, a request id,
 * a session token the user already holds — return it here and every call site
 * picks it up. Do NOT return a 1delta API key: anything returned here ships in
 * the client bundle and is readable by every visitor.
 */
export function apiHeaders(): Record<string, string> {
  return {}
}

/**
 * The position index (`pos-indexer`), public at https://positions.1delta.io.
 * The ledger of who did what in which market, on the chains this app offers.
 * Read-only, CORS `*`, no key. It is NEVER asked for the connected user's own
 * positions — those stay on the live allocator path (`/v1/data/earn/positions`),
 * which is the index's own hard rule. This is for OTHER wallets and for history.
 */
export const INDEX_BASE_URL =
  (import.meta.env.VITE_INDEX_BASE_URL as string | undefined) ?? 'https://positions.1delta.io'

/**
 * The SOLANA position index (`pos-indexer/apps/sol-indexer`), public at
 * https://sol-positions.1delta.io — a separate service until it merges into
 * pos-indexer (docs/solana.md). Same rules: read-only, no key, never the
 * connected user's own positions. `index/api.ts` routes to it by chain,
 * address shape or uid; it must answer the EVM index's response shapes —
 * YieldCircle does not adapt them (plan decision 2), so a route that still
 * answers its old `{ok, data}` envelope simply reads as empty here.
 */
export const SOL_INDEX_BASE_URL =
  (import.meta.env.VITE_SOL_INDEX_BASE_URL as string | undefined) ?? 'https://sol-positions.1delta.io'

/**
 * The social service, public at https://social.1delta.io. Reads are open;
 * every write is an EIP-712 message signed by the wallet that authored it, so
 * there are no sessions, no cookies and no key here either.
 */
export const SOCIAL_BASE_URL =
  (import.meta.env.VITE_SOCIAL_BASE_URL as string | undefined) ?? 'https://social.1delta.io'
