/**
 * Minimal npm registry client: package metadata and version resolution.
 * @license AGPL-3.0-only
 */

/** Distribution metadata of one published version. */
export interface VersionDist {
   tarball: string;
   integrity?: string;
}

/** Metadata of one published version (abbreviated packument). */
export interface PackumentVersion {
   name: string;
   version: string;
   dist: VersionDist;
}

/** Abbreviated packument returned by npm registries. */
export interface Packument {
   name: string;
   "dist-tags"?: Record<string, string>;
   versions: Record<string, PackumentVersion>;
}

/**
 * Builds the metadata URL of a scoped package (`@scope/name` → `@scope%2fname`).
 * @param registry Registry base URL, ending with a slash.
 * @param packageName Scoped package name.
 * @returns The metadata URL.
 */
export function packumentUrl(registry: string, packageName: string): string {
   return `${registry}${packageName.replace("/", "%2f")}`;
}

/**
 * Fetches the abbreviated packument of a package.
 * @param registry Registry base URL, ending with a slash.
 * @param packageName Scoped package name.
 * @param token Optional bearer token (private registries).
 * @returns The packument.
 * @throws Error when the package does not exist or the registry fails.
 */
export async function fetchPackument(registry: string, packageName: string, token?: string): Promise<Packument> {
   const headers: Record<string, string> = {
      Accept: "application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8",
      "User-Agent": "tycho-core",
   };
   if (token) {
      headers.Authorization = `Bearer ${token}`;
   }
   const response = await fetch(packumentUrl(registry, packageName), { headers });
   if (response.status === 404) {
      throw new Error(`module ${packageName} not found on ${registry}`);
   }
   if (!response.ok) {
      throw new Error(`registry ${registry} answered HTTP ${response.status} for ${packageName}`);
   }
   return (await response.json()) as Packument;
}

/**
 * Picks the highest published version satisfying a range; `latest` or an empty range
 * follows the `latest` dist-tag. Pre-releases are only selected when asked explicitly.
 * @param packument Package metadata.
 * @param range Semver range, exact version or dist-tag.
 * @returns The selected version metadata.
 * @throws Error when no version matches.
 */
export function resolveVersion(packument: Packument, range: string | undefined): PackumentVersion {
   const tags = packument["dist-tags"] || {};
   const wanted = range && range !== "" ? range : "latest";
   const tagged = tags[wanted];
   if (tagged && packument.versions[tagged]) {
      return packument.versions[tagged];
   }
   const candidates = Object.keys(packument.versions)
      .filter((version) => !version.includes("-") || wanted.includes("-"))
      .filter((version) => Bun.semver.satisfies(version, wanted))
      .sort((a, b) => Bun.semver.order(b, a));
   if (candidates.length === 0) {
      throw new Error(`no version of ${packument.name} matches "${wanted}"`);
   }
   return packument.versions[candidates[0]];
}

/**
 * Downloads a tarball.
 * @param url Tarball URL announced by the registry.
 * @param token Optional bearer token (private registries).
 * @returns The tarball bytes.
 * @throws Error when the download fails.
 */
export async function downloadTarball(url: string, token?: string): Promise<Uint8Array<ArrayBuffer>> {
   const headers: Record<string, string> = { "User-Agent": "tycho-core" };
   if (token) {
      headers.Authorization = `Bearer ${token}`;
   }
   const response = await fetch(url, { headers });
   if (!response.ok) {
      throw new Error(`download of ${url} failed: HTTP ${response.status}`);
   }
   return new Uint8Array(await response.arrayBuffer());
}
