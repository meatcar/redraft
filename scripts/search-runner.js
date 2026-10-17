const corpus = await (await fetch("/corpus.json")).json();
const engine = await window.makeEngine();
const gc = () => globalThis.gc?.();
const heap = () => performance.memory.usedJSHeapSize;
gc();
await new Promise((resolve) => setTimeout(resolve, 0));
const before = heap();
const start = performance.now();
const transaction = engine.transaction ?? ((work) => work());
transaction(() => {
  for (const doc of corpus.docs) engine.add(doc);
});
const buildMs = performance.now() - start;
gc();
await new Promise((resolve) => setTimeout(resolve, 0));
const after = heap();
const retainedBytes = after - before;
const wasmBytes = engine.wasmBytes?.() ?? 0;
const results = [];
for (const { query, relevant } of corpus.queries) {
  const queryStart = performance.now();
  const hits = engine.search(query, 6);
  const ms = performance.now() - queryStart;
  const paths = hits.map(({ id }) => corpus.docs[id - 1].path);
  const rank = paths.findIndex((path) => new RegExp(relevant).test(path));
  results.push({
    query,
    ms,
    ids: hits.map(({ id }) => id),
    paths,
    reciprocalRank: rank < 0 ? 0 : 1 / (rank + 1),
  });
}
const changedPaths = new Set(
  [...new Set(corpus.docs.map((doc) => doc.path))].filter((_, i) => i % 100 === 0),
);
const changed = corpus.docs.filter((doc) => changedPaths.has(doc.path));
const updateStart = performance.now();
transaction(() => {
  for (const doc of changed) {
    engine.remove(doc.id);
    engine.add({ ...doc, body: `${doc.body}\nbenchmarkmutationtoken` });
  }
});
const updateMs = performance.now() - updateStart;
const mutationFound = engine.search("benchmarkmutationtoken", 6).length;
for (const doc of changed) engine.remove(doc.id);
const mutationRemoved = engine.search("benchmarkmutationtoken", 6).length === 0;
const exact = engine.search("sta", 6).map(({ id }) => corpus.docs[id - 1].body);
window.benchmark = {
  engine: new URL(location.href).searchParams.get("engine"),
  files: corpus.files,
  chunks: corpus.docs.length,
  bytes: corpus.bytes,
  chunkMs: corpus.chunkMs,
  buildMs,
  before,
  after,
  retainedBytes,
  wasmBytes,
  changedFiles: changedPaths.size,
  changedChunks: changed.length,
  updateMs,
  mutationFound,
  mutationRemoved,
  shortPrefixSamples: exact.slice(0, 2),
  results,
};
document.body.textContent = JSON.stringify(window.benchmark);
