import { mkdir } from "node:fs/promises";
import { basename, resolve } from "node:path";

import { chunkMarkdown } from "../src/core/context";
import queries from "./search-queries.json";

const work = resolve("dist/search-bench");
const corpus = resolve(Bun.argv[2] ?? ".cache/search-bench/github-docs/content");
await mkdir(work, { recursive: true });
const paths = [...new Bun.Glob("**/*.md").scanSync(corpus)].toSorted();
const docs = [];
let bytes = 0;
const started = performance.now();
for (const path of paths) {
  // oxlint-disable-next-line no-await-in-loop
  const source = await Bun.file(`${corpus}/${path}`).text();
  bytes += Buffer.byteLength(source);
  for (const chunk of chunkMarkdown(source)) {
    docs.push({
      id: docs.length + 1,
      path,
      heading: chunk.heading,
      body: source.slice(chunk.start, chunk.end),
    });
  }
}
await Bun.write(
  `${work}/corpus.json`,
  JSON.stringify({
    files: paths.length,
    bytes,
    chunkMs: performance.now() - started,
    docs,
    queries,
  }),
);
const engines = ["fts5", "minisearch", "flexsearch", "orama", "bm25"];
const sizes = [];
for (const engine of engines) {
  const entry = `import { makeEngine } from "${resolve(`scripts/search/${engine}.ts`)}"; window.makeEngine = makeEngine;`;
  // oxlint-disable-next-line no-await-in-loop
  await Bun.write(`${work}/entry.ts`, entry);
  // oxlint-disable-next-line no-await-in-loop
  await Bun.write(`${work}/entry.html`, '<script type="module" src="./entry.ts"></script>');
  const options = {
    entrypoints: [`${work}/entry.ts`],
    target: "browser",
    minify: true,
  } satisfies Bun.BuildConfig;
  // oxlint-disable-next-line no-await-in-loop
  const build = await Bun.build(options);
  if (!build.success) throw new AggregateError(build.logs);
  const js = build.outputs.find((out) => out.type.includes("javascript"))!;
  // oxlint-disable-next-line no-await-in-loop
  await Bun.write(`${work}/${engine}.js`, js);
  for (const output of build.outputs.filter((out) => out !== js)) {
    // oxlint-disable-next-line no-await-in-loop
    await Bun.write(`${work}/${output.path.split("/").at(-1)}`, output);
  }
  // oxlint-disable-next-line no-await-in-loop
  const code = new Uint8Array(await js.arrayBuffer());
  // oxlint-disable-next-line no-await-in-loop
  const single = await Bun.build({
    ...options,
    entrypoints: [`${work}/entry.html`],
    compile: true,
  });
  if (!single.success || single.outputs.length !== 1)
    throw new AggregateError(single.logs, "expected single-file engine build");
  // oxlint-disable-next-line no-await-in-loop
  const html = new Uint8Array(await single.outputs[0]!.arrayBuffer());
  // oxlint-disable-next-line no-await-in-loop
  await Bun.write(`${work}/${engine}.html`, html);
  sizes.push({
    engine,
    js: code.length,
    gzip: Bun.gzipSync(code).length,
    html: html.length,
    htmlGzip: Bun.gzipSync(html).length,
    assets: build.outputs
      .filter((out) => out !== js)
      .map((out) => ({ path: out.path, bytes: out.size })),
  });
}
await Bun.write(`${work}/sizes.json`, JSON.stringify(sizes, null, 2));
console.log(JSON.stringify(sizes));
console.log(
  JSON.stringify({
    files: paths.length,
    chunks: docs.length,
    bytes,
    url: "http://localhost:3001/?engine=fts5",
  }),
);

Bun.serve({
  port: 3001,
  fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/") {
      const engine = String(url.searchParams.get("engine"));
      if (!engines.includes(engine)) return new Response("Unknown engine", { status: 400 });
      return new Response(
        `<script type="module">import '/${engine}.js'; import '/runner.js';</script>`,
        { headers: { "Content-Type": "text/html" } },
      );
    }
    const path =
      url.pathname === "/runner.js"
        ? resolve("scripts/search-runner.js")
        : `${work}/${basename(url.pathname)}`;
    const file = Bun.file(path);
    return new Response(file);
  },
});
