/**
 * Fails unless a release tag matches the versions declared by the core: package.json and
 * CORE_VERSION (compared with each module's `tycho.core` range at run time).
 * Usage: bun run scripts/check-version.ts <tag>   (e.g. v1.0.0)
 * @license AGPL-3.0-only
 */
import { readFileSync } from "fs";

const tag = process.argv[2] ?? "";
const match = /^v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(tag);
if (!match) {
   console.error(`tag "${tag}" is not vX.Y.Z`);
   process.exit(1);
}
const version = match[1];
const pkg = JSON.parse(readFileSync("package.json", "utf-8")).version;
const core = /CORE_VERSION = "([^"]+)"/.exec(readFileSync("src/core/context.ts", "utf-8"))?.[1];
const problems = [
   pkg !== version ? `package.json says ${pkg}` : null,
   core !== version ? `CORE_VERSION says ${core}` : null,
].filter(Boolean);
if (problems.length > 0) {
   console.error(`tag ${tag} does not match: ${problems.join(", ")}`);
   process.exit(1);
}
console.log(`version ${version} consistent`);
