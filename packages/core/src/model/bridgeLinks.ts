/**
 * A bridge's own tracker for a transfer, by the source transaction: where its status, the
 * destination leg and any refund are shown in full. Only the trackers that take the SOURCE hash in
 * their address; a bridge keyed on its own order id (deBridge) or with no per-transfer page gets no
 * link rather than a guessed one. The API names a bridge loosely ("Across", "stargate-v2",
 * "NEAR Intents"), so names are matched lower-cased and stripped.
 */
const TRACKERS: [RegExp, (hash: string) => string][] = [
  [/^(layerzero|stargate)/, (h) => `https://layerzeroscan.com/tx/${h}`],
  [/^(squid|axelar)/, (h) => `https://axelarscan.io/gmp/${h}`],
  [/^mayan/, (h) => `https://explorer.mayan.finance/swap/${h}`],
  [/^relay/, (h) => `https://relay.link/transaction/${h}`],
  [/^(wormhole|portal)/, (h) => `https://wormholescan.io/#/tx/${h}`],
  [/^(socket|bungee)/, (h) => `https://socketscan.io/tx/${h}`],
]

export function bridgeTracker(name: string | undefined, sourceHash: string | undefined): { name: string; url: string } | undefined {
  if (!name || !sourceHash || sourceHash.startsWith('paper:') || sourceHash.startsWith('batch:')) return undefined
  const key = name.toLowerCase().replace(/[^a-z]/g, '')
  const hit = TRACKERS.find(([re]) => re.test(key))
  return hit ? { name, url: hit[1](sourceHash) } : undefined
}
