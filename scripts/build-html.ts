import tailwind from "bun-plugin-tailwind";

import { packageRoots, thirdPartyNotices } from "./licenses";

const outfile = Bun.argv[2] ?? "dist/redraft.html";
// NOTE: the tailwind plugin inlines these stylesheets; they never appear in the metafile.
const CSS_PACKAGES = ["node_modules/tailwindcss", "node_modules/tw-animate-css"];

const result = await Bun.build({
  entrypoints: ["./src/web/index.html"],
  compile: true,
  target: "browser",
  define: { "process.env.NODE_ENV": '"production"' },
  minify: true,
  metafile: true,
  plugins: [tailwind],
});
if (!result.success) throw new AggregateError(result.logs, "build failed");

const html = result.outputs.find((output) => output.type.startsWith("text/html"));
if (!html || result.outputs.length !== 1) throw new Error("expected exactly one HTML output");

const content = await html.text();
const scripts = [...content.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
if (scripts.length !== 1 || /\bsrc\s*=/i.test(scripts[0]?.[1] ?? ""))
  throw new Error("expected exactly one inline script");
const hash = new Bun.CryptoHasher("sha256").update(scripts[0]![2]!).digest("base64");
const policy = [
  "default-src 'none'",
  `script-src 'sha256-${hash}' 'wasm-unsafe-eval'`,
  "script-src-attr 'none'",
  "style-src 'unsafe-inline'",
  "img-src data:",
  "connect-src https: http: data:",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");
if (!content.includes("<head>")) throw new Error("expected an HTML head");
const secured = content.replace(
  "<head>",
  `<head><meta http-equiv="Content-Security-Policy" content="${policy}">`,
);

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

await Bun.write(outfile, `${secured}\n<!--\n${legal.replaceAll("-->", "- ->")}\n-->\n`);
console.log(
  JSON.stringify({ outfile, packages: roots.length, withoutLicenseFile: notices.missing }),
);
