import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createContext } from "../core/context";
import { runModule } from "./runner";
import { findModuleForCommand, installModule, readLock, removeModule } from "./store";
import { extractTgz } from "./tar";
import type { TargetResolution } from "../core/targets";

const NO_TARGET: TargetResolution = { target: null, error: "no target selected" };
import { makeTgz, startFakeRegistry } from "./testing";

const forge = (version: string, extra: Record<string, unknown> = {}) => ({
   packageJson: {
      name: "@tycho/forge",
      version,
      main: "index.js",
      tycho: { module: "forge", commands: ["forge"], core: "^1.0.0", trust: "official" },
      ...extra,
   },
   files: [{ name: "package/index.js", content: `export function run(args) { return args.length === 0 ? 0 : Number(args[0]); }` }],
});

const registry = startFakeRegistry({
   "@tycho/forge": { "1.0.0": forge("1.0.0"), "1.2.0": forge("1.2.0"), "2.0.0-beta.1": forge("2.0.0-beta.1") },
   "@tycho/tampered": {
      "1.0.0": { ...forge("1.0.0"), integrity: "sha512-AAAA" },
   },
   "@tycho/oldcore": {
      "1.0.0": forge("1.0.0", { name: "@tycho/oldcore", tycho: { module: "oldcore", commands: ["oldcore"], core: "^2.0.0", trust: "official" } }),
   },
   "@tycho/devmod": {
      "1.0.0": forge("1.0.0", { name: "@tycho/devmod", tycho: { module: "devmod", commands: ["devmod"], core: "^1.0.0", trust: "dev" } }),
   },
   "@tycho/security": {
      "1.0.0": forge("1.0.0", { name: "@tycho/security", tycho: { module: "security", commands: ["security", "sec"], core: "^1.0.0", trust: "official" } }),
   },
});
afterAll(() => registry.stop());

let dir: string;
let ctx: ReturnType<typeof createContext>;
beforeEach(() => {
   dir = mkdtempSync(join(tmpdir(), "tycho-modules-"));
   ctx = createContext({ TYCHO_MODULES_DIR: dir, TYCHO_REGISTRY: registry.url }, false);
});

describe("installModule", () => {
   test("installs the highest stable version and records it in the lock", async () => {
      const entry = await installModule(ctx, "forge");
      expect(entry.version).toBe("1.2.0");
      expect(readLock(ctx).forge.integrity).toStartWith("sha512-");
      expect(existsSync(join(dir, "node_modules/@tycho/forge/index.js"))).toBe(true);
   });

   test("honours a range and a pre-release when asked explicitly", async () => {
      expect((await installModule(ctx, "forge@~1.0.0")).version).toBe("1.0.0");
      expect((await installModule(ctx, "forge@2.0.0-beta.1")).version).toBe("2.0.0-beta.1");
   });

   test("refuses a tarball whose integrity does not match and installs nothing", async () => {
      await expect(installModule(ctx, "tampered")).rejects.toThrow(/integrity/);
      expect(readLock(ctx).tampered).toBeUndefined();
      expect(existsSync(join(dir, "node_modules/@tycho/tampered"))).toBe(false);
   });

   test("refuses a module requiring another core version", async () => {
      await expect(installModule(ctx, "oldcore")).rejects.toThrow(/requires core/);
   });

   test("refuses a trust level not accepted by this core", async () => {
      await expect(installModule(ctx, "devmod")).rejects.toThrow(/trust level/);
   });

   test("refuses an unknown module and an invalid name", async () => {
      await expect(installModule(ctx, "nope")).rejects.toThrow(/not found/);
      await expect(installModule(ctx, "../evil")).rejects.toThrow(/invalid module name/);
   });
});

describe("commands and execution", () => {
   test("resolves aliases and runs the module in-process", async () => {
      await installModule(ctx, "security");
      expect(findModuleForCommand(ctx, "sec")).toBe("security");
      expect(await runModule(ctx, "security", "sec", [], NO_TARGET)).toBe(0);
      expect(await runModule(ctx, "security", "sec", ["3"], NO_TARGET)).toBe(3);
   });

   test("removes a module and its lock entry", async () => {
      await installModule(ctx, "forge");
      expect(removeModule(ctx, "forge")).toBe(true);
      expect(readLock(ctx).forge).toBeUndefined();
      expect(JSON.parse(readFileSync(ctx.lockFile, "utf-8"))).toEqual({});
   });
});

describe("extractTgz", () => {
   const out = () => mkdtempSync(join(tmpdir(), "tycho-tar-"));

   test("refuses path traversal", () => {
      const tgz = makeTgz([{ name: "package/../../escape.txt", content: "x" }]);
      expect(() => extractTgz(tgz, out())).toThrow(/unsafe path/);
   });

   test("refuses symbolic links", () => {
      const tgz = makeTgz([{ name: "package/link", type: "2" }]);
      expect(() => extractTgz(tgz, out())).toThrow(/links are refused/);
   });

   test("keeps the executable bit of scripts", () => {
      const target = out();
      extractTgz(makeTgz([{ name: "package/bin/run.sh", content: "#!/bin/sh\n", mode: 0o755 }]), target);
      extractTgz(makeTgz([{ name: "package/README.md", content: "doc", mode: 0o644 }]), target);
      expect(statSync(join(target, "bin/run.sh")).mode & 0o111).not.toBe(0);
      expect(statSync(join(target, "README.md")).mode & 0o111).toBe(0);
      rmSync(target, { recursive: true, force: true });
   });
});
