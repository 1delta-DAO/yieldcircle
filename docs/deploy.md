# Deploy — Cloudflare, git-linked

Three projects from this one repo, all building on push to `main`; secrets
live in the dashboard, never in git:

| | what | where | serves |
|---|---|---|---|
| 1 | the app — **Pages** project `yieldcircle` | `app.yieldcircle.io` | `index.html` + `src/`, the beta gate (`functions/`) |
| 2 | the landing — **Pages** project `yieldcircle-landing` | `yieldcircle.io` | `landing/`: the public page and the waitlist signup, linking into the app |
| 3 | the x-link helper — **Worker** `yieldcircle-xlink` (optional) | `xlink.yieldcircle.io` | `worker/x-link/` |

The landing and the app share one waitlist: both bind the `WHITELIST` KV
namespace and answer `/gate/check` + `/gate/request` from the same code
(`gate/waitlist.ts`). Only the app signs a wallet in (`/gate/verify`), since
the beta cookie belongs to its origin — a whitelisted wallet on the landing is
sent on to the app.

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
| `VITE_SITE_URL` | defaults to `https://app.yieldcircle.io` — the canonical / og origin and the WalletConnect metadata URL |

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

## 2 · The landing — Pages project `yieldcircle-landing`

A second Pages project on the same repo. Its Worker
([`landing/worker.ts`](../landing/worker.ts)) is bundled into the output as
`_worker.js` by [`landing/build-worker.mjs`](../landing/build-worker.mjs) —
Pages' advanced mode, so the repo's `functions/` (the app's gate) is ignored
here — and `_routes.json` sends it only `/gate/*`; everything else is a static
file.

| Settings → Build | value |
|---|---|
| Build command | `pnpm build:landing` |
| Build output directory | `dist-landing` |
| Root directory | `/` |

| Settings → … (Production and Preview) | name | value |
|---|---|---|
| Bindings → KV namespace | `WHITELIST` | the same `WHITELIST` namespace as the app (`23ce3e9b…`) — one waitlist, two front doors |
| Build variable | `VITE_WC_PROJECT_ID` | the same Reown project id; register the landing's origin on it too |
| Build variable (optional) | `VITE_APP_URL` | defaults to `https://app.yieldcircle.io` — every "Sign in" and app link |
| Build variable (optional) | `VITE_SITE_URL` | defaults to `https://yieldcircle.io` |
| Secret (optional) | `RESEND_API_KEY`, `NOTIFY_EMAIL` | as on the app — a request mail per new waitlist entry |

The gate's card is built into the landing's `index.html` at build time
(`landing/vite.config.ts`), so nothing rewrites HTML at the edge. Locally:
`pnpm dev:landing` (port 3201; `/gate/*` needs the Worker:
`pnpm build:landing && npx wrangler pages dev dist-landing --kv WHITELIST`),
or `pnpm deploy:landing` (direct upload).

The investor deck lives on the landing too, at `/deck`: a second page of the
same build (`landing/deck.html` → `deck-main.tsx` → `Deck.tsx`, styles in
`deck.css`). Nothing links to it. Pages serves `deck.html` for `/deck`; in dev
it is `http://localhost:3201/deck.html`. `pnpm deck:pdf` prints it to
`dist/deck.pdf`, one slide a page; the "Save as PDF" button on the page does the
same through the browser's print dialog.

### Cutover from one origin to two

Until now the app (with the landing inside it) lived on `yieldcircle.io`.
In order:

1. Pages `yieldcircle` → Custom domains: add `app.yieldcircle.io`.
2. Reown project: add `https://app.yieldcircle.io` (keep `https://yieldcircle.io`, the landing connects wallets too).
3. `worker/x-link/wrangler.toml`: `ALLOWED_ORIGIN` → `https://app.yieldcircle.io`, redeploy the x-link worker.
4. Pages `yieldcircle` → Custom domains: remove `yieldcircle.io`; Pages `yieldcircle-landing` → add it (the dashboard repoints the DNS record).
5. Pages `yieldcircle` → Variables: `VITE_SITE_URL` → `https://app.yieldcircle.io`, then redeploy.

Beta cookies are per origin: members sign in once more on `app.yieldcircle.io`.

## 3 · The x-link worker — `yieldcircle-xlink` (optional)

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
