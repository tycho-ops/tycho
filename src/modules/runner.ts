/**
 * Loads an installed module and hands it the command line.
 * @license AGPL-3.0-only
 */

import { readFileSync } from "fs";
import { join } from "path";
import type { CoreContext } from "../core/context";
import type { TargetEntry, TargetResolution } from "../core/targets";
import { type ModulePackage, validateContract } from "./manifest";
import { ACCEPTED_TRUST, moduleDir } from "./store";

/** Context given to a module's `run` function. */
export interface ModuleRunContext {
   coreVersion: string;
   mode: CoreContext["mode"];
   command: string;
   env: Record<string, string>;
   /** Target selected for this command (`--target`, TYCHO_TARGET or current), or null. */
   target: TargetEntry | null;
   /** Why there is no target, when `target` is null. */
   targetError: string | null;
}

/** Entry point every module exports. */
export type ModuleRun = (args: string[], ctx: ModuleRunContext) => Promise<number | void> | number | void;

/**
 * Runs an installed module in-process. The contract is re-validated at each load, so a
 * module edited or replaced on disk with an incompatible manifest is refused.
 * @param ctx Core context.
 * @param name Module name.
 * @param command Command typed after `tycho` (main name or alias).
 * @param args Remaining arguments (`--target` already removed).
 * @param selection Target resolved by the core for this command.
 * @returns The exit code returned by the module (0 when it returns nothing).
 * @throws Error when the module is invalid or does not export `run`.
 */
export async function runModule(ctx: CoreContext, name: string, command: string, args: string[], selection: TargetResolution): Promise<number> {
   const dir = moduleDir(ctx, name);
   const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf-8")) as ModulePackage;
   validateContract(pkg, ctx.version, ACCEPTED_TRUST);
   const entry = await import(join(dir, pkg.main as string));
   if (typeof entry.run !== "function") {
      throw new Error(`${pkg.name} does not export a run(args, ctx) function`);
   }
   const env = { ...ctx.env };
   if (selection.target) {
      env.TYCHO_TARGET_ORG = selection.target.org;
      env.TYCHO_TARGET_ID = selection.target.id;
      env.TYCHO_TARGET_NAME = selection.target.name;
      env.TYCHO_TARGET_PATH = selection.target.path;
      env.TYCHO_TARGET_ENGINE = selection.target.engine;
   }
   const result = await (entry.run as ModuleRun)(args, {
      coreVersion: ctx.version,
      mode: ctx.mode,
      command,
      env,
      target: selection.target,
      targetError: selection.error,
   });
   return typeof result === "number" ? result : 0;
}
