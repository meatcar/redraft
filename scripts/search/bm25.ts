import { normalize, terms, topHits, words, type Engine } from "./terms";

export function makeEngine(): Engine {
  const postings = new Map<string, Map<number, number>>();
  const documents = new Map<number, { length: number; terms: string[] }>();
  let totalLength = 0;
  return {
    add: (doc) => {
      const frequencies = new Map<string, number>();
      let length = 0;
      for (const [text, boost] of [
        [doc.heading, 2],
        [doc.body, 1],
        [doc.path, 1.5],
      ] as const) {
        for (const word of words(normalize(text))) {
          frequencies.set(word, (frequencies.get(word) ?? 0) + boost);
          length++;
        }
      }
      for (const [term, frequency] of frequencies) {
        let posting = postings.get(term);
        if (!posting) postings.set(term, (posting = new Map()));
        posting.set(doc.id, frequency);
      }
      documents.set(doc.id, { length, terms: [...frequencies.keys()] });
      totalLength += length;
    },
    remove: (id) => {
      const doc = documents.get(id);
      if (!doc) return;
      for (const term of doc.terms) {
        const posting = postings.get(term)!;
        posting.delete(id);
        if (!posting.size) postings.delete(term);
      }
      totalLength -= doc.length;
      documents.delete(id);
    },
    search: (query, limit) => {
      const scores = new Map<number, number>();
      for (const term of terms(normalize(query))) {
        const frequencies = new Map<number, number>();
        const matching = [...postings].filter(
          ([word]) => word === term || (term.length >= 4 && word.startsWith(term)),
        );
        for (const [, posting] of matching) {
          for (const [id, frequency] of posting)
            frequencies.set(id, (frequencies.get(id) ?? 0) + frequency);
        }
        const idf = Math.max(
          1e-6,
          Math.log((documents.size - frequencies.size + 0.5) / (frequencies.size + 0.5)),
        );
        for (const [id, frequency] of frequencies) {
          const length = documents.get(id)!.length;
          const score =
            (idf * frequency * 2.2) /
            (frequency + 1.2 * (0.25 + (0.75 * length) / (totalLength / documents.size)));
          scores.set(id, (scores.get(id) ?? 0) + score);
        }
      }
      return topHits(scores, limit);
    },
  };
}
