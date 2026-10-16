import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import type { ContextStatus } from "../shared/api";

const TEXT_FILES = new Bun.Glob("**/*.{md,mdx,markdown,txt,rst,org,adoc}");
const IGNORED_SEGMENTS = new Set(["node_modules", ".git"]);
const MAX_FILE_BYTES = 1_000_000;
const READ_BATCH = 64;
const MAX_QUERY_TERMS = 32;
const MIN_PREFIX_CHARS = 4;
const OPTIMIZE_AFTER_FILES = 50;
const SCHEMA_VERSION = 1;

export type Chunk = { heading: string; start: number; end: number };
export type ContextHit = { path: string; heading: string; text: string; score: number };

type FileEntry = { path: string; mtimeMs: number; size: number };
type FileRow = { id: number; path: string; mtime: number; size: number };
type HitRow = { path: string; mtime: number; size: number; heading: string } & Chunk & {
    score: number;
  };

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

async function listFiles(dir: string): Promise<FileEntry[]> {
  const entries: FileEntry[] = [];
  for await (const path of TEXT_FILES.scan({ cwd: dir, onlyFiles: true })) {
    if (path.split(sep).some((segment) => IGNORED_SEGMENTS.has(segment))) continue;
    const info = await stat(join(dir, path));
    if (info.size <= MAX_FILE_BYTES) entries.push({ path, mtimeMs: info.mtimeMs, size: info.size });
  }
  return entries;
}

/** Turns free text into an FTS5 query: any word, by prefix, ranked by BM25. */
function toMatchQuery(text: string): string | null {
  const words = new Set(text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
  const terms = [...words]
    .slice(0, MAX_QUERY_TERMS)
    .map((w) => (w.length >= MIN_PREFIX_CHARS ? `"${w}"*` : `"${w}"`));
  return terms.length > 0 ? terms.join(" OR ") : null;
}

function openDatabase(path: string): Database {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { create: true, strict: true });
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA foreign_keys = ON");
  const { user_version: version } = db
    .query<{ user_version: number }, []>("PRAGMA user_version")
    .get()!;
  if (version !== SCHEMA_VERSION) {
    // NOTE: the index is a disposable cache; rebuild instead of migrating.
    db.run("DROP TABLE IF EXISTS chunks_fts");
    db.run("DROP TABLE IF EXISTS chunks");
    db.run("DROP TABLE IF EXISTS files");
    db.run(`CREATE TABLE files (
      id INTEGER PRIMARY KEY, dir TEXT NOT NULL, path TEXT NOT NULL,
      mtime REAL NOT NULL, size INTEGER NOT NULL, UNIQUE (dir, path))`);
    db.run(`CREATE TABLE chunks (
      id INTEGER PRIMARY KEY, file_id INTEGER NOT NULL REFERENCES files ON DELETE CASCADE,
      heading TEXT NOT NULL, start INTEGER NOT NULL, "end" INTEGER NOT NULL)`);
    db.run("CREATE INDEX chunks_file ON chunks (file_id)");
    // NOTE: contentless; stores terms and positions only. Snippets are read from disk.
    db.run(`CREATE VIRTUAL TABLE chunks_fts USING fts5(heading, body, path,
      content='', contentless_delete=1, tokenize='unicode61 remove_diacritics 2')`);
    db.run(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  }
  return db;
}

/** One synced context folder: search by relevance, read whole files. */
export class ContextIndex {
  constructor(
    readonly dir: string,
    private readonly db: Database,
  ) {}

  // NOTE: fallow misses the getter use in app.ts.
  // fallow-ignore-next-line unused-class-member
  get status(): ContextStatus {
    const row = this.db
      .query<{ files: number; chunks: number }, [string]>(
        `SELECT count(DISTINCT f.id) AS files, count(c.id) AS chunks
         FROM files f LEFT JOIN chunks c ON c.file_id = f.id WHERE f.dir = ?`,
      )
      .get(this.dir);
    return { root: this.dir, files: row?.files ?? 0, chunks: row?.chunks ?? 0 };
  }

  async search(query: string, limit = 6): Promise<ContextHit[]> {
    const match = toMatchQuery(query);
    if (!match) return [];
    const rows = this.db
      .query<HitRow, [string, string, number]>(
        // NOTE: MATERIALIZED forces FTS first; otherwise the planner scans every chunk in the folder.
        `WITH matches AS MATERIALIZED (
           SELECT rowid, bm25(chunks_fts, 2.0, 1.0, 1.5) AS score
           FROM chunks_fts WHERE chunks_fts MATCH ?)
         SELECT f.path, f.mtime, f.size, c.heading, c.start, c."end", matches.score
         FROM matches
         JOIN chunks c ON c.id = matches.rowid
         JOIN files f ON f.id = c.file_id
         WHERE f.dir = ?
         ORDER BY matches.score LIMIT ?`,
      )
      .all(match, this.dir, limit);

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
    const known = this.db
      .query<{ id: number }, [string, string]>("SELECT id FROM files WHERE dir = ? AND path = ?")
      .get(this.dir, path);
    if (!known) throw new Error(`${path} is not in the context folder`);
    return Bun.file(join(this.dir, path)).text();
  }

  /** Returns the file text only if it still matches the indexed version, so offsets stay valid. */
  private async readUnchanged(row: { path: string; mtime: number; size: number }) {
    const file = join(this.dir, row.path);
    const info = await stat(file).catch(() => null);
    if (!info || info.mtimeMs !== row.mtime || info.size !== row.size) return null;
    return Bun.file(file).text();
  }
}

/** Opens context folders under one allowed root and keeps their FTS5 index in sync with disk. */
export class ContextLibrary {
  private readonly db: Database;
  private readonly syncs = new Map<string, Promise<ContextIndex>>();

  constructor(
    readonly root: string,
    { indexPath = ":memory:" }: { indexPath?: string } = {},
  ) {
    this.db = openDatabase(indexPath);
  }

  async open(path: string): Promise<ContextIndex> {
    const dir = await this.resolveInsideRoot(path);
    // NOTE: one sync per folder at a time; callers queue behind the running one.
    const previous = this.syncs.get(dir) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(() => this.sync(dir));
    this.syncs.set(dir, next);
    return next;
  }

  private async sync(dir: string): Promise<ContextIndex> {
    const files = await listFiles(dir);
    const known = new Map(
      this.db
        .query<FileRow, [string]>("SELECT id, path, mtime, size FROM files WHERE dir = ?")
        .all(dir)
        .map((row) => [row.path, row]),
    );
    const present = new Set(files.map((f) => f.path));
    const removed = [...known.values()].filter((row) => !present.has(row.path));
    const changed = files.filter((f) => {
      const row = known.get(f.path);
      return !row || row.mtime !== f.mtimeMs || row.size !== f.size;
    });

    this.db.transaction(() => {
      for (const row of removed) this.forget(row.id);
    })();

    for (let start = 0; start < changed.length; start += READ_BATCH) {
      const batch = changed.slice(start, start + READ_BATCH);
      // NOTE: bounded batches avoid exhausting file descriptors on large corpora.
      // oxlint-disable-next-line no-await-in-loop
      const contents = await Promise.all(batch.map((f) => Bun.file(join(dir, f.path)).text()));
      this.db.transaction(() => {
        batch.forEach((file, i) => this.index(dir, file, contents[i] ?? "", known.get(file.path)));
      })();
    }
    if (changed.length >= OPTIMIZE_AFTER_FILES) {
      this.db.run("INSERT INTO chunks_fts (chunks_fts) VALUES ('optimize')");
      this.db.run("VACUUM");
    }
    return new ContextIndex(dir, this.db);
  }

  private forget(fileId: number) {
    this.db
      .query("DELETE FROM chunks_fts WHERE rowid IN (SELECT id FROM chunks WHERE file_id = ?)")
      .run(fileId);
    this.db.query("DELETE FROM files WHERE id = ?").run(fileId);
  }

  private index(dir: string, file: FileEntry, source: string, previous: FileRow | undefined) {
    if (previous) this.forget(previous.id);
    const { id: fileId } = this.db
      .query<{ id: number }, [string, string, number, number]>(
        "INSERT INTO files (dir, path, mtime, size) VALUES (?, ?, ?, ?) RETURNING id",
      )
      .get(dir, file.path, file.mtimeMs, file.size)!;
    const insertChunk = this.db.query<{ id: number }, [number, string, number, number]>(
      `INSERT INTO chunks (file_id, heading, start, "end") VALUES (?, ?, ?, ?) RETURNING id`,
    );
    const insertTerms = this.db.query(
      "INSERT INTO chunks_fts (rowid, heading, body, path) VALUES (?, ?, ?, ?)",
    );
    for (const chunk of chunkMarkdown(source)) {
      const { id } = insertChunk.get(fileId, chunk.heading, chunk.start, chunk.end)!;
      insertTerms.run(id, chunk.heading, source.slice(chunk.start, chunk.end), file.path);
    }
  }

  private async resolveInsideRoot(path: string): Promise<string> {
    const root = await realpath(this.root);
    const expanded = path.replace(/^~(?=$|\/)/, homedir());
    const dir = await realpath(isAbsolute(expanded) ? expanded : resolve(root, expanded));
    const rel = relative(root, dir);
    if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
      throw new Error(`${path} is outside the allowed context root ${this.root}`);
    }
    return dir;
  }
}
