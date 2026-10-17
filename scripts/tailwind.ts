import type { BunPlugin } from "bun";
import tailwindcss from "@tailwindcss/postcss";
import postcss from "postcss";

export default {
  name: "tailwindcss",
  setup(build) {
    const processor = postcss([
      tailwindcss({ base: build.config.root ?? process.cwd(), optimize: false }),
    ]);
    build.onLoad({ filter: /\.css$/ }, async ({ path }) => {
      const result = await processor.process(await Bun.file(path).text(), { from: path });
      return { contents: result.css, loader: "css" };
    });
  },
} satisfies BunPlugin;
