# Deploy — the git-linked Cloudflare Pages project

The dashboard settings, field by field. **Both `wrangler.toml` files are
gitignored** (the x-link one holds plaintext secrets), so the git-linked build
never sees them: everything below — build settings, variables, bindings — is
configured in the dashboard UI. The local tomls serve the manual
`pnpm deploy` path and local `wrangler` commands only.

> A direct-upload Pages project cannot be converted to git integration. Create
> a **new** project: Workers & Pages → Create → Pages → Connect to Git. To keep
> the name `yieldcircle`, delete the old direct-upload project first; otherwise
> pick another name and move the custom domain after the first green build.

## Build configuration

| field | value |
|---|---|
| Git repository | this repo |
| Production branch | `main` |
| Framework preset | None |
| Build command | `node scripts/menu-seed.mjs && pnpm build` |
| Build output directory | `dist` |
| Root directory | `/` |

pnpm is detected from the lockfile. `menu-seed.mjs` keeps the checked-in seed
on any failure, so it can never fail a build. Git builds build **committed**
code only.

## Variables and Secrets

Set every variable under **both Production and Preview** — `VITE_*` is baked
into the bundle at build time (`scripts/check-env.mjs`; the git-build guard for
the WC id is in `vite.config.ts`).

| name | type | value |
|---|---|---|
| `NODE_VERSION` | plaintext | `22` |
| `VITE_WC_PROJECT_ID` | plaintext | the Reown (WalletConnect) project id — without it phones cannot connect |
| `VITE_BACKEND_BASE_URL` | plaintext | `https://allocator.api.1delta.io`, or the proxy |
| `VITE_INDEX_BASE_URL` | plaintext | optional — defaults to `https://positions.1delta.io` |
| `VITE_SOCIAL_BASE_URL` | plaintext | optional — defaults to `https://social.1delta.io` |
| `VITE_XLINK_URL` | plaintext | optional — the x-link worker; absent = free X-post path only |
| `GATE_SECRET` | **Secret** | 32+ random bytes; HMAC key for the beta-gate cookie and invite codes (only once `functions/` ships — tickets/0002) |

## Bindings (beta gate, tickets/0002)

Added **manually in the UI**: Pages project → Settings → Bindings, under both
Production and Preview. The KV namespace exists; D1 is still to create
(`npx wrangler d1 create yieldcircle-waitlist`):

| binding name | type | resource |
|---|---|---|
| `WHITELIST` | KV namespace | the beta whitelist, `wl:<address>` — id `23ce3e9b23224ce09a4cd4f486480870` |
| `WAITLIST` | D1 database | `yieldcircle-waitlist` — pending |

The local (gitignored) `wrangler.toml` mirrors the same bindings so manual
deploys and `wrangler kv` commands agree with the UI — keep the two in sync by
hand.

A `functions/` directory at the repo root is compiled automatically on every
git build, branch previews included — previews are gated too.

## The x-link worker (`worker/x-link`) — manual deploy

A separate Worker whose `wrangler.toml` is **gitignored** (it carries the
secrets as plain vars), so it cannot be git-linked — a git build would find no
config. Deploy it from a machine that has the local file:

```bash
cd worker/x-link
npx wrangler kv namespace create XLINK      # once; id → [[kv_namespaces]]
npx wrangler deploy
```

Values to fill in the local toml before deploying:

| var | value |
|---|---|
| `X_CLIENT_ID` | the X developer app's client id |
| `X_CLIENT_SECRET` | the X app's client secret — plain var by deliberate choice |
| `XLINK_SECRET` | the same value the social service holds |
| `SOCIAL_URL` | `https://social.1delta.io` |
| `REDIRECT_URI` | the worker's deployed URL + `/callback` — deploy once to learn the `workers.dev` subdomain, set it, redeploy; register the same URI in the X app |
| `ALLOWED_ORIGIN` | the app's production origin (keep `*` only in dev) |

Optional — without this worker the app uses the free X-post link path and
never mentions OAuth.

Finally, point the Pages project's `VITE_XLINK_URL` at the worker's URL (both
environments) so the app offers the OAuth path.

## The manual path

`pnpm deploy` / `pnpm deploy:preview` (direct upload) remain the escape hatch
while both projects exist; they read the same `wrangler.toml`. Retire them once
the git project owns the domain.
