import { apiFetchEnvelope } from '../vendor/allocator/http'
import type { LoopActions, SignStep } from './types'

/**
 * A MANDATORY signature step (worker-api `v1/envelope.ts` `SignStep`): the API
 * cannot build the action until a message is signed. Today that is an Inverse
 * FiRM loop — FiRM only lets Inverse's ALE borrow on a user's behalf, on a
 * per-action EIP-712 permit — and the Midnight / Term maker flows.
 *
 * Contract: `actions.signs` non-empty ⇒ nothing to send yet. Sign
 * `typedData`, replay `submit` with the signature, and the answer is an
 * ordinary one. (`actions.signatures` is different: OPTIONAL permit offers
 * that replace an approval, never a step.)
 */
export const signStep = (a: LoopActions | null | undefined): SignStep | undefined =>
  a && !(a.transactions?.length || a.alternatives?.length) ? a.signs?.[0] : undefined

/** The API's typed data carries decimal strings; the wallet wants bigints for every (u)int. */
export function walletTypedData(td: SignStep['typedData']) {
  const primaryType = td.primaryType
  const fields = td.types[primaryType] ?? []
  const message: Record<string, unknown> = {}
  for (const f of fields) message[f.name] = /^u?int\d*$/.test(f.type) ? BigInt(td.message[f.name] as string) : td.message[f.name]
  return {
    domain: { ...td.domain, chainId: Number(td.domain.chainId) },
    types: { [primaryType]: fields },
    primaryType,
    message,
  }
}

/** Replay `submit` verbatim with the signature under `signatureField`. */
export function submitSigned<T>(step: SignStep, signature: string) {
  const { method, endpoint, params, body, signatureField } = step.submit
  return method === 'GET'
    ? apiFetchEnvelope<T, LoopActions>(endpoint, { params: { ...params, [signatureField]: signature } })
    : apiFetchEnvelope<T, LoopActions>(endpoint, { body: { ...body, [signatureField]: signature } })
}

/**
 * Resolve an answer that may need a signature: sign the step and replay
 * `submit`. Returns the answer unchanged when there is no step — or when
 * `sign` is null (paper: the build is asked, never signed).
 */
export async function withSignature<E extends { actions?: LoopActions | null }>(
  env: E,
  sign: ((td: ReturnType<typeof walletTypedData>) => Promise<string>) | null,
): Promise<E> {
  const step = signStep(env.actions)
  if (!step || !sign) return env
  const next = (await submitSigned(step, await sign(walletTypedData(step.typedData)))) as unknown as E
  if (signStep(next.actions)) throw new Error('The venue asked for a second signature — start the action again.')
  return next
}
