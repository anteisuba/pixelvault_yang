#!/usr/bin/env bash
# Vercel Ignored Build Step.
# exit 0 = skip build; exit 1 = proceed with build.
#
# Prefer VERCEL_GIT_PREVIOUS_SHA (last successful deploy for this branch).
# Vercel uses a shallow clone, so that SHA is often missing locally — try a
# depth-1 fetch first. If the previous deploy commit still cannot be resolved,
# fail open and build: falling back to HEAD~1 alone can permanently skip
# production when the tip is docs-only after undeployed app commits.
set -euo pipefail

# Only production (main) builds on Vercel. Every preview deployment keeps its
# own copy of the function bundle (Function + Deployment Storage quota), and
# thread branches (claude/*) push dozens of times a day: on 2026-11-03 that
# pushed the Hobby team over its storage limits and production got paused.
# CI (ci.yml `build`) already builds every branch. vercel.json
# `git.deploymentEnabled` stops the known prefixes before a deployment record
# even exists; this catches any other branch.
if [[ "${VERCEL_ENV:-}" != "production" ]]; then
  echo "VERCEL_ENV=${VERCEL_ENV:-<unset>} (${VERCEL_GIT_COMMIT_REF:-?}); previews are off, skipping."
  exit 0
fi

watched_paths=(
  "src/"
  "prisma/"
  "public/"
  "next.config.ts"
  "package.json"
  "vercel.json"
  "scripts/vercel-ignore-build.sh"
  "scripts/vercel-build.sh"
)

base_sha="${VERCEL_GIT_PREVIOUS_SHA:-}"
diff_base=""

if [[ -n "$base_sha" ]]; then
  if ! git cat-file -e "${base_sha}^{commit}" 2>/dev/null; then
    echo "Previous deployment SHA ${base_sha} not in local clone; fetching..."
    # Best-effort: shallow clones often omit the prior production commit.
    # Bound the fetch so a missing object cannot hang the ignore step.
    if command -v timeout >/dev/null 2>&1; then
      timeout 15s git fetch --depth=1 origin "$base_sha" 2>/dev/null || true
    else
      git fetch --depth=1 origin "$base_sha" 2>/dev/null || true
    fi
  fi

  if git cat-file -e "${base_sha}^{commit}" 2>/dev/null; then
    diff_base="$base_sha"
  else
    echo "Cannot resolve previous deployment SHA ${base_sha}; building to be safe."
    exit 1
  fi
elif git rev-parse --verify HEAD~1 >/dev/null 2>&1; then
  # First deploy / PREVIOUS_SHA unset — only safe to use parent of tip.
  diff_base="HEAD~1"
else
  echo "No previous commit is available; build can proceed."
  exit 1
fi

if git diff --quiet "$diff_base" HEAD -- "${watched_paths[@]}"; then
  echo "No deployment-relevant changes since $diff_base; skipping build."
  exit 0
fi

echo "Deployment-relevant changes detected since $diff_base; build can proceed."
exit 1
