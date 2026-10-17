import lunr from "lunr";

import { normalize, terms, words, type Engine, type SearchDocument } from "./terms";

export function makeEngine(): Engine {
  const docs = new Map<number, SearchDocument>();
  let index: lunr.Index | null = null;
  let dirty = true;
  const rebuild = () => {
    if (!dirty) return;
    index = null;
    index = lunr(function () {
      this.ref("id");
      this.field("heading", { boost: 2 });
      this.field("body");
      this.field("path", { boost: 1.5 });
      this.pipeline.reset();
      this.searchPipeline.reset();
      this.tokenizer = Object.assign(
        (text?: unknown) =>
          words(normalize(typeof text === "string" ? text : "")).map(
            (word) => new lunr.Token(word, {}),
          ),
        lunr.tokenizer,
      );
      for (const doc of docs.values()) this.add(doc);
    });
    dirty = false;
  };
  return {
    add: (doc) => {
      docs.set(doc.id, doc);
      dirty = true;
    },
    remove: (id) => {
      docs.delete(id);
      dirty = true;
    },
    transaction: (work) => {
      work();
      rebuild();
    },
    search: (query, limit) => {
      const tokens = terms(normalize(query));
      if (!tokens.length) return [];
      rebuild();
      return index!
        .query((plan) => {
          for (const term of tokens)
            plan.term(term, {
              usePipeline: false,
              wildcard: term.length >= 4 ? lunr.Query.wildcard.TRAILING : lunr.Query.wildcard.NONE,
            });
        })
        .slice(0, limit)
        .map(({ ref, score }) => ({ id: Number(ref), score }));
    },
  };
}
