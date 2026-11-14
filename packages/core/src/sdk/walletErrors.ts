type WalletErr = { code?: number; cause?: unknown; shortMessage?: string; message?: string; details?: string }
const SAID_NO = /reject|denied|cancel|declin/i
/** The error the wallet itself answered, under whatever viem wrapped around it: the deepest `cause` that has a code. */
function walletCause(e: unknown): WalletErr | undefined {
  let found: WalletErr | undefined
  for (let x = e as WalletErr | undefined, i = 0; x && typeof x === 'object' && i < 6; x = x.cause as WalletErr | undefined, i++) if (typeof x.code === 'number') found = x
  return found
}
/**
 * The user said no in the wallet (EIP-1193 4001, or a wallet that only says it in words): nothing was sent.
 *
 * WalletConnect's 5000 is NOT that on its own. MetaMask Mobile answers 5000 for every request it
 * could not carry out — a batch it will not take, a transaction it could not validate, any error of
 * its own — with the reason in the message (`WalletConnect2Session.rejectRequest`), and viem files
 * 5000 under `UserRejectedRequestError`. Read as a "no", a refused batch never fell back to one step
 * per tap and the reason was never shown. A 5000 is a rejection only when its message says so (or
 * says nothing).
 */
export const isRejection = (e: unknown) => {
  const x = e as WalletErr, w = walletCause(e)
  if (w?.code === 5000) return !w.message || SAID_NO.test(w.message)
  return x?.code === 4001 || w?.code === 4001 || SAID_NO.test(x?.shortMessage ?? x?.message ?? '')
}
/**
 * Why a send failed, in the wallet's own words where it gave any: its message (the `message` inside
 * a JSON-RPC error MetaMask stringified into one), else viem's short one — never viem's whole
 * message, which ends in a docs link and a version.
 */
export function walletWhy(e: unknown): string {
  const x = e as WalletErr, w = walletCause(e)
  let m = w?.message || x?.details || x?.shortMessage || x?.message || 'the wallet gave no reason'
  if (m.startsWith('{')) try { m = (JSON.parse(m) as { message?: string }).message || m } catch { /* not JSON: as it is */ }
  return m
}
/**
 * The wallet is on another chain than the request names. MetaMask Mobile answers "Invalid parameters:
 * active chainId is different than the one provided" for a send or a typed-data domain off its own
 * chain — its chain for this app can differ from the one the session reports, so the app cannot
 * always see it coming. Also MetaMask's typed-data and batch refusals, and viem's own check.
 */
const CHAIN_OFF = /chain ?id is different|must match the active chain|chain id must match|does not match the target chain/i
export const isChainMismatch = (e: unknown) => CHAIN_OFF.test(walletWhy(e)) || CHAIN_OFF.test((e as WalletErr)?.message ?? '')
