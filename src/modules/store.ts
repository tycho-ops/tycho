/**
 * Installed modules: lock file, installation, removal and resolution of commands.
 * @license AGPL-3.0-only
 */

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import type { CoreContext } from "../core/context";
import { MODULE_SCOPE } from "../core/context";
import { assertIntegrity } from "./integrity";
import { type ModuleContract, type ModulePackage, type TrustLevel, validateContract } from "./manifest";
import { downloadTarball, fetchPackument, resolveVersion } from "./registry";
import { extractTgz } from "./tar";

/** Trust levels accepted by core 1.0.0 (signatures, hence `partner` and `dev`, arrive in 1.1). */
export const ACCEPTED_TRUST: TrustLevel[] = ["official"];

/** One entry of the lock file. */
export interface LockEntry {
   package: string;
   version: string;
   integrity: string;
   resolved: string;
   commands: string[];
   installedAt: string;
}

/** Lock file content, keyed by module name. */
export type LockFile = Record<string, LockEntry>;

/**
 * Reads the lock file (empty when absent).
 * @param ctx Core context.
 * @returns The installed modules.
 */
export function readLock(ctx: CoreContext): LockFile {
   if (!existsSync(ctx.lockFile)) {
      return {};
   }
   return JSON.parse(readFileSync(ctx.lockFile, "utf-8")) as LockFile;
}

/**
 * Writes the lock file atomically.
 * @param ctx Core context.
 * @param lock Installed modules.
 */
function writeLock(ctx: CoreContext, lock: LockFile): void {
   mkdirSync(ctx.modulesDir, { recursive: true });
   const temporary = `${ctx.lockFile}.tmp`;
   writeFileSync(temporary, `${JSON.stringify(lock, null, 2)}\n`, "utf-8");
   renameSync(temporary, ctx.lockFile);
}

/**
 * Directory of an installed module.
 * @param ctx Core context.
 * @param name Module name.
 * @returns The module directory.
 */
export function moduleDir(ctx: CoreContext, name: string): string {
   return join(ctx.modulesDir, "node_modules", MODULE_SCOPE, name);
}

/**
 * Splits `name@range` (range optional).
 * @param spec Module specification given on the command line.
 * @returns Module name and range.
 * @throws Error on an invalid module name.
 */
export function parseSpec(spec: string): { name: string; range: string | undefined } {
   const [name, range] = spec.split("@");
   if (!/^[a-z][a-z0-9-]*$/.test(name)) {
      throw new Error(`invalid module name "${name}"`);
   }
   return { name, range: range || undefined };
}

/**
 * Installs (or upgrades) a module from the registry: resolve, download, verify the
 * integrity, extract into a staging directory, validate the contract, then swap.
 * @param ctx Core context.
 * @param spec `name` or `name@range`.
 * @param token Optional registry token.
 * @returns The lock entry written.
 * @throws Error on any failed check; the previously installed version is left untouched.
 */
export async function installModule(ctx: CoreContext, spec: string, token?: string): Promise<LockEntry> {
   const { name, range } = parseSpec(spec);
   const packageName = `${MODULE_SCOPE}/${name}`;
   const packument = await fetchPackument(ctx.registry, packageName, token);
   const selected = resolveVersion(packument, range);
   const tarball = await downloadTarball(selected.dist.tarball, token);
   assertIntegrity(tarball, selected.dist.integrity);

   const target = moduleDir(ctx, name);
   const staging = `${target}.staging-${process.pid}`;
   rmSync(staging, { recursive: true, force: true });
   try {
      extractTgz(tarball, staging);
      const pkg = JSON.parse(readFileSync(join(staging, "package.json"), "utf-8")) as ModulePackage;
      if (pkg.name !== packageName || pkg.version !== selected.version) {
         throw new Error(`tarball content (${pkg.name}@${pkg.version}) does not match ${packageName}@${selected.version}`);
      }
      const contract: ModuleContract = validateContract(pkg, ctx.version, ACCEPTED_TRUST);
      if (contract.module !== name) {
         throw new Error(`${packageName} declares module "${contract.module}"`);
      }
      rmSync(target, { recursive: true, force: true });
      renameSync(staging, target);
      const entry: LockEntry = {
         package: packageName,
         version: selected.version,
         integrity: selected.dist.integrity as string,
         resolved: selected.dist.tarball,
         commands: contract.commands,
         installedAt: new Date().toISOString(),
      };
      const lock = readLock(ctx);
      lock[name] = entry;
      writeLock(ctx, lock);
      return entry;
   } finally {
      rmSync(staging, { recursive: true, force: true });
   }
}

/**
 * Links a module from a local working copy (development): the module directory becomes a
 * symbolic link to it, so a rebuild is picked up without reinstalling. The contract is checked
 * as for a published module; the lock records `link:<path>` instead of an integrity.
 * @param ctx Core context.
 * @param path Local module directory (holding its package.json and built entry point).
 * @returns The lock entry written.
 * @throws Error when the directory is not a valid module of the official scope.
 */
export function linkModule(ctx: CoreContext, path: string): LockEntry {
   const source = resolve(path);
   const pkg = JSON.parse(readFileSync(join(source, "package.json"), "utf-8")) as ModulePackage;
   const contract = validateContract(pkg, ctx.version, ACCEPTED_TRUST);
   if (pkg.name !== `${MODULE_SCOPE}/${contract.module}`) {
      throw new Error(`${pkg.name} does not match module "${contract.module}" of scope ${MODULE_SCOPE}`);
   }
   if (!existsSync(join(source, pkg.main as string))) {
      throw new Error(`${join(source, pkg.main as string)} not found: build the module first`);
   }
   const target = moduleDir(ctx, contract.module);
   mkdirSync(dirname(target), { recursive: true });
   rmSync(target, { recursive: true, force: true });
   symlinkSync(source, target, "dir");
   const entry: LockEntry = {
      package: pkg.name,
      version: pkg.version,
      integrity: "link",
      resolved: `link:${source}`,
      commands: contract.commands,
      installedAt: new Date().toISOString(),
   };
   const lock = readLock(ctx);
   lock[contract.module] = entry;
   writeLock(ctx, lock);
   return entry;
}

/**
 * Removes an installed module.
 * @param ctx Core context.
 * @param name Module name.
 * @returns Whether the module was installed.
 */
export function removeModule(ctx: CoreContext, name: string): boolean {
   const lock = readLock(ctx);
   const known = name in lock;
   rmSync(moduleDir(ctx, name), { recursive: true, force: true });
   if (known) {
      delete lock[name];
      writeLock(ctx, lock);
   }
   return known;
}

/**
 * Finds the installed module handling a command (main name or alias).
 * @param ctx Core context.
 * @param command Command typed after `tycho`.
 * @returns The module name, or null.
 */
export function findModuleForCommand(ctx: CoreContext, command: string): string | null {
   const lock = readLock(ctx);
   for (const [name, entry] of Object.entries(lock)) {
      if (entry.commands.includes(command)) {
         return name;
      }
   }
   return null;
}
