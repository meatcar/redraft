import MiniSearch from "minisearch";

import { normalize, terms, words, type Engine, type SearchDocument } from "./terms";

export function makeEngine(): Engine {
  const index = new MiniSearch<SearchDocument>({
    fields: ["heading", "body", "path"],
    tokenize: words,
    processTerm: normalize,
    searchOptions: {
      boost: { heading: 2, body: 1, path: 1.5 },
      combineWith: "OR",
      prefix: (term) => term.length >= 4,
      fuzzy: false,
    },
  });
  return {
    add: (doc) => index.add(doc),
    remove: (id) => index.discard(id),
    search: (query, limit) =>
      index
        .search(terms(query).join(" "))
        .slice(0, limit)
        .map(({ id, score }) => ({ id: Number(id), score })),
  };
}
