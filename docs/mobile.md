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

**What is on the phone** (2026-11-02):

| | Lite | Pro |
|---|---|---|
| Home | balance and a day's earnings, streak, the idle nudge, three lenses of cards (proven · trending · most held), the moves (Following · Everyone, with Copy, Follow and the mover's reason), a dot on the tab for new moves by people you follow | your money, the best three rows per money |
| Earn | four money tiles (the best deposit, the levered rate beside it), the best rates safest first or a money's rows, search · sort · filters, "show all" | every row of a money, every venue and chain |
| Board | wallets and strategies (best rate · most a day) in all money or Dollars · ETH · BTC, on the chains in scope (the chip, `src/ui/ChainChip.tsx`), Everyone · People you follow, the top 20 then more; an opened wallet shows each position's share and what it made, its closed ones, Follow and its profile | the same board |
| Profiles | a wallet's page (`/w/<addr>`), your name and face (`/me`), Follow on faces | the same pages |
| Search | recent picks (the same list the web keeps), people you follow, the best rates, the four categories; results with what each name rests on | — |

The rules behind these are shared, not copied: `tileRates`, `safestFirst`, `BOARD_HELD` and
`NAME_CLAIM` in core, `liteMoves` and `isDust` in core's `model/moves.ts`, and the hooks in `app`
(`liteMoves.ts`: `useLiteMoves`, `useMoveReasons`; `board.ts`: `useLiteByKey`, `useBoardNames`,
`useWalletRecord`; `earnFilter.ts`; `social/seen.ts`).

**The ticket's people** (2026-11-02): adding opens "Who's in it" under the ticket — the biggest
holders, the people you follow first, what each said, a Copy on each (`useWhoIsIn`) — and the
strategy's thread folded under it (`src/ui/thread.tsx`: reactions, replies, delete, one signature
per post). "Say why" sits under the sign button and comes back once the ladder is done; it posts to
the strategy's thread (`ThreadCtx`, from `useThreadOf`). Reactions and the author's stake line are
core's (`social/words.ts`).

**A held loop as a loan** (2026-11-02): Lite's "Deposit & borrow" and "Repay & withdraw" tabs
(core's `liteModes`) draw `LoopLoanBody` (`src/ticket/bodies.tsx`), the web's `LoopLoanPanes`:
collateral in and, on a plain loan (`plainLoan`), more borrowed — zone chips and a typed sum, no
slider — or debt paid and collateral out. The logic is shared with the web's panes
(`@yieldcircle/app/tickets/borrow`: `useBorrowTicket`, `useTopUpTicket`, `loopLoanOffer`; repay is
`useRepayTicket`). Before this the two tabs fell through to Lower risk's body. Add is offered on any
held position the ticket can carry, as on the web.

**The rest of Lite** (2026-11-02), so Lite is whole on the phone:

- **A position's record** (`app/position.tsx`, the web's `PnlDrawer`): a tap on any position on the
  board or a profile. The record in a sentence, value · average equity · APR, exact or not, its own
  money or USD, the PnL line (gaps where there was no price, a mark where a held PT matured), and
  folds for its legs, its holding periods per day and its moves with what it earned before each.
  The rules are core's (`model/positionRecord.ts`, `model/protocolName.ts`); the web's drawer reads
  the same.
- **Every number** under You's "What you made" (`app/made.tsx`): the day-by-day line (all of it and
  what farming made), by strategy, every position — each opens its record. A price bet on You opens
  Pro on the web, as on the web (Lite has no actions for it); the "comes next" `app/details.tsx` is
  no longer opened from anywhere.
- **Paper money** (`src/paper.tsx`, `app/paper.tsx`): the web's one sign-in form, the same keys from
  the same name and password (`@yieldcircle/app/paper/keys`, pinned by `keys.test.ts`), and the same
  engine (`@yieldcircle/app/paper/engine`: the book, its sync, the offline queue, `act`). There is no
  wallet connector on the phone: signed in, the session shows the paper account as the account (its
  Solana key acts on Solana), its key signs social writes through `Platform.useLocalSigner`, and every
  ticket confirms on paper through the shared paper ladder. You shows what it made off the ledger and
  signs out. The derived keys — never the password — stay on the phone, because the derivation is slow
  without a JIT: 0.15 s in Node, 8 s with `--jitless` on a laptop, so roughly 15–30 s on a phone. The
  sign-in shows a bar and says it runs once per phone. A native scrypt (`react-native-quick-crypto`)
  would make it instant, at the cost of a dev-client rebuild and of paper in Expo Go.
  Paper is optional and steps aside, as on the web (2026-11-04): a wallet connected while paper is in
  use takes over (an AppKit session restored at launch does not), and paper stays signed in —
  "Use it" (profile, the offers, the ticket's "Continue as …") brings it back at once, with no new
  derivation. Profile and settings has the paper account (in use or not, Use my wallet, Export the
  book through the share sheet, Sign out); You's paper figure has the farming / price bar, the
  server's daily line and **Every number** (`app/paper-book.tsx`: earned · at work · put in ·
  friction, each position with what it made, the bank and what is bridging, the paper clock).
| Feed · Borrow | — | "comes next" (the feed needs the social layer; borrowing comes with the ticket) |

A row opens the **strategy screen**: what it is in words, the rate (amber on a
spike), risk, kind, who runs it, chain, size, who holds it, yours. It is
read-only — **Earn this** is disabled until the phone has the ticket, and says
so. **You** (behind the balance chip, as on the web) has your money and its positions (each opens
its Lite ticket, "More choices" included). **Profile and settings** (`app/profile.tsx`, behind the
face top-left, 2026-11-03) has who you are, the wallet, your name and face, your linked wallets,
what waits for a signature, the chains every list reads, the filters (Lite's four in Lite, all of
Pro's in Pro, drawn from core's `LITE_CONTROLS` / `FILTER_CONTROLS`) and slippage, the
**Lite / Pro switch** (saved like the web's setting; `/` opens the saved mode) and the wallet probe
(`app/probe.tsx`: what the wallet answers to `wallet_getCapabilities`).

**Profiles** (2026-11-01) are Lite's on both apps. A wallet's page (`app/w/[account].tsx`, the web's
`LiteProfile`) shows who it is, its followers and the people you follow among them, the board's
numbers, what it runs with a Copy on each, what it said, and its recent moves. Your own address opens
You. **Your name and face** (`app/me.tsx`) is the web's profile editor (Pro's `#/me`; Lite links
there) in Lite's look: character or picture, handle (checked as you type), name, bio, tags, unlisted,
the X link, and your linked wallets. **Save** queues the edit with your follows (docs/social.md §17),
and the profile screen lists the queue and signs it in one `Batch`; **Save and sign now** signs at once. Follow is
on profiles and in search. Profile names and faces show on the board, in search, on the Home cards and
in the top bar, where a dot means something is waiting to be signed. Each signature brings the
wallet forward through `Platform.openWallet`, as the ladder does. The social code is shared:
`@yieldcircle/core/social/*` (client, types, EIP-712 envelope) and `@yieldcircle/app/social/*`
(queries, the queue, `useSocialWrite`). The web's `src/social/*` re-export them.

```
mobile/
  app/_layout.tsx        polyfills → env → AppKit, wagmi, React Query, Settings, session; the AppKit modal
  app/index.tsx          → /lite or /pro, by the saved mode
  app/lite/  app/pro/    the two tab navigators and their screens (the bar itself is src/ui/TabBar.tsx)
  app/strategy/[id].tsx  one strategy, read-only
  app/you.tsx            your money: stats, what you made, positions, follows' moves
  app/profile.tsx        profile and settings: wallet, linked wallets, pending, chains, filters, Lite / Pro
  app/w/[account].tsx    a wallet's profile (the web's LiteProfile)
  app/me.tsx             your name and face: the profile editor, the X link, linked wallets
  app/probe.tsx          the wallet-capabilities probe
  src/session.tsx        the phone's SessionProvider: every chain, the connected wallet
  src/mode.ts            Lite / Pro, in localStorage
  src/ui/                bits (Tok, GroupIcon, RiskDot, Rate, Seg …), Lite rows and cards, Pro rows, the board,
                         social.tsx (Follow, moves, pending changes, a profile's wallets)
  src/env.ts             EXPO_PUBLIC_* → core's configureBackend (the web's src/env.ts, for the phone)
  src/appkit.ts          WagmiAdapter + createAppKit: the web's chain list, metadata, features off
  src/storage.ts         AsyncStorage behind AppKit, so a session survives a restart
  plugins/wallet-queries.js  Android <queries> so installed wallets are detected
  app.json · eas.json    identity, wallet schemes (iOS), build profiles
```

**Not on the phone yet**, in the order they would come: the ticket (opening
and closing a position: the web's `Ticket.tsx` + `useLadder.ts`), the rest of
the social layer (the feed, threads and signed comments; profiles and follows
are in).

**Solana** (2026-11-04): AppKit's Solana adapter beside the wagmi one (`src/appkit.ts`), with the
Phantom and Solflare deep-link connectors — an EVM and a Solana wallet at once, one account per VM
as on the web. Two ways in, both from AppKit's wallet list (Profile and settings → EVM / Solana →
Connect): a wallet that holds both (Trust, Phantom over WalletConnect) approves both namespaces in
one session, and then disconnecting one disconnects the other; or Phantom / Solflare connect Solana
on their own protocol beside any EVM wallet. A second *WalletConnect* wallet replaces the first —
AppKit keeps one WalletConnect session. `src/solana.ts` fills `Platform.useSol`, `solSignAndSend`
and `solSignMessage`: WalletConnect requests go base64, deep links base58; a WalletConnect wallet
that did not approve `solana_signAndSendTransaction` signs and the app broadcasts (core's
`solRpc.sendTransaction`). It reads the Solana connection off AppKit's `ConnectionsController` by
namespace — AppKit's "active" account goes blank on Solana once the EVM wallet is disconnected —
so `@reown/appkit-core-react-native` and `valtio` are direct dependencies and single copies in
`metro.config.js`. The session (`src/session.tsx`) is the web's: the EVM wallet leads, the Solana
one is `solSigner` and acts on Solana, a Solana-only user is the account. Phantom's and
Solflare's answers come back as `yieldcircle://?nonce=…&data=…`; `+native-intent.tsx` keeps them
(and the bare `yieldcircle://`) from navigating. Untested on a phone: connect, a Solana ticket, a
Solana-signed social write, per wallet.

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
| `pnpm mobile release [ios]` | a store build (`production`) straight to TestFlight — after a native change (below) |
| `pnpm mobile update ["what changed"]` | JS-only release to the TestFlight builds: no build, no review (below) |
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
way. A build installed this way (dev or `preview`, "ad hoc") runs only with
Developer Mode on — for testers, TestFlight (below).

### Testers: TestFlight and updates

Set up 2026-11-01: the app is on App Store Connect (`ascAppId` 6829504192, in
`eas.json`), the EAS submit key is stored on EAS, and the internal group
"Team (Expo)" gets every build. Testers install **TestFlight**, accept the
invite, install — no device registration, no Developer Mode. Internal testers
(App Store Connect users, up to 100) need no review; an external group with a
public link needs Beta App Review once.

Two ways to ship, and which one is decided by the native code:

- **`pnpm mobile update ["what changed"]`** — the everyday one. Publishes the JS
  (screens, core, app) to the `production` channel in about a minute; the
  phones download it on start and run it on the next one. Bundled on this
  machine, with the root `.env`'s keys. The message defaults to the last
  commit's subject; `pnpm mobile update preview "…"` targets the ad hoc builds.
- **`pnpm mobile release`** — after a **native** change: a new native package,
  an Expo SDK bump, `app.json` (icon, splash, schemes, plugins). Builds
  `production` on EAS and submits it; TestFlight has it 30–45 min later, the
  build number counting up by itself. Bump `version` in `app.json` only for a
  milestone.

`runtimeVersion` is the **fingerprint** of the native code, so an update only
reaches builds it can run on: after a native change, `update` finds no build to
land on until a `release` has gone out. When unsure which is needed,
`npx expo-updates runtimeversion:resolve --platform ios` in `mobile/` before and
after (the `runtimeVersion` it prints changes with the native code), or just
`release`.

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

`supported` / `ready` (or the draft's `atomicBatch: { supported: true }`, `canBatchOn` in
`app/ladder.ts`) → the ladder can go out as one batch; `unsupported`, `not reported` or an error
→ step by step, as the web already falls back. A wallet that answers the draft shape but refuses
viem's `wallet_sendCalls` 2.0 drops back to steps on the first try.

**A batch is followed from send, not from the wallet's report** (2026-11-04). Over WalletConnect
the wallet is another app, and in the background iOS keeps it from answering
`wallet_getCallsStatus`, so a batch that had landed sat as "not reported yet". Now
`txTrace.traceBatch` starts the trace the moment the wallet takes the batch (the ladder and the
bridge ticket's route + gas leg), and the first of three answers wins:

1. the wallet's report (`batchLanded` / `batchFailed`): its transaction, followed as any other;
2. the account's nonce moving past the one read before sending (`markBatch`: an EOA, EIP-7702
   delegated or not): the transaction with that nonce is found in the blocks since, then followed
   as any other: receipt, revert, depth, reorg;
3. what it touched moving against the baseline (a smart account or a relayer, whose batches never
   move the EOA's nonce): landed, with no transaction to link. A bridge sent this way goes
   straight to the destination balance; its status needs the source hash.

Not covered: a bridge ticket's gas leg sent as a separate transaction (non-atomic) is traced on
its own only if the wallet reports it; its balance still shows on the next read. Tested against a
fake chain (`app/src/sdk/txTrace.batch.test.ts`), not yet on a phone; fill in the table above.

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

- **The tab bar is on every page** (2026-11-10). Pages pushed over the tabs — a wallet's page, You,
  a position, search, profile — used to cover the navigator's bar, leaving the back arrow as the one
  way out. Now one bar sits under the root stack (`AppTabBar`, `src/ui/TabBar.tsx`): the tab a page
  was opened from stays lit, a tap on any tab closes what was pushed and lands on that tab. It steps
  aside only for a task with its own close: the paper sign-in, and the ticket (on iOS the native
  sheet covers it anyway). This is the iOS HIG and Material rule, and what Revolut, X and Instagram do.
- **Dark only**, on both apps (2026-10-28). The tokens have no light set and none is planned: it is
  not a gap to file.
- **The type scale and touch sizes are tokens** (`packages/design/tokens.css`: `--fs-cap` 11 …
  `--fs-d3` 44, `--ctl` 36, `--tap` 44). Whole pixels, nothing under 11; a control is 36 to look
  at and 44 to hit (`hitSlop` on the phone).

## Known gaps, roughly in order

- **Profile signatures over WalletConnect are untested per wallet.** The social domain has no
  `chainId` on purpose (`core/social/envelope.ts`). Check in the capabilities table below that each
  wallet signs it and hands back. The profile pieces the phone does not have yet:
  - **Explorer links** under a profile's address: the chain table with explorer URLs is the web's
    (`ui/ChainMark.tsx`). The address opens the share sheet instead.
  - **Earned badges are not listed** in the editor: the crown and label formatting is in the web's
    `social-bits.tsx`. The editor still uses them to lock earned layers.
  - **Linking a wallet** starts on the web, where both keys can be connected. Unlink works here.
  - **The X proof text** goes to X or the share sheet, since there is no clipboard module (it
    would need a dev-client rebuild).

- **Solana on a real phone:** wired (above) but not yet run on a device. Needs a `release`
  (Solflare joined the wallet lists in `app.json` and the Android queries). Solana in the
  WalletConnect namespaces turns Link Mode off (below). `@solana/web3.js` came with the adapter:
  the bundle went from 9.3 to 12 MB.
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
- **Paper sign-in speed:** measure the derivation on a real phone (above: 15–30 s expected, once per
  phone). If it is too slow, swap `derivePaperKeys`'s scrypt for `react-native-quick-crypto`'s on the
  phone only (a dev-client rebuild); the derived keys must stay byte-identical (`keys.test.ts`).
- **Paper on the phone, untested end to end:** creating an account posts a real profile, so the
  browser check stopped at "Create?". Sign in, confirm a paper deposit and post a comment as paper on
  a dev build.
