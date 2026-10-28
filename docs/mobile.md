# Mobile — the Expo app (`mobile/`)

The phone app: Expo SDK 58 (React Native 0.88, React 19.3 — the same React as
the web), expo-router, wallets through **Reown AppKit** + its wagmi adapter.
It runs on the same code as the web below the screens:

- **`@yieldcircle/core`** — the model, the API clients, the formatters, Lite's
  rules (`model/lite.ts`), all plain TypeScript.
- **`@yieldcircle/app`** (`packages/app`) — the React half both apps share: the
  data hooks (`useCatalog`, `useBook`, rate history, the index's proofs and
  trending, `useLiteMenu`, `liteCards`) and the settings. No DOM; who is
  looking comes in through `SessionProvider` — the web fills it from its hash
  route and paper account (`packages/web/src/state/session.tsx`), the phone from
  the connected wallet (`mobile/src/session.tsx`). `localStorage` is the one
  browser API it uses; the phone gets a synchronous one on SQLite
  (`expo-sqlite/localStorage/install`, first in `app/_layout.tsx`).

**What is on the phone** (2026-10-25):

| | Lite | Pro |
|---|---|---|
| Home | balance and a day's earnings, streak, the idle nudge, three lenses of cards (proven · trending · most held) | your money, the best three rows per money |
| Earn | four money tiles, the highest steady rates or a money's rows, "show all" | every row of a money, every venue and chain |
| Board | the wallet board (best rate · most a day), tap for each position's PnL | the same board |
| Feed · Borrow | — | "comes next" (the feed needs the social layer; borrowing comes with the ticket) |

A row opens the **strategy screen**: what it is in words, the rate (amber on a
spike), risk, kind, who runs it, chain, size, who holds it, yours. It is
read-only — **Earn this** is disabled until the phone has the ticket, and says
so. **You** (behind the balance chip, as on the web) has your money, its positions (each opens its Lite ticket, "More choices" included), and at its foot the wallet,
the chains every list reads, the **Lite / Pro switch** (saved like the web's setting; `/`
opens the saved mode) and the wallet probe (`app/probe.tsx`: what the wallet
answers to `wallet_getCapabilities`).

```
mobile/
  app/_layout.tsx        polyfills → env → AppKit, wagmi, React Query, Settings, session; the AppKit modal
  app/index.tsx          → /lite or /pro, by the saved mode
  app/lite/  app/pro/    the two tab bars and their screens
  app/strategy/[id].tsx  one strategy, read-only
  app/you.tsx            wallet, your money, Lite / Pro
  app/probe.tsx          the wallet-capabilities probe
  src/session.tsx        the phone's SessionProvider: every chain, the connected wallet
  src/mode.ts            Lite / Pro, in localStorage
  src/ui/                bits (Tok, GroupIcon, RiskDot, Rate, Seg …), Lite rows and cards, Pro rows, the board
  src/env.ts             EXPO_PUBLIC_* → core's configureBackend (the web's src/env.ts, for the phone)
  src/appkit.ts          WagmiAdapter + createAppKit: the web's chain list, metadata, features off
  src/storage.ts         AsyncStorage behind AppKit, so a session survives a restart
  plugins/wallet-queries.js  Android <queries> so installed wallets are detected
  app.json · eas.json    identity, wallet schemes (iOS), build profiles
```

**Not on the phone yet**, in the order they would come: the ticket (opening
and closing a position: the web's `Ticket.tsx` + `useLadder.ts`), the social
layer (profiles, follows, the feed, signed comments), paper accounts, Solana.

**The ticket on the phone** runs on the web's own ticket engine — the
ladder, the transaction trace and one controller per ticket body live in
`@yieldcircle/app` (docs/mobile-plan.md, phase 3). The phone fills
`@yieldcircle/app/platform` in `mobile/src/platform.tsx`: its SQLite
`localStorage` as the scratchpad, the WalletConnect session's redirect to bring
the wallet forward, wagmi for chain switches.

**One copy of each context library** (`mobile/metro.config.js`): pnpm installs
a package once per set of its peers, so the phone's wagmi (built against
AsyncStorage) and the shared package's (a dev dependency there) were two copies
— and the shared ladder's `useAccount` could not see the phone's
`<WagmiProvider>`. Metro resolves `wagmi`, `viem`, `@tanstack/react-query`,
`react` and `react-dom` from the phone app, wherever they are imported.

## Running it

AppKit needs native modules, so **Expo Go cannot run it** — a *development
build* is the app with the dev client inside; build it once, then JS changes
load live from Metro.

**One `.env`.** The keys stay in the repo root's `.env`, where the web reads
them. `scripts/mobile.mjs` (`pnpm mobile …`) hands every `VITE_X` there to Expo
as `EXPO_PUBLIC_X` for the step it runs — `VITE_WC_PROJECT_ID` becomes
`EXPO_PUBLIC_WC_PROJECT_ID`, the URL overrides likewise — so there is no
`mobile/.env`. Only `VITE_*` crosses over; anything else in `.env` (`FAL_KEY`)
is a secret and never reaches the app.

| | |
|---|---|
| `pnpm mobile setup android` | **first time, in one go:** EAS login and project (once), the dev client built on EAS (an APK — install it from the link), then Metro. `ios` needs an Apple Developer account and the phone registered first (`pnpm mobile device`; see "On an iPhone") |
| `pnpm mobile` | every day after: Metro with the keys; open the dev build on the phone (`pnpm mobile --tunnel` when the phone cannot reach this machine on the Wi-Fi) |
| `pnpm mobile device` | register an iPhone (below) |
| `pnpm mobile go [--tunnel]` | Expo Go instead of a dev build: no build, no Apple account (below) |
| `pnpm mobile build android` | rebuild the dev client — only after a native change (a new native package, `app.json`) |
| `pnpm mobile run android` | build and install locally instead of EAS (Android SDK + a phone on USB; `ios` needs a Mac) |
| `pnpm mobile env` | what the app gets, masked |
| `pnpm mobile env:push` | copy the same values to EAS for **preview / production** builds |
| `pnpm bundle:mobile` | bundle both platforms without a device — the check that core, the polyfills and the workspace links resolve |

A dev build is native code only; its JS, keys included, comes from Metro on
your machine, so the EAS dev build needs no keys. Preview and production builds
bundle the JS on EAS's servers, which never see the local `.env` — hence
`env:push` (plaintext variables: `EXPO_PUBLIC_*` ships inside the app anyway).
`pnpm typecheck` covers mobile with the rest.

### Without a build: Expo Go

`pnpm mobile go [--tunnel]` runs the app in **Expo Go** (free from the App
Store, no Apple account, no EAS build). Wallets connect, the capabilities card
and the earn list work; two things do not: the wallet cannot hand back
(Expo Go is not `yieldcircle://` — switch back by hand) and installed wallets
are not detected (react-native-compat's native half is missing; it logs
"Application module is not available" once and carries on).

What it took to get an iPhone onto it (2026-10-25), so nobody repeats it:

- **The QR opens a chooser page** (the project has `expo-dev-client`): tap
  **Expo Go**. "Development Build" asks an Expo Go server for a dev-client
  link it cannot make — an empty 404 that Safari saves as a `.txt`.
- **`karateduck` isolates Wi-Fi clients**: phone and laptop cannot reach each
  other at all (no ARP answer), so the LAN address is unreachable. Use
  `--tunnel`, or the iPhone's Personal Hotspot for the laptop (then no tunnel).
- **With `--tunnel`, enter `exps://<host>`, not `exp://`**: the tunnel serves
  https; `exp://` goes out as plain http and timed out ("gateway timeout")
  although Safari reached the same host. The script prints the right address
  for each run.
- **The tunnel address is new on every start** — Expo Go's history entries from
  an earlier run are dead tunnels ("gateway timeout" again).
- **A cold bundle outlasts the tunnel's wait**: the script now builds the iOS
  and Android bundles as soon as Metro is up ("bundle ready"); open the app
  after that line.

### On an iPhone

Everything builds on EAS, so no Mac is needed — but Apple only installs a
development build on phones it knows, signed by a paid developer account.

1. **Apple Developer Program** (99 USD a year, developer.apple.com) on the
   Apple ID that will own the app. EAS logs into it during the first iOS build
   and creates the certificate, the provisioning profile and the app id
   `io.yieldcircle.app` itself (say yes to its prompts).
2. **Register the phone:** `pnpm mobile device` → open the link (or scan the
   QR code) on the iPhone in Safari and install the profile it offers
   (Settings → General → VPN & Device Management). Once per phone.
3. **Build:** `pnpm mobile setup ios` — the build carries every phone
   registered *before* it started; a phone added later needs
   `pnpm mobile build ios` again.
4. **Install:** open the build's link on the iPhone (the QR code on the build
   page) and install.
5. **Developer Mode** (iOS 16+): the first launch is refused until it is on —
   Settings → Privacy & Security → Developer Mode → on, restart, confirm.
6. **Run:** `pnpm mobile` on this machine, open YieldCircle on the phone; it
   finds Metro on the same Wi-Fi, or use `pnpm mobile --tunnel`.

An iOS *simulator* build needs a Mac to run, so from Linux a real phone is the
way. For testers beyond your own phones later: a `preview` / `production` build
goes through TestFlight (`npx eas-cli submit --platform ios`) and needs
`pnpm mobile env:push` first, since those builds carry their JS and keys.

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

## Lite's links on the phone (deep-link map)

Every Lite address is written once, in core (`model/liteLinks.ts`): a `LiteDest` says what a link
points at, `liteHash` / `liteUrl` write the web's address and `parseLiteHash` reads one back. The
phone's half is `mobile/src/nav.tsx::pathOf`, and `app/+native-intent.tsx` sends every incoming link
through it. Shared code goes somewhere with `useNav()` (`@yieldcircle/app/nav`), never with a hash or
an expo-router path.

| Web (`https://app.yieldcircle.io/…`) | Phone path |
|---|---|
| `#/lite/` | `/lite` |
| `#/lite/earn`, `#/lite/<USD\|ETH\|BTC\|MORE>` | `/lite/earn`, `/lite/earn?g=USD` |
| `#/lite/<GROUP>?s=&k=&copy=&lev=&h=&m=` | `/strategy/<s>?copy=&lev=&h=&m=` |
| `#/lite/board?by=&t=&x=` | `/lite/board?by=&t=&x=` (Wallets unless `by=strategy`) |
| `#/lite/you?h=&m=` | `/strategy/_?h=&m=` (that position's sheet), else `/you` |
| `#/lite/search?q=` | `/search?q=` |
| `#/lite/w/<addr>` | `/w/<addr>` |
| `#/pro/…`, a Pro-only page, the bare `yieldcircle://` (the wallet's return) | passed through unchanged |

Pro is the web's on the phone for now: "Open this in Pro" (`useNav().pro`) opens `#/pro/…` there.
Share text and its link are core's (`shareOf`, `canShare` in `model/lite.ts`); both apps call them.

## Decisions on the look

- **Dark only**, on both apps (2026-10-28). The tokens have no light set and none is planned: it is
  not a gap to file.
- **The type scale and touch sizes are tokens** (`packages/design/tokens.css`: `--fs-cap` 11 …
  `--fs-d3` 44, `--ctl` 36, `--tap` 44). Whole pixels, nothing under 11; a control is 36 to look
  at and 44 to hit (`hitSlop` on the phone).

## Known gaps, roughly in order

- **Solana:** not wired. AppKit's Solana adapter + its Phantom / Solflare
  connectors replace the web's Wallet Standard (`wallet/solana.ts`), which has
  no window to live in here. Adding Solana turns Link Mode off (below).
- **Universal links for shared Copy links** (`https://app.yieldcircle.io/#/lite/…`): the map and
  the handler are in (above); the same `apple-app-site-association` / `assetlinks.json` as below
  make the system hand them to the app.
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
