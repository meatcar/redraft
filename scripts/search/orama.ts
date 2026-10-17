import { create, insert, remove, search } from "@orama/orama";

import { terms, type Engine } from "./terms";

export function makeEngine(): Engine {
  const db = create({
    schema: { heading: "string", body: "string", path: "string" } as const,
    components: { tokenizer: { stemming: false, stopWords: false, allowDuplicates: true } },
  });
  return {
    add: (doc) => {
      void insert(db, { ...doc, id: String(doc.id) });
    },
    remove: (id) => {
      void remove(db, String(id));
    },
    search: (query, limit) => {
      const result = search(db, {
        term: terms(query).join(" "),
        limit,
        threshold: 1,
        tolerance: 0,
        boost: { heading: 2, body: 1, path: 1.5 },
      });
      if (result instanceof Promise) throw new Error("unexpected asynchronous Orama search");
      return result.hits.map(({ id, score }) => ({ id: Number(id), score }));
    },
  };
}
