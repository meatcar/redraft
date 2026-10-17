import tailwind from "./tailwind";

import { packageRoots, thirdPartyNotices } from "./licenses";

const outfile = Bun.argv[2] ?? "dist/redraft.html";
// NOTE: PostCSS inlines these stylesheets; they never appear in the metafile.
const CSS_PACKAGES = ["node_modules/tailwindcss", "node_modules/tw-animate-css"];

const result = await Bun.build({
  entrypoints: ["./src/web/index.html"],
  compile: true,
  target: "browser",
  minify: true,
  metafile: true,
  plugins: [tailwind],
});
if (!result.success) throw new AggregateError(result.logs, "build failed");

const html = result.outputs.find((output) => output.type.startsWith("text/html"));
if (!html || result.outputs.length !== 1) throw new Error("expected exactly one HTML output");

const roots = [...packageRoots(Object.keys(result.metafile?.inputs ?? {})), ...CSS_PACKAGES];
const notices = await thirdPartyNotices(roots);
const legal = [
  "Redraft. Copyright 2026 Denys Pavlov. Apache License 2.0.",
  "Source: https://github.com/meatcar/redraft",
  "",
  await Bun.file("NOTICE").text(),
  await Bun.file("LICENSE").text(),
  "This file bundles the following third-party software:",
  "",
  notices.text,
].join("\n");

await Bun.write(outfile, `${await html.text()}\n<!--\n${legal.replaceAll("-->", "- ->")}\n-->\n`);
console.log(
  JSON.stringify({ outfile, packages: roots.length, withoutLicenseFile: notices.missing }),
);
