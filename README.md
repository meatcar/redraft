# Bun + Nix modules

Run `nix develop` or approve `.envrc` with `direnv allow`, then `bun install`.
Check the project with `bun test`, `bun run check`, and `nix flake check`.
Commit `flake.lock` and `bun.lock`. This template targets x86_64 Linux.

For disposable environments, add `github:meatcar/nix-templates#sandbox` with
`nix flake init -t`, then follow `.agents/sandbox/AGENTS.md`.
