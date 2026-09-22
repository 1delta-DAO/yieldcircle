const DEFAULT_BASE_URL = 'https://portal.1delta.io'

/** Base backend URL, e.g. https://portal.1delta.io */
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
