## Codebase: Redraft (Direnv + Nix + Bun)

Selection-based AI rewriting, client-side only. Bun serves the static React app; the browser
calls the model endpoint and indexes the context folder itself.

```
flake.nix            # inputs only
.envrc               # env init
nix/flake-modules/   # flake parts: devshell.nix, treefmt.nix
.agents/             # orb lifecycle (vendored from meatcar/nix-templates#sandbox)
.amp/services.yaml   # orb dev server + portal
src/core/            # browser domain, no React: api.ts (zod contract), suggest.ts (LLM loop),
                     # llm.ts (endpoint), context.ts (SQLite-wasm FTS5 index), files.ts (folder sources)
src/server/          # main.ts (Bun.serve static + /healthz), config.ts (env)
src/web/             # React 19 + shadcn/ui + Tailwind 4 + CodeMirror 6
```

## Principles

- Red/Green TDD. Conventional Commits: consistent scopes, short titles. Atomic, testable, logically distinct commits.
- Ask before network or out-of-workspace actions.
- Client-side only: document text, notes, and the API key never reach our server. Do not add server routes that handle them.
- 12-factor server: config only from env (`src/server/config.ts`, documented in `.env.example`), JSON logs to stdout, stateless. User settings live in the browser (`localStorage`, prefix `redraft:`).
- Test `src/core` directly with `MockLanguageModelV4` and in-memory `FileSource`s; test web code with Testing Library (happy-dom preloaded via `bunfig.toml`) and `src/web/test/fetch.ts` for the network boundary.
- Copied third-party code: keep a `NOTE:` with copyright, license, what changed, and a `see` link; add it to `NOTICE`.

## Commands (repo root)

- `direnv exec .`: run commands
- `nix fmt`: format (run after every source edit)
- `nix flake check`: validate flake outputs
- `bun run dev`: dev server with HMR on `$PORT` (default 3000). If HMR keeps a stale failed import, run `amp orb service restart web`.

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
