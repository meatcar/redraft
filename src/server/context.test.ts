import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ContextLibrary, chunkMarkdown } from "./context";

let root: string;
let corpus: string;

async function rejection(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return "resolved";
}

async function write(path: string, content: string) {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, content);
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "redraft-ctx-"));
  corpus = join(root, "notes");
  await write(
    join(corpus, "brand/voice.md"),
    "# Voice\n\nWe write plainly.\n\n## Banned words\n\nNever say synergy or leverage.\n",
  );
  await write(
    join(corpus, "product/pricing.md"),
    "# Pricing\n\nThe starter plan costs 12 dollars.\n",
  );
  await write(join(corpus, "readme.txt"), "General notes about the zeppelin project.\n");
  await write(join(corpus, "image.png"), "synergy synergy synergy");
  await write(join(corpus, "node_modules/pkg/doc.md"), "synergy synergy synergy");
  await write(join(root, "secret.md"), "outside the corpus");
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
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

describe("ContextLibrary", () => {
  test("indexes only text files and finds content by relevance", async () => {
    const index = await new ContextLibrary(root).open(corpus);
    expect(index.status.files).toBe(3);

    const hits = await index.search("which words are banned");
    expect(hits[0]?.path).toBe("brand/voice.md");
    expect(hits[0]?.heading).toBe("Voice > Banned words");
    expect(hits[0]?.text).toContain("synergy");
  });

  test("accepts paths relative to the root", async () => {
    const index = await new ContextLibrary(root).open("notes");
    expect((await index.search("starter plan"))[0]?.path).toBe("product/pricing.md");
  });

  test("rejects paths that escape the root", async () => {
    const library = new ContextLibrary(corpus);
    expect(await rejection(library.open("../"))).toMatch(/outside/);
    expect(await rejection(library.open(tmpdir()))).toMatch(/outside/);
  });

  test("rejects symlinks that escape the root", async () => {
    const link = join(corpus, "escape");
    await symlink(root, link);
    try {
      expect(await rejection(new ContextLibrary(corpus).open(link))).toMatch(/outside/);
    } finally {
      await rm(link);
    }
  });

  test("reads indexed files only", async () => {
    const index = await new ContextLibrary(root).open(corpus);
    expect(await index.read("product/pricing.md")).toContain("12 dollars");
    expect(await rejection(index.read("../secret.md"))).toMatch(/not in the context/);
    expect(await rejection(index.read("image.png"))).toMatch(/not in the context/);
  });

  test("follows added, edited, and deleted files", async () => {
    const library = new ContextLibrary(root);
    const file = join(corpus, "new.md");
    await library.open(corpus);

    await write(file, "# Fresh\n\nA brand new quokka fact.\n");
    expect((await (await library.open(corpus)).search("quokka"))[0]?.text).toContain("quokka fact");

    await write(file, "# Fresh\n\nNow about a wombat, with a longer body than before.\n");
    const edited = await library.open(corpus);
    expect(await edited.search("quokka")).toEqual([]);
    expect((await edited.search("wombat"))[0]?.text).toContain("about a wombat");

    await rm(file);
    const removed = await library.open(corpus);
    expect(await removed.search("wombat")).toEqual([]);
    expect(removed.status.files).toBe(3);
  });

  test("drops hits from files edited since the last sync", async () => {
    const library = new ContextLibrary(root);
    const file = join(corpus, "drift.md");
    await write(file, "# Drift\n\nThe narwhal paragraph.\n");
    try {
      const index = await library.open(corpus);
      await write(file, "# Drift\n\nShifted text, the narwhal moved further along.\n");
      expect(await index.search("narwhal")).toEqual([]);
      expect((await (await library.open(corpus)).search("narwhal"))[0]?.text).toContain("moved");
    } finally {
      await rm(file);
    }
  });

  test("persists the index without copying document text", async () => {
    const indexPath = join(root, "index.sqlite");
    await new ContextLibrary(root, { indexPath }).open(corpus);
    const reopened = await new ContextLibrary(root, { indexPath }).open(corpus);
    expect((await reopened.search("starter plan"))[0]?.text).toContain("12 dollars");

    const bytes = await readFile(indexPath);
    expect(bytes.includes("starter plan costs")).toBe(false);
    expect(bytes.includes("Never say synergy")).toBe(false);
  });
});
