import MiniSearch from "minisearch";
import { realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import type { ContextStatus } from "../shared/api";

const TEXT_FILES = new Bun.Glob("**/*.{md,mdx,markdown,txt,rst,org,adoc}");
const IGNORED_SEGMENTS = new Set(["node_modules", ".git"]);
const MAX_FILE_BYTES = 1_000_000;
const READ_BATCH = 64;

export type Chunk = { heading: string; text: string };
export type ContextHit = Chunk & { path: string; score: number };

type IndexedChunk = Chunk & { id: number; path: string };
type FileEntry = { path: string; mtimeMs: number; size: number };

export function chunkMarkdown(source: string, maxChars = 1500): Chunk[] {
  const sections: Chunk[] = [];
  const trail: string[] = [];
  let lines: string[] = [];
  let inFence = false;

  const flush = () => {
    const text = lines.join("\n").trim();
    if (text) sections.push({ heading: trail.filter(Boolean).join(" > "), text });
    lines = [];
  };

  for (const line of source.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    const heading = inFence ? null : /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading?.[1] && heading[2] !== undefined) {
      flush();
      const depth = heading[1].length;
      trail.length = depth;
      trail[depth - 1] = heading[2].trim();
    }
    lines.push(line);
  }
  flush();

  return sections.flatMap((section) => splitSection(section, maxChars));
}

function splitSection(section: Chunk, maxChars: number): Chunk[] {
  if (section.text.length <= maxChars) return [section];
  const chunks: Chunk[] = [];
  let current = "";
  for (const paragraph of section.text.split(/\n{2,}/)) {
    for (let start = 0; start < paragraph.length; start += maxChars) {
      const piece = paragraph.slice(start, start + maxChars);
      if (current && current.length + piece.length + 2 > maxChars) {
        chunks.push({ heading: section.heading, text: current });
        current = "";
      }
      current = current ? `${current}\n\n${piece}` : piece;
    }
  }
  if (current) chunks.push({ heading: section.heading, text: current });
  return chunks;
}

async function listFiles(dir: string): Promise<FileEntry[]> {
  const entries: FileEntry[] = [];
  for await (const path of TEXT_FILES.scan({ cwd: dir, onlyFiles: true })) {
    if (path.split(sep).some((segment) => IGNORED_SEGMENTS.has(segment))) continue;
    const info = await stat(join(dir, path));
    if (info.size <= MAX_FILE_BYTES) entries.push({ path, mtimeMs: info.mtimeMs, size: info.size });
  }
  return entries.toSorted((a, b) => a.path.localeCompare(b.path));
}

function signatureOf(files: FileEntry[]): string {
  return Bun.hash(files.map((f) => `${f.path}:${f.mtimeMs}:${f.size}`).join("\n")).toString(36);
}

export class ContextIndex {
  private constructor(
    readonly dir: string,
    readonly signature: string,
    private readonly files: ReadonlySet<string>,
    private readonly chunks: readonly IndexedChunk[],
    private readonly engine: MiniSearch<IndexedChunk>,
  ) {}

  static async build(dir: string, files: FileEntry[]): Promise<ContextIndex> {
    const chunks: IndexedChunk[] = [];
    for (let start = 0; start < files.length; start += READ_BATCH) {
      const batch = files.slice(start, start + READ_BATCH);
      // NOTE: bounded batches avoid exhausting file descriptors on large corpora.
      // oxlint-disable-next-line no-await-in-loop
      const contents = await Promise.all(batch.map((f) => Bun.file(join(dir, f.path)).text()));
      batch.forEach((file, i) => {
        for (const { heading, text } of chunkMarkdown(contents[i] ?? "")) {
          chunks.push({ id: chunks.length, path: file.path, heading, text });
        }
      });
    }
    const engine = new MiniSearch<IndexedChunk>({
      fields: ["heading", "text", "path"],
      searchOptions: { boost: { heading: 2, path: 1.5 }, fuzzy: 0.2, prefix: true },
    });
    engine.addAll(chunks);
    return new ContextIndex(
      dir,
      signatureOf(files),
      new Set(files.map((f) => f.path)),
      chunks,
      engine,
    );
  }

  // NOTE: fallow misses the getter use in app.ts.
  // fallow-ignore-next-line unused-class-member
  get status(): ContextStatus {
    return { root: this.dir, files: this.files.size, chunks: this.chunks.length };
  }

  search(query: string, limit = 6): ContextHit[] {
    return this.engine
      .search(query)
      .slice(0, limit)
      .flatMap((hit) => {
        const id: unknown = hit.id;
        const chunk = typeof id === "number" ? this.chunks[id] : undefined;
        return chunk
          ? [{ path: chunk.path, heading: chunk.heading, text: chunk.text, score: hit.score }]
          : [];
      });
  }

  async read(path: string): Promise<string> {
    if (!this.files.has(path)) throw new Error(`${path} is not in the context folder`);
    return Bun.file(join(this.dir, path)).text();
  }
}

/** Opens context folders under one allowed root and caches their indexes until files change. */
export class ContextLibrary {
  private readonly cache = new Map<string, ContextIndex>();

  constructor(readonly root: string) {}

  async open(path: string): Promise<ContextIndex> {
    const dir = await this.resolveInsideRoot(path);
    const files = await listFiles(dir);
    const cached = this.cache.get(dir);
    if (cached?.signature === signatureOf(files)) return cached;
    const index = await ContextIndex.build(dir, files);
    this.cache.set(dir, index);
    return index;
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
