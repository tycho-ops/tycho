import { describe, expect, test } from "bun:test";
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createContext } from "./context";
import { addTarget, extractTargetFlag, readTargets, removeTarget, resolveTarget, useTarget } from "./targets";
import { runModule } from "../modules/runner";
import { findModuleForCommand, linkModule, readLock } from "../modules/store";

function targetRepo(root: string, name: string, engine: string): string {
   const dir = join(root, name);
   mkdirSync(dir, { recursive: true });
   writeFileSync(join(dir, "target.yaml"), `apiVersion: tycho.qtrn.io/v1alpha1\nkind: Target\nmetadata:\n  name: ${name}\nspec:\n  engine: ${engine}\n`);
   return dir;
}

describe("targets shared by every module", () => {
   const root = mkdtempSync(join(tmpdir(), "tycho-targets-"));
   const env = { TYCHO_CONFIG_DIR: join(root, "config") };

   test("registers targets by the name of their target.yaml, first one becomes current", () => {
      expect(resolveTarget(undefined, env)).toEqual({ target: null, error: expect.stringContaining("no target selected") });
      const prod = addTarget(targetRepo(root, "acme-prod", "kubernetes"), env);
      const edge = addTarget(targetRepo(root, "acme-edge", "podman"), env);
      expect(prod).toMatchObject({ name: "acme-prod", engine: "kubernetes" });
      expect(edge.engine).toBe("podman");
      expect(readTargets(env).current).toBe("acme-prod");
      expect((lstatSync(join(env.TYCHO_CONFIG_DIR, "targets.json")).mode & 0o777).toString(8)).toBe("600");
   });

   test("resolution: --target, then TYCHO_TARGET, then current; an unknown explicit name fails", () => {
      useTarget("acme-edge", env);
      expect(resolveTarget(undefined, env).target?.name).toBe("acme-edge");
      expect(resolveTarget(undefined, { ...env, TYCHO_TARGET: "acme-prod" }).target?.name).toBe("acme-prod");
      expect(resolveTarget("acme-prod", { ...env, TYCHO_TARGET: "acme-edge" }).target?.name).toBe("acme-prod");
      expect(() => resolveTarget("nope", env)).toThrow(/unknown target nope/);
      expect(() => useTarget("nope", env)).toThrow(/unknown target/);
   });

   test("refuses a repository without a valid target.yaml, and a name taken by another path", () => {
      expect(() => addTarget(join(root, "missing"), env)).toThrow(/not found/);
      expect(() => addTarget(targetRepo(join(root, "other"), "acme-prod", "kubernetes"), env)).toThrow(/already registered/);
      expect(() => addTarget(targetRepo(root, "bad-engine", "vm"), env)).toThrow(/spec.engine/);
   });

   test("removing the current target leaves no current target", () => {
      removeTarget("acme-edge", env);
      expect(readTargets(env).current).toBeNull();
      expect(resolveTarget(undefined, env).target).toBeNull();
   });

   test("--target is removed from the module arguments", () => {
      expect(extractTargetFlag(["plan", "--target", "acme-prod", "--yes"])).toEqual({ args: ["plan", "--yes"], target: "acme-prod" });
      expect(extractTargetFlag(["--target=acme-prod", "status"])).toEqual({ args: ["status"], target: "acme-prod" });
      expect(() => extractTargetFlag(["--target"])).toThrow(/needs a target name/);
   });
});

describe("module link and target hand-over", () => {
   test("a linked module runs with the selected target in its context and environment", async () => {
      const root = mkdtempSync(join(tmpdir(), "tycho-link-"));
      const ctx = createContext({ TYCHO_MODULES_DIR: join(root, "modules"), TYCHO_CONFIG_DIR: join(root, "config") }, false);
      const dir = join(root, "orchestration");
      mkdirSync(dir);
      writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "@tycho/orchestration", version: "0.0.1", main: "index.js", tycho: { module: "orchestration", commands: ["orchestration"], core: "^1.0.0", trust: "official" } }));
      writeFileSync(join(dir, "index.js"), `export function run(args, ctx) { globalThis.__seen = { args, target: ctx.target, error: ctx.targetError, env: ctx.env.TYCHO_TARGET_PATH }; return 0; }`);
      const entry = linkModule(ctx, dir);
      expect(entry.resolved).toBe(`link:${dir}`);
      expect(readLock(ctx).orchestration.integrity).toBe("link");
      expect(lstatSync(join(ctx.modulesDir, "node_modules", "@tycho", "orchestration")).isSymbolicLink()).toBe(true);
      expect(findModuleForCommand(ctx, "orchestration")).toBe("orchestration");

      const repo = targetRepo(root, "acme-prod", "kubernetes");
      addTarget(repo, ctx.env);
      expect(await runModule(ctx, "orchestration", "orchestration", ["status"], resolveTarget(undefined, ctx.env))).toBe(0);
      const seen = (globalThis as unknown as { __seen: { args: string[]; target: { name: string }; error: null; env: string } }).__seen;
      expect(seen).toMatchObject({ args: ["status"], target: { name: "acme-prod", engine: "kubernetes" }, error: null, env: repo });
   });

   test("link refuses a directory that is not an official module or is not built", () => {
      const root = mkdtempSync(join(tmpdir(), "tycho-link-bad-"));
      const ctx = createContext({ TYCHO_MODULES_DIR: join(root, "modules") }, false);
      const dir = join(root, "x");
      mkdirSync(dir);
      writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "@other/x", version: "1.0.0", main: "index.js", tycho: { module: "x", commands: ["x"], core: "^1.0.0", trust: "official" } }));
      expect(() => linkModule(ctx, dir)).toThrow(/scope @tycho/);
      writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "@tycho/x", version: "1.0.0", main: "dist/cli.js", tycho: { module: "x", commands: ["x"], core: "^1.0.0", trust: "official" } }));
      expect(() => linkModule(ctx, dir)).toThrow(/build the module first/);
      expect(readFileSync(join(dir, "package.json"), "utf-8")).toContain("@tycho/x");
   });
});
