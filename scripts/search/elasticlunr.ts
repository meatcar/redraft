import type Elasticlunr from "elasticlunr";

import { normalize, terms, topHits, words, type Engine, type SearchDocument } from "./terms";

export async function makeEngine(): Promise<Engine> {
  Object.assign(globalThis, { lunr: {} });
  const elasticlunr: typeof Elasticlunr = (await import("elasticlunr")).default;
  elasticlunr.tokenizer = Object.assign(
    (text?: string) => words(normalize(text ?? "")),
    elasticlunr.tokenizer,
  );
  const index = elasticlunr<SearchDocument>(function () {
    this.setRef("id");
    this.addField("heading");
    this.addField("body");
    this.addField("path");
    this.pipeline.reset();
  });
  return {
    add: (doc) => index.addDoc(doc),
    remove: (id) => index.removeDocByRef(id),
    search: (query, limit) => {
      const scores = new Map<number, number>();
      for (const term of terms(normalize(query))) {
        for (const { ref, score } of index.search(term, {
          bool: "OR",
          expand: term.length >= 4,
          fields: { heading: { boost: 2 }, body: { boost: 1 }, path: { boost: 1.5 } },
        }))
          scores.set(Number(ref), (scores.get(Number(ref)) ?? 0) + score);
      }
      return topHits(scores, limit);
    },
  };
}
