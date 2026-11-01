/**
 * Signing a social write lives in `@yieldcircle/app/social/sign` (the hook) and
 * `@yieldcircle/core/social/envelope` (the EIP-712 types, which it re-exports), shared with the
 * phone. The web's Solana signer reaches it through `state/platform.tsx`.
 */
export * from '@yieldcircle/app/social/sign'
