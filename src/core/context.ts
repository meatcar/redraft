import MiniSearch from "minisearch";

import { isIgnoredPath, type FileSource, type SourceFile } from "./files";

const TEXT_FILE = /\.(md|mdx|markdown|txt|rst|org|adoc)$/i;
const MAX_FILE_BYTES = 1_000_000;
const READ_BATCH = 64;
const MAX_QUERY_TERMS = 32;
const MIN_PREFIX_CHARS = 4;

export type Chunk = { heading: string; start: number; end: number };
export type ContextHit = { path: string; heading: string; text: string; score: number };
export type ContextStatus = { name: string; files: number; chunks: number };

type IndexedFile = { mtime: number; size: number; chunks: number[] };
type IndexedChunk = Chunk & { path: string };
type SearchDocument = { id: number; heading: string; body: string; path: string };

export function chunkMarkdown(source: string, maxChars = 1500): Chunk[] {
  const sections: Chunk[] = [];
  const trail: string[] = [];
  let heading = "";
  let start = 0;
  let pos = 0;
  let inFence = false;

  const flush = (end: number) => {
    const range = trimRange(source, start, end);
    if (range) sections.push({ heading, ...range });
  };

  for (const line of source.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    const match = inFence ? null : /^(#{1,6})\s+(.*)$/.exec(line);
    if (match?.[1] && match[2] !== undefined) {
      flush(pos);
      start = pos;
      const depth = match[1].length;
      trail.length = depth;
      trail[depth - 1] = match[2].trim();
      heading = trail.filter(Boolean).join(" > ");
    }
    pos += line.length + 1;
  }
  flush(source.length);

  return sections.flatMap((section) => splitSection(source, section, maxChars));
}

function trimRange(source: string, start: number, end: number) {
  while (start < end && /\s/.test(source[start] ?? "")) start++;
  while (end > start && /\s/.test(source[end - 1] ?? "")) end--;
  return start < end ? { start, end } : null;
}

function splitSection(source: string, section: Chunk, maxChars: number): Chunk[] {
  if (section.end - section.start <= maxChars) return [section];
  const pieces: { start: number; end: number }[] = [];
  const body = source.slice(section.start, section.end);
  let paragraphStart = 0;
  for (const separator of [...body.matchAll(/\n{2,}/g), { index: body.length, 0: "" }]) {
    for (let at = paragraphStart; at < separator.index; at += maxChars) {
      const end = Math.min(at + maxChars, separator.index);
      pieces.push({ start: section.start + at, end: section.start + end });
    }
    paragraphStart = separator.index + separator[0].length;
  }

  const chunks: Chunk[] = [];
  for (const piece of pieces) {
    const last = chunks.at(-1);
    if (last && piece.end - last.start <= maxChars) last.end = piece.end;
    else chunks.push({ heading: section.heading, ...piece });
  }
  return chunks;
}

const words = (text: string) =>
  text
    .normalize("NFC")
    .toLowerCase()
    .match(/[\p{L}\p{N}][\p{L}\p{N}\p{M}]*/gu) ?? [];

const isIndexable = (file: SourceFile) =>
  TEXT_FILE.test(file.path) && !isIgnoredPath(file.path) && file.size <= MAX_FILE_BYTES;

/**
 * Full-text index over one picked folder, held in memory.
 * sync() follows the folder's current state; search() reads snippets from the files themselves.
 */
export class ContextIndex {
  private files = new Map<string, SourceFile>();
  private indexed = new Map<string, IndexedFile>();
  private chunks = new Map<number, IndexedChunk>();
  private nextId = 1;
  private searchIndex = new MiniSearch<SearchDocument>({
    fields: ["heading", "body", "path"],
    tokenize: words,
    processTerm: (term) =>
      term
        .normalize("NFD")
        .replace(/(\p{Script=Latin})\p{M}+/gu, "$1")
        .normalize("NFC"),
    searchOptions: {
      boost: { heading: 2, body: 1, path: 1.5 },
      combineWith: "OR",
      prefix: (term) => term.length >= MIN_PREFIX_CHARS,
      fuzzy: false,
    },
  });
  private syncing: Promise<void> = Promise.resolve();

  private constructor(private readonly source: FileSource) {}

  static async open(source: FileSource): Promise<ContextIndex> {
    const index = new ContextIndex(source);
    await index.sync();
    return index;
  }

  get status(): ContextStatus {
    return { name: this.source.name, files: this.indexed.size, chunks: this.chunks.size };
  }

  /** Re-lists the folder and reindexes changed files; concurrent calls queue. */
  sync(): Promise<void> {
    this.syncing = this.syncing.catch(() => {}).then(() => this.syncNow());
    return this.syncing;
  }

  // NOTE: fallow misses calls through Pick<ContextIndex, ...> in suggest.ts.
  // fallow-ignore-next-line unused-class-member
  async search(query: string, limit = 6): Promise<ContextHit[]> {
    const match = [...new Set(words(query))].slice(0, MAX_QUERY_TERMS).join(" ");
    if (!match) return [];
    const rows = this.searchIndex
      .search(match)
      .slice(0, limit)
      .map(({ id, score }) => Object.assign({ score }, this.chunks.get(Number(id))!));

    const sources = new Map<string, Promise<string | null>>();
    const sourceOf = (row: IndexedChunk) => {
      let source = sources.get(row.path);
      if (!source) {
        source = this.readUnchanged(row.path);
        sources.set(row.path, source);
      }
      return source;
    };
    const hits = await Promise.all(
      rows.map(async (row) => {
        const source = await sourceOf(row);
        if (source === null) return [];
        const text = source.slice(row.start, row.end);
        return [{ path: row.path, heading: row.heading, text, score: row.score }];
      }),
    );
    return hits.flat();
  }

  // fallow-ignore-next-line unused-class-member
  async read(path: string): Promise<string> {
    const file = this.files.get(path);
    if (!file) throw new Error(`${path} is not in the context folder`);
    return (await file.open()).text();
  }

  /** Returns the file text only if it still matches the indexed version, so offsets stay valid. */
  private async readUnchanged(path: string) {
    const row = this.indexed.get(path)!;
    const current = await this.files
      .get(path)
      ?.open()
      .catch(() => null);
    if (!current || current.lastModified !== row.mtime || current.size !== row.size) return null;
    return current.text();
  }

  private async syncNow() {
    const listed = (await this.source.list()).filter(isIndexable);
    const present = new Set(listed.map((f) => f.path));
    const changed = listed.filter((f) => {
      const row = this.indexed.get(f.path);
      return !row || row.mtime !== f.lastModified || row.size !== f.size;
    });

    for (const path of this.indexed.keys()) {
      if (!present.has(path)) this.forget(path);
    }
    for (let start = 0; start < changed.length; start += READ_BATCH) {
      const batch = changed.slice(start, start + READ_BATCH);
      // NOTE: bounded batches cap open file reads on large folders.
      // oxlint-disable-next-line no-await-in-loop
      const contents = await Promise.all(batch.map(async (f) => (await f.open()).text()));
      batch.forEach((file, i) => this.index(file, contents[i] ?? ""));
    }
    this.files = new Map(listed.map((f) => [f.path, f]));
  }

  private forget(path: string) {
    for (const id of this.indexed.get(path)?.chunks ?? []) {
      this.searchIndex.discard(id);
      this.chunks.delete(id);
    }
    this.indexed.delete(path);
  }

  private index(file: SourceFile, source: string) {
    this.forget(file.path);
    const chunks: number[] = [];
    for (const chunk of chunkMarkdown(source)) {
      const id = this.nextId++;
      this.searchIndex.add({
        id,
        heading: chunk.heading,
        body: source.slice(chunk.start, chunk.end),
        path: file.path,
      });
      this.chunks.set(id, { ...chunk, path: file.path });
      chunks.push(id);
    }
    this.indexed.set(file.path, { mtime: file.lastModified, size: file.size, chunks });
  }
}
