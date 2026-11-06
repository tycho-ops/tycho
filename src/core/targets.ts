/**
 * Targets (contexts): one `tycho` manages several targets, each one a target repository holding a
 * `target.yaml` (RFC-001 §3). The list is shared by every module: select a target once, then
 * `tycho orchestration`, `tycho containers`, `tycho security`… act on it.
 * Resolution never guesses: `--target <name>`, else TYCHO_TARGET, else the current target.
 * @license AGPL-3.0-only
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { homedir } from "os";
import { isAbsolute, join, resolve } from "path";

/** Engine of a target, read from `spec.engine` of its `target.yaml`. */
export type TargetEngine = "kubernetes" | "podman";

/** A registered target. */
export interface TargetEntry {
   name: string;
   /** Absolute path of the target repository. */
   path: string;
   engine: TargetEngine;
}

/** Content of the targets file. */
export interface TargetsFile {
   current: string | null;
   targets: Record<string, { path: string; engine: TargetEngine }>;
}

const NAME = /^[a-z0-9]([a-z0-9-]{0,40}[a-z0-9])?$/;

/**
 * Directory of the core configuration.
 * @param env Process environment (`TYCHO_CONFIG_DIR`, `XDG_CONFIG_HOME`).
 * @returns The directory.
 */
export function configDir(env: Record<string, string | undefined>): string {
   if (env.TYCHO_CONFIG_DIR) {
      return env.TYCHO_CONFIG_DIR;
   }
   return join(env.XDG_CONFIG_HOME || join(homedir(), ".config"), "tycho");
}

function targetsFile(env: Record<string, string | undefined>): string {
   return join(configDir(env), "targets.json");
}

/**
 * Reads the registered targets (empty when none).
 * @param env Process environment.
 * @returns The targets file content.
 */
export function readTargets(env: Record<string, string | undefined>): TargetsFile {
   const file = targetsFile(env);
   if (!existsSync(file)) {
      return { current: null, targets: {} };
   }
   return JSON.parse(readFileSync(file, "utf-8")) as TargetsFile;
}

function writeTargets(content: TargetsFile, env: Record<string, string | undefined>): void {
   const dir = configDir(env);
   mkdirSync(dir, { recursive: true, mode: 0o700 });
   const file = targetsFile(env);
   const temporary = `${file}.tmp`;
   writeFileSync(temporary, `${JSON.stringify(content, null, 2)}\n`, { mode: 0o600 });
   renameSync(temporary, file);
}

/**
 * Reads the name and engine declared by a target repository.
 * @param path Target repository.
 * @returns Name (`metadata.name`) and engine (`spec.engine`).
 * @throws Error when `target.yaml` is missing or does not declare them.
 */
export function readTargetIdentity(path: string): { name: string; engine: TargetEngine } {
   const file = join(path, "target.yaml");
   if (!existsSync(file)) {
      throw new Error(`${file} not found`);
   }
   const doc = Bun.YAML.parse(readFileSync(file, "utf-8")) as { metadata?: { name?: unknown }; spec?: { engine?: unknown } };
   const name = doc?.metadata?.name;
   const engine = doc?.spec?.engine;
   if (typeof name !== "string" || !NAME.test(name)) {
      throw new Error(`${file}: metadata.name is missing or invalid`);
   }
   if (engine !== "kubernetes" && engine !== "podman") {
      throw new Error(`${file}: spec.engine must be kubernetes or podman`);
   }
   return { name, engine };
}

/**
 * Registers a target repository. The name must match `metadata.name` of its `target.yaml`,
 * so that a name always designates the same target on every workstation.
 * @param path Target repository.
 * @param env Process environment.
 * @returns The registered target.
 * @throws Error when the name is already registered for another path.
 */
export function addTarget(path: string, env: Record<string, string | undefined>): TargetEntry {
   const absolute = isAbsolute(path) ? path : resolve(path);
   const { name, engine } = readTargetIdentity(absolute);
   const content = readTargets(env);
   const existing = content.targets[name];
   if (existing && existing.path !== absolute) {
      throw new Error(`target ${name} is already registered for ${existing.path}`);
   }
   content.targets[name] = { path: absolute, engine };
   if (content.current === null) {
      content.current = name;
   }
   writeTargets(content, env);
   return { name, path: absolute, engine };
}

/**
 * Selects the current target.
 * @param name Target name.
 * @param env Process environment.
 */
export function useTarget(name: string, env: Record<string, string | undefined>): void {
   const content = readTargets(env);
   if (!content.targets[name]) {
      throw new Error(`unknown target ${name} (tycho context list)`);
   }
   content.current = name;
   writeTargets(content, env);
}

/**
 * Forgets a target; its repository is left untouched.
 * @param name Target name.
 * @param env Process environment.
 */
export function removeTarget(name: string, env: Record<string, string | undefined>): void {
   const content = readTargets(env);
   if (!content.targets[name]) {
      throw new Error(`unknown target ${name}`);
   }
   delete content.targets[name];
   if (content.current === name) {
      content.current = null;
   }
   writeTargets(content, env);
}

/** Result of the target resolution handed to modules. */
export type TargetResolution = { target: TargetEntry; error: null } | { target: null; error: string };

/**
 * Resolves the target of a command: `--target`, else TYCHO_TARGET, else the current target.
 * An explicitly requested target that is unknown is an error; no selection at all is not
 * (commands that need no target still run), the module reports it when it needs one.
 * @param flag Value of `--target`, if given.
 * @param env Process environment.
 * @returns The target, or why there is none.
 * @throws Error when `--target` or TYCHO_TARGET names an unknown target.
 */
export function resolveTarget(flag: string | undefined, env: Record<string, string | undefined>): TargetResolution {
   const content = readTargets(env);
   const explicit = flag ?? env.TYCHO_TARGET;
   const name = explicit ?? content.current;
   if (!name) {
      return { target: null, error: "no target selected: tycho context use <name>, or --target <name>" };
   }
   const entry = content.targets[name];
   if (!entry) {
      const message = `unknown target ${name} (tycho context add <path>)`;
      if (explicit) {
         throw new Error(message);
      }
      return { target: null, error: message };
   }
   return { target: { name, path: entry.path, engine: entry.engine }, error: null };
}

/**
 * Removes `--target <name>` / `--target=<name>` from the arguments of a module command.
 * @param args Arguments after the module command.
 * @returns The remaining arguments and the flag value.
 */
export function extractTargetFlag(args: string[]): { args: string[]; target: string | undefined } {
   const remaining: string[] = [];
   let target: string | undefined;
   for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg === "--target") {
         target = args[i + 1];
         i++;
         if (target === undefined) {
            throw new Error("--target needs a target name");
         }
      } else if (arg.startsWith("--target=")) {
         target = arg.slice("--target=".length);
      } else {
         remaining.push(arg);
      }
   }
   return { args: remaining, target };
}
