# Deploy — two Cloudflare Workers, git-linked

Both are standard Workers Builds projects: each has a committed
`wrangler.toml` with no secrets, Cloudflare builds on push, and secrets live
in the dashboard. Create each with Workers & Pages → Create → **Workers** →
Import a repository → this repo. The project name **must equal** the `name`
in its `wrangler.toml`.

## 1 · The app — `yieldcircle`

A Worker serving `dist/` as static assets ([`wrangler.toml`](../wrangler.toml)).

| Settings → Build | value |
|---|---|
| Root directory | `/` |
| Build command | `pnpm build` |
| Deploy command | `npx wrangler deploy` |

**No variable is required** — the API, index, social and site URLs all
default to production. Two optional build variables:

| Build variable | value |
|---|---|
| `VITE_WC_PROJECT_ID` | Reown project id — without it phones cannot connect a wallet (the build warns) |
| `VITE_XLINK_URL` | the x-link worker's URL, only if that worker is deployed |

A build variable takes effect on the next build.

Locally: `pnpm deploy` (= menu-seed + build + `wrangler deploy`), or
`pnpm deploy:preview` for a preview version that does not take traffic.

## 2 · The x-link worker — `yieldcircle-xlink` (optional)

[`worker/x-link/wrangler.toml`](../worker/x-link/wrangler.toml) carries the
plain vars and the `XLINK` KV binding. Without this worker the app uses the
free X-post link path.

| Settings → Build | value |
|---|---|
| Root directory | `worker/x-link` |
| Build command | *(empty)* |
| Deploy command | `npx wrangler deploy` |

| Settings → Variables and Secrets (type **Secret**) | value |
|---|---|
| `X_CLIENT_SECRET` | the X app's client secret |
| `XLINK_SECRET` | the same value the social service holds |

Secrets survive deploys — wrangler never touches them. In the toml, fill
`X_CLIENT_ID` and set `REDIRECT_URI` to the worker URL + `/callback` (register
the same in the X app). For `wrangler dev`, the secrets go in the gitignored
`worker/x-link/.dev.vars`.

## The beta gate (tickets/0002)

Lands in the app worker itself: a `main` script with
`assets.run_worker_first = true` and the `WHITELIST` KV binding — the lines are
already in the root `wrangler.toml`, commented. Plus `GATE_SECRET` as a Secret
on the `yieldcircle` project.
