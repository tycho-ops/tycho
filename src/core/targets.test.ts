import { describe, expect, test } from "bun:test";
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createContext } from "./context";
import { addTarget, extractSelectionFlags, parseTargetRef, readTargetIdentity, readTargets, removeTarget, resolveTarget, useOrg, useTarget } from "./targets";
import { runModule } from "../modules/runner";
import { findModuleForCommand, linkModule, readLock } from "../modules/store";

function targetRepo(root: string, name: string, engine: string): string {
   const dir = join(root, name);
   mkdirSync(dir, { recursive: true });
   writeFileSync(join(dir, "target.yaml"), `apiVersion: tycho.qtrn.io/v1alpha1\nkind: Target\nmetadata:\n  name: ${name}\nspec:\n  engine: ${engine}\n`);
   return dir;
}

function orgRepo(root: string, dir: string, name: string, engine: string, org?: string): string {
   const path = join(root, dir);
   mkdirSync(path, { recursive: true });
   const orgLine = org ? `  organization: ${org}\n` : "";
   writeFileSync(join(path, "target.yaml"), `apiVersion: tycho.qtrn.io/v1alpha1\nkind: Target\nmetadata:\n  name: ${name}\n${orgLine}spec:\n  engine: ${engine}\n`);
   return path;
}

describe("organisations and targets shared by every module", () => {
   const root = mkdtempSync(join(tmpdir(), "tycho-targets-"));
   const env = { TYCHO_CONFIG_DIR: join(root, "config") };

   test("single organisation users stay on default", () => {
      expect(resolveTarget(undefined, env)).toEqual({ target: null, error: expect.stringContaining("no target registered in organisation default") });
      const solo = addTarget(orgRepo(root, "solo", "prod", "kubernetes"), env);
      expect(solo).toMatchObject({ org: "default", name: "prod", id: "default/prod" });
      expect(resolveTarget(undefined, env).target?.id).toBe("default/prod");
      expect((lstatSync(join(env.TYCHO_CONFIG_DIR, "targets.json")).mode & 0o777).toString(8)).toBe("600");
   });

   test("the organisation comes from target.yaml, else --org; the same name may exist in two organisations", () => {
      const a = addTarget(orgRepo(root, "acme-prod", "production", "kubernetes", "acme"), env);
      const b = addTarget(orgRepo(root, "globex-prod", "production", "kubernetes"), env, "globex");
      addTarget(orgRepo(root, "acme-edge", "edge", "podman", "acme"), env);
      expect([a.id, b.id]).toEqual(["acme/production", "globex/production"]);
      expect(() => addTarget(orgRepo(root, "acme-x", "x", "kubernetes", "acme"), env, "globex")).toThrow(/declares organisation acme/);
      expect(() => addTarget(orgRepo(root, "acme-prod-2", "production", "kubernetes", "acme"), env)).toThrow(/already registered/);
   });

   test("resolution: --org/--target, then TYCHO_ORG/TYCHO_TARGET, then current", () => {
      useOrg("acme", env);
      expect(readTargets(env).currentOrg).toBe("acme");
      expect(resolveTarget(undefined, env).target?.id).toBe("acme/production");
      expect(resolveTarget("edge", env).target?.id).toBe("acme/edge");
      expect(resolveTarget("globex/production", env).target?.id).toBe("globex/production");
      expect(resolveTarget(undefined, env, "globex").target?.id).toBe("globex/production");
      expect(resolveTarget(undefined, { ...env, TYCHO_ORG: "default" }).target?.id).toBe("default/prod");
      expect(resolveTarget(undefined, { ...env, TYCHO_TARGET: "acme/edge" }).target?.engine).toBe("podman");
      expect(() => resolveTarget("acme/production", env, "globex")).toThrow(/not in --org globex/);
      expect(() => resolveTarget("nope", env)).toThrow(/unknown target acme\/nope/);
      expect(() => resolveTarget(undefined, env, "initech")).toThrow(/unknown organisation initech/);
      expect(() => useOrg("initech", env)).toThrow(/unknown organisation/);
   });

   test("use org/name switches organisation; removing the last target removes the organisation", () => {
      expect(useTarget("globex/production", env)).toBe("globex/production");
      expect(readTargets(env).currentOrg).toBe("globex");
      removeTarget("globex/production", env);
      expect(readTargets(env).orgs.globex).toBeUndefined();
      expect(resolveTarget(undefined, env).target).toBeNull();
      expect(() => readTargetIdentity(join(root, "missing"))).toThrow(/not found/);
      expect(() => addTarget(orgRepo(root, "bad", "bad", "vm"), env, "acme")).toThrow(/spec.engine/);
   });

   test("selection flags are removed from the module arguments", () => {
      expect(extractSelectionFlags(["plan", "--target", "acme/production", "--yes", "--org=acme"])).toEqual({ args: ["plan", "--yes"], target: "acme/production", org: "acme" });
      expect(() => extractSelectionFlags(["--org"])).toThrow(/needs a value/);
      expect(() => parseTargetRef("a/b/c")).toThrow(/org\/name/);
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
      expect(seen).toMatchObject({ args: ["status"], target: { org: "default", name: "acme-prod", id: "default/acme-prod", engine: "kubernetes" }, error: null, env: repo });
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
