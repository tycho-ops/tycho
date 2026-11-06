/**
 * Minimal, dependency-free extractor for npm tarballs (gzip + ustar).
 * Only regular files and directories are extracted; links and special files are refused.
 * @license AGPL-3.0-only
 */

import { chmodSync, mkdirSync, writeFileSync } from "fs";
import { dirname, isAbsolute, join, normalize, sep } from "path";

const BLOCK = 512;

/**
 * Reads a NUL-terminated ASCII field of a tar header.
 * @param header Header block.
 * @param offset Field offset.
 * @param length Field length.
 * @returns The field value.
 */
function field(header: Uint8Array, offset: number, length: number): string {
   const raw = header.subarray(offset, offset + length);
   const end = raw.indexOf(0);
   return new TextDecoder().decode(end === -1 ? raw : raw.subarray(0, end));
}

/**
 * Reads an octal numeric field of a tar header.
 * @param header Header block.
 * @param offset Field offset.
 * @param length Field length.
 * @returns The numeric value.
 */
function octal(header: Uint8Array, offset: number, length: number): number {
   const text = field(header, offset, length).trim();
   return text === "" ? 0 : parseInt(text, 8);
}

/**
 * Resolves an archive entry path inside the destination, refusing any escape.
 * npm tarballs put every file under `package/`, which is stripped.
 * @param destination Extraction directory.
 * @param entryName Path stored in the archive.
 * @returns The absolute output path, or null for the root entry itself.
 * @throws Error when the entry would be written outside the destination.
 */
function safePath(destination: string, entryName: string): string | null {
   const stripped = entryName.replace(/^package\/?/, "");
   if (stripped === "") {
      return null;
   }
   if (isAbsolute(stripped) || normalize(stripped).split(sep).includes("..")) {
      throw new Error(`unsafe path in archive: ${entryName}`);
   }
   return join(destination, normalize(stripped));
}

/**
 * Extracts a gzip-compressed npm tarball into a directory.
 * @param gzipped Tarball bytes (`.tgz`).
 * @param destination Directory receiving the package content (created if needed).
 * @returns The list of extracted file paths, relative to the destination.
 * @throws Error on malformed archives, unsafe paths or unsupported entry types.
 */
export function extractTgz(gzipped: Uint8Array<ArrayBuffer>, destination: string): string[] {
   const tar = Bun.gunzipSync(gzipped);
   const files: string[] = [];
   let offset = 0;
   mkdirSync(destination, { recursive: true });
   while (offset + BLOCK <= tar.length) {
      const header = tar.subarray(offset, offset + BLOCK);
      if (header.every((byte) => byte === 0)) {
         break;
      }
      const prefix = field(header, 345, 155);
      const baseName = field(header, 0, 100);
      const name = prefix ? `${prefix}/${baseName}` : baseName;
      const size = octal(header, 124, 12);
      const mode = octal(header, 100, 8);
      const type = String.fromCharCode(header[156] || 48);
      const dataStart = offset + BLOCK;
      offset = dataStart + Math.ceil(size / BLOCK) * BLOCK;

      if (type === "x" || type === "g") {
         continue;
      }
      const target = safePath(destination, name);
      if (target === null) {
         continue;
      }
      if (type === "5") {
         mkdirSync(target, { recursive: true });
         continue;
      }
      if (type !== "0" && type !== "\0") {
         throw new Error(`unsupported entry type '${type}' for ${name} (links are refused)`);
      }
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, tar.subarray(dataStart, dataStart + size));
      chmodSync(target, mode & 0o111 ? 0o755 : 0o644);
      files.push(target.slice(destination.length + 1));
   }
   return files;
}
