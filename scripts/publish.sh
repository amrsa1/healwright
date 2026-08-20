#!/usr/bin/env bash
#
# healwright — manual npm publish
#
# Publishes the version currently in package.json using an interactive npm
# login, for when CI's NPM_TOKEN is unavailable or restricted.
#
#   ./scripts/publish.sh              # check, confirm, publish
#   ./scripts/publish.sh --dry-run    # do everything except the actual publish
#   ./scripts/publish.sh --otp 123456 # pass a 2FA code non-interactively
#   ./scripts/publish.sh --skip-tests # trust a green CI run, skip local checks
#   ./scripts/publish.sh --yes        # no confirmation prompt
#   ./scripts/publish.sh --legacy     # username/password login instead of browser
#
# Note: --provenance is deliberately not used. It requires a supported CI
# environment with OIDC and fails on a local machine.

set -euo pipefail

DRY_RUN=0
SKIP_TESTS=0
ASSUME_YES=0
LEGACY_LOGIN=0
OTP=""

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run)    DRY_RUN=1 ;;
    --skip-tests) SKIP_TESTS=1 ;;
    --yes|-y)     ASSUME_YES=1 ;;
    --legacy)     LEGACY_LOGIN=1 ;;
    --otp)        OTP="${2:-}"; shift ;;
    --otp=*)      OTP="${1#*=}" ;;
    -h|--help)    awk 'NR>1 && /^#/ { sub(/^# ?/, ""); print; next } NR>1 { exit }' "$0"; exit 0 ;;
    *)            echo "Unknown option: $1 (try --help)" >&2; exit 2 ;;
  esac
  shift
done

# ---------------------------------------------------------------- output ----

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'
  GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RESET=$'\033[0m'
else
  BOLD=""; DIM=""; RED=""; GREEN=""; YELLOW=""; RESET=""
fi

step() { printf '\n%s==>%s %s%s\n' "$BOLD" "$RESET" "$1" "$RESET"; }
ok()   { printf '  %s✓%s %s\n' "$GREEN" "$RESET" "$1"; }
warn() { printf '  %s!%s %s\n' "$YELLOW" "$RESET" "$1"; }
die()  { printf '\n  %s✗ %s%s\n\n' "$RED" "$1" "$RESET" >&2; exit 1; }

# Prompt against the terminal so this still works when stdin is piped.
confirm() {
  [ "$ASSUME_YES" = "1" ] && return 0
  local reply
  if [ -e /dev/tty ]; then
    printf '\n%s%s%s [y/N] ' "$BOLD" "$1" "$RESET" > /dev/tty
    read -r reply < /dev/tty
  else
    die "No terminal available for confirmation. Re-run with --yes if you are sure."
  fi
  case "$reply" in [yY]|[yY][eE][sS]) return 0 ;; *) die "Aborted." ;; esac
}

# ------------------------------------------------------------ repo checks ---

step "Locating repository"
ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || die "Not inside a git repository."
cd "$ROOT"
ok "$ROOT"

PKG_NAME="$(node -p "require('./package.json').name")"
VERSION="$(node -p "require('./package.json').version")"
TAG="v${VERSION}"
ok "${PKG_NAME}@${VERSION}"

step "Checking git state"
if [ -n "$(git status --porcelain)" ]; then
  git status --short | sed 's/^/      /'
  die "Working tree is dirty. Commit or stash before publishing."
fi
ok "working tree clean"

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "$BRANCH" != "main" ]; then
  warn "on branch '$BRANCH', not 'main'"
else
  ok "on main"
fi

if git fetch origin --tags --quiet 2>/dev/null; then
  LOCAL="$(git rev-parse @)"
  REMOTE="$(git rev-parse '@{u}' 2>/dev/null || echo "$LOCAL")"
  if [ "$LOCAL" != "$REMOTE" ]; then
    warn "local HEAD differs from upstream — you may be publishing unpushed code"
  else
    ok "in sync with origin"
  fi
else
  warn "could not reach origin; skipping sync check"
fi

if git rev-parse "$TAG" >/dev/null 2>&1; then
  if [ "$(git rev-parse "$TAG^{commit}")" = "$(git rev-parse HEAD)" ]; then
    ok "tag $TAG points at HEAD"
  else
    warn "tag $TAG exists but points at a different commit than HEAD"
  fi
else
  warn "no git tag $TAG for this version"
fi

# ------------------------------------------------------------- npm checks ---

step "Checking npm registry"
PUBLISHED="$(npm view "${PKG_NAME}@${VERSION}" version 2>/dev/null || true)"
if [ -n "$PUBLISHED" ]; then
  die "${PKG_NAME}@${VERSION} is already published. Bump the version first."
fi
LATEST="$(npm view "$PKG_NAME" version 2>/dev/null || echo 'unknown')"
ok "registry latest is ${LATEST}; ${VERSION} is not published yet"

step "Checking npm authentication"
if NPM_USER="$(npm whoami 2>/dev/null)"; then
  ok "logged in as ${NPM_USER}"
elif [ "$DRY_RUN" = "1" ]; then
  NPM_USER="(not logged in)"
  warn "not logged in — fine for a dry run, but a real publish will prompt"
else
  warn "not logged in — starting npm login"
  if [ "$LEGACY_LOGIN" = "1" ]; then
    npm login --auth-type=legacy
  else
    npm login
  fi
  NPM_USER="$(npm whoami 2>/dev/null)" || die "Login did not complete."
  ok "logged in as ${NPM_USER}"
fi

# --------------------------------------------------------------- verify -----

if [ "$SKIP_TESTS" = "1" ]; then
  step "Skipping local checks (--skip-tests)"
else
  step "Running checks"
  npm run typecheck  && ok "typecheck"
  npm run lint       && ok "lint"
  npm run test:unit  && ok "unit tests"
fi

step "Building"
npm run build >/dev/null
for f in dist/index.js dist/index.mjs dist/index.d.ts; do
  [ -f "$f" ] || die "Build did not produce $f"
done
ok "dist/index.js, dist/index.mjs, dist/index.d.ts"

step "Package contents"
npm pack --dry-run 2>&1 | sed 's/^npm notice \{0,1\}//' | sed 's/^/  /'

# -------------------------------------------------------------- publish -----

if [ "$DRY_RUN" = "1" ]; then
  step "Dry run — not publishing"
  npm publish --dry-run --access public
  printf '\n  %sDry run complete.%s Re-run without --dry-run to publish %s@%s.\n\n' \
    "$GREEN" "$RESET" "$PKG_NAME" "$VERSION"
  exit 0
fi

confirm "Publish ${PKG_NAME}@${VERSION} to npm as ${NPM_USER}?"

step "Publishing"
PUBLISH_ARGS=(--access public)
[ -n "$OTP" ] && PUBLISH_ARGS+=("--otp=$OTP")

if ! npm publish "${PUBLISH_ARGS[@]}"; then
  printf '\n  %sPublish failed.%s Common causes:\n' "$RED" "$RESET"
  printf '    • 2FA required — re-run with --otp <code>\n'
  printf '    • 404 on PUT — the logged-in account lacks publish rights on %s\n' "$PKG_NAME"
  printf '    • 403 — version already exists, or the name is taken\n\n'
  exit 1
fi

step "Verifying"
sleep 3
LIVE="$(npm view "${PKG_NAME}@${VERSION}" version 2>/dev/null || echo '')"
if [ "$LIVE" = "$VERSION" ]; then
  ok "${PKG_NAME}@${VERSION} is live"
else
  warn "registry has not caught up yet; check 'npm view ${PKG_NAME} version' shortly"
fi

printf '\n  %sPublished %s@%s%s\n' "$GREEN$BOLD" "$PKG_NAME" "$VERSION" "$RESET"
printf '  %shttps://www.npmjs.com/package/%s/v/%s%s\n\n' "$DIM" "$PKG_NAME" "$VERSION" "$RESET"

if command -v gh >/dev/null 2>&1; then
  if ! gh release view "$TAG" >/dev/null 2>&1; then
    warn "No GitHub release for $TAG — create one with:"
    printf '      gh release create %s --title %s --notes-file CHANGELOG.md\n\n' "$TAG" "$TAG"
  else
    ok "GitHub release $TAG exists"
  fi
fi
