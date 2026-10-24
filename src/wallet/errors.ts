/** The user said no in the wallet (EIP-1193 4001, or a wallet that only says it in words): nothing was sent. */
export const isRejection = (e: unknown) => { const x = e as { code?: number; cause?: { code?: number }; shortMessage?: string; message?: string }; return x?.code === 4001 || x?.cause?.code === 4001 || /reject|denied|cancel/i.test(x?.shortMessage ?? x?.message ?? '') }
