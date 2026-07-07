#!/usr/bin/env bash
set -euo pipefail

watched_paths=(
  "src/"
  "prisma/"
  "public/"
  "next.config.ts"
  "package.json"
  "vercel.json"
)

base_sha="${VERCEL_GIT_PREVIOUS_SHA:-}"

if [[ -n "$base_sha" ]] && git cat-file -e "${base_sha}^{commit}" 2>/dev/null; then
  diff_base="$base_sha"
elif git rev-parse --verify HEAD~1 >/dev/null 2>&1; then
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
