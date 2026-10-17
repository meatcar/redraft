# Lighter context search

## Recommendation

Use **MiniSearch 7.2.0**. It is the smallest tested maintained library that fits Redraft's
live-folder workflow without the matching-rule failures found in several alternatives.
The prototype preserves filtering, markdown chunks, OR matching, four-character prefix
cutoff, field boosts, changed-file sync, fresh snippet reads, and stale-offset rejection.
Its BM25+ ranking is **not FTS5 ranking**.

| Complete app, including notices | HTML bytes | Gzip bytes |
| ------------------------------- | ---------: | ---------: |
| FTS5 baseline                   |  3,608,033 |  1,207,178 |
| MiniSearch prototype            |  2,240,494 |    632,302 |

That is **47.6% less gzip**, with no UI changes. These are freshly built artifacts from
[the starting main](https://github.com/meatcar/redraft/commit/f8b261c1cc09005181e889abd2400244938781b1)
and this branch, using the same installed dependencies and build command. Gzip throughout
the report is `Bun.gzipSync(bytes, { level: 9 })`, Bun 1.3.13. An independent GNU gzip 1.12
`gzip -n -9` check gives 1,202,636 → 630,929 bytes. Compression implementations differ;
the conclusion does not depend on choosing one. Artifact SHA-256 hashes are in
[`lighter-search-results.json`](lighter-search-results.json).

## Scope and fixtures

Nine implemented adapters, two pinned real corpora, 41 task queries, 200 additional
known-target title queries, two absent-term controls, and 24 adversarial matching cases.
This is a broad, reproducible comparison, **not proof of optimality over every engine,
configuration, language, or possible folder**.

| Corpus                                                                                                             | Markdown files | Source bytes | Redraft chunks |
| ------------------------------------------------------------------------------------------------------------------ | -------------: | -----------: | -------------: |
| [GitHub Docs](https://github.com/github/docs/commit/dae83f7d28f3b8e10015bd6b6d8b72267cedceca), `content`           |          3,760 |   20,530,560 |         29,947 |
| [MDN](https://github.com/mdn/content/commit/44a1a0348720bbd1b1085c7d92b93b4fd311a3dd), English CSS/HTTP/JavaScript |          3,005 |   16,832,046 |         37,515 |

Both corpus and query hashes are recorded. Task labels are explicit path patterns in
[`search-queries.json`](../scripts/search-queries.json) and
[`search-mdn-queries.json`](../scripts/search-mdn-queries.json); the harness rejects labels
that match no file. Title targets are 100 paths per corpus selected by SHA-256 ordering,
not by engine results. Task and title scores remain separate: exact-title lookup is not
the same task as semantic information retrieval.

## Measured comparison

One-vCPU Linux x86_64 orb, Intel Xeon 2.60 GHz, 1,983 MiB RAM, Chrome 155.0.8059.79.
Fresh browser instances, serialized runs, V8 old-space cap 512 MiB. GitHub timings are
medians of three completed trials except Fuse and Lunr, which have one completed build.
Lunr's later update validation did not complete. All repeated completed rankings agreed.

### GitHub Docs: payload, build, memory, edits

| Engine                    | HTML payload, bytes | Payload gzip, bytes | Build, s | Peak renderer RSS, MiB | Edit 1%, ms | Task hits@6 | Title hits@6 |
| ------------------------- | ------------------: | ------------------: | -------: | ---------------------: | ----------: | ----------: | -----------: |
| SQLite FTS5 3.53.4        |           1,377,126 |             578,784 |     1.12 |                    311 |        52.5 |       16/17 |       97/100 |
| **MiniSearch 7.2.0**      |          **18,535** |           **6,340** | **4.36** |                **395** |    **39.1** |   **17/17** |   **91/100** |
| FlexSearch 0.8.212        |              51,250 |              17,589 |     5.44 |                    816 |       111.3 |       15/17 |       65/100 |
| Orama 3.1.18              |              67,225 |              22,594 |     7.07 |                    447 |     1,618.6 |       11/17 |       29/100 |
| Handwritten BM25          |               1,177 |                 680 |     1.79 |                    637 |        35.5 |       16/17 |       97/100 |
| Elasticlunr 0.9.5         |              20,940 |               6,387 |     5.35 |                    834 |        58.4 |       16/17 |       71/100 |
| Lunr 2.3.9                |              32,098 |               9,418 |     8.79 |                  1,119 | incomplete¹ |       16/17 |      not run |
| Fuse 7.5.0                |              27,474 |              10,014 |     1.73 |                    616 |     2,156.8 |       16/17 |      not run |
| SQL.js/FTS5 bundle 1.0.2² |           1,087,898 |             498,597 |     1.01 |                    233 |        73.9 |       16/17 |       97/100 |

Payload means a **standalone self-contained HTML bundle of the adapter and engine**,
including base64 wasm and a tiny wrapper, excluding app code and notices. It is not an
npm package size or an estimate of the complete app. All nine HTML bundles were separately
loaded in Chrome and passed initialization, search, replacement, and no-external-wasm-fetch
checks. Performance trials use the corresponding JavaScript bundle and wasm asset.

Build time excludes shared reads/chunking and module initialization. Every adapter receives
the same chunks in sorted-file order. SQLite inserts use prepared statements in a transaction.
Reindex timing excludes shared directory enumeration, file reads, and rechunking.

**Memory is sampled peak RSS of the actual benchmark renderer PID, every 25 ms during build.**
The PID is identified by a CDP trace marker, not by selecting or summing arbitrary Chrome
processes. RSS includes the loaded corpus, engine, wasm, and renderer overhead; it is neither
engine-only memory nor total browser RAM. The benchmark materializes the corpus, whereas the
app reads batches and releases source bodies, so this is not a measurement of a production tab.
Sampling can miss shorter peaks. Absolute post-GC JS/backing-store snapshots and wasm buffer
sizes are recorded separately; no misleading net heap subtraction or speculative sum is used.

¹ Lunr rebuilds the immutable index after each edit transaction. Three earlier GitHub
edit/delete/restore cycles exceeded a 60-second CDP deadline. A recheck that releases the old
index first completed its build and task queries, then the measurement process was terminated
with exit 137 during that cycle. MDN also exceeded the cycle deadline. These observations
do **not** establish an OOM cause, or a 60-second lower bound on a single edit: the timed
cycle includes edit, delete, and restore rebuilds. Initial-build metrics and query results
are retained; no update timing is invented. Small-folder mutation checks passed.

² The smaller published FTS5 wasm is 778,154 bytes versus 868,907 for the official package.
The measured browser-only adapter excludes unused Node builtin branches. A stock Bun bundle
would instead be **1,623,329 HTML / 658,536 gzip bytes**, because of Node polyfills. The optimized
variant executes in Chrome but still costs about half a megabyte compressed. No custom SQLite
compiler-flag sweep was performed, and this is not claimed to be the smallest possible build.

### Independent MDN confirmation

FTS5 and MiniSearch have three trials; other completed entries have one. Lunr has a completed
build/query stage but incomplete update validation. These are measurements, not confidence
intervals over heterogeneous machines.

| Engine           | Build, s | Peak renderer RSS, MiB | Edit 1%, ms | Task hits@6 | Title hits@6 |
| ---------------- | -------: | ---------------------: | ----------: | ----------: | -----------: |
| FTS5             |     1.15 |                    296 |        58.4 |       23/24 |       97/100 |
| **MiniSearch**   | **3.40** |                **358** |    **40.7** |   **24/24** |   **88/100** |
| FlexSearch       |     4.12 |                    700 |       205.5 |       21/24 |       50/100 |
| Orama            |     5.85 |                    406 |     3,165.9 |       15/24 |       22/100 |
| Handwritten BM25 |     1.57 |                    548 |        25.3 |       23/24 |       97/100 |
| Elasticlunr      |     4.13 |                    716 |        64.5 |       23/24 |       69/100 |
| Lunr             |     7.19 |                    998 | incomplete¹ |       22/24 |      not run |
| Fuse             |     1.47 |                    538 |     4,461.3 |       23/24 |      not run |
| SQL.js/FTS5      |     0.91 |                    223 |        51.9 |       23/24 |       97/100 |

Task MRR@6 is FTS5 .824/.795 and MiniSearch .902/.903 for GitHub/MDN. Title MRR reverses
the advantage: FTS5 .879/.828, MiniSearch .803/.762. Thus MiniSearch wins these task labels
but loses known-title lookup; it is not uniformly more relevant. GitHub task query p50/p95
is FTS5 5.9/50.4 ms, MiniSearch 7.1/83.3 ms, and Fuse 1,727.6/2,121.1 ms. Earlier Fuse
118-query batches hit a 60-second deadline; those were not single-query timeouts. Rechecks
time individual queries and complete the task subset. Fuse/Lunr title scores are unavailable,
not silently treated as zero. Every measured absent-term control returned no hits.

Hit@6 means a labeled file occurs among six returned **chunks**, with no file deduplication,
matching the app. Labels are author-assigned, not blinded human relevance judgments; broad
path labels and repeated titles can affect scores. These English documentation corpora do
not establish multilingual quality, LLM query-choice quality, or final rewrite quality.
All results describe the checked-in adapters/settings, not the best achievable tuning of
each library.

## Matching and re-indexing

[`search-contract.json`](../scripts/search-contract.json) covers exact/prefix/infix, the
three/four-character boundary, OR, no fuzzy edits, punctuation, empty input, decomposed
Latin accents, Greek/Cyrillic distinctions, CJK, and Hebrew. Against FTS5 result IDs:
MiniSearch, handwritten BM25, Elasticlunr, Lunr, and SQL.js agree on **24/24** cases;
FlexSearch differs on 3, Orama on 12, and Fuse on 9. This does not prove whole-Unicode
`unicode61` equivalence. The production regressions were run red before fixing decomposed
Latin tokenization and overly broad diacritic stripping; their failing logs are preserved.

| Adapter          | Update strategy and relevant costs                                                                                                                                                                                   |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FTS5 / SQL.js    | Delete old chunk rows, insert new rows in transactions. Contentless FTS stores postings, not a second document body.                                                                                                 |
| MiniSearch       | Discard old IDs, add new IDs; discarded hits disappear immediately. Automatic batched vacuum later reclaims postings (default threshold: 20 discarded documents and 10% dirt). No full rebuild.                      |
| FlexSearch       | Remove/add in three field indexes, with `fastupdate: true`; weighted reciprocal-rank fusion across terms and fields. Forward indexing also matches short prefixes, so extra work is needed to preserve the contract. |
| Orama            | Remove/add; stemming and stopword removal disabled, OR threshold, zero fuzzy tolerance, field boosts. Retains chunk bodies. Default tokenizer/prefix behavior is not a drop-in match.                                |
| Handwritten BM25 | Remove per-document postings, update frequencies/length totals, add chunks. FTS5-style weighted BM25; prefix expansion scans vocabulary. We own scoring, Unicode, optimization, and maintenance.                     |
| Elasticlunr      | Remove/add with its document store and custom tokenization; prefix expansion only at four characters. Its published global binding needed a browser adapter workaround.                                              |
| Lunr             | Retain inputs and rebuild the immutable index per edit transaction; alternatively reread files for a rebuild. Not incremental in the tested API. See the incomplete large-folder cycles above.                       |
| Fuse             | Remove/add in its token-search configuration, exact threshold and OR tokens. Removal scans stored inputs; task searches take roughly 1.7 seconds here, and matching differs from the contract.                       |

The update fixture changes **38 files / 263 chunks** in GitHub and **31 files / 400 chunks**
in MDN, inserting a unique token, then deletes and restores them. All completed cycles find
the inserted token and stop finding it after deletion. FTS5, MiniSearch, and handwritten
BM25 additionally pass **480 recorded churn cycles** across both corpora: every current token
is found, every previous token is absent. MiniSearch vacuum is awaited and timed separately.
These churn runs test stale-result cleanup, not a proof of bounded lifetime memory.

## Packaged-app workflow proof

The actual baseline and prototype HTML apps were each driven through the UI with **3,761
real OPFS files** (GitHub corpus plus a canary), real directory/file handles, real reads,
and actual `search_context` / `read_context_file` tool execution. Only the native picker
dialog returns the prepared handle, and a local deterministic model stand-in requests the
tools and formats their results. No search implementation or file contents are mocked.

Both apps read 3,761 bodies when the folder is picked. Initial and unchanged suggestions
read two bodies each (snippet and explicit full-file tool); one edited file causes three
reads (reindex plus those two); deleted and forgotten context cause zero. The visible answer
changes from 12 to 27 dollars after editing, contains no context after deletion/forgetting,
and consistently shows three alternatives with the correct source list. The 24 endpoint
requests, tool results, DOM text, and read counts are retained in the raw evidence.
This does not test an OS permission dialog or an actual external model's judgment.

## Alternatives screened, not benchmarked

- [Wink BM25](https://winkjs.org/wink-bm25-text-search/): its documented consolidation workflow
  freezes additions before search. A rebuild-oriented API is a worse fit for live folders.
- [Pagefind](https://pagefind.app/docs/): its normal workflow generates the index at build time;
  Redraft discovers arbitrary folders at runtime, entirely in the browser.
- [tinysearch](https://github.com/tinysearch/tinysearch): its documented workflow compiles a
  preselected corpus into a wasm artifact; not a direct runtime-folder replacement.
- [uFuzzy](https://github.com/leeoniya/uFuzzy): string filtering/fuzzy matching rather than
  weighted document retrieval; would need additional ranking and update design.
- [JS Search](https://github.com/bvaughn/js-search): its documented API is add-oriented;
  the nine implemented candidates offer closer matches to the mutable-index requirement.
  This is not a claim that custom deletion support is impossible.

No sizes or quality scores are claimed for excluded engines, arbitrary custom SQLite builds,
or untested tunings. Literal exhaustiveness over those spaces is not supportable.

## Decision and limits

MiniSearch gives the best tested maintained-library fit, saving about 575 KB compressed
in the complete app. Relative to FTS5 it builds roughly 3–4× slower, uses higher peak
renderer memory here, and changes rankings. It preserves the checked matching controls and
live-folder safeguards. Keep it if the title-lookup regression is acceptable; do not describe
it as relevance-equivalent. The handwritten engine saves only another 5,660 payload gzip
bytes, despite making us responsible for a search engine and showing higher build-time RSS.
If exact FTS5 behavior is mandatory, retain SQLite or pursue a separately scoped custom build.

## Evidence and reproduction

[`lighter-search-results.json`](lighter-search-results.json) contains corpus/query hashes,
exact sizes, timing ranges, trial counts, MRR, latency, memory snapshots, and summary metrics.
[`lighter-search-raw.json.gz`](lighter-search-raw.json.gz) preserves the recorded final-trial rankings,
samples, failure checkpoints, matching results, churn observations, Unicode red logs, and successful packaged-app
transcript. Its hash is in the summary. Earlier pilot memory accounting is superseded by this
report; old raw trial payload gzip fields used Bun's default level, while the report and final
summary payload sizes use explicit level 9.

Inside the devshell, with network access permitted:

```sh
mkdir -p .cache/search-bench
git clone --depth 1 --filter=blob:none --sparse https://github.com/github/docs.git .cache/search-bench/github-docs
git -C .cache/search-bench/github-docs fetch --depth 1 origin dae83f7d28f3b8e10015bd6b6d8b72267cedceca
git -C .cache/search-bench/github-docs checkout FETCH_HEAD
git -C .cache/search-bench/github-docs sparse-checkout set content
git clone --depth 1 --filter=blob:none --sparse https://github.com/mdn/content.git .cache/search-bench/mdn-content
git -C .cache/search-bench/mdn-content fetch --depth 1 origin 44a1a0348720bbd1b1085c7d92b93b4fd311a3dd
git -C .cache/search-bench/mdn-content checkout FETCH_HEAD
git -C .cache/search-bench/mdn-content sparse-checkout set files/en-us/web/css files/en-us/web/http files/en-us/web/javascript

amp orb service start search-bench --command 'direnv exec . bun scripts/search-benchmark.ts'
direnv exec . bun scripts/search-measure.js dist/search-bench 3 fts5,minisearch,flexsearch,orama,bm25,elasticlunr,sqljs
direnv exec . bun scripts/search-measure.js dist/search-bench 1 fuse,lunr tasks
direnv exec . bun scripts/search-package-check.js dist/search-bench
amp orb service stop search-bench

amp orb service start search-bench --command 'direnv exec . bun scripts/search-benchmark.ts .cache/search-bench/mdn-content/files/en-us/web scripts/search-mdn-queries.json dist/search-mdn'
direnv exec . bun scripts/search-measure.js dist/search-mdn 1 fts5,minisearch,flexsearch,orama,bm25,elasticlunr,sqljs
direnv exec . bun scripts/search-measure.js dist/search-mdn 3 fts5,minisearch
direnv exec . bun scripts/search-measure.js dist/search-mdn 1 fuse,lunr tasks
direnv exec . bun scripts/search-package-check.js dist/search-mdn
amp orb service stop search-bench
```

The harness binds port 3001; run only one corpus server at a time. On a non-orb machine,
run the server's Bun command directly. Use a fresh output directory for fresh measurements;
the driver checkpoints stages and resumes completed engine/trial pairs. A terminated Lunr
trial can be skipped on resume by passing only the remaining engines. On another machine,
numbers will vary; preserve browser flags and report resource limits and incomplete trials.

For the packaged-app check, use a disposable archive of the starting commit with this
checkout's installed dependencies. Remove the archive before running tests:

```sh
BASELINE_DIR=$(mktemp -d .cache/search-baseline.XXXXXX)
git archive f8b261c1cc09005181e889abd2400244938781b1 | tar -x -C "$BASELINE_DIR"
ln -s ../../node_modules "$BASELINE_DIR/node_modules"
direnv exec . bun --cwd "$BASELINE_DIR" scripts/build-html.ts "$PWD/dist/search-proof-baseline.html"
rm -r "$BASELINE_DIR"
direnv exec . bun run build:html
amp orb service start search-ui-proof --command 'direnv exec . bun scripts/search-proof-server.ts'
direnv exec . bun scripts/search-ui-proof.js before
direnv exec . bun scripts/search-ui-proof.js after
amp orb service stop search-ui-proof
direnv exec . bun test
direnv exec . bun run check
gzip -dc docs/lighter-search-raw.json.gz | jq '.packages | map({engine, fresh, stale, externalWasm})'
```

The proof server binds port 3002 and uses only public fixtures and a fake local model key.
Generated corpora, browser transcripts, and bundles stay in ignored `dist/` and `.cache/`;
the committed evidence contains no corpus bodies other than the canary. Main and UI work
are untouched; delivery is the `explore/lighter-search` prototype branch, not a merge.
