/**
 * What every command shows and asks: the selected organisation and target (banner), and a
 * confirmation before any destructive action, both handed to modules.
 * @license AGPL-3.0-only
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { join } from "path";
import { configDir, type TargetResolution } from "./targets";

/** Settings of `tycho config`. */
export interface CoreSettings {
   /** Show the organisation / target banner before each module command. */
   banner: boolean;
}

const DEFAULTS: CoreSettings = { banner: true };

function settingsFile(env: Record<string, string | undefined>): string {
   return join(configDir(env), "config.json");
}

/**
 * Reads the settings (defaults for missing keys).
 * @param env Process environment.
 */
export function readSettings(env: Record<string, string | undefined>): CoreSettings {
   const file = settingsFile(env);
   if (!existsSync(file)) {
      return { ...DEFAULTS };
   }
   return { ...DEFAULTS, ...(JSON.parse(readFileSync(file, "utf-8")) as Partial<CoreSettings>) };
}

/**
 * Sets one setting from its command line form (`banner on|off`).
 * @throws Error on an unknown key or value.
 */
export function setSetting(key: string, value: string, env: Record<string, string | undefined>): CoreSettings {
   const settings = readSettings(env);
   if (key !== "banner") {
      throw new Error(`unknown setting ${key} (settings: banner)`);
   }
   if (value !== "on" && value !== "off") {
      throw new Error("banner: on or off");
   }
   settings.banner = value === "on";
   mkdirSync(configDir(env), { recursive: true, mode: 0o700 });
   const file = settingsFile(env);
   writeFileSync(`${file}.tmp`, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
   renameSync(`${file}.tmp`, file);
   return settings;
}

/**
 * Whether the banner is shown: off with `-q`, TYCHO_BANNER=0 or `tycho config set banner off`.
 */
export function bannerEnabled(quiet: boolean, env: Record<string, string | undefined>): boolean {
   if (quiet || env.TYCHO_BANNER === "0" || env.TYCHO_BANNER === "off") {
      return false;
   }
   return readSettings(env).banner;
}

/**
 * One line naming the organisation and the target a command acts on.
 * @param org Organisation resolved for the command.
 * @param selection Target resolved for the command.
 */
export function bannerText(org: string, selection: TargetResolution): string {
   if (selection.target) {
      return `tycho · ${selection.target.org}:${selection.target.name} (${selection.target.engine})`;
   }
   return `tycho · ${org}: no context`;
}

/** Reads one line from the terminal (injected in tests). */
export type Asker = (question: string) => string | null;

/** Confirmation handed to modules: true only on an explicit "y" / "yes". */
export type Confirm = (action: string) => Promise<boolean>;

/**
 * Builds the confirmation of destructive actions. The question names the target. Without an
 * interactive terminal the answer is no, unless TYCHO_ASSUME_YES=1 was set on purpose (CI).
 * @param selection Target of the command (named in the question).
 * @param env Process environment.
 * @param interactive Whether stdin is a terminal.
 * @param ask Line reader.
 */
export function makeConfirm(selection: TargetResolution | null, env: Record<string, string | undefined>, interactive: boolean, ask: Asker = (q) => prompt(q)): Confirm {
   return async (action: string): Promise<boolean> => {
      const where = selection?.target ? ` on ${selection.target.org}:${selection.target.name}` : "";
      if (env.TYCHO_ASSUME_YES === "1") {
         console.error(`! ${action}${where}: confirmed by TYCHO_ASSUME_YES=1`);
         return true;
      }
      if (!interactive) {
         console.error(`✖ ${action}${where}: needs a confirmation, and no terminal is attached (TYCHO_ASSUME_YES=1 to confirm in CI)`);
         return false;
      }
      const answer = ask(`⚠ ${action}${where}. Continue? [y/N]`);
      return /^(y|yes|o|oui)$/i.test((answer ?? "").trim());
   };
}
