# Mobile — why the tabs lagged, and what was done (2026-11-14)

A tab switch on the phone held the JS thread for long enough to feel broken, and so did opening
anything over the tabs. Measured, fixed in the shared data layer, measured again. Not yet run on a
phone: the numbers below are the app's browser render under a throttled CPU (how, at the end).

## What was wrong

None of it was the navigator. Every cause was the same shape: **work done per component and per
render that should be done once per answer.**

1. **Every reader of the book derived the whole catalogue for itself.** `useBook` is called by the
   top bar (one per tab: three in Lite), each tab, the tab bar's pill and every pushed page;
   `useLiteMenu` by most of them again. Each copy held its own `useMemo`s over the same cached
   answers, so each classified every earn row, deduped, capped and sorted it — eight times over —
   and woke on every answer of some hundred query observers. A first visit to a tab paid all of it
   on mount.
2. **`useBook` and `useLiteMenu` memoised nothing they returned.** `all` was a new array per
   render, so the rate history's uid list (the catalogue's, sorted) and its request key (a few
   hundred kB of text) were rebuilt per render; `liteMenu` named, folded and sorted every row per
   render, asking each row's steady rate — a 30-point series, rebuilt — at every comparison of the
   sort; `rows` being new, every `useMemo` keyed on it downstream (`liteCards`, `liteMoves`,
   the board's name maps) ran again too.
3. **The balance read rebuilt its asset lists per render**: per chain a deduped, sorted list of up
   to ~450 addresses (twice), then `JSON.stringify` of all of them for the query key. The largest
   single item in the profile with a wallet connected.
4. **A formatter was built per figure.** `toLocaleDateString` for every dated row's name and
   `toLocaleString('en-US')` for every dollar figure each construct an `Intl` format. On Hermes
   that is a call into the system's ICU each time — far dearer than the browser profile shows.
5. **The tab bar re-rendered every page.** `AppTabBar` handed the safe-area context a new object
   on every render — every tab switch, and every second while a transaction's clock ticks — and
   every page and header reads that context.
6. **Every SVG token logo was fetched and parsed again on every render of its row.**
   react-native-svg's `SvgUri` keeps nothing, and its effect is keyed on the `onError` it is given
   — an inline arrow in `Tok`, new each render. Each re-render of a list was a fetch per SVG logo
   and an XML parse on the JS thread.

## What changed

| | where |
|---|---|
| One answer for every caller with the same inputs (`sharedCache`): the catalogue's derivation, the book's row list, the history's uid list, Lite's ranking (a steady rate per row, once per history), the menu's rows and proof keys, the balance read's asset lists and index key | `packages/app/src/shared.ts`, `sdk/queries.ts`, `book.ts`, `lite.ts`, `sdk/rateHistoryStore.ts`, `index/proofStore.ts` |
| The catalogue, the book and the menu are the same object until a part of them changes (`useMemo` over parts held still by `useSame`, React Query's structural sharing) | `sdk/queries.ts`, `book.ts`, `lite.ts` |
| **One book and one menu for the phone**: `BookProvider` and `LiteMenuProvider` at the root; `useBook` / `useLiteMenu` read them from context there, and compute their own where there is none (the web, unchanged) | `book.ts`, `lite.ts`, `mobile/app/_layout.tsx` |
| Formats made once: the dated rows' `Intl.DateTimeFormat`, a plain thousands grouping for whole dollars, a cached `Intl.NumberFormat` for the rest. Same text out (checked over 200k values) | `packages/core/src/model/format.ts`, `lite.ts`, `strategies.ts`, `ticket.ts` |
| The page insets are one object until an inset changes | `mobile/src/ui/TabBar.tsx` |
| An SVG logo is fetched and parsed once per address for the whole app (`SvgLogo`); a failed one is left alone for five minutes | `mobile/src/ui/bits.tsx` |

Nothing a screen shows changed: the same pages were dumped as text before and after and differ
only where other work in the tree changed them. The web takes the shared caches and the stable
objects too; it mounts no provider.

**A rule that follows:** on the phone `useBook()` and `useLiteMenu()` are context reads. A new page
calls them freely; it must not sit under a second `SessionProvider` (another wallet's book) without
its own `BookProvider`. In the shared layer, a derivation over the catalogue goes through a
`sharedCache`, not a bare `useMemo` — `useMemo` is per component, and there are many.

## Measured

CPU ×6, Lite, all chains, each tap followed for 2.5 s. *Blocked* is the time the thread was held in
tasks over 50 ms.

| tap | wallet with positions: before → after | no wallet: before → after |
|---|---|---|
| Earn, first visit | 1679 → 0 ms | 362 → 0 ms |
| Board, first visit | 773 → 67 | 306 → 63 |
| Home, back | 619 → 71 | 131 → 65 |
| Earn again | 356 → 52 | 99 → 50 |
| Board again | 127 → 102 | 108 → 99 |
| Home again | 514 → 71 | 149 → 69 |
| Earn, third | 122 → 57 | 97 → 55 |
| Earn: pick Dollars | 95 → 96 | 88 → 58 |
| Home, fourth | 249 → 130 | 134 → 97 |
| **all nine** | **4534 → 646** | **1474 → 556** |
| JS busy over the whole run | 5953 → 1561 | 2353 → 1475 |

A throttled cold start (45 s from the first byte, wallet) held the thread 6.8 s before and 4.5 s
with the providers in — measured once, both runs side by side, before the logo and format changes.

What is left in a tab switch is React rendering the page it lands on (the route's params change,
so the page renders) — one task of 50–130 ms at ×6.

## Not done, in the order it would pay

- **Run it on a phone.** Hermes has no JIT: the JS that was cut weighs more there than here, and
  the `Intl` change is close to invisible in a browser. A release build, not the dev client —
  the dev client runs unminified JS with React's dev checks and is several times slower by itself.
- **Hidden tabs still render when the book changes.** expo-router 58 can wrap inactive screens in
  React `<Activity>` (`activityEnabled` on `<Tabs>` / `<Stack>`): a hidden tab then drops its
  subscriptions and renders at idle priority. Left out because it re-runs a screen's effects on
  every return (Earn's `?g=` effect would reset a picked category) and has not been seen on a
  device.
- **Pages re-render whole.** Rows are not `React.memo`'d, and `proof(s)` hands each a new object.
  With the book stable this is one render per real change; memo the rows if a list still stutters.
- **Long lists are `ScrollView`s** (Earn's "show all", the board's top 50, You): every row mounts
  at once. A `FlatList` when a list passes ~50 rows.
- **Start-up.** The bundle is 12 MB of bytecode (docs/mobile.md, "Bundle size") and the first
  catalogue answer is classified in one go — the longest single task of a cold start (~1 s at ×6).
- **The Lite menu is worked out in Pro too** (the provider is at the root): one pass per catalogue
  answer and one proofs request. Move the provider under `app/lite/` if Pro grows its own pages.

## Measuring it again

`scripts/mobile-perf.mjs` drives the app's browser export through the tabs under a throttled CPU
and writes a table like the one above, the profile's top functions and a `.cpuprofile` (Chrome
DevTools → Performance → load) to `.harness/mobile-perf/`:

```
cd mobile && EXPO_PUBLIC_BACKEND_BASE_URL=… npx expo export --platform web --no-minify --output-dir /tmp/yc-web
node scripts/mobile-perf.mjs /tmp/yc-web <label> [--as=0x…] [--rate=6]
```

`--as` reads a wallet without connecting it (the browser-only `?as=`, `mobile/src/session.tsx`); a
book with positions is the case that hurts. The browser is not the phone — V8 has a JIT, the DOM
is not Fabric — but the bundle is the same JS, and that is where the time went: read a run against
another run, not as the phone's own numbers. The data is live, so two runs differ by a few tens of
milliseconds a tap.
