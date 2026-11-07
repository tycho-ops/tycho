/**
 * Writes `SHA256SUMS` for the release binaries of a directory (`sha256sum` format), with no
 * dependency on the host tools (sha256sum on Linux, shasum on macOS).
 * Usage: bun run scripts/checksums.ts <dir>
 * @license AGPL-3.0-only
 */
import { readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const dir = process.argv[2];
if (!dir) {
   console.error("usage: bun run scripts/checksums.ts <dir>");
   process.exit(2);
}
const files = readdirSync(dir).filter((f) => f.startsWith("tycho-")).sort();
if (files.length === 0) {
   console.error(`no tycho-* binary in ${dir}`);
   process.exit(1);
}
const lines = files.map((f) => `${new Bun.CryptoHasher("sha256").update(readFileSync(join(dir, f))).digest("hex")}  ${f}`);
writeFileSync(join(dir, "SHA256SUMS"), `${lines.join("\n")}\n`);
console.log(lines.join("\n"));
