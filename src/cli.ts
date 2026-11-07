#!/usr/bin/env bun
/**
 * Tycho core: the only executable. It installs modules (`@tycho/*` npm packages) and
 * runs them in-process with its embedded Bun runtime (RFC-001 §4quinquies).
 * @license AGPL-3.0-only
 */

import { createContext, CORE_VERSION } from "./core/context";
import { bannerEnabled, bannerText, makeConfirm, readSettings, setSetting } from "./core/interaction";
import { runModule } from "./modules/runner";
import { findModuleForCommand, installModule, linkModule, readLock, removeModule } from "./modules/store";
import {
   addTarget,
   extractLeadingSelection,
   extractSelectionFlags,
   mergeSelection,
   readTargets,
   removeTarget,
   resolveOrg,
   resolveTarget,
   useOrg,
   useTarget,
} from "./core/targets";

/** Official modules, shown by `tycho help` and suggested when a command is unknown. */
const OFFICIAL_MODULES: Record<string, string> = {
   forge: "Multi-forge adapter: pull requests, issues, mirrors (Forgejo, GitHub, GitLab, Bitbucket)",
   containers: "Single-host Podman deployments of catalogue recipes",
   orchestration: "Kubernetes deployments of catalogue recipes (Traefik, TLS, Terraform)",
   knowledge: "Open Knowledge Format (OKF) curation, validation and sync",
   security: "Security audits of code and deployments (alias: sec)",
};

const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const paint = (code: string) => (useColor ? code : "");
const BOLD = paint("\x1b[1m");
const DIM = paint("\x1b[2m");
const RED = paint("\x1b[31m");
const GREEN = paint("\x1b[32m");
const RESET = paint("\x1b[0m");

const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
const ctx = createContext(process.env, isRoot);
const token = process.env.TYCHO_REGISTRY_TOKEN || undefined;
const leading = extractLeadingSelection(process.argv.slice(2));
const interactive = Boolean(process.stdin.isTTY);
const [command, ...rest] = leading.rest;

/** Prints the general help. */
function printHelp(): void {
   const lock = readLock(ctx);
   console.log(`${BOLD}Tycho ${CORE_VERSION}${RESET} ${DIM}(${ctx.mode} mode)${RESET}

Usage: tycho [-c <org>:<context>] [-o <org>] [-q] <command> [arguments]

Core commands:
  module add <name>[@<range>]   Install or upgrade a module from ${ctx.registry}
  module list                   List installed modules
  module remove <name>          Remove a module
  module link <dir>             Use a module from a local working copy (development)
  org list                      List organisations (* = current)
  org use <org>                 Select the current organisation
  context list [--all]          List the targets of the organisation (* = current)
  context add <dir>             Register a target repository (name and organisation read
                                from its target.yaml, else --org, else the current one)
  context use <name|org/name>   Select the current target
  context current               Print the current target
  context remove <name|org/name> Forget a target (its repository is left untouched)
  config list | set banner on|off   Settings (banner: org and context before each command)
  version                       Print the core version
  help                          Show this help

Selection, for every module command:
  tycho -c <org>:<context> <command> ...   short form, before the command (-c <context>, -o <org>)
  --context|--target <name|org:name>, --org <org>   anywhere
  else TYCHO_TARGET / TYCHO_ORG, else the current organisation and target.
Each module command first prints the organisation and context (-q, TYCHO_BANNER=0 or
tycho config set banner off to hide it). Destructive actions ask for confirmation
(TYCHO_ASSUME_YES=1 to confirm without a terminal, in CI).

Modules:`);
   for (const [name, description] of Object.entries(OFFICIAL_MODULES)) {
      const label = lock[name] ? lock[name].version : "not installed";
      const color = lock[name] ? GREEN : DIM;
      console.log(`  ${name.padEnd(14)} ${color}${label.padEnd(14)}${RESET} ${DIM}${description}${RESET}`);
   }
   console.log(`\nModules directory: ${ctx.modulesDir}`);
}

/**
 * Handles `tycho module <action> ...`.
 * @param args Arguments after `module`.
 * @returns Exit code.
 */
async function moduleCommand(args: string[]): Promise<number> {
   const [action, ...targets] = args;
   if (!action || action === "list") {
      const lock = readLock(ctx);
      const names = Object.keys(lock).sort();
      if (names.length === 0) {
         console.log("No module installed. Example: tycho module add forge");
         return 0;
      }
      for (const name of names) {
         const entry = lock[name];
         console.log(`${name.padEnd(14)} ${entry.version.padEnd(10)} ${DIM}${entry.commands.join(", ")}${RESET}`);
      }
      return 0;
   }
   if (action === "add") {
      if (targets.length === 0) {
         console.error(`${RED}Usage:${RESET} tycho module add <name>[@<range>] ...`);
         return 2;
      }
      for (const spec of targets) {
         const entry = await installModule(ctx, spec, token);
         console.log(`${GREEN}✔${RESET} ${entry.package}@${entry.version} ${DIM}(${entry.integrity.slice(0, 19)}…)${RESET}`);
      }
      return 0;
   }
   if (action === "remove") {
      if (targets.length === 0) {
         console.error(`${RED}Usage:${RESET} tycho module remove <name> ...`);
         return 2;
      }
      for (const name of targets) {
         if (!(await makeConfirm(null, ctx.env, interactive)(`Remove module ${name}`))) {
            console.error(`${name}: not removed`);
            continue;
         }
         const removed = removeModule(ctx, name);
         console.log(removed ? `${GREEN}✔${RESET} removed ${name}` : `${name} was not installed`);
      }
      return 0;
   }
   if (action === "link") {
      if (targets.length !== 1) {
         console.error(`${RED}Usage:${RESET} tycho module link <dir>`);
         return 2;
      }
      const entry = linkModule(ctx, targets[0]);
      console.log(`${GREEN}✔${RESET} ${entry.package}@${entry.version} ${DIM}(${entry.resolved})${RESET}`);
      return 0;
   }
   console.error(`${RED}Unknown action "${action}".${RESET} Actions: add, link, list, remove`);
   return 2;
}

/**
 * Handles `tycho org <action> ...`: organisations group the targets of one instance.
 * @param args Arguments after `org`.
 * @returns Exit code.
 */
function orgCommand(args: string[]): number {
   const [action, value] = args;
   const content = readTargets(ctx.env);
   if (!action || action === "list") {
      const names = Object.keys(content.orgs).sort();
      if (names.length === 0) {
         console.log(`No organisation yet: the first target added goes to "${content.currentOrg}".`);
         return 0;
      }
      for (const name of names) {
         const mark = name === content.currentOrg ? `${GREEN}*${RESET}` : " ";
         const count = Object.keys(content.orgs[name].targets).length;
         console.log(`${mark} ${name.padEnd(28)} ${DIM}${count} target(s), current: ${content.orgs[name].current ?? "none"}${RESET}`);
      }
      return 0;
   }
   if (action === "use" && value) {
      useOrg(value, ctx.env);
      console.log(`Current organisation: ${BOLD}${value}${RESET}`);
      return 0;
   }
   if (action === "current") {
      console.log(resolveOrg(undefined, ctx.env));
      return 0;
   }
   console.error(`${RED}Usage:${RESET} tycho org list | use <org> | current`);
   return 2;
}

/**
 * Handles `tycho context <action> ...`: the targets shared by every module.
 * @param argv Arguments after `context` (may hold --org, and --all for list).
 * @returns Exit code.
 */
async function contextCommand(argv: string[]): Promise<number> {
   const all = argv.includes("--all");
   const { args, org: trailingOrg } = extractSelectionFlags(argv.filter((a) => a !== "--all"));
   const orgFlag = mergeSelection(leading, { target: undefined, org: trailingOrg }).org;
   const [action, value] = args;
   if (!action || action === "list") {
      const content = readTargets(ctx.env);
      const org = resolveOrg(orgFlag, ctx.env);
      const orgs = all ? Object.keys(content.orgs).sort() : [org];
      let shown = 0;
      for (const o of orgs) {
         const entry = content.orgs[o];
         for (const name of Object.keys(entry?.targets ?? {}).sort()) {
            const target = entry.targets[name];
            const current = o === content.currentOrg && name === entry.current;
            const mark = current ? `${GREEN}*${RESET}` : " ";
            console.log(`${mark} ${`${o}/${name}`.padEnd(36)} ${target.engine.padEnd(11)} ${DIM}${target.path}${RESET}`);
            shown++;
         }
      }
      if (shown === 0) {
         console.log(`No target in organisation ${all ? "any" : org}. Example: tycho context add ~/src/acme/k8s-scaleway-prod`);
      }
      return 0;
   }
   if (action === "add" && value) {
      const entry = addTarget(value, ctx.env, orgFlag);
      console.log(`${GREEN}✔${RESET} ${entry.id} (${entry.engine}) ${DIM}${entry.path}${RESET}`);
      return 0;
   }
   if (action === "use" && value) {
      const id = useTarget(orgFlag && !value.includes("/") ? `${orgFlag}/${value}` : value, ctx.env);
      console.log(`Current target: ${BOLD}${id}${RESET}`);
      return 0;
   }
   if (action === "remove" && value) {
      const ref = orgFlag && !value.includes("/") && !value.includes(":") ? `${orgFlag}/${value}` : value;
      if (!(await makeConfirm(null, ctx.env, interactive)(`Forget target ${ref} (its repository is kept)`))) {
         console.error(`${ref}: kept`);
         return 1;
      }
      removeTarget(ref, ctx.env);
      console.log(`${GREEN}✔${RESET} forgot ${value}`);
      return 0;
   }
   if (action === "current") {
      const selection = resolveTarget(undefined, ctx.env, orgFlag);
      if (!selection.target) {
         console.error(selection.error);
         return 1;
      }
      console.log(`${selection.target.id} ${DIM}(${selection.target.engine}, ${selection.target.path})${RESET}`);
      return 0;
   }
   console.error(`${RED}Usage:${RESET} tycho context list [--all] | add <dir> | use <name|org/name> | current | remove <name|org/name>  [--org <org>]`);
   return 2;
}

/**
 * Routes the command line.
 * @returns Exit code.
 */
async function main(): Promise<number> {
   if (!command || command === "help" || command === "--help" || command === "-h") {
      printHelp();
      return 0;
   }
   if (command === "version" || command === "--version" || command === "-v") {
      console.log(`tycho ${CORE_VERSION}`);
      return 0;
   }
   if (command === "module") {
      return moduleCommand(rest);
   }
   if (command === "context") {
      return contextCommand(rest);
   }
   if (command === "config") {
      const [action, key, value] = rest;
      if (action === "set" && key && value) {
         setSetting(key, value, ctx.env);
         console.log(`${GREEN}✔${RESET} ${key} ${value}`);
         return 0;
      }
      if (!action || action === "list") {
         const settings = readSettings(ctx.env);
         console.log(`banner ${settings.banner ? "on" : "off"}`);
         return 0;
      }
      console.error(`${RED}Usage:${RESET} tycho config list | set banner on|off`);
      return 2;
   }
   if (command === "org") {
      return orgCommand(rest);
   }
   const moduleName = findModuleForCommand(ctx, command);
   if (moduleName) {
      const { args, ...after } = extractSelectionFlags(rest);
      const { target, org } = mergeSelection(leading, after);
      const selection = resolveTarget(target, ctx.env, org);
      if (bannerEnabled(leading.quiet, ctx.env)) {
         console.error(`${DIM}${bannerText(resolveOrg(org, ctx.env), selection)}${RESET}`);
      }
      return runModule(ctx, moduleName, command, args, selection, makeConfirm(selection, ctx.env, interactive));
   }
   if (command in OFFICIAL_MODULES || command === "sec") {
      const name = command === "sec" ? "security" : command;
      console.error(`Module "${name}" is not installed. Install it with: ${BOLD}tycho module add ${name}${RESET}`);
      return 127;
   }
   console.error(`${RED}Unknown command "${command}".${RESET} See: tycho help`);
   return 127;
}

try {
   process.exit(await main());
} catch (error) {
   console.error(`${RED}✖${RESET} ${error instanceof Error ? error.message : String(error)}`);
   process.exit(1);
}
