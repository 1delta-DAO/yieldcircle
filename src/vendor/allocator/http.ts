/**
 * The one place this app talks to the 1delta backend.
 *
 * Every request to `BACKEND_BASE_URL` goes through {@link apiFetch} or
 * {@link apiFetchEnvelope}. That is deliberate and it is the thing to preserve
 * when forking: attaching an API key, swapping in a proxy, adding tracing or a
 * retry policy is a change to *this file*, not to fifty call sites.
 *
 * ## The response envelope
 *
 * Every backend endpoint answers with the same wrapper:
 *
 * ```json
 * { "success": true, "data": { … }, "actions": { "transactions": [], "permissions": [] } }
 * { "success": false, "error": { "code": "BAD_REQUEST", "message": "…" } }
 * ```
 *
 * `apiFetch` unwraps `data` for you. `apiFetchEnvelope` returns the whole
 * thing, for the action-building endpoints that also populate `actions`.
 *
 * ## Errors
 *
 * Both throw {@link ApiError} on a transport failure, a non-2xx status, or
 * `success: false`. They never resolve with a sentinel value — a query that
 * failed must look failed to React Query, and an action builder that failed
 * must not look like an empty transaction list. Call sites that need a
 * non-throwing result (the action builders, which render `error` in the form)
 * catch and convert with {@link errorMessage}.
 *
 * ## Not routed through here
 *
 * Two fetches in the app talk to something *other* than the 1delta backend and
 * deliberately stay raw: `hooks/lending/executeRpcCalls.ts` (a user-supplied
 * chain RPC) and `lib/data/tokenListsCache.ts` (third-party token list URLs).
 * Neither speaks the envelope above.
 */

import { BACKEND_BASE_URL, apiHeaders } from '../../config/backend'

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** A backend call that failed, at any layer: transport, HTTP status, or envelope. */
export class ApiError extends Error {
  /** HTTP status, absent when the request never completed. */
  readonly status?: number
  /** Backend error code (`error.code`), when the envelope supplied one. */
  readonly code?: string
  /** Request path, for logs — never includes the base URL or any header. */
  readonly path: string
  /** The envelope's `error.details`: the numbers behind the message, per code (`INSUFFICIENT_DEPTH` → the cap and what fits). */
  readonly details?: unknown

  constructor(message: string, opts: { path: string; status?: number; code?: string; details?: unknown }) {
    super(message)
    this.name = 'ApiError'
    this.path = opts.path
    this.status = opts.status
    this.code = opts.code
    this.details = opts.details
  }
}

/**
 * Message for any thrown value. Use at the boundary where a throwing call has
 * to become a `{ success: false, error }` result for the UI to render.
 */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message
  if (err instanceof Error) return err.message
  return 'Unknown error'
}

// ---------------------------------------------------------------------------
// URLs
// ---------------------------------------------------------------------------

type ParamValue = string | number | boolean | null | undefined | ReadonlyArray<string | number>

export type ApiParams = Record<string, ParamValue>

/**
 * Build a backend URL.
 *
 * `undefined`, `null` and `''` values are dropped, so callers can pass optional
 * params straight through instead of guarding each one. An array value
 * **repeats** the key (`chainId=1&chainId=8453`) — endpoints that want a CSV
 * take a pre-joined string, because which of the two an endpoint expects is not
 * inferable from the value.
 *
 * Exported because query keys need a stable URL string without issuing the
 * request.
 */
export function apiUrl(path: string, params?: ApiParams): string {
  const url = new URL(path.startsWith('/') ? path : `/${path}`, BACKEND_BASE_URL)
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === '') continue
      if (Array.isArray(value)) {
        for (const v of value) url.searchParams.append(key, String(v))
      } else {
        url.searchParams.set(key, String(value))
      }
    }
  }
  return url.toString()
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

/**
 * One call the wallet has to make. The single transaction shape every
 * `/v1/actions/*` endpoint speaks — the per-domain aliases
 * (`LendingTransaction`, `VaultTransaction`, `EarnTx`, …) all point here.
 */
export interface ApiTransaction {
  to: string
  data: string
  /** Decimal string of wei. */
  value: string
}

/** A permission (approval / setup) step — labelled by the backend. */
export interface ApiPermission extends ApiTransaction {
  /** Human label the backend attaches to approvals / setup steps. */
  description?: string
}

/** The executable payload the `/v1/actions/*` endpoints return. */
export interface ApiActions {
  transactions: ApiTransaction[]
  permissions: ApiPermission[]
}

/**
 * The wrapper every backend endpoint responds with.
 *
 * `A` widens `actions` for the few endpoints that add their own keys to it —
 * the spot-swap quote carries `alternatives` there, for instance. Default to
 * plain {@link ApiActions}.
 */
export interface ApiEnvelope<T, A = ApiActions> {
  success: boolean
  /**
   * `/lending/pairs/optimize` and `/lending/comparables` report status as `ok`
   * rather than `success`. Treated as an alias so those two don't each need
   * their own envelope handling.
   */
  ok?: boolean
  data?: T | null
  actions?: A | null
  error?: { code?: string; message?: string; details?: unknown } | string
}

export interface ApiOptions {
  params?: ApiParams
  /** Presence switches the request to POST and JSON-encodes the value. */
  body?: unknown
  /** Force a method; only needed for a POST with no body. */
  method?: 'GET' | 'POST'
  signal?: AbortSignal
  /**
   * The browser's HTTP cache mode. User routes answer `max-age=15`, so a re-read seconds after
   * a transaction would be served the answer from before it: `'no-store'` there.
   */
  cache?: RequestCache
}

// ---------------------------------------------------------------------------
// Rate limit
// ---------------------------------------------------------------------------

/** When the backend last said to come back, as epoch ms; 0 = open. Shared by every request. */
let gateUntil = 0
function closeGate(seconds: number) {
  gateUntil = Math.max(gateUntil, Date.now() + Math.min(Math.max(seconds, 1), 120) * 1000)
}
/** Resolves once the gate is open (at once, almost always). An abort while waiting rejects as a fetch would. */
function rateGate(signal?: AbortSignal): Promise<void> {
  const wait = gateUntil - Date.now()
  if (wait <= 0) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, wait)
    signal?.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')) }, { once: true })
  })
}
/** `retryAfter` from the envelope, else the `Retry-After` header, else 30 s. Reads a clone so the body stays readable. */
async function retryAfterSeconds(res: Response): Promise<number> {
  const body = (await res.clone().json().catch(() => null)) as { retryAfter?: number } | null
  const n = Number(body?.retryAfter ?? res.headers.get('retry-after'))
  return Number.isFinite(n) && n > 0 ? n : 30
}

/** Normalise the two shapes the backend uses for `error`. */
function envelopeError(error: ApiEnvelope<unknown>['error']): { message?: string; code?: string; details?: unknown } {
  if (typeof error === 'string') return { message: error }
  return { message: error?.message, code: error?.code, details: error?.details }
}

/**
 * Issue a request and return the full envelope. Throws {@link ApiError} unless
 * the backend answered `success: true`.
 *
 * Use this for the `/v1/actions/*` endpoints, whose payload lives in `actions`
 * as well as `data`. Everything else wants {@link apiFetch}.
 */
export async function apiFetchEnvelope<T, A = ApiActions>(
  path: string,
  options: ApiOptions = {}
): Promise<ApiEnvelope<T, A>> {
  const { params, body, method, signal, cache } = options
  const url = apiUrl(path, params)

  let res: Response
  const send = () => fetch(url, {
    method: method ?? (body === undefined ? 'GET' : 'POST'),
    headers: {
      ...apiHeaders(),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal,
    ...(cache ? { cache } : {}),
  })
  try {
    await rateGate(signal)
    res = await send()
    // One 429 closes the gate for everyone until the backend's `retryAfter`,
    // then this request tries once more. Without it every query in flight
    // keeps knocking (and React Query's retry doubles it), which is what kept
    // the limit tripped instead of letting it reset.
    if (res.status === 429) {
      closeGate(await retryAfterSeconds(res))
      await rateGate(signal)
      res = await send()
    }
  } catch (err) {
    // Network failure, DNS, CORS, or an aborted request. Re-throw aborts
    // untouched so React Query can tell a cancellation from a real failure.
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new ApiError(errorMessage(err), { path })
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    // A non-2xx body is usually still the envelope, and the code in it is
    // actionable — the permit flow branches on `BUILD_EXPIRED` (re-quote and
    // resubmit the same signature) vs `PERMIT_STALE` (sign again). Surface it
    // instead of burying it in a raw-text message.
    try {
      const parsed = JSON.parse(text) as ApiEnvelope<unknown>
      const { message, code, details } = envelopeError(parsed?.error)
      if (message || code) {
        throw new ApiError(message ?? `HTTP ${res.status}`, {
          path,
          status: res.status,
          code,
          details,
        })
      }
    } catch (err) {
      if (err instanceof ApiError) throw err
      // not JSON — fall through to the raw-text error
    }
    throw new ApiError(`HTTP ${res.status}: ${text || res.statusText}`, {
      path,
      status: res.status,
    })
  }

  const json = (await res.json()) as ApiEnvelope<T, A>

  // Only an explicit `false` is a failure. A handful of endpoints answer with a
  // bare payload and no status key at all — treat those as "not enveloped" and
  // hand the whole body back as the data rather than calling them failures.
  const status = json.success ?? json.ok
  if (status === undefined) {
    return { success: true, data: json as unknown as T }
  }

  if (!status) {
    const { message, code, details } = envelopeError(json.error)
    throw new ApiError(message ?? `${path} returned success: false`, {
      path,
      status: res.status,
      code,
      details,
    })
  }

  return json
}

/**
 * Issue a request and return the unwrapped `data` payload. Throws
 * {@link ApiError} on any failure. This is what a React Query `queryFn` wants.
 *
 * Note the `data` cast: a `success: true` envelope with a null `data` is a
 * backend bug rather than a case to model, and every caller would otherwise
 * need a redundant null check.
 */
export async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const json = await apiFetchEnvelope<T>(path, options)
  return json.data as T
}

/**
 * `data` when the response was enveloped, the whole body when it wasn't.
 *
 * Two endpoints (`/lending/pairs/optimize`, `/lending/comparables`) put their
 * payload at the top level on some deployments and under `data` on others.
 * Rather than each call site re-deriving `json.data ?? json`, they call this.
 * Prefer plain {@link apiFetch} everywhere else.
 */
export async function apiFetchLoose<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const json = await apiFetchEnvelope<T>(path, options)
  return (json.data ?? (json as unknown)) as T
}
