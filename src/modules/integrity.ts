/**
 * Subresource-integrity checks of downloaded tarballs (npm `dist.integrity`).
 * @license AGPL-3.0-only
 */

import { createHash } from "crypto";

/**
 * Computes the SRI string (`sha512-<base64>`) of a buffer.
 * @param data Bytes to hash.
 * @returns The integrity string.
 */
export function sha512Integrity(data: Uint8Array): string {
   return `sha512-${createHash("sha512").update(data).digest("base64")}`;
}

/**
 * Verifies a buffer against an npm integrity string. Only sha512 is accepted: weaker
 * algorithms (sha1) are refused.
 * @param data Downloaded bytes.
 * @param expected Integrity announced by the registry.
 * @throws Error when the integrity is missing, uses another algorithm or does not match.
 */
export function assertIntegrity(data: Uint8Array, expected: string | undefined): void {
   if (!expected) {
      throw new Error("the registry did not announce an integrity for this tarball");
   }
   const candidates = expected.split(/\s+/).filter((entry) => entry.startsWith("sha512-"));
   if (candidates.length === 0) {
      throw new Error(`unsupported integrity algorithm (sha512 required): ${expected}`);
   }
   const actual = sha512Integrity(data);
   if (!candidates.includes(actual)) {
      throw new Error("integrity mismatch: the tarball differs from the one announced by the registry");
   }
}
