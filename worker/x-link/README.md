# The X link worker — the *optional* OAuth route

**You probably do not need this.** The default way to link an X account costs
nothing and needs no developer account: the holder signs an `XLink` message,
posts their address and a nonce on X, and the social service reads the post
back through the public `publish.x.com/oembed` endpoint
(`packages/social/src/xVerify.ts`). That path is on by default and works with
nothing configured.

This worker buys one thing: **X's stable numeric user id**, which a rename
cannot break. Everything else about it is a cost — a developer app, a client
secret a static site cannot hold, and, since X ended free API access for new
developers on 6 February 2026, about **$0.010 per link** for the one
`GET /2/users/me` read.

```
GET  /challenge?account=0x…&action=link   → { nonce }
POST /begin { account, nonce, action, signed }  → { url } | { ok }
GET  /callback?code&state                 → finishes, then closes the popup
```

The **nonce** is what makes this safe. It is inside the EIP-712 `XLink`
message the wallet signed *and* inside the OAuth `state`, so a captured
signature cannot be replayed against a different X account and a captured
code cannot be redirected onto a different wallet. PKCE (S256) covers the
authorization code on its own account.

The worker never verifies the signature — the social service recovers the
signer, which is the only place that should — but it refuses to carry a
message whose `author`, `nonce` or `action` disagrees with the challenge it
issued.

## Deploy

```bash
npx wrangler kv namespace create XLINK      # id → wrangler.toml
npx wrangler deploy
```

`X_CLIENT_SECRET` and `XLINK_SECRET` (the same value the social service has)
are plain `[vars]` in `wrangler.toml`, which is **gitignored** — the config
with its ids and secrets lives only on the deploying machine. Deploy this
worker manually from here; a git-linked build has no config to read.

Then set `VITE_XLINK_URL` on the Pages project to the worker's origin, and
`XLINK_SECRET` in the social service's environment. Without either, the app
falls back to the free post-proof route and never mentions OAuth.

In the X developer portal the app needs **OAuth 2.0, confidential client**,
scopes `users.read tweet.read`, and this worker's `/callback` as a redirect
URI.

⚠️ Pricing: new developers are on pay-per-use since 6 February 2026 (the flat
Basic and Pro tiers closed to new signups, and legacy Basic was migrated on
1 June 2026). A user read is about $0.010, so one link costs about a cent and
there is no monthly minimum — but there is also no free allowance to
prototype against, and the shape of this keeps changing. The free route needs
none of it.

Worth knowing: OAuth **1.0a** returns `screen_name` and `user_id` in the
access-token response itself, so it would give the numeric id without a
billed read. It still needs an approved app, and X's own documentation page
for it currently answers `402 Payment Required`.
