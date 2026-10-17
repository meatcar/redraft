import { expect, test } from "bun:test";

import { makeEngine as bm25 } from "./bm25";
import { makeEngine as flexsearch } from "./flexsearch";
import { makeEngine as fts5 } from "./fts5";
import { makeEngine as minisearch } from "./minisearch";
import { makeEngine as orama } from "./orama";

for (const [name, create] of Object.entries({ bm25, flexsearch, fts5, minisearch, orama })) {
  test(`${name}: search reflects insertion, replacement, and deletion`, async () => {
    const engine = await create();
    const doc = { id: 1, path: "notes.md", heading: "Wildlife", body: "quokka" };
    engine.add(doc);
    engine.add({ ...doc, id: 2, body: "wombat" });
    expect(engine.search("quok", 6).map(({ id }) => id)).toEqual([1]);
    expect(engine.search("wombat", 6).map(({ id }) => id)).toEqual([2]);
    expect(engine.search("nonexistent", 6)).toEqual([]);
    engine.remove(1);
    engine.add({ ...doc, body: "narwhal" });
    expect(engine.search("quokka", 6)).toEqual([]);
    expect(engine.search("narwhal", 6).map(({ id }) => id)).toEqual([1]);
    engine.remove(1);
    expect(engine.search("narwhal", 6)).toEqual([]);
    expect(engine.search("wombat", 6).map(({ id }) => id)).toEqual([2]);
  });
}
