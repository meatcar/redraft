import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

test("the standalone release allows only its hashed script, not remote or injected code", async () => {
  await mkdir(join(import.meta.dir, "../.cache"), { recursive: true });
  const dir = await mkdtemp(join(import.meta.dir, "../.cache/html-test-"));
  const ambient = await mkdtemp(join(import.meta.dir, "../build-input-test-"));
  try {
    const outfile = join(dir, "redraft.html");
    const build = Bun.spawn([process.execPath, "scripts/build-html.ts", outfile], {
      env: { ...process.env, NODE_ENV: "development" },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, status] = await Promise.all([
      new Response(build.stdout).text(),
      new Response(build.stderr).text(),
      build.exited,
    ]);
    expect({ status, stderr, stdout }).toMatchObject({ status: 0 });
    const html = await Bun.file(outfile).text();
    const scripts: { src: string | null; text: string }[] = [];
    let policy = "";
    await new HTMLRewriter()
      .on('meta[http-equiv="Content-Security-Policy"]', {
        element(element) {
          policy = element.getAttribute("content") ?? "";
        },
      })
      .on("script", {
        element(element) {
          scripts.push({ src: element.getAttribute("src"), text: "" });
        },
        text(chunk) {
          scripts.at(-1)!.text += chunk.text;
        },
      })
      .transform(new Response(html))
      .text();
    expect(scripts).toHaveLength(1);
    expect(scripts[0]!.src).toBeNull();
    const hash = createHash("sha256").update(scripts[0]!.text).digest("base64");
    expect(policy.split("; ")).toContain(`script-src 'sha256-${hash}' 'wasm-unsafe-eval'`);
    expect(policy).toContain("default-src 'none'");
    expect(policy).toContain("base-uri 'none'");
    expect(policy).toContain("form-action 'none'");
    expect(html.indexOf('http-equiv="Content-Security-Policy"')).toBeLessThan(
      html.indexOf("<script"),
    );
    expect(html).toContain("data:application/wasm;base64,");
    expect(html).not.toMatch(/<(?:link|script)\b[^>]*(?:src|href)=["'](?:https?:|\/\/)/i);

    await writeFile(join(ambient, "unrelated.html"), '<div class="bg-[#123456]">unrelated</div>');
    const other = join(dir, "other.html");
    const rebuild = Bun.spawn([process.execPath, "scripts/build-html.ts", other], {
      env: { ...process.env, NODE_ENV: "production" },
      stdout: "ignore",
      stderr: "inherit",
    });
    expect(await rebuild.exited).toBe(0);
    const rebuilt = await Bun.file(other).bytes();
    expect(Buffer.compare(Buffer.from(html), rebuilt)).toBe(0);
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(ambient, { recursive: true, force: true });
  }
}, 30_000);
