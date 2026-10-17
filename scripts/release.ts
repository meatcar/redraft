import { $ } from "bun";

const version = Bun.argv[2] ?? (await $`git cliff --bumped-version`.text()).trim();
if (!/^v\d+\.\d+\.\d+(-[\w.]+)?$/.test(version))
  throw new Error(`Not a vX.Y.Z version: ${version}`);
if ((await $`git status --porcelain`.text()).trim())
  throw new Error("Commit or stash changes first.");

await $`git cliff --tag ${version} --output CHANGELOG.md`;
await $`git add CHANGELOG.md`;
await $`git commit --quiet --message ${`chore(release): ${version}`}`;
await $`git tag --annotate ${version} --message ${version}`;
console.log(`Tagged ${version}. Publish with: git push origin main ${version}`);
