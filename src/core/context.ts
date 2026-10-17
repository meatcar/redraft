import type { Database } from "@sqlite.org/sqlite-wasm";
import { z } from "zod";

import { isIgnoredPath, type FileSource, type SourceFile } from "./files";
import { openMemoryDatabase } from "./sqlite";

const TEXT_FILE = /\.(md|mdx|markdown|txt|rst|org|adoc)$/i;
const MAX_FILE_BYTES = 1_000_000;
const READ_BATCH = 64;
const MAX_QUERY_TERMS = 32;
const MIN_PREFIX_CHARS = 4;

export type Chunk = { heading: string; start: number; end: number };
export type ContextHit = { path: string; heading: string; text: string; score: number };
export type ContextStatus = { name: string; files: number; chunks: number };

const fileRow = z.object({ id: z.number(), path: z.string(), mtime: z.number(), size: z.number() });
const hitRow = fileRow.extend({
  heading: z.string(),
  start: z.number(),
  end: z.number(),
  score: z.number(),
});
const countsRow = z.object({ files: z.number(), chunks: z.number() });
type FileRow = z.infer<typeof fileRow>;
type HitRow = z.infer<typeof hitRow>;

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

/** Turns free text into an FTS5 query: any word, by prefix, ranked by BM25. */
function toMatchQuery(text: string): string | null {
  const words = new Set(text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
  const terms = [...words]
    .slice(0, MAX_QUERY_TERMS)
    .map((w) => (w.length >= MIN_PREFIX_CHARS ? `"${w}"*` : `"${w}"`));
  return terms.length > 0 ? terms.join(" OR ") : null;
}

const SCHEMA = [
  `CREATE TABLE files (
     id INTEGER PRIMARY KEY, path TEXT NOT NULL UNIQUE,
     mtime REAL NOT NULL, size INTEGER NOT NULL)`,
  `CREATE TABLE chunks (
     id INTEGER PRIMARY KEY, file_id INTEGER NOT NULL REFERENCES files ON DELETE CASCADE,
     heading TEXT NOT NULL, start INTEGER NOT NULL, "end" INTEGER NOT NULL)`,
  "CREATE INDEX chunks_file ON chunks (file_id)",
  // NOTE: contentless; stores terms and positions only. Snippets are read from the folder.
  `CREATE VIRTUAL TABLE chunks_fts USING fts5(heading, body, path,
     content='', contentless_delete=1, tokenize='unicode61 remove_diacritics 2')`,
];

const isIndexable = (file: SourceFile) =>
  TEXT_FILE.test(file.path) && !isIgnoredPath(file.path) && file.size <= MAX_FILE_BYTES;

/**
 * Full-text index over one picked folder, held in memory.
 * sync() follows the folder's current state; search() reads snippets from the files themselves.
 */
export class ContextIndex {
  private files = new Map<string, SourceFile>();
  private syncing: Promise<void> = Promise.resolve();

  private constructor(
    private readonly source: FileSource,
    private readonly db: Database,
  ) {}

  static async open(source: FileSource): Promise<ContextIndex> {
    const db = await openMemoryDatabase();
    db.exec("PRAGMA foreign_keys = ON");
    for (const sql of SCHEMA) db.exec(sql);
    const index = new ContextIndex(source, db);
    await index.sync();
    return index;
  }

  get status(): ContextStatus {
    const row = countsRow.parse(
      this.db.selectObject(
        "SELECT (SELECT count(*) FROM files) AS files, (SELECT count(*) FROM chunks) AS chunks",
      ),
    );
    return { name: this.source.name, ...row };
  }

  /** Re-lists the folder and reindexes changed files; concurrent calls queue. */
  sync(): Promise<void> {
    this.syncing = this.syncing.catch(() => {}).then(() => this.syncNow());
    return this.syncing;
  }

  async search(query: string, limit = 6): Promise<ContextHit[]> {
    const match = toMatchQuery(query);
    if (!match) return [];
    const rows = z.array(hitRow).parse(
      this.db.selectObjects(
        // NOTE: MATERIALIZED forces FTS first; otherwise the planner scans every chunk.
        `WITH matches AS MATERIALIZED (
         SELECT rowid, bm25(chunks_fts, 2.0, 1.0, 1.5) AS score
         FROM chunks_fts WHERE chunks_fts MATCH ?)
       SELECT f.id, f.path, f.mtime, f.size, c.heading, c.start, c."end", matches.score
       FROM matches
       JOIN chunks c ON c.id = matches.rowid
       JOIN files f ON f.id = c.file_id
       ORDER BY matches.score LIMIT ?`,
        [match, limit],
      ),
    );

    const sources = new Map<string, Promise<string | null>>();
    const sourceOf = (row: HitRow) => {
      let source = sources.get(row.path);
      if (!source) {
        source = this.readUnchanged(row);
        sources.set(row.path, source);
      }
      return source;
    };
    const hits = await Promise.all(
      rows.map(async (row) => {
        const source = await sourceOf(row);
        if (source === null) return [];
        const text = source.slice(row.start, row.end);
        return [{ path: row.path, heading: row.heading, text, score: -row.score }];
      }),
    );
    return hits.flat();
  }

  async read(path: string): Promise<string> {
    const file = this.files.get(path);
    if (!file) throw new Error(`${path} is not in the context folder`);
    return (await file.open()).text();
  }

  /** Returns the file text only if it still matches the indexed version, so offsets stay valid. */
  private async readUnchanged(row: FileRow) {
    const current = await this.files
      .get(row.path)
      ?.open()
      .catch(() => null);
    if (!current || current.lastModified !== row.mtime || current.size !== row.size) return null;
    return current.text();
  }

  private async syncNow() {
    const listed = (await this.source.list()).filter(isIndexable);
    const rows = z
      .array(fileRow)
      .parse(this.db.selectObjects("SELECT id, path, mtime, size FROM files"));
    const known = new Map(rows.map((row) => [row.path, row]));
    const present = new Set(listed.map((f) => f.path));
    const removed = [...known.values()].filter((row) => !present.has(row.path));
    const changed = listed.filter((f) => {
      const row = known.get(f.path);
      return !row || row.mtime !== f.lastModified || row.size !== f.size;
    });

    this.db.transaction(() => {
      for (const row of removed) this.forget(row.id);
    });
    for (let start = 0; start < changed.length; start += READ_BATCH) {
      const batch = changed.slice(start, start + READ_BATCH);
      // NOTE: bounded batches cap open file reads on large folders.
      // oxlint-disable-next-line no-await-in-loop
      const contents = await Promise.all(batch.map(async (f) => (await f.open()).text()));
      this.db.transaction(() => {
        batch.forEach((file, i) => this.index(file, contents[i] ?? "", known.get(file.path)));
      });
    }
    this.files = new Map(listed.map((f) => [f.path, f]));
  }

  private forget(fileId: number) {
    this.db.exec(
      "DELETE FROM chunks_fts WHERE rowid IN (SELECT id FROM chunks WHERE file_id = ?)",
      {
        bind: [fileId],
      },
    );
    this.db.exec("DELETE FROM files WHERE id = ?", { bind: [fileId] });
  }

  private index(file: SourceFile, source: string, previous: FileRow | undefined) {
    if (previous) this.forget(previous.id);
    const fileId = this.db.selectValue(
      "INSERT INTO files (path, mtime, size) VALUES (?, ?, ?) RETURNING id",
      [file.path, file.lastModified, file.size],
    );
    const insertChunk = this.db.prepare(
      `INSERT INTO chunks (file_id, heading, start, "end") VALUES (?, ?, ?, ?) RETURNING id`,
    );
    const insertTerms = this.db.prepare(
      "INSERT INTO chunks_fts (rowid, heading, body, path) VALUES (?, ?, ?, ?)",
    );
    try {
      for (const chunk of chunkMarkdown(source)) {
        insertChunk.bind([fileId ?? null, chunk.heading, chunk.start, chunk.end]).step();
        const chunkId = insertChunk.get(0);
        insertChunk.reset();
        const body = source.slice(chunk.start, chunk.end);
        insertTerms.bind([chunkId, chunk.heading, body, file.path]).stepReset();
      }
    } finally {
      insertChunk.finalize();
      insertTerms.finalize();
    }
  }
}
