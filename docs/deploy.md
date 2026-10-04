# Deploy — Cloudflare, git-linked

The app is a **Pages** project, the optional x-link helper a **Worker**. Both
build on push to `main`; secrets live in the dashboard, never in git.

## 1 · The app — Pages project `yieldcircle`

Configured entirely in the dashboard (the root `wrangler.toml` is gitignored
and unused by the git build).

| Settings → Build | value |
|---|---|
| Build command | `pnpm build` |
| Build output directory | `dist` |
| Root directory | `/` |

**No build variable is required** — the API, index, social and site URLs all
default to production. Optional, and only effective on the next build:

| Build variable | value |
|---|---|
| `VITE_WC_PROJECT_ID` | Reown project id — without it phones cannot connect a wallet (the build warns) |
| `VITE_XLINK_URL` | `https://xlink.yieldcircle.io` |

**The beta gate** (`functions/_middleware.ts`, tickets/0002) needs, under
both Production and Preview:

| Settings → … | name | value |
|---|---|---|
| Bindings → KV namespace | `WHITELIST` | the `WHITELIST` namespace (`23ce3e9b…`) |
| Variables and Secrets (Secret) | `GATE_SECRET` | 32+ random characters (`openssl rand -base64 32`) |
| Variables and Secrets (Secret, optional) | `RESEND_API_KEY` | resend.com API key — emails each `/lineup` request; without it requests are only stored |
| Variables and Secrets (optional) | `NOTIFY_EMAIL` | where requests are mailed; defaults to `achim@1delta.io`. Resend's `onboarding@resend.dev` sender only delivers to the Resend account's own address, so sign up with this one (or verify a domain) |
| Variables and Secrets (optional) | `GATE_OFF` | `1` opens the app to everyone — the end of the beta |
| Variables and Secrets (Secret, optional) | `GATE_PASS` | an access code: `https://<site>/?access=<code>` lets the holder in for 30 days without a whitelisted wallet (hackathon judges, reviewers). Change it to stop new entries; rotate `GATE_SECRET` to also log out those already in |

The gate is an **overlay**: the app always loads and stays visible behind a
frosted layer; only the HTML document is touched. Missing binding or secret =
gate **off**, app open (a misconfiguration never takes the site down). Manage the list with `pnpm whitelist`
(`add`, `remove`, `list`, `waitlist`, `wait`, `promote N` — see
`scripts/whitelist.mjs`).

Locally: `pnpm deploy` / `pnpm deploy:preview` (direct upload of `dist`).

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
