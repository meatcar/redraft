export type SearchDocument = { id: number; heading: string; body: string; path: string };
export type Ranked = { id: number; score: number };
export type Engine = {
  add: (doc: SearchDocument) => void;
  remove: (id: number) => void;
  search: (query: string, limit: number) => Ranked[];
  transaction?: (work: () => void) => void;
  wasmBytes?: () => number;
  settle?: () => Promise<void>;
};

export const words = (text: string) =>
  text
    .normalize("NFC")
    .toLowerCase()
    .match(/[\p{L}\p{N}][\p{L}\p{N}\p{M}]*/gu) ?? [];
export const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/(\p{Script=Latin})\p{M}+/gu, "$1")
    .normalize("NFC");
export const terms = (text: string) => [...new Set(words(text))].slice(0, 32);

export const ftsMatch = (query: string) =>
  terms(query)
    .map((term) => `"${term}"${term.length >= 4 ? "*" : ""}`)
    .join(" OR ");

export const topHits = (scores: Map<number, number>, limit: number): Ranked[] =>
  [...scores]
    .map(([id, score]) => ({ id, score }))
    .toSorted((a, b) => b.score - a.score)
    .slice(0, limit);
