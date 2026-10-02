/**
 * WalletConnect configuration, in one place.
 *
 * Without a project id the app ships `connectors: [injected()]`, which on a
 * plain mobile browser means NO way to connect at all — the product is
 * unreachable from a phone. `vite.config.ts` warns at build time; this module
 * is what the UI branches on so the failure is at least legible.
 */
export const WC_PROJECT_ID = (import.meta.env.VITE_WC_PROJECT_ID as string | undefined)?.trim() || undefined
export const HAS_WC = !!WC_PROJECT_ID

/**
 * The origin wallets are shown while they ask the user to approve a signature.
 * It must be an origin registered on the reown dashboard, or the wallet paints
 * a red "cannot verify domain" banner over the request — so a preview deploy on
 * a `*.pages.dev` host that nobody registered is worse than no metadata at all.
 */
export const SITE_URL = (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/$/, '') || (typeof location === 'undefined' ? '' : location.origin)

export const APP_METADATA = {
  name: 'YieldCircle',
  description: 'everything you hold, earning',
  url: SITE_URL,
  icons: [`${SITE_URL}/icon-192.png`],
}
