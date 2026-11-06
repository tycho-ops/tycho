#!/usr/bin/env bun
/**
 * Tycho core: the only executable. It installs modules (`@tycho/*` npm packages) and
 * runs them in-process with its embedded Bun runtime (RFC-001 §4quinquies).
 * @license AGPL-3.0-only
 */

import { createContext, CORE_VERSION } from "./core/context";
import { runModule } from "./modules/runner";
import { findModuleForCommand, installModule, linkModule, readLock, removeModule } from "./modules/store";
import { addTarget, extractTargetFlag, readTargets, removeTarget, resolveTarget, useTarget } from "./core/targets";

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
const [command, ...rest] = process.argv.slice(2);

/** Prints the general help. */
function printHelp(): void {
   const lock = readLock(ctx);
   console.log(`${BOLD}Tycho ${CORE_VERSION}${RESET} ${DIM}(${ctx.mode} mode)${RESET}

Usage: tycho <command> [arguments]

Core commands:
  module add <name>[@<range>]   Install or upgrade a module from ${ctx.registry}
  module list                   List installed modules
  module remove <name>          Remove a module
  module link <dir>             Use a module from a local working copy (development)
  context list                  List targets (* = current)
  context add <dir>             Register a target repository (name read from its target.yaml)
  context use <name>            Select the current target
  context current               Print the current target
  context remove <name>         Forget a target (its repository is left untouched)
  version                       Print the core version
  help                          Show this help

Every module command accepts --target <name> (else TYCHO_TARGET, else the current target).

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
 * Handles `tycho context <action> ...`: the targets shared by every module.
 * @param args Arguments after `context`.
 * @returns Exit code.
 */
function contextCommand(args: string[]): number {
   const [action, value] = args;
   if (!action || action === "list") {
      const content = readTargets(ctx.env);
      const names = Object.keys(content.targets).sort();
      if (names.length === 0) {
         console.log("No target registered. Example: tycho context add ~/src/acme/k8s-scaleway-prod");
         return 0;
      }
      for (const name of names) {
         const entry = content.targets[name];
         const mark = name === content.current ? `${GREEN}*${RESET}` : " ";
         console.log(`${mark} ${name.padEnd(28)} ${entry.engine.padEnd(11)} ${DIM}${entry.path}${RESET}`);
      }
      return 0;
   }
   if (action === "add" && value) {
      const entry = addTarget(value, ctx.env);
      console.log(`${GREEN}✔${RESET} ${entry.name} (${entry.engine}) ${DIM}${entry.path}${RESET}`);
      return 0;
   }
   if (action === "use" && value) {
      useTarget(value, ctx.env);
      console.log(`Current target: ${BOLD}${value}${RESET}`);
      return 0;
   }
   if (action === "remove" && value) {
      removeTarget(value, ctx.env);
      console.log(`${GREEN}✔${RESET} forgot ${value}`);
      return 0;
   }
   if (action === "current") {
      const selection = resolveTarget(undefined, ctx.env);
      if (!selection.target) {
         console.error(selection.error);
         return 1;
      }
      console.log(`${selection.target.name} ${DIM}(${selection.target.engine}, ${selection.target.path})${RESET}`);
      return 0;
   }
   console.error(`${RED}Usage:${RESET} tycho context list | add <dir> | use <name> | current | remove <name>`);
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
   const moduleName = findModuleForCommand(ctx, command);
   if (moduleName) {
      const { args, target } = extractTargetFlag(rest);
      return runModule(ctx, moduleName, command, args, resolveTarget(target, ctx.env));
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
