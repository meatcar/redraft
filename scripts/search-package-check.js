import { strict as assert } from "node:assert";

import { agentBrowser } from "./search/browser";

// NOTE: each package uses a fresh browser instance.
/* oxlint-disable no-await-in-loop */
const work = Bun.argv[2] ?? "dist/search-bench";
const flags = "--disable-extensions,--no-first-run";
const run = agentBrowser.bind(null, "search-package-check", flags);
const results = [];
const check = async () => {
  const fixture = await (await fetch("/contract.json")).json();
  const engine = await window.makeEngine();
  const transaction = engine.transaction ?? ((operation) => operation());
  transaction(() => fixture.docs.forEach((doc) => engine.add(doc)));
  const contract = fixture.queries.map(({ query, label }) => ({
    query,
    label,
    ids: engine
      .search(query, 100)
      .map(({ id }) => id)
      .toSorted((a, b) => a - b),
  }));
  transaction(() => {
    engine.remove(3);
    engine.add({ id: 3, path: "c.md", heading: "", body: "packagefreshqz" });
  });
  return {
    contract,
    fresh: engine.search("packagefreshqz", 6).map(({ id }) => id),
    stale: engine.search("quokka", 6).map(({ id }) => id),
    externalWasm: performance
      .getEntriesByType("resource")
      .filter(({ name }) => !name.startsWith("data:") && new URL(name).pathname.endsWith(".wasm"))
      .map(({ name }) => name),
  };
};
for (const { engine } of await Bun.file(`${work}/sizes.json`).json()) {
  try {
    await run("open", `http://localhost:3001/${engine}.html`);
    const response = JSON.parse(await run("eval", `(${check.toString()})()`, "--json"));
    assert.ok(response.success, JSON.stringify(response));
    const result = response.data.result;
    assert.deepEqual(result.fresh, [3]);
    assert.deepEqual(result.stale, []);
    assert.deepEqual(result.externalWasm, []);
    results.push({ engine, ...result });
    console.log(`${engine}: single-file initialization, search, replacement passed`);
  } finally {
    await run("close");
  }
}
await Bun.write(`${work}/packages.json`, JSON.stringify(results, null, 2));
