/**
 * Test helpers: build npm-like tarballs and serve them from a fake registry.
 * @license AGPL-3.0-only
 */

import { sha512Integrity } from "./integrity";

/** One entry of a test archive. */
export interface TarEntry {
   name: string;
   content?: string;
   mode?: number;
   /** Tar type flag: "0" file (default), "5" directory, "2" symlink. */
   type?: string;
}

/**
 * Writes an octal field into a tar header.
 * @param header Header block.
 * @param offset Field offset.
 * @param length Field length.
 * @param value Numeric value.
 */
function writeOctal(header: Uint8Array, offset: number, length: number, value: number): void {
   const text = value.toString(8).padStart(length - 1, "0");
   header.set(new TextEncoder().encode(text), offset);
}

/**
 * Builds a gzip-compressed ustar archive.
 * @param entries Archive entries.
 * @returns The `.tgz` bytes.
 */
export function makeTgz(entries: TarEntry[]): Uint8Array<ArrayBuffer> {
   const encoder = new TextEncoder();
   const blocks: Uint8Array[] = [];
   for (const entry of entries) {
      const data = encoder.encode(entry.content || "");
      const header = new Uint8Array(512);
      header.set(encoder.encode(entry.name).subarray(0, 100), 0);
      writeOctal(header, 100, 8, entry.mode ?? 0o644);
      writeOctal(header, 108, 8, 0);
      writeOctal(header, 116, 8, 0);
      writeOctal(header, 124, 12, data.length);
      writeOctal(header, 136, 12, 0);
      header.set(encoder.encode("        "), 148);
      header[156] = (entry.type || "0").charCodeAt(0);
      header.set(encoder.encode("ustar\u000000"), 257);
      const checksum = header.reduce((sum, byte) => sum + byte, 0);
      header.set(encoder.encode(`${checksum.toString(8).padStart(6, "0")}\u0000 `), 148);
      blocks.push(header);
      const padded = new Uint8Array(Math.ceil(data.length / 512) * 512);
      padded.set(data);
      blocks.push(padded);
   }
   blocks.push(new Uint8Array(1024));
   const total = blocks.reduce((size, block) => size + block.length, 0);
   const tar = new Uint8Array(total);
   let offset = 0;
   for (const block of blocks) {
      tar.set(block, offset);
      offset += block.length;
   }
   return Bun.gzipSync(tar) as Uint8Array<ArrayBuffer>;
}

/** A version published on the fake registry. */
export interface FakeVersion {
   packageJson: Record<string, unknown>;
   files: TarEntry[];
   /** Overrides the announced integrity (to simulate tampering). */
   integrity?: string;
}

/**
 * Starts a fake npm registry serving scoped packages on `/@scope%2fname`.
 * @param packages Package name → version → content.
 * @returns The server and its base URL (ending with a slash).
 */
export function startFakeRegistry(packages: Record<string, Record<string, FakeVersion>>): {
   url: string;
   stop: () => void;
} {
   const tarballs = new Map<string, Uint8Array<ArrayBuffer>>();
   const server = Bun.serve({
      port: 0,
      fetch(request) {
         const path = decodeURIComponent(new URL(request.url).pathname.slice(1));
         const tarball = tarballs.get(path);
         if (tarball) {
            return new Response(tarball);
         }
         const versions = packages[path];
         if (!versions) {
            return new Response("{}", { status: 404 });
         }
         const body: Record<string, unknown> = { name: path, "dist-tags": {}, versions: {} };
         const sorted = Object.keys(versions).sort((a, b) => Bun.semver.order(a, b));
         (body["dist-tags"] as Record<string, string>).latest = sorted.filter((v) => !v.includes("-")).pop() || "";
         for (const version of sorted) {
            const spec = versions[version];
            const archive = makeTgz([
               { name: "package/package.json", content: JSON.stringify(spec.packageJson) },
               ...spec.files,
            ]);
            const key = `${path}/-/${version}.tgz`;
            tarballs.set(key, archive);
            (body.versions as Record<string, unknown>)[version] = {
               name: path,
               version,
               dist: {
                  tarball: `http://localhost:${server.port}/${encodeURIComponent(key)}`,
                  integrity: spec.integrity ?? sha512Integrity(archive),
               },
            };
         }
         return Response.json(body);
      },
   });
   return { url: `http://localhost:${server.port}/`, stop: () => server.stop(true) };
}
