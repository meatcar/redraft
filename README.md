# Redraft

Paste text or open a markdown file, select a span, and get three AI rewrites. A steering
prompt at the bottom shapes every suggestion. Point it at a folder of notes and the model
searches them to match your facts and voice.

## Run

```sh
nix develop          # or: direnv allow
bun install
cp .env.example .env # set LLM_BASE_URL, LLM_API_KEY, LLM_MODEL
bun run dev          # http://localhost:3000
```

In an orb, set the `LLM_*` variables as project secrets and run `amp orb services ensure`.

Production: `bun run start` serves the same app with `NODE_ENV=production`. All configuration
comes from the environment; see `.env.example`.

## How suggestions work

```
select text ─▶ POST /api/suggest ─▶ BM25 prefetch over context folder
                                    ─▶ model loop (search_context / read_context_file tools)
                                    ─▶ structured output: exactly 3 { text, rationale }
```

- Context folders are indexed in memory with MiniSearch (BM25 + fuzzy + prefix) over
  heading-aware markdown chunks, and reindexed when any file changes. Paths must resolve
  inside `CONTEXT_ROOT`.
- The model gets the top hits up front, then can search again or read whole files before it
  answers.
- Any OpenAI-compatible endpoint works. Set `LLM_STRUCTURED_OUTPUTS=false` if it rejects
  `response_format: json_schema`.

## Check

```sh
bun test
bun run check   # tsc, oxlint, fallow, treefmt
nix flake check
```
