import React from 'react'
import { useAccount, useSwitchChain } from 'wagmi'
import { answerWindow, openWallet } from './deeplink'

/**
 * `switchChainAsync` settles only once the wallet's answer AND a `chainChanged` for the target
 * have both come back. Over WalletConnect either can be lost while the page sits in the background
 * (the socket the relay delivers on is suspended with it): the promise never settles, `isPending`
 * never clears, and the button it disables is dead with the wallet already on the right chain.
 *
 * So over WalletConnect the wait ends once the answer has had its chance (`answerWindow`). If the
 * switch landed, `useAccount().chainId` has followed and the button reads "Send"; if not, it reads
 * "Switch" again, and a second tap asks a wallet that is already there, which answers at once.
 * A late `chainChanged` still reaches wagmi's state, so nothing is lost by not waiting for it.
 *
 * Call `switchTo` synchronously from the click: it foregrounds the wallet app before its first await.
 */
export function useSwitchTo() {
  const { connector } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const [switching, setSwitching] = React.useState(false)
  const switchTo = async (chainId: number) => {
    openWallet(connector?.id)
    setSwitching(true)
    try {
      const sw = switchChainAsync({ chainId })
      await (connector?.id === 'walletConnect' ? Promise.race([sw, answerWindow()]) : sw)
    } finally { setSwitching(false) }
  }
  return { switchTo, switching }
}
