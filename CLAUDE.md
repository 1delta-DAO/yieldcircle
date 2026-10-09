# YieldCircle — notes for agents

- Before touching any code that fetches data or builds a transaction, read
  [`docs/apis.md`](docs/apis.md): which service each call hits (1delta API,
  position index, social), the layering (`http.ts` → `api.ts` → `queries.ts` →
  UI), and the rules (no raw `fetch` in UI, never read the connected user's
  positions from the index, `marketUidIn/Out` flip between loop open and close).
- Social layer design: [`docs/social.md`](docs/social.md).
- Two deployments from one repo: the app (`index.html` + `src/`, Pages +
  `functions/_middleware.ts`) and the landing page (`landing/`, a second Pages
  project with its own `_worker.js`; shares `src/` and `public/`). The waitlist endpoints both use
  live in `gate/waitlist.ts`. See [`docs/deploy.md`](docs/deploy.md).
- Shared design: [`design/`](design/README.md) (`@yieldcircle/design`) — tokens,
  base, shared components and the brand. Both entries import
  `@yieldcircle/design/index.css` first; app-only styles stay in `src/styles/app.css`.
- `pnpm build` (tsc + vite) is the type check; `pnpm build:landing` builds the landing.
