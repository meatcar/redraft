import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import tailwind from "./tailwind";

test("Bun compiles Tailwind imports, applies, and updated source classes", async () => {
  const root = await mkdtemp(join(tmpdir(), "redraft-tailwind-"));
  try {
    const css = join(root, "index.css");
    const source = join(root, "view.html");
    await Bun.write(
      css,
      `@import "${import.meta.resolve("tailwindcss/index.css")}" source(none);
       @source "./view.html";
       .applied { @apply flex; }`,
    );
    const compile = async (width: number) => {
      await Bun.write(source, `<div class="w-[${width}px]"></div>`);
      const result = await Bun.build({ entrypoints: [css], root, plugins: [tailwind] });
      expect(result.success).toBe(true);
      return result.outputs[0]!.text();
    };
    const first = await compile(137);
    expect(first).toContain("width: 137px");
    expect(first).toContain("display: flex");
    expect(first).not.toContain("@apply");
    expect(first).not.toContain("@import");
    const rebuilt = await compile(293);
    expect(rebuilt).toContain("width: 293px");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
