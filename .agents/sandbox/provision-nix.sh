#!/usr/bin/env bash
# Provision Nix and direnv for a disposable sandbox.
set -euo pipefail

if [ ! -x "$HOME/.nix-profile/bin/nix" ]; then
  installer="$(mktemp)"
  curl -fsSL https://nixos.org/nix/install -o "$installer"
  sh "$installer" --no-daemon --yes --no-channel-add
  rm -f "$installer"
  # shellcheck source=/dev/null
  . "$HOME/.nix-profile/etc/profile.d/nix.sh"
fi

mkdir -p "$HOME/.config/nix"
touch "$HOME/.config/nix/nix.conf"
grep -Fqx 'sandbox = false' "$HOME/.config/nix/nix.conf" ||
  printf '%s\n' 'sandbox = false' >> "$HOME/.config/nix/nix.conf"
grep -Eq '^experimental-features = .*nix-command.*flakes' "$HOME/.config/nix/nix.conf" ||
  printf '%s\n' 'experimental-features = nix-command flakes' >> "$HOME/.config/nix/nix.conf"

command -v direnv > /dev/null 2>&1 || nix profile install --inputs-from . nixpkgs#direnv
direnv allow .
