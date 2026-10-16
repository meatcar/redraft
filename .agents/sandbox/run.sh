#!/usr/bin/env bash
# Run the sandbox lifecycle with fresh environments for authentication and work.
set -euo pipefail

export SANDBOX_LIFECYCLE="$1"
case "$(uname -sm)" in
'Linux x86_64') arch=amd64 ;;
'Linux aarch64') arch=arm64 ;;
*)
  echo 'Sandbox requires x86_64 or aarch64 Linux' >&2
  exit 1
  ;;
esac
asset="task_linux_$arch.tar.gz"
release=
while read -r sum path; do
  if [ "${path#*/}" = "$asset" ]; then
    sha256="$sum" release="$path"
  fi
done < .agents/sandbox/task.sha256
if [ -z "$release" ]; then
  echo "No Task checksum for $asset in .agents/sandbox/task.sha256" >&2
  exit 1
fi
version="${release%/*}"
task_dir="$HOME/.local/share/sandbox/task-$version"

http_proxy_value="${HTTP_PROXY:-${http_proxy:-${npm_config_http_proxy:-}}}"
https_proxy_value="${HTTPS_PROXY:-${https_proxy:-${npm_config_https_proxy:-}}}"
[ -n "$http_proxy_value" ] || http_proxy_value="$https_proxy_value"
[ -n "$https_proxy_value" ] || https_proxy_value="$http_proxy_value"
if [ -n "$http_proxy_value" ]; then
  export HTTP_PROXY="$http_proxy_value" http_proxy="$http_proxy_value"
  export HTTPS_PROXY="$https_proxy_value" https_proxy="$https_proxy_value"
fi

if [ ! -x "$task_dir/task" ]; then
  if [ "$SANDBOX_LIFECYCLE" != setup ]; then
    echo 'Task unavailable; run .agents/setup' >&2
    exit 1
  fi
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  curl -fsSL "https://github.com/go-task/task/releases/download/$release" -o "$tmp/task.tar.gz"
  printf '%s  %s\n' "$sha256" "$tmp/task.tar.gz" | sha256sum --check
  tar -xzf "$tmp/task.tar.gz" -C "$tmp" task
  mkdir -p "$task_dir"
  install -m 755 "$tmp/task" "$task_dir/task.tmp"
  mv "$task_dir/task.tmp" "$task_dir/task"
  rm -rf "$tmp"
  trap - EXIT
fi

export PATH="$task_dir:$HOME/.nix-profile/bin:$PATH"
if [ "$(id -u)" = 0 ]; then
  export NIX_CONFIG="${NIX_CONFIG:-}"$'\nbuild-users-group ='
fi
if [ "$SANDBOX_LIFECYCLE" = resume ]; then
  if [ ! -x "$HOME/.nix-profile/bin/nix" ] || ! command -v direnv > /dev/null 2>&1; then
    echo 'Devshell unavailable; run .agents/setup' >&2
    exit 1
  fi
fi

task=("$task_dir/task" --dir . --taskfile .agents/Taskfile.yml)
if [ "$SANDBOX_LIFECYCLE" = setup ]; then
  trap '"${task[@]}" setup_cleanup' EXIT
fi

"${task[@]}" before_nix
if [ "$SANDBOX_LIFECYCLE" = setup ]; then
  bash .agents/sandbox/provision-nix.sh
fi
bash .agents/sandbox/provision-shell.sh "$task_dir/task"

direnv exec . "${task[@]}" "${SANDBOX_LIFECYCLE}_auth"
direnv exec . "${task[@]}" work
