# YieldCircle — notes for agents

- Before touching any code that fetches data or builds a transaction, read
  [`docs/apis.md`](docs/apis.md): which service each call hits (1delta API,
  position index, social), the layering (`http.ts` → `api.ts` → `queries.ts` →
  UI), and the rules (no raw `fetch` in UI, never read the connected user's
  positions from the index, `marketUidIn/Out` flip between loop open and close).
- Social layer design: [`docs/social.md`](docs/social.md).
- `pnpm build` (tsc + vite) is the type check.
