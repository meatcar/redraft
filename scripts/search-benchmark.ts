import { mkdir } from "node:fs/promises";
import { basename, resolve } from "node:path";

import { chunkMarkdown } from "../src/core/context";

const work = resolve(Bun.argv[4] ?? "dist/search-bench");
const corpus = resolve(Bun.argv[2] ?? ".cache/search-bench/github-docs/content");
const queries: { query: string; relevant: string; kind?: string }[] = await Bun.file(
  Bun.argv[3] ?? "scripts/search-queries.json",
).json();
await mkdir(work, { recursive: true });
const paths = [...new Bun.Glob("**/*.md").scanSync(corpus)].toSorted();
const docs = [];
const titles = [];
const digest = new Bun.CryptoHasher("sha256");
let bytes = 0;
const started = performance.now();
for (const path of paths) {
  // oxlint-disable-next-line no-await-in-loop
  const source = await Bun.file(`${corpus}/${path}`).text();
  bytes += Buffer.byteLength(source);
  digest.update(path).update("\0").update(source).update("\0");
  const title = /^title:\s*["']?(.+?)["']?\s*$/m.exec(source)?.[1];
  if (title && title.split(/\s+/).length >= 3 && title.length < 120) titles.push({ path, title });
  for (const chunk of chunkMarkdown(source)) {
    docs.push({
      id: docs.length + 1,
      path,
      heading: chunk.heading,
      body: source.slice(chunk.start, chunk.end),
    });
  }
}
for (const { relevant } of queries.filter((query) => query.relevant !== "^$")) {
  if (!paths.some((path) => new RegExp(relevant).test(path)))
    throw new Error(`Relevance label matches no source file: ${relevant}`);
}
const titleQueries = titles
  .map((entry) => ({
    path: entry.path,
    title: entry.title,
    hash: new Bun.CryptoHasher("sha256").update(entry.path).digest("hex"),
  }))
  .toSorted((a, b) => a.hash.localeCompare(b.hash))
  .slice(0, 100)
  .map(({ path, title }) => ({
    query: title,
    relevant: `^${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
    kind: "title",
  }));
queries.forEach((query) => {
  query.kind = query.relevant === "^$" ? "negative" : "task";
});
queries.push(...titleQueries);
const manifest = {
  files: paths.length,
  bytes,
  chunks: docs.length,
  corpusSha256: digest.digest("hex"),
  queriesSha256: new Bun.CryptoHasher("sha256").update(JSON.stringify(queries)).digest("hex"),
  queries,
};
await Bun.write(`${work}/manifest.json`, JSON.stringify(manifest, null, 2));
await Bun.write(
  `${work}/corpus.json`,
  JSON.stringify({
    ...manifest,
    chunkMs: performance.now() - started,
    docs,
    queries,
  }),
);
const engines = [
  "fts5",
  "minisearch",
  "flexsearch",
  "orama",
  "bm25",
  "elasticlunr",
  "lunr",
  "fuse",
  "sqljs",
];
const browserOnly: Bun.BunPlugin = {
  name: "browser-only-sqljs",
  setup(build) {
    build.onResolve({ filter: /^(node:)?(crypto|path|fs)$/ }, ({ path }) => ({
      path,
      namespace: "unused-node",
    }));
    build.onLoad({ filter: /.*/, namespace: "unused-node" }, () => ({
      contents: 'throw new Error("Node builtin used in browser")',
      loader: "js",
    }));
  },
};
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
    plugins: engine === "sqljs" ? [browserOnly] : [],
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
  let stockHtml;
  if (engine === "sqljs") {
    // oxlint-disable-next-line no-await-in-loop
    const stock = await Bun.build({
      ...options,
      plugins: [],
      entrypoints: [`${work}/entry.html`],
      compile: true,
    });
    if (!stock.success || stock.outputs.length !== 1) throw new AggregateError(stock.logs);
    // oxlint-disable-next-line no-await-in-loop
    const stockBytes = new Uint8Array(await stock.outputs[0]!.arrayBuffer());
    stockHtml = {
      html: stockBytes.length,
      htmlGzip: Bun.gzipSync(stockBytes, { level: 9 }).length,
    };
  }
  sizes.push({
    engine,
    js: code.length,
    gzip: Bun.gzipSync(code, { level: 9 }).length,
    html: html.length,
    htmlGzip: Bun.gzipSync(html, { level: 9 }).length,
    stockHtml,
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

const routes = new Map([
  ["/runner.js", resolve("scripts/search-runner.js")],
  ["/contract.json", resolve("scripts/search-contract.json")],
]);
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
    const path = routes.get(url.pathname) ?? `${work}/${basename(url.pathname)}`;
    const file = Bun.file(path);
    return new Response(file);
  },
});
