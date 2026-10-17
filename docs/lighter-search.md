# Lighter context search

## Recommendation

Use MiniSearch 7.2.0. The prototype preserves folder filtering, markdown chunks, heading/path
boosts, OR matching, the four-character prefix cutoff, fresh snippets, and incremental sync.
It replaces FTS5's ranking with BM25+, so scores and ordering are not identical.

The complete `bun run build:html` output, including third-party notices, falls from
**3,608,033 to 2,240,422 bytes**, or **1,205,817 to 632,166 bytes gzipped** (47.6% smaller).
The baseline is [the branch's starting main](https://github.com/meatcar/redraft/commit/f8b261c).
No web/UI files changed.

## Measured comparison

Chrome 155 and Bun 1.3.13 on the same Linux x64 orb; medians of three runs in fresh browser instances.
The corpus is GitHub Docs at
[dae83f7](https://github.com/github/docs/commit/dae83f7d28f3b8e10015bd6b6d8b72267cedceca):
**3,760 actual markdown files, 20,530,560 source bytes, 29,947 Redraft chunks**.

| Engine                 | Search payload in HTML, bytes | Payload gzip, bytes | Relevant file in top 6 |    MRR@6 | Build, s | Retained memory, MiB | Update 1%, ms |
| ---------------------- | ----------------------------: | ------------------: | ---------------------: | -------: | -------: | -------------------: | ------------: |
| SQLite FTS5 3.53.4     |                     1,377,076 |             581,557 |                  16/17 |     .824 |     1.35 |                23.84 |          65.5 |
| **MiniSearch 7.2.0**   |                    **18,428** |           **6,336** |              **17/17** | **.902** |     3.78 |                48.20 |          35.8 |
| FlexSearch 0.8.212     |                        51,174 |              17,779 |                  15/17 |     .755 |     5.80 |               126.98 |         125.1 |
| Orama 3.1.18           |                        67,191 |              23,039 |                  11/17 |     .404 |     7.45 |               123.46 |       2,267.3 |
| Small handwritten BM25 |                         1,101 |                 657 |                  16/17 |     .824 |     1.61 |                47.46 |          21.3 |

Payload sizes are **measured standalone, self-contained HTML bundles of each search adapter**,
not estimates of the complete app and not npm download sizes. They include the tiny HTML wrapper
and adapter, and SQLite's base64 wasm; they exclude app code and license notices. Each bundle was
loaded and searched in Chrome. The complete-app comparison above includes notices and is measured
separately. SQLite's binary is 868,907 bytes before base64 expansion.

Build times measure insertion into the search engine after common file loading/chunking, excluding
module initialization and filesystem permission prompts. All engines receive exactly the same
chunks, in the same order. FTS5 uses prepared inserts inside a transaction. The benchmark saves
the separate shared read/chunk preparation time in the results JSON; it is not a browser I/O
measurement. Memory is the post-GC JavaScript heap increase over the loaded corpus, plus SQLite's
16.69 MiB wasm linear memory. It excludes shared input strings, file handles, chunk-offset maps,
renderer overhead, and peak transient allocations. These are **engine costs, not total tab RAM**.

The fixed query set covers 16 documentation tasks, one truncated-prefix query, and one absent-term
negative control. Relevant-file labels are explicit path patterns in
[`search-queries.json`](../scripts/search-queries.json), corrected for actual corpus filenames
before the recorded runs. Hit@6 and MRR@6 exclude the negative control; all engines returned no
hits for it. This is a small, English, technical-document smoke benchmark, not a general relevance
evaluation or an LLM end-to-end quality claim. Raw rankings and all three timing/memory samples are
in [`lighter-search-results.json`](lighter-search-results.json).

MiniSearch shares 43.1% of FTS5's top-six chunks; the handwritten BM25 shares 100% on this set.
Better relevant-file ranking does not imply equivalent returned context. Median / p95 query times
were FTS5 5.8 / 46.9 ms, MiniSearch 6.6 / 80.0 ms, FlexSearch 2.3 / 18.9 ms,
Orama 10.2 / 65.3 ms, and handwritten BM25 11.5 / 61.8 ms.

## Changes and re-indexing

- **FTS5:** delete a changed file's old chunk rows, insert its new chunks, and update metadata in
  transactions. Removed files cascade; unchanged bodies are not reread. The benchmark uses the
  same contentless FTS tokenizer, weights, OR expansion, and BM25 scoring as the original index.
- **MiniSearch:** discard old chunk IDs and add new IDs, retaining only term postings and chunk
  offsets. Discarded documents stop appearing immediately; automatic batched vacuum reclaims
  postings later (default threshold: at least 20 discarded documents and 10% dirt). No full
  rebuild is needed. Unchanged files are skipped by size/mtime, as before.
- **FlexSearch:** remove/add in three field indexes. `fastupdate: true` makes deletion practical;
  without it, the initial experiment took roughly ten seconds for the same update. It increases
  memory. The tested adapter uses forward prefixes and weighted reciprocal-rank fusion (k=60)
  across terms and fields, rather than BM25. It also expands short prefixes, unlike Redraft's
  contract; preserving that contract would require additional indexing/filtering.
- **Orama:** remove/add documents with stemming and stopword removal disabled, duplicates allowed,
  field boosts, OR threshold, no fuzzy tolerance. Its standard document store retains chunk text.
  Its default prefix behavior also needs adapting for short-word exact matches. The measured
  configuration is not a drop-in replacement.
- **Handwritten BM25:** delete per-document term postings, update document frequencies and total
  length, then add new chunks. Uses FTS5-style field-weighted frequency, document-length
  normalization, and IDF flooring. Prefix queries scan the vocabulary. It is tiny but makes us
  responsible for search mathematics, Unicode behavior, performance, and maintenance.

The update workload replaces **38 files / 263 chunks** (every hundredth sorted file), adding a
unique token. Each engine found the new token and stopped finding it after deletion. Update
timings exclude the shared folder walk, file read, and rechunking work.

The real `ContextIndex` was also exercised against disk-read corpus files with an editable
in-memory overlay: unchanged sync opened zero files, a 38-file edit opened exactly those 38 files,
returned snippets contained the inserted token, and edits after sync were rejected as stale.
Existing add/edit/delete, file filtering, prefix, snippet, and LLM-tool tests remain passing.

## Tradeoffs and limits

MiniSearch roughly doubles retained engine memory and takes about 2.8× as long to build this
index. It avoids wasm initialization but does not eliminate main-thread indexing work. It is the
best maintained-library result here, and the handwritten alternative saves only another 5.7 KB
gzipped. Favor the handwritten version only if exact baseline-style ranking and faster builds
justify owning a search engine.

JS Unicode tokenization/normalization is not SQLite `unicode61`; combining marks and some
non-Latin text may differ. Multilingual quality needs a separate corpus before promising parity.
No custom smaller SQLite build was measured; no savings are claimed for one. An FTS-only wasm
build remains an option if exact SQLite behavior is more important than avoiding a custom
compiler/runtime maintenance path.

## Reproduce

```sh
mkdir -p .cache/search-bench
git clone --depth 1 --filter=blob:none --sparse https://github.com/github/docs.git \
  .cache/search-bench/github-docs
git -C .cache/search-bench/github-docs fetch --depth 1 origin \
  dae83f7d28f3b8e10015bd6b6d8b72267cedceca
git -C .cache/search-bench/github-docs checkout FETCH_HEAD
git -C .cache/search-bench/github-docs sparse-checkout set content
amp orb service start search-bench --command 'direnv exec . bun scripts/search-benchmark.ts'
```

The harness serves locally on port 3001. For each engine (`fts5`, `minisearch`, `flexsearch`,
`orama`, `bm25`), repeat the following three times, closing the browser after each run. Keep the
launch flags identical on every command; fresh instances avoid cross-page heap accounting.

```sh
FLAGS='--js-flags=--expose-gc,--enable-precise-memory-info,--disable-features=BackForwardCache'
agent-browser --session search-measure --args "$FLAGS" \
  open 'http://localhost:3001/?engine=minisearch'
agent-browser --session search-measure --args "$FLAGS" wait --fn '!!window.benchmark'
agent-browser --session search-measure --args "$FLAGS" eval 'window.benchmark' --json
agent-browser --session search-measure --args "$FLAGS" close
```

`dist/search-bench/sizes.json` records bundle sizes. `/<engine>.html` serves each independent
single-file bundle. Generated corpus and bundles stay under ignored `dist/`; the downloaded
input stays under ignored `.cache/`. On a non-orb machine, run the Bun script directly instead
of the service command. Run `bun test`, `bun run check`, and `bun run build:html` inside the
devshell for the production prototype.
