# YieldCircle — notes for agents

- Before touching any code that fetches data or builds a transaction, read
  [`docs/apis.md`](docs/apis.md): which service each call hits (1delta API,
  position index, social), the layering (`http.ts` → `api.ts` → `queries.ts` →
  UI), and the rules (no raw `fetch` in UI, never read the connected user's
  positions from the index, `marketUidIn/Out` flip between loop open and close).
- Social layer design: [`docs/social.md`](docs/social.md).
- A pnpm workspace: the app is `packages/web`, the landing `packages/landing`, the design
  `packages/design`, the X OAuth worker `packages/x-link`, and the platform-free half —
  `model/`, `data/`, `config/`, `vendor/`, `search/`, the API clients `sdk/api.ts` and
  `index/api.ts` — is `packages/core` (`@yieldcircle/core/…`; no React, no DOM, guarded by
  `src/platform.test.ts`). A `src/…` path in these notes and in `docs/` is in core if it is one
  of those, else in `packages/web/src/…`.
- The React data layer both apps share is `packages/app` (`@yieldcircle/app/…`: `sdk/queries`,
  `index/queries`, `index/pnl`, `book` = `useBook`, `lite` = `useLiteMenu`, `state/Settings`). It has
  no DOM; who is looking comes from `SessionProvider` (web: `src/state/session.tsx`). A new data
  hook goes there, not in `packages/web`, unless it needs the browser.
- The phone app is `mobile/` (Expo, AppKit + wagmi, `@yieldcircle/core` + `@yieldcircle/app`): how to run it, its
  decisions and gaps in [`docs/mobile.md`](docs/mobile.md). Platform code (storage, URLs from
  `EXPO_PUBLIC_*`) stays in `mobile/src`; anything both apps need goes to core. Run everything from the repo root (the root `package.json`
  forwards); `scripts/`, `docs/`, `tickets/` and `brand/` stay at the root.
- Lite and Pro: two shells over one catalogue (`#/lite/…`, `#/pro/…`, Lite is the
  default). Lite's rules live only in `model/lite.ts` (core); its pages in `src/ui/lite/`;
  the ticket's Lite branches in `src/ui/Ticket.tsx`. See [`docs/lite-plan.md`](docs/lite-plan.md).
- Two deployments from one repo: the app (`packages/web`: `index.html` + `src/`, Pages +
  `functions/_middleware.ts`) and the landing page (`packages/landing`, a second Pages
  project with its own `_worker.js`; shares the app's `src/` and `public/`). The waitlist endpoints both use
  live in `packages/web/gate/waitlist.ts`. See [`docs/deploy.md`](docs/deploy.md).
- Shared design: [`packages/design`](packages/design/README.md) (`@yieldcircle/design`) — tokens,
  base, shared components and the brand. Both entries import
  `@yieldcircle/design/index.css` first; app-only styles stay in `src/styles/app.css`.
- `pnpm build` (tsc + vite) is the type check; `pnpm build:landing` builds the landing.
