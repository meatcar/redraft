## Codebase: Direnv + Nix + Bun

```
flake.nix          # inputs only
.envrc             # env init
nix/flake-modules/ # flake parts: devshell.nix, treefmt.nix
```

## Principles

- Red/Green TDD. Conventional Commits: consistent scopes, short titles. Atomic, testable, logically distinct commits.
- Ask before network or out-of-workspace actions.

## Commands (repo root)

- `direnv exec .`: run commands
- `nix fmt`: format (run after every source edit)
- `nix flake check`: validate flake outputs

## Nix

- Use `inputs'.nixpkgs-unstable.legacyPackages` only for intentional unstable packages.
- Formatters (`treefmt-nix`): `nixfmt`, `deadnix`+`statix` (lint), `oxfmt`.

## Bun / TypeScript

`bun install` / `bun test` / `bun run check`. Run inside the devshell: `treefmt` and the
nix formatters only exist there.

Code quality enforced via `bun run check`, running:

- `bun run typecheck`: `tsc --noEmit`
- `bun run lint`: `oxlint` (type-aware; `correctness`/`suspicious`/`perf` error) + `fallow` (duplicates, code health)
- `bun run format`: `treefmt`

If you swap bun for node/npm, also swap `@tsconfig/bun` + `@types/bun` for `@types/node`
and set `"types": ["node"]` in tsconfig. Note that `pi install git:...` runs a bare
`npm install --omit=dev` inside a repo, so an npm project needs a committed lockfile and
may need `.npmrc` with `legacy-peer-deps=true` to survive peer conflicts.
