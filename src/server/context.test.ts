import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
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

describe("chunkMarkdown", () => {
  test("splits on headings and carries the heading trail", () => {
    const chunks = chunkMarkdown("# A\n\nalpha\n\n## B\n\nbeta\n\n# C\n\ngamma\n");
    expect(chunks.map((c) => [c.heading, c.text.trim()])).toEqual([
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
    const chunks = chunkMarkdown(
      `# Long\n\n${[paragraph, paragraph, paragraph].join("\n\n")}`,
      600,
    );
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.heading).toBe("Long");
      expect(chunk.text.length).toBeLessThanOrEqual(600);
    }
  });
});

describe("ContextLibrary", () => {
  test("indexes only text files and finds content by relevance", async () => {
    const index = await new ContextLibrary(root).open(corpus);
    expect(index.status.files).toBe(3);

    const hits = index.search("which words are banned");
    expect(hits[0]?.path).toBe("brand/voice.md");
    expect(hits[0]?.heading).toBe("Voice > Banned words");
    expect(hits[0]?.text).toContain("synergy");
  });

  test("accepts paths relative to the root", async () => {
    const index = await new ContextLibrary(root).open("notes");
    expect(index.search("starter plan")[0]?.path).toBe("product/pricing.md");
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

  test("reindexes when the corpus changes", async () => {
    const library = new ContextLibrary(root);
    const before = await library.open(corpus);
    expect(await library.open(corpus)).toBe(before);

    await write(join(corpus, "new.md"), "# Fresh\n\nA brand new quokka fact.\n");
    try {
      const after = await library.open(corpus);
      expect(after).not.toBe(before);
      expect(after.search("quokka")[0]?.path).toBe("new.md");
    } finally {
      await rm(join(corpus, "new.md"));
    }
  });
});
