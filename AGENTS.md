## Codebase: Redraft (Direnv + Nix + Bun)

Selection-based AI rewriting. Bun serves the React app and a Hono API from one process.

```
flake.nix            # inputs only
.envrc               # env init
nix/flake-modules/   # flake parts: devshell.nix, treefmt.nix
.agents/             # orb lifecycle (vendored from meatcar/nix-templates#sandbox)
.amp/services.yaml   # orb dev server + portal
src/shared/api.ts    # zod contract shared by server and web; derive types from it
src/server/          # main.ts (Bun.serve), app.ts (Hono routes), config.ts (env),
                     # context.ts (folder index + search), suggest.ts (LLM loop), llm.ts
src/web/             # React 19 + shadcn/ui + Tailwind 4 + CodeMirror 6
```

## Principles

- Red/Green TDD. Conventional Commits: consistent scopes, short titles. Atomic, testable, logically distinct commits.
- Ask before network or out-of-workspace actions.
- 12-factor: config only from env (`src/server/config.ts`, documented in `.env.example`), JSON logs to stdout, stateless server.
- Test the server through `createApp(...).request()` with `MockLanguageModelV4`; test web code with Testing Library (happy-dom preloaded via `bunfig.toml`) and `src/web/test/fetch.ts` for the network boundary.

## Commands (repo root)

- `direnv exec .`: run commands
- `nix fmt`: format (run after every source edit)
- `nix flake check`: validate flake outputs
- `bun run dev`: dev server with HMR on `$PORT` (default 3000)

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

Add shadcn/ui components with `bunx --bun shadcn@latest add <name>` (config in `components.json`).
