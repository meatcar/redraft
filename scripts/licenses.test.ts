import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { packageRoots, thirdPartyNotices } from "./licenses";

describe("packageRoots", () => {
  test("keeps scoped names and the innermost package of nested installs", () => {
    expect(
      packageRoots([
        "node_modules/@radix-ui/react-select/dist/index.mjs",
        "node_modules/@radix-ui/react-select/dist/other.mjs",
        "node_modules/a/node_modules/b/lib/x.js",
        "src/web/App.tsx",
      ]),
    ).toEqual(["node_modules/@radix-ui/react-select", "node_modules/a/node_modules/b"]);
  });
});

describe("thirdPartyNotices", () => {
  test("includes each package's license text and flags packages without one", async () => {
    const bare = await mkdtemp(join(tmpdir(), "pkg-"));
    await writeFile(
      join(bare, "package.json"),
      JSON.stringify({ name: "bare", version: "1.0.0", license: "MIT", repository: "x/bare" }),
    );

    const { text, missing } = await thirdPartyNotices(["node_modules/react", bare]);
    expect(text).toContain("react@");
    expect(text).toContain("Copyright (c) Meta Platforms, Inc. and affiliates.");
    expect(text).toContain("bare@1.0.0 (MIT)\n\nNo license file in the package; see x/bare.");
    expect(missing).toEqual(["bare"]);
  });
});
