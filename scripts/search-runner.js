const corpus = await (await fetch("/corpus.json")).json();
const initStart = performance.now();
const engine = await window.makeEngine();
const initializationMs = performance.now() - initStart;
const transaction = engine.transaction ?? ((work) => work());
const changedPaths = new Set(
  [...new Set(corpus.docs.map((doc) => doc.path))].filter((_, i) => i % 100 === 0),
);
const changed = corpus.docs.filter((doc) => changedPaths.has(doc.path));

window.runBuild = () => {
  const start = performance.now();
  transaction(() => {
    for (const doc of corpus.docs) engine.add(doc);
  });
  return {
    buildMs: performance.now() - start,
    initializationMs,
    wasmBytes: engine.wasmBytes?.() ?? 0,
  };
};

window.runQuery = (number) => {
  const { query, relevant, kind } = corpus.queries[number];
  const start = performance.now();
  const hits = engine.search(query, 6);
  const ms = performance.now() - start;
  const paths = hits.map(({ id }) => corpus.docs[id - 1].path);
  const rank = paths.findIndex((path) => new RegExp(relevant).test(path));
  return {
    query,
    kind,
    ms,
    ids: hits.map(({ id }) => id),
    paths,
    reciprocalRank: rank < 0 ? 0 : 1 / (rank + 1),
  };
};

window.runUpdates = async () => {
  const start = performance.now();
  transaction(() => {
    for (const doc of changed) {
      engine.remove(doc.id);
      engine.add({ ...doc, body: `${doc.body}\nbenchmarkmutationtoken` });
    }
  });
  const updateMs = performance.now() - start;
  const mutationFound = engine.search("benchmarkmutationtoken", 6).length;
  transaction(() => {
    for (const doc of changed) engine.remove(doc.id);
  });
  const mutationRemoved = engine.search("benchmarkmutationtoken", 6).length === 0;
  transaction(() => {
    for (const doc of changed) engine.add(doc);
  });
  const settleStart = performance.now();
  await engine.settle?.();
  return {
    changedFiles: changedPaths.size,
    changedChunks: changed.length,
    updateMs,
    settleMs: performance.now() - settleStart,
    mutationFound,
    mutationRemoved,
  };
};

window.runChurn = async () => {
  const cycles = [];
  for (let cycle = 0; cycle < 30; cycle++) {
    const start = performance.now();
    transaction(() => {
      for (const doc of changed) {
        engine.remove(doc.id);
        engine.add({ ...doc, body: `${doc.body}\nbenchmarkcycle${cycle}qz` });
      }
    });
    const ms = performance.now() - start;
    const fresh = engine.search(`benchmarkcycle${cycle}qz`, 6).length > 0;
    const stale = cycle > 0 && engine.search(`benchmarkcycle${cycle - 1}qz`, 6).length > 0;
    cycles.push({ cycle, ms, fresh, stale });
  }
  const start = performance.now();
  await engine.settle?.();
  return { cycles, settleMs: performance.now() - start };
};

window.runContract = async () => {
  const { docs, queries } = await (await fetch("/contract.json")).json();
  const isolated = await window.makeEngine();
  (isolated.transaction ?? ((work) => work()))(() => {
    for (const doc of docs) isolated.add(doc);
  });
  return queries.map(({ query, label }) => ({
    label,
    query,
    ids: isolated
      .search(query, 100)
      .map(({ id }) => id)
      .toSorted((a, b) => a - b),
  }));
};

window.benchmarkReady = true;
