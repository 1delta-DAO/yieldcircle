import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Storage } from '@reown/appkit-react-native'
import { safeJsonParse, safeJsonStringify } from '@walletconnect/safe-json'

/** Where AppKit keeps the WalletConnect session, so a connected wallet survives a restart. */
export const storage: Storage = {
  getKeys: async () => (await AsyncStorage.getAllKeys()) as string[],
  getEntries: async <T = unknown>(): Promise<[string, T][]> => {
    const keys = await AsyncStorage.getAllKeys()
    return Promise.all(keys.map(async (k): Promise<[string, T]> => [k, safeJsonParse((await AsyncStorage.getItem(k)) ?? '') as T]))
  },
  getItem: async <T = unknown>(key: string): Promise<T | undefined> => {
    const item = await AsyncStorage.getItem(key)
    return item == null ? undefined : (safeJsonParse(item) as T)
  },
  setItem: async <T = unknown>(key: string, value: T) => { await AsyncStorage.setItem(key, safeJsonStringify(value)) },
  removeItem: async (key: string) => { await AsyncStorage.removeItem(key) },
}
