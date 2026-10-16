# Redraft

Paste text or open a markdown file, select a span, press Ctrl+Space, and get three AI
rewrites. A steering prompt at the bottom shapes every suggestion. Pick a folder of notes and
the model can search them to match your facts and voice.

Everything runs in the browser. Your document, notes, and API key go only to the model
endpoint you set; the server only serves static files.

## Run

```sh
nix develop          # or: direnv allow
bun install
bun run dev          # http://localhost:3000
```

In an orb, run `amp orb services ensure`. In the app, set the model endpoint (default
`https://cpa.pvlv.ca/v1`), enter your API key, and pick a model. The endpoint must allow
CORS from the app's origin.

Production: `bun run start` serves the same app with `NODE_ENV=production`. Server
configuration is `PORT` only; see `.env.example`.

## How suggestions work

```
Ctrl+Space ─▶ browser: sync context index ─▶ model loop with tools ─▶ exactly 3 { text, rationale }
                                             │
                                             ├─ read_around_selection, search_document
                                             └─ search_context, read_context_file
```

- The first prompt holds only the selection and the steering text. The model calls tools
  when it needs more.
- The context folder is indexed in memory with SQLite FTS5 (`@sqlite.org/sqlite-wasm`), one
  contentless index of heading-aware markdown chunks. Snippets are read from the files, so
  nothing is copied. Each suggestion resyncs changed, added, and deleted files first.
- Chromium uses the File System Access API (`showDirectoryPicker`), so later edits show up.
  Other browsers upload the folder as a snapshot.
- Any OpenAI-compatible endpoint that supports `response_format: json_schema` works.

## Check

```sh
bun test
bun run check   # tsc, oxlint, fallow, treefmt
nix flake check
```

Licensed under the [Apache License 2.0](LICENSE); attributions in [NOTICE](NOTICE).
