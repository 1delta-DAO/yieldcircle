# Mobile — the Expo app (`mobile/`)

The phone app: Expo SDK 58 (React Native 0.88, React 19.3 — the same React as
the web), expo-router, wallets through **Reown AppKit** + its wagmi adapter,
data and rules from **`@yieldcircle/core`**. It is a probe so far, not the
product: one screen that proves the three things the app rests on.

| On the screen | What it proves |
|---|---|
| **Connect** (`<AppKitButton />`) | a wallet connects over WalletConnect and hands the user back (`yieldcircle://`) |
| **Wallet capabilities** | what the wallet answers to `wallet_getCapabilities` (EIP-5792) on the current chain — whether the one-signature ladder can batch, per wallet |
| **Earn on Base** | core runs on Hermes: `fetchEarn` → `classifyEarn` with the default floors, against production |

```
mobile/
  app/_layout.tsx        polyfills → env → providers (AppKit, wagmi, React Query), the AppKit modal
  app/index.tsx          the probe screen
  src/env.ts             EXPO_PUBLIC_* → core's configureBackend (the web's src/env.ts, for the phone)
  src/appkit.ts          WagmiAdapter + createAppKit: the web's chain list, metadata, features off
  src/storage.ts         AsyncStorage behind AppKit, so a session survives a restart
  plugins/wallet-queries.js  Android <queries> so installed wallets are detected
  app.json · eas.json    identity, wallet schemes (iOS), build profiles
```

## Running it

AppKit needs native modules, so **Expo Go cannot run it** — a *development
build* is the app with the dev client inside; build it once, then JS changes
load live from Metro.

1. `cp mobile/.env.example mobile/.env` and set `EXPO_PUBLIC_WC_PROJECT_ID` (the
   web's `VITE_WC_PROJECT_ID`). Without it the screen says so and nothing connects.
2. Build the dev client, either way:
   - **EAS (cloud, no Mac needed for iOS):** `cd mobile && npx eas-cli login`,
     then `npx eas-cli build --profile development --platform android` (an APK to
     install) or `--platform ios` (needs an Apple Developer account; register the
     test phones with `npx eas-cli device:create`). Set the same
     `EXPO_PUBLIC_WC_PROJECT_ID` under the EAS project's environment variables.
   - **Locally:** `pnpm --filter @yieldcircle/mobile android` with the Android
     SDK + a phone on USB debugging (`ios` needs a Mac with Xcode).
3. `pnpm mobile` starts Metro; open the dev build on the phone and it loads.

`pnpm bundle:mobile` bundles both platforms without a device (Metro → Hermes
bytecode in `mobile/dist/`) — the quick check that core, the polyfills and the
workspace links still resolve. `pnpm typecheck` covers mobile with the rest.

## The capabilities test, per wallet

The question the web cannot answer from docs: which wallets accept
`wallet_sendCalls` **over WalletConnect** on a phone. Connect each, switch to
Base and to Ethereum, read the card, fill in:

| Wallet | connects + returns | `atomic` on Base | `atomic` on Ethereum | notes |
|---|---|---|---|---|
| MetaMask | | | | |
| Rainbow | | | | |
| Coinbase Wallet | | | | |
| Trust | | | | |
| Zerion | | | | |
| Uniswap | | | | |
| Safe | | | | |

`supported` / `ready` → the ladder can go out as one batch; `unsupported`,
`not reported` or an error → step by step, as the web already falls back.

## Decisions in the setup

- **Identity:** `io.yieldcircle.app` (iOS bundle id and Android package) and the
  scheme `yieldcircle`. Free to change until the first store upload; fixed after.
- **AppKit features off:** no email / social (embedded) accounts, swaps or
  onramp — the user's own wallet only, smart-account features from the wallet
  (EIP-5792 / 7702), as on the web.
- **Metadata URL** is `https://app.yieldcircle.io`, already registered on the
  Reown project, so wallets show a verified domain. If the Reown dashboard
  rejects the app's connections, add `io.yieldcircle.app` to the project's
  allowed native app ids there.
- **TypeScript stays 5.9** like the rest of the repo; SDK 58 asks for 6, so
  `typescript` is excluded from Expo's version check (`expo.install.exclude`).
- **`zod` pinned at the root** (`3.25.76`): viem and wagmi take it as an
  optional peer, and every new workspace member let pnpm resolve a second copy
  (`zod@4`, which `porto` brings) for one app — two viem/wagmi instances for the
  landing, which builds from web's source. Pinned at the root, every app
  resolves the same one.
- **Site builds install only their own packages** (`--filter`, docs/deploy.md):
  the phone toolchain is ~300 MB the Pages builds never need.

## Known gaps, roughly in order

- **Solana:** not wired. AppKit's Solana adapter + its Phantom / Solflare
  connectors replace the web's Wallet Standard (`wallet/solana.ts`), which has
  no window to live in here. Adding Solana turns Link Mode off (below).
- **Return trip without the relay — universal links + Link Mode:** needs
  `apple-app-site-association` / `assetlinks.json` on `app.yieldcircle.io`,
  `redirect.universal` + `linkMode: true` in `src/appkit.ts`, and One-Click Auth
  (SIWE). EVM only.
- **The chain list is duplicated** from `packages/web/src/wallet/wagmi.ts` —
  move it to a shared package with viem as its dependency (core has none).
- **Bundle size:** 9.3 MB of bytecode, much of it core's data tables
  (`asset-notes.json`, `token-icons.json` through `model/assets.ts`). Fine for a
  probe; split or fetch them before a store build.
- **Paper accounts:** the key derivation (scrypt N = 2^16 in pure JS,
  `wallet/paperKey.ts`) is unmeasured on Hermes and probably wants a native
  module (`react-native-quick-crypto`).
