/**
 * Execution context of the Tycho core: version, mode (user / system) and directories.
 * @license AGPL-3.0-only
 */

import { homedir } from "os";
import { join } from "path";

/** Version of the Tycho core, compared with the `core` range declared by each module. */
export const CORE_VERSION = "1.0.0";

/** Default npm registry serving the official `@tycho/*` modules (scope routed on the bare domain). */
export const DEFAULT_REGISTRY = "https://qtrn.io/";

/** Scope of the official modules. */
export const MODULE_SCOPE = "@tycho";

/** Execution mode: `system` when run as root, `user` otherwise. */
export type ExecutionMode = "user" | "system";

/** Paths and settings shared by every core command and handed to modules. */
export interface CoreContext {
   /** Core version. */
   version: string;
   /** Execution mode. */
   mode: ExecutionMode;
   /** Directory holding installed modules (`<dir>/node_modules/@tycho/<module>`). */
   modulesDir: string;
   /** Lock file recording installed modules, versions and integrity. */
   lockFile: string;
   /** Base URL of the npm registry, always ending with a slash. */
   registry: string;
   /** Environment passed to modules. */
   env: Record<string, string>;
}

/**
 * Builds the execution context from the process environment.
 * `TYCHO_MODULES_DIR` and `TYCHO_REGISTRY` override the defaults (tests, air-gapped mirrors).
 * @param env Process environment.
 * @param isRoot Whether the process runs as root.
 * @returns The core context.
 */
export function createContext(env: NodeJS.ProcessEnv, isRoot: boolean): CoreContext {
   const mode: ExecutionMode = isRoot ? "system" : "user";
   const defaultDir = isRoot
      ? "/usr/local/share/tycho/modules"
      : join(env.XDG_DATA_HOME || join(homedir(), ".local", "share"), "tycho", "modules");
   const modulesDir = env.TYCHO_MODULES_DIR || defaultDir;
   const registryRaw = env.TYCHO_REGISTRY || DEFAULT_REGISTRY;
   const registry = registryRaw.endsWith("/") ? registryRaw : `${registryRaw}/`;
   return {
      version: CORE_VERSION,
      mode,
      modulesDir,
      lockFile: join(modulesDir, "modules.lock"),
      registry,
      env: {
         ...(env as Record<string, string>),
         TYCHO_VERSION: CORE_VERSION,
         TYCHO_MODE: mode,
         TYCHO_MODULES_DIR: modulesDir,
      },
   };
}
