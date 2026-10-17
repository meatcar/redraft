import { Index } from "flexsearch";

import { normalize, terms, topHits, words, type Engine } from "./terms";

export function makeEngine(): Engine {
  const fields = ["heading", "body", "path"] as const;
  const boosts = [2, 1, 1.5];
  const indexes = fields.map(
    () =>
      new Index({
        tokenize: "forward",
        fastupdate: true,
        encode: (text) => words(normalize(text)),
      }),
  );
  return {
    add: (doc) => {
      indexes.forEach((index, i) => index.add(doc.id, doc[fields[i]!]));
    },
    remove: (id) => {
      indexes.forEach((index) => index.remove(id));
    },
    search: (query, limit) => {
      const scores = new Map<number, number>();
      for (const term of terms(query)) {
        indexes.forEach((index, i) => {
          (index.search(term, { limit: 1_000_000 }) ?? []).forEach((id, rank) => {
            const key = Number(id);
            scores.set(key, (scores.get(key) ?? 0) + boosts[i]! / (rank + 60));
          });
        });
      }
      return topHits(scores, limit);
    },
  };
}
