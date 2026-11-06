#!/usr/bin/env bun
/**
 * Tycho core: the only executable. It installs modules (`@tycho/*` npm packages) and
 * runs them in-process with its embedded Bun runtime (RFC-001 §4quinquies).
 * @license AGPL-3.0-only
 */

import { createContext, CORE_VERSION } from "./core/context";
import { runModule } from "./modules/runner";
import { findModuleForCommand, installModule, readLock, removeModule } from "./modules/store";

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
  version                       Print the core version
  help                          Show this help

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
   console.error(`${RED}Unknown action "${action}".${RESET} Actions: add, list, remove`);
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
   const moduleName = findModuleForCommand(ctx, command);
   if (moduleName) {
      return runModule(ctx, moduleName, command, rest);
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
