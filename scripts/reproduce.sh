#!/usr/bin/env bash
set -euo pipefail

repo=$(git rev-parse --show-toplevel)
revision=${1:-HEAD}
commit=$(git rev-parse --verify --end-of-options "$revision^{commit}")
epoch=$(git show -s --format=%ct "$commit")
candidate=${2:-}
if [[ -n "$candidate" ]]; then
  candidate=$(realpath "$candidate")
fi
mkdir -p "$repo/.cache" "$repo/dist"
scratch=$(mktemp -d "$repo/.cache/reproduce.XXXXXX")
trap 'rm -rf "$scratch"' EXIT

for build in first nested/second; do
  source="$scratch/$build"
  mkdir -p "$source"
  git archive "$commit" | tar -x -C "$source"
  if [[ "$build" == first ]]; then
    timestamp=2000-01-01
    zone=UTC
  else
    timestamp=2030-12-31
    zone=Pacific/Honolulu
  fi
  find "$source" -type f -exec touch -d "$timestamp" {} +
  (
    cd "$source"
    nix develop "path:$source" --no-write-lock-file --ignore-environment --command bash -euc '
      export HOME="$3"
      export BUN_INSTALL_CACHE_DIR="$HOME/cache"
      export SOURCE_DATE_EPOCH="$1" TZ="$2" LC_ALL=C
      mkdir -p "$HOME"
      bun --version
      bun install --frozen-lockfile --ignore-scripts
      bun run build:html
    ' -- "$epoch" "$zone" "$scratch/home-${build//\//-}"
  )
done

first="$scratch/first/dist/redraft.html"
second="$scratch/nested/second/dist/redraft.html"
sha256sum "$first" "$second"
cmp "$first" "$second"
if [[ -n "$candidate" ]]; then
  sha256sum "$candidate"
  cmp "$first" "$candidate"
fi
cp "$first" "$repo/dist/reproduced.html"
printf 'Reproduced %s; identical bytes in dist/reproduced.html\n' "$commit"
