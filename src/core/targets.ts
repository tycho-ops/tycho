/**
 * Organisations and targets (contexts). A target is a deployment environment described by the
 * `target.yaml` of its repository (RFC-001 §3); an organisation groups the targets of one
 * instance (one customer, one company). One `tycho` manages several organisations, each with
 * several targets; operators with a single organisation stay on `default`.
 * The list is shared by every module: select once, then `tycho orchestration`, `tycho security`…
 * act on the selection. Resolution never guesses:
 *   organisation: --org, else TYCHO_ORG, else the current organisation;
 *   target: --target (`name` or `org/name`), else TYCHO_TARGET, else the organisation's current target.
 * @license AGPL-3.0-only
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { homedir } from "os";
import { isAbsolute, join, resolve } from "path";

/** Engine of a target, read from `spec.engine` of its `target.yaml`. */
export type TargetEngine = "kubernetes" | "podman";

/** Organisation of targets that declare none. */
export const DEFAULT_ORG = "default";

/** A registered target. */
export interface TargetEntry {
   org: string;
   name: string;
   /** `org/name`: unique on the workstation (kubeconfigs, cluster markers…). */
   id: string;
   /** Absolute path of the target repository. */
   path: string;
   engine: TargetEngine;
}

interface OrgEntry {
   current: string | null;
   targets: Record<string, { path: string; engine: TargetEngine }>;
}

/** Content of the targets file. */
export interface TargetsFile {
   version: 2;
   currentOrg: string;
   orgs: Record<string, OrgEntry>;
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
 * Reads the registered organisations and targets.
 * @param env Process environment.
 * @returns The targets file content (empty `default` organisation when none).
 */
export function readTargets(env: Record<string, string | undefined>): TargetsFile {
   const file = targetsFile(env);
   if (!existsSync(file)) {
      return { version: 2, currentOrg: DEFAULT_ORG, orgs: {} };
   }
   const content = JSON.parse(readFileSync(file, "utf-8")) as TargetsFile;
   if (content.version !== 2) {
      throw new Error(`${file}: unsupported format, remove it and register the targets again`);
   }
   return content;
}

function writeTargets(content: TargetsFile, env: Record<string, string | undefined>): void {
   const dir = configDir(env);
   mkdirSync(dir, { recursive: true, mode: 0o700 });
   const file = targetsFile(env);
   const temporary = `${file}.tmp`;
   writeFileSync(temporary, `${JSON.stringify(content, null, 2)}\n`, { mode: 0o600 });
   renameSync(temporary, file);
}

function assertName(value: string, what: string): void {
   if (!NAME.test(value)) {
      throw new Error(`invalid ${what} "${value}": lowercase letters, digits and dashes`);
   }
}

/**
 * Splits a target reference: `name`, `org/name` or `org:name`.
 * @param ref Target reference.
 * @returns Organisation (null when not given) and name.
 */
export function parseTargetRef(ref: string): { org: string | null; name: string } {
   const parts = ref.split(/[/:]/);
   if (parts.length > 2) {
      throw new Error(`invalid target "${ref}": name, org:name or org/name`);
   }
   const [org, name] = parts.length === 2 ? [parts[0], parts[1]] : [null, parts[0]];
   if (org !== null) {
      assertName(org, "organisation");
   }
   assertName(name, "target name");
   return { org, name };
}

/**
 * Reads the identity declared by a target repository.
 * @param path Target repository.
 * @returns Name (`metadata.name`), organisation (`metadata.organization`, if any) and engine.
 * @throws Error when `target.yaml` is missing or invalid.
 */
export function readTargetIdentity(path: string): { name: string; org: string | null; engine: TargetEngine } {
   const file = join(path, "target.yaml");
   if (!existsSync(file)) {
      throw new Error(`${file} not found`);
   }
   const doc = Bun.YAML.parse(readFileSync(file, "utf-8")) as {
      metadata?: { name?: unknown; organization?: unknown };
      spec?: { engine?: unknown };
   };
   const name = doc?.metadata?.name;
   const org = doc?.metadata?.organization;
   const engine = doc?.spec?.engine;
   if (typeof name !== "string" || !NAME.test(name)) {
      throw new Error(`${file}: metadata.name is missing or invalid`);
   }
   if (org !== undefined && (typeof org !== "string" || !NAME.test(org))) {
      throw new Error(`${file}: metadata.organization is invalid`);
   }
   if (engine !== "kubernetes" && engine !== "podman") {
      throw new Error(`${file}: spec.engine must be kubernetes or podman`);
   }
   return { name, org: (org as string | undefined) ?? null, engine };
}

/**
 * Registers a target repository. Its name is `metadata.name` of its `target.yaml`; its
 * organisation is `metadata.organization`, else `orgFlag`, else the current organisation.
 * @param path Target repository.
 * @param env Process environment.
 * @param orgFlag Value of `--org`, if given.
 * @returns The registered target.
 * @throws Error when the organisations disagree or the name is taken by another path.
 */
export function addTarget(path: string, env: Record<string, string | undefined>, orgFlag?: string): TargetEntry {
   const absolute = isAbsolute(path) ? path : resolve(path);
   const identity = readTargetIdentity(absolute);
   const content = readTargets(env);
   if (identity.org && orgFlag && identity.org !== orgFlag) {
      throw new Error(`target.yaml declares organisation ${identity.org}, --org says ${orgFlag}`);
   }
   const org = identity.org ?? orgFlag ?? env.TYCHO_ORG ?? content.currentOrg;
   assertName(org, "organisation");
   const entry = (content.orgs[org] ??= { current: null, targets: {} });
   const existing = entry.targets[identity.name];
   if (existing && existing.path !== absolute) {
      throw new Error(`target ${org}/${identity.name} is already registered for ${existing.path}`);
   }
   entry.targets[identity.name] = { path: absolute, engine: identity.engine };
   entry.current ??= identity.name;
   writeTargets(content, env);
   return { org, name: identity.name, id: `${org}/${identity.name}`, path: absolute, engine: identity.engine };
}

/**
 * Selects the current organisation.
 * @param org Organisation name.
 * @param env Process environment.
 */
export function useOrg(org: string, env: Record<string, string | undefined>): void {
   const content = readTargets(env);
   if (!content.orgs[org]) {
      throw new Error(`unknown organisation ${org} (it exists once a target is added: tycho context add <dir> --org ${org})`);
   }
   content.currentOrg = org;
   writeTargets(content, env);
}

/**
 * Selects the current target; `org/name` also selects its organisation.
 * @param ref `name` (in the current organisation) or `org/name`.
 * @param env Process environment.
 * @returns The selected target id.
 */
export function useTarget(ref: string, env: Record<string, string | undefined>): string {
   const content = readTargets(env);
   const { org: given, name } = parseTargetRef(ref);
   const org = given ?? content.currentOrg;
   if (!content.orgs[org]?.targets[name]) {
      throw new Error(`unknown target ${org}/${name} (tycho context list --all)`);
   }
   content.currentOrg = org;
   content.orgs[org].current = name;
   writeTargets(content, env);
   return `${org}/${name}`;
}

/**
 * Forgets a target; its repository is left untouched. An organisation left empty is removed.
 * @param ref `name` (in the current organisation) or `org/name`.
 * @param env Process environment.
 */
export function removeTarget(ref: string, env: Record<string, string | undefined>): void {
   const content = readTargets(env);
   const { org: given, name } = parseTargetRef(ref);
   const org = given ?? content.currentOrg;
   const entry = content.orgs[org];
   if (!entry?.targets[name]) {
      throw new Error(`unknown target ${org}/${name}`);
   }
   delete entry.targets[name];
   if (entry.current === name) {
      entry.current = null;
   }
   if (Object.keys(entry.targets).length === 0) {
      delete content.orgs[org];
   }
   writeTargets(content, env);
}

/** Result of the target resolution handed to modules. */
export type TargetResolution = { target: TargetEntry; error: null } | { target: null; error: string };

/**
 * Resolves the organisation of a command: `--org`, else TYCHO_ORG, else the current one.
 * @param orgFlag Value of `--org`, if given.
 * @param env Process environment.
 */
export function resolveOrg(orgFlag: string | undefined, env: Record<string, string | undefined>): string {
   return orgFlag ?? env.TYCHO_ORG ?? readTargets(env).currentOrg;
}

/**
 * Resolves the target of a command. An explicitly requested target or organisation that is
 * unknown is an error; no selection at all is not (commands that need no target still run),
 * the module reports it when it needs one.
 * @param targetFlag Value of `--target` (`name` or `org/name`), if given.
 * @param env Process environment.
 * @param orgFlag Value of `--org`, if given.
 * @returns The target, or why there is none.
 * @throws Error when an explicit target or organisation is unknown.
 */
export function resolveTarget(targetFlag: string | undefined, env: Record<string, string | undefined>, orgFlag?: string): TargetResolution {
   const content = readTargets(env);
   const explicitRef = targetFlag ?? env.TYCHO_TARGET;
   const parsed = explicitRef ? parseTargetRef(explicitRef) : null;
   if (parsed?.org && orgFlag && parsed.org !== orgFlag) {
      throw new Error(`--target ${explicitRef} is not in --org ${orgFlag}`);
   }
   const explicitOrg = parsed?.org ?? orgFlag ?? env.TYCHO_ORG;
   const org = explicitOrg ?? content.currentOrg;
   const entry = content.orgs[org];
   if (!entry) {
      const message = `unknown organisation ${org} (tycho org list)`;
      if (explicitOrg) {
         throw new Error(message);
      }
      return { target: null, error: `no target registered in organisation ${org}: tycho context add <dir>` };
   }
   const name = parsed?.name ?? entry.current;
   if (!name) {
      return { target: null, error: `no target selected in organisation ${org}: tycho context use <name>, or --target <name>` };
   }
   const target = entry.targets[name];
   if (!target) {
      const message = `unknown target ${org}/${name} (tycho context list)`;
      if (parsed) {
         throw new Error(message);
      }
      return { target: null, error: message };
   }
   return { target: { org, name, id: `${org}/${name}`, path: target.path, engine: target.engine }, error: null };
}

/** Selection given on a command line. */
export interface Selection {
   target: string | undefined;
   org: string | undefined;
}

function setOnce(found: Selection, key: keyof Selection, value: string | undefined, flag: string): void {
   if (value === undefined || value === "" || value.startsWith("-")) {
      throw new Error(`${flag} needs a value`);
   }
   if (found[key] !== undefined && found[key] !== value) {
      throw new Error(`${flag} ${value} conflicts with ${found[key]}`);
   }
   found[key] = value;
}

/**
 * Removes the long selection flags (`--target` or its alias `--context`, `--org`, with a space or
 * `=`) from the arguments of a module command. Short flags are only read before the command (see
 * `extractLeadingSelection`): after it they belong to the module (git uses `-c` and `-o`).
 * @param args Arguments after the module command.
 * @returns The remaining arguments and the flag values.
 */
export function extractSelectionFlags(args: string[]): { args: string[] } & Selection {
   const remaining: string[] = [];
   const found: Selection = { target: undefined, org: undefined };
   for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      const match = /^--(target|context|org)(?:=(.*))?$/.exec(arg);
      if (!match) {
         remaining.push(arg);
         continue;
      }
      const key = match[1] === "org" ? "org" : "target";
      const value = match[2] ?? args[++i];
      setOnce(found, key, value, `--${match[1]}`);
   }
   return { args: remaining, ...found };
}

/**
 * Reads the selection options placed before the command: `-c <org>:<context>` (or `-c <context>`,
 * `--context`, `--target`) and `-o <org>` (`--org`).
 * @param argv Arguments after `tycho`.
 * @returns The selection and the arguments from the command on.
 */
export function extractLeadingSelection(argv: string[]): { rest: string[] } & Selection {
   const found: Selection = { target: undefined, org: undefined };
   let i = 0;
   for (; i < argv.length; i++) {
      const arg = argv[i];
      const match = /^(-c|-o|--context|--target|--org)(?:=(.*))?$/.exec(arg);
      if (!match) {
         break;
      }
      const key = match[1] === "-o" || match[1] === "--org" ? "org" : "target";
      const value = match[2] ?? argv[++i];
      setOnce(found, key, value, match[1]);
   }
   return { rest: argv.slice(i), ...found };
}

/**
 * Merges the selection given before the command with the one given after it.
 * @throws Error when both give different values for the same option.
 */
export function mergeSelection(before: Selection, after: Selection): Selection {
   const merged: Selection = { target: undefined, org: undefined };
   for (const key of ["target", "org"] as const) {
      for (const value of [before[key], after[key]]) {
         if (value !== undefined) {
            setOnce(merged, key, value, key === "org" ? "--org" : "--target");
         }
      }
   }
   return merged;
}
