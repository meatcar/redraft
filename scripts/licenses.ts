import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

const LEGAL_FILE = /^(licen[cs]e|copying|notice)/i;
const PACKAGE_ROOT = /^(.*node_modules\/(?:@[^/]+\/)?[^/]+)\//;

/** Package directories that bundle inputs came from, innermost package for nested installs. */
export function packageRoots(inputs: Iterable<string>): string[] {
  const roots = new Set<string>();
  for (const input of inputs) {
    const root = PACKAGE_ROOT.exec(input)?.[1];
    if (root) roots.add(root);
  }
  return [...roots].toSorted();
}

const manifestSchema = z.object({
  name: z.string(),
  version: z.string(),
  license: z.string().optional(),
  repository: z.union([z.string(), z.object({ url: z.string() })]).optional(),
});

/** Name, version, license, and the license and notice files of each package. */
export async function thirdPartyNotices(roots: readonly string[]) {
  const sections = await Promise.all(
    roots.map(async (root) => {
      const manifest = manifestSchema.parse(await Bun.file(join(root, "package.json")).json());
      const legal = (await readdir(root)).filter((name) => LEGAL_FILE.test(name)).toSorted();
      const texts = await Promise.all(legal.map((name) => Bun.file(join(root, name)).text()));
      const heading = `${manifest.name}@${manifest.version} (${manifest.license ?? "no license field"})`;
      const body = texts.length
        ? texts.map((text) => text.trim()).join("\n\n")
        : `No license file in the package; see ${repositoryUrl(manifest.repository)}.`;
      return { name: manifest.name, missing: texts.length === 0, text: `${heading}\n\n${body}` };
    }),
  );
  return {
    text: sections.map((s) => s.text).join(`\n\n${"-".repeat(72)}\n\n`),
    missing: sections.filter((s) => s.missing).map((s) => s.name),
  };
}

function repositoryUrl(repository: z.infer<typeof manifestSchema>["repository"]) {
  return typeof repository === "object" ? repository.url : (repository ?? "the package registry");
}
