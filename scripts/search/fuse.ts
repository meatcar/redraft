import Fuse from "fuse.js";

import { normalize, terms, words, type Engine, type SearchDocument } from "./terms";

export function makeEngine(): Engine {
  const index = new Fuse<SearchDocument>([], {
    keys: [
      { name: "heading", weight: 2 },
      { name: "body", weight: 1 },
      { name: "path", weight: 1.5 },
    ],
    includeScore: true,
    useTokenSearch: true,
    tokenMatch: "any",
    tokenize: (text) => words(normalize(text)),
    threshold: 0,
    ignoreLocation: true,
  });
  return {
    add: (doc) => index.add(doc),
    remove: (id) => {
      index.remove((doc) => doc.id === id);
    },
    search: (query, limit) =>
      index
        .search(terms(query).join(" "), { limit })
        .map(({ item, score }) => ({ id: item.id, score: 1 - (score ?? 0) })),
  };
}
