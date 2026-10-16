import { describe, expect, test } from "bun:test";

import { ContextIndex, chunkMarkdown } from "./context";
import { directorySource, snapshotSource, type DirectoryEntry, type FileSource } from "./files";

async function rejection(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return "resolved";
}

/** An editable folder; every write gets a newer timestamp, like a real file system. */
function folder(initial: Record<string, string>) {
  const files = new Map<string, File>();
  let clock = 1;
  const write = (path: string, text: string) =>
    files.set(path, new File([text], path, { lastModified: clock++ }));
  for (const [path, text] of Object.entries(initial)) write(path, text);
  const source: FileSource = {
    name: "notes",
    list: async () =>
      [...files].map(([path, file]) => ({
        path,
        lastModified: file.lastModified,
        size: file.size,
        open: async () => files.get(path) ?? Promise.reject(new Error(`${path} is gone`)),
      })),
  };
  return { source, write, remove: (path: string) => files.delete(path) };
}

const corpus = () =>
  folder({
    "brand/voice.md":
      "# Voice\n\nWe write plainly.\n\n## Banned words\n\nNever say synergy or leverage.\n",
    "product/pricing.md": "# Pricing\n\nThe starter plan costs 12 dollars.\n",
    "readme.txt": "General notes about the zeppelin project.\n",
    "image.png": "synergy synergy synergy",
    "node_modules/pkg/doc.md": "synergy synergy synergy",
  });

const textsOf = (source: string, maxChars?: number) =>
  chunkMarkdown(source, maxChars).map((c) => source.slice(c.start, c.end));

describe("chunkMarkdown", () => {
  test("splits on headings and carries the heading trail", () => {
    const source = "# A\n\nalpha\n\n## B\n\nbeta\n\n# C\n\ngamma\n";
    const chunks = chunkMarkdown(source);
    expect(chunks.map((c) => [c.heading, source.slice(c.start, c.end)])).toEqual([
      ["A", "# A\n\nalpha"],
      ["A > B", "## B\n\nbeta"],
      ["C", "# C\n\ngamma"],
    ]);
  });

  test("ignores heading-like lines inside code fences", () => {
    const chunks = chunkMarkdown("# Real\n\n```sh\n# not a heading\n```\n");
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.heading).toBe("Real");
  });

  test("splits oversized sections on paragraph boundaries", () => {
    const paragraph = "word ".repeat(100).trim();
    const source = `# Long\n\n${[paragraph, paragraph, paragraph].join("\n\n\n")}`;
    const chunks = chunkMarkdown(source, 600);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.heading).toBe("Long");
      expect(chunk.end - chunk.start).toBeLessThanOrEqual(600);
    }
    expect(textsOf(source, 600).join("").replaceAll(/\s/g, "")).toBe(source.replaceAll(/\s/g, ""));
  });
});

describe("ContextIndex", () => {
  test("indexes only text files and finds content by relevance", async () => {
    const index = await ContextIndex.open(corpus().source);
    expect(index.status).toEqual({ name: "notes", files: 3, chunks: 4 });

    const hits = await index.search("which words are banned");
    expect(hits[0]?.path).toBe("brand/voice.md");
    expect(hits[0]?.heading).toBe("Voice > Banned words");
    expect(hits[0]?.text).toBe("## Banned words\n\nNever say synergy or leverage.");
  });

  test("matches longer words by prefix and short words exactly", async () => {
    const index = await ContextIndex.open(corpus().source);
    expect((await index.search("zeppel"))[0]?.path).toBe("readme.txt");
    expect(await index.search("sta")).toEqual([]);
  });

  test("reads indexed files only", async () => {
    const index = await ContextIndex.open(corpus().source);
    expect(await index.read("product/pricing.md")).toContain("12 dollars");
    expect(await rejection(index.read("image.png"))).toMatch(/not in the context/);
    expect(await rejection(index.read("node_modules/pkg/doc.md"))).toMatch(/not in the context/);
  });

  test("follows added, edited, and deleted files", async () => {
    const notes = corpus();
    const index = await ContextIndex.open(notes.source);

    notes.write("new.md", "# Fresh\n\nA brand new quokka fact.\n");
    await index.sync();
    expect((await index.search("quokka"))[0]?.text).toContain("quokka fact");

    notes.write("new.md", "# Fresh\n\nNow about a wombat, with a longer body than before.\n");
    await index.sync();
    expect(await index.search("quokka")).toEqual([]);
    expect((await index.search("wombat"))[0]?.text).toContain("about a wombat");

    notes.remove("new.md");
    await index.sync();
    expect(await index.search("wombat")).toEqual([]);
    expect(index.status.files).toBe(3);
  });

  test("drops hits from files edited since the last sync", async () => {
    const notes = corpus();
    notes.write("drift.md", "# Drift\n\nThe narwhal paragraph.\n");
    const index = await ContextIndex.open(notes.source);
    notes.write("drift.md", "# Drift\n\nShifted text, the narwhal moved further along.\n");
    expect(await index.search("narwhal")).toEqual([]);
    await index.sync();
    expect((await index.search("narwhal"))[0]?.text).toContain("moved");
  });
});

type Tree = { [name: string]: string | Tree };

/** Just enough of FileSystemDirectoryHandle for the walk. */
function fakeDir(name: string, tree: Tree): DirectoryEntry {
  const entries = Object.entries(tree).map(([entry, value]) =>
    typeof value === "string"
      ? { kind: "file" as const, name: entry, getFile: async () => new File([value], entry) }
      : fakeDir(entry, value),
  );
  return {
    kind: "directory",
    name,
    values: async function* () {
      yield* entries;
    },
  };
}

const uploaded = (path: string) =>
  Object.defineProperty(new File(["x"], path.split("/").at(-1)!), "webkitRelativePath", {
    value: path,
  });

describe("folder sources", () => {
  test("a picked directory lists nested files relative to it, skipping ignored folders", async () => {
    const root = fakeDir("notes", {
      "a.md": "a",
      sub: { "b.md": "bb", deeper: { "c.txt": "ccc" } },
      node_modules: { "x.md": "x" },
      ".git": { HEAD: "ref" },
    });
    const source = directorySource(root);
    const files = (await source.list()).toSorted((a, b) => a.path.localeCompare(b.path));
    expect(source.name).toBe("notes");
    expect(files.map((f) => [f.path, f.size])).toEqual([
      ["a.md", 1],
      ["sub/b.md", 2],
      ["sub/deeper/c.txt", 3],
    ]);
    expect(await (await files.find((f) => f.path === "sub/b.md")!.open()).text()).toBe("bb");
  });

  test("an uploaded folder strips the folder name from paths", async () => {
    const source = snapshotSource([uploaded("notes/a.md"), uploaded("notes/sub/b.md")]);
    expect(source.name).toBe("notes");
    expect((await source.list()).map((f) => f.path)).toEqual(["a.md", "sub/b.md"]);
  });
});
