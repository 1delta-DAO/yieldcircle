#!/usr/bin/env bash
# Ship yieldcircle + pos-indexer together, in the one order that never leaves a
# client ahead of the server it talks to (tickets/0022):
#
#   1. preflight   both repos on main, committed, in step with origin; build + tests green
#   2. pos-indexer pushed, then `deploy all` (indexer → social → reader) and `deploy solana`
#                  when the inventory enables it; each service health-checked by deploy.sh
#   3. smoke       the public hosts answer as the new edge should (ops routes 404, the
#                  X challenge exists) — the clients below depend on it
#   4. x-link      `wrangler deploy` of the OAuth worker
#   5. web         `git push` — the app and the landing are git-linked Pages projects
#                  (docs/deploy.md); they build on push
#
# The first failure stops the run; nothing after it goes out. Every server change in
# this round is backward-compatible with the app still live (a 404 on /x/challenge falls
# back to the legacy nonce), so stopping between steps is safe.
#
#   scripts/ship-all.sh          plan + preflight only, deploys nothing
#   scripts/ship-all.sh --go     the whole thing
#   --skip-tests                 preflight without build/tests (a re-run after a smoke fix)
#
# Env: POS_INDEXER_DIR (default ~/pos-indexer), VPS_INVENTORY (deploy.sh's, default
# ~/vps-indexing), POSITIONS_URL / SOL_POSITIONS_URL / SOCIAL_URL for the smoke checks.
#
# Not in here — the dashboard and the later switches (pos-indexer docs/edge-cloudflare.md):
# orange cloud + rate rules, then TRUST_CF_IP=1 in the same box-1 deploy;
# XLINK_LEGACY_NONCE=0 once the app is out; CSP from Report-Only to enforced.
set -euo pipefail
cd "$(dirname "$0")/.."

YC="$PWD"
PI="${POS_INDEXER_DIR:-$HOME/pos-indexer}"
INVENTORY="${VPS_INVENTORY:-$HOME/vps-indexing}"
POSITIONS_URL="${POSITIONS_URL:-https://positions.1delta.io}"
SOL_POSITIONS_URL="${SOL_POSITIONS_URL:-https://sol-positions.1delta.io}"
SOCIAL_URL="${SOCIAL_URL:-https://social.1delta.io}"

GO=0; TESTS=1
for a in "$@"; do
  case "$a" in
    --go) GO=1 ;;
    --skip-tests) TESTS=0 ;;
    *) echo "usage: scripts/ship-all.sh [--go] [--skip-tests]"; exit 2 ;;
  esac
done

step() { printf '\n== %s\n' "$*"; }
die() { printf '! %s\n' "$*" >&2; exit 1; }
inv() { [[ -f "$INVENTORY" ]] && grep -qE "^$1=.+" "$INVENTORY"; }

# a repo ships only as committed on main and in step with origin — the deploy rsyncs the
# working tree, so an unrelated edit in progress would otherwise go out with it
clean_main() {
  local dir="$1" name="$2"
  git -C "$dir" fetch -q origin main
  [[ "$(git -C "$dir" branch --show-current)" == main ]] || die "$name is not on main"
  [[ -z "$(git -C "$dir" status --porcelain)" ]] || die "$name has uncommitted or untracked files — commit or stash them first"
  [[ "$(git -C "$dir" rev-list --count HEAD..origin/main)" == 0 ]] || die "$name is behind origin/main — pull first"
  echo "  $name: $(git -C "$dir" log -1 --format='%h %s') (+$(git -C "$dir" rev-list --count origin/main..HEAD) to push)"
}

# what the public edge must answer once pos-indexer is out
expect() {
  local want="$1" url="$2" got
  got=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$url" || echo 000)
  [[ "$got" == "$want" ]] || die "smoke: $url answered $got, expected $want"
  echo "  $got $url"
}

step "plan"
echo "  pos-indexer: deploy all$(inv SOLANA_ENABLED && echo ' + solana')  (inventory $INVENTORY)"
echo "  x-link:      wrangler deploy (packages/x-link)"
echo "  web:         git push → Pages builds app + landing"
[[ $GO == 1 ]] || echo "  (dry run — add --go to deploy)"

step "preflight"
[[ -d "$PI" ]] || die "no pos-indexer checkout at $PI (set POS_INDEXER_DIR)"
command -v wrangler >/dev/null || die "wrangler not on PATH"
clean_main "$PI" pos-indexer
clean_main "$YC" yieldcircle
if [[ $TESTS == 1 ]]; then
  (cd "$PI" && pnpm -s check:deps && pnpm -s typecheck && pnpm -s test) || die "pos-indexer checks failed"
  (cd "$YC" && pnpm -s build && pnpm -s build:landing && pnpm -s test) || die "yieldcircle checks failed"
  echo "  build + tests green in both repos"
fi
[[ $GO == 1 ]] || { echo; echo "preflight passed; nothing deployed"; exit 0; }

step "pos-indexer"
git -C "$PI" push -q origin main
(cd "$PI" && pnpm -s run deploy all)
if inv SOLANA_ENABLED; then (cd "$PI" && pnpm -s run deploy solana); fi

step "smoke"
expect 200 "$POSITIONS_URL/health"
expect 404 "$POSITIONS_URL/stats"
expect 404 "$POSITIONS_URL/ops/handovers"
expect 200 "$SOCIAL_URL/x/challenge?account=0x0000000000000000000000000000000000000001"
if inv SOLANA_ENABLED; then
  expect 200 "$SOL_POSITIONS_URL/health"
  expect 404 "$SOL_POSITIONS_URL/stats"
fi

step "x-link"
(cd "$YC/packages/x-link" && wrangler deploy)

step "web"
git -C "$YC" push -q origin main
echo "  pushed $(git -C "$YC" log -1 --format=%h) — Pages builds app.yieldcircle.io + yieldcircle.io now"

step "done — still by hand (pos-indexer docs/edge-cloudflare.md)"
echo "  - orange cloud + rate rules on positions./sol-positions./social., then TRUST_CF_IP=1 on box 1"
echo "  - XLINK_LEGACY_NONCE=0 on social once the new app has been live a while"
echo "  - CSP Report-Only → enforced after a week of reports"
