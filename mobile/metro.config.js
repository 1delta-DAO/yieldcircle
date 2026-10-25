// Expo's monorepo-aware defaults (SDK 52+), plus one rule: the libraries that hold React context
// resolve to the phone app's own copy, wherever they are imported from.
//
// pnpm installs one copy of a package per set of its peers: the phone's wagmi is built against
// React Native's AsyncStorage, the shared package's (`packages/app`, a dev dependency there for its
// typecheck) against none — two copies, two contexts, and `useAccount` in the shared ladder could
// not see the phone's <WagmiProvider> ("useConfig must be used within WagmiProvider").
const path = require('node:path')
const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)
// the phone's direct dependencies only (their own dependencies follow from the copy chosen)
const SINGLE = ['wagmi', 'viem', '@tanstack/react-query', 'react', 'react-dom']
const here = path.join(__dirname, 'package.json')
const isSingle = (name) => SINGLE.some((p) => name === p || name.startsWith(p + '/'))

const upstream = config.resolver.resolveRequest
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = upstream ?? context.resolveRequest
  if (isSingle(moduleName)) return resolve({ ...context, originModulePath: here }, moduleName, platform)
  return resolve(context, moduleName, platform)
}

module.exports = config
