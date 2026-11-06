/**
 * Module contract (`"tycho"` block of a module's package.json), RFC-001 §4quinquies.
 * @license AGPL-3.0-only
 */

/** Trust levels of RFC-001 §4ter. */
export type TrustLevel = "official" | "partner" | "dev";

/** Contract declared by a module in its package.json. */
export interface ModuleContract {
   /** Module name, also its main command (`tycho <module>`). */
   module: string;
   /** Commands handled by the module (main command first, then aliases). */
   commands: string[];
   /** Semver range of supported core versions. */
   core: string;
   /** Trust level. */
   trust: TrustLevel;
}

/** Subset of a module package.json read by the core. */
export interface ModulePackage {
   name: string;
   version: string;
   main?: string;
   tycho?: Partial<ModuleContract>;
}

/**
 * Validates the contract of a module package, fail-fast.
 * @param pkg Module package.json.
 * @param coreVersion Version of the running core.
 * @param allowedTrust Trust levels accepted by this core release.
 * @returns The validated contract.
 * @throws Error when the contract is missing, incomplete, incompatible or not trusted.
 */
export function validateContract(
   pkg: ModulePackage,
   coreVersion: string,
   allowedTrust: TrustLevel[],
): ModuleContract {
   const contract = pkg.tycho;
   if (!contract) {
      throw new Error(`${pkg.name} is not a Tycho module (no "tycho" block in package.json)`);
   }
   const { module, commands, core, trust } = contract;
   if (!module || !/^[a-z][a-z0-9-]*$/.test(module)) {
      throw new Error(`${pkg.name}: invalid or missing "tycho.module"`);
   }
   if (!Array.isArray(commands) || commands.length === 0 || commands[0] !== module) {
      throw new Error(`${pkg.name}: "tycho.commands" must list the module name first`);
   }
   if (!core) {
      throw new Error(`${pkg.name}: missing "tycho.core" range`);
   }
   if (!Bun.semver.satisfies(coreVersion, core)) {
      throw new Error(`${pkg.name}@${pkg.version} requires core ${core}, running ${coreVersion}`);
   }
   if (!trust || !allowedTrust.includes(trust)) {
      throw new Error(`${pkg.name}: trust level "${trust}" is not accepted (allowed: ${allowedTrust.join(", ")})`);
   }
   if (!pkg.main) {
      throw new Error(`${pkg.name}: missing "main" entry point`);
   }
   return { module, commands, core, trust };
}
