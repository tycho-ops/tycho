/**
 * Publishes a release of this repository on its Forgejo instance, with its assets.
 * Environment: FORGEJO_API (e.g. https://git.qtrn.io/api/v1/repos/tycho/tycho), FORGEJO_TOKEN, TAG.
 * Usage: bun run scripts/publish-release.ts <asset>...
 * @license AGPL-3.0-only
 */
import { readFileSync } from "fs";
import { basename } from "path";

const { FORGEJO_API: api, FORGEJO_TOKEN: token, TAG: tag } = process.env;
const assets = process.argv.slice(2);
if (!api || !token || !tag || assets.length === 0) {
   console.error("FORGEJO_API, FORGEJO_TOKEN, TAG and at least one asset are required");
   process.exit(2);
}
const headers = { Authorization: `token ${token}` };
const sums = assets.find((a) => basename(a) === "SHA256SUMS");
const body = [
   `Tycho core ${tag}.`,
   "",
   "Install: `curl -fsSL https://qtrn.io/install.sh | bash`",
   ...(sums ? ["", "SHA-256:", "```", readFileSync(sums, "utf-8").trim(), "```"] : []),
].join("\n");

const created = await fetch(`${api}/releases`, {
   method: "POST",
   headers: { ...headers, "Content-Type": "application/json" },
   body: JSON.stringify({ tag_name: tag, name: tag, body, draft: false, prerelease: tag.includes("-") }),
});
if (!created.ok) {
   console.error(`release ${tag}: HTTP ${created.status} ${await created.text()}`);
   process.exit(1);
}
const { id, html_url: url } = (await created.json()) as { id: number; html_url: string };
for (const path of assets) {
   const form = new FormData();
   form.append("attachment", new Blob([readFileSync(path)]), basename(path));
   const res = await fetch(`${api}/releases/${id}/assets?name=${encodeURIComponent(basename(path))}`, { method: "POST", headers, body: form });
   if (!res.ok) {
      console.error(`${basename(path)}: HTTP ${res.status} ${await res.text()}`);
      process.exit(1);
   }
   console.log(`uploaded ${basename(path)}`);
}
console.log(url);
