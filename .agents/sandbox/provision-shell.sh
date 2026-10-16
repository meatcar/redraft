#!/usr/bin/env bash
# Install shell hooks that load the devshell in future shells.
# Takes the Task executable path as its first argument. Runs every lifecycle so
# the login block stays after environment loaders that providers append later.
set -euo pipefail

agent_env="$HOME/.sandbox-env.sh"
printf "export PATH=%q:\$PATH\n" "$(dirname "$1"):$HOME/.nix-profile/bin" > "$agent_env"
cat >> "$agent_env" << 'EOF'
command -v direnv >/dev/null 2>&1 && eval "$(direnv hook bash)"
EOF

if ! grep -Fq '.sandbox-env.sh' "$HOME/.bashrc" 2> /dev/null; then
  cat >> "$HOME/.bashrc" << 'EOF'

[ -f "$HOME/.sandbox-env.sh" ] && . "$HOME/.sandbox-env.sh"
EOF
fi

profile="$HOME/.bash_profile"
marker="# sandbox environment: $PWD"
kept=""
if [ -f "$profile" ]; then
  in_block=false
  while IFS= read -r line || [ -n "$line" ]; do
    if [ "$line" = "$marker" ]; then
      in_block=true
    elif $in_block; then
      [ "$line" != "fi" ] || in_block=false
    else
      kept+="$line"$'\n'
    fi
  done < "$profile"
fi
[[ -z $kept || $kept == *$'\n\n' ]] || kept+=$'\n'

# NOTE: Unset DIRENV_FILE to force a reload. Keep DIRENV_DIFF so direnv reverts an inherited activation.
{
  printf "%s%s\nif [[ \$PWD == %q || \$PWD == %q/* ]]; then\n" "$kept" "$marker" "$PWD" "$PWD"
  cat << 'EOF'
  [ -f "$HOME/.sandbox-env.sh" ] && . "$HOME/.sandbox-env.sh"
  if command -v direnv >/dev/null 2>&1; then
    unset DIRENV_FILE
    direnv allow . >/dev/null 2>&1
    eval "$(direnv export bash 2>/dev/null)"
  fi
fi
EOF
} > "$profile"
