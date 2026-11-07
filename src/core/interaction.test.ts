import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { bannerEnabled, bannerText, makeConfirm, readSettings, setSetting } from "./interaction";
import type { TargetResolution } from "./targets";

const prod: TargetResolution = { target: { org: "acme", name: "production", id: "acme/production", path: "/srv/p", engine: "kubernetes" }, error: null };
const none: TargetResolution = { target: null, error: "no target selected" };

describe("banner", () => {
   test("names the organisation and the context", () => {
      expect(bannerText("acme", prod)).toBe("tycho · acme:production (kubernetes)");
      expect(bannerText("default", none)).toBe("tycho · default: no context");
   });

   test("can be turned off by -q, TYCHO_BANNER=0 or the persistent setting", () => {
      const env = { TYCHO_CONFIG_DIR: join(mkdtempSync(join(tmpdir(), "tycho-cfg-")), "c") };
      expect(bannerEnabled(false, env)).toBe(true);
      expect(bannerEnabled(true, env)).toBe(false);
      expect(bannerEnabled(false, { ...env, TYCHO_BANNER: "0" })).toBe(false);
      setSetting("banner", "off", env);
      expect(readSettings(env).banner).toBe(false);
      expect(bannerEnabled(false, env)).toBe(false);
      expect(() => setSetting("color", "on", env)).toThrow(/unknown setting/);
      expect(() => setSetting("banner", "maybe", env)).toThrow(/on or off/);
   });
});

describe("confirmation of destructive actions", () => {
   test("only an explicit yes confirms, and the question names the target", async () => {
      const asked: string[] = [];
      const ask = (answer: string | null) => (q: string) => {
         asked.push(q);
         return answer;
      };
      expect(await makeConfirm(prod, {}, true, ask("y"))("Merge PR #3")).toBe(true);
      expect(asked[0]).toBe("⚠ Merge PR #3 on acme:production. Continue? [y/N]");
      expect(await makeConfirm(prod, {}, true, ask("oui"))("x")).toBe(true);
      expect(await makeConfirm(prod, {}, true, ask(""))("x")).toBe(false);
      expect(await makeConfirm(prod, {}, true, ask(null))("x")).toBe(false);
      expect(await makeConfirm(prod, {}, true, ask("yes please"))("x")).toBe(false);
   });

   test("without a terminal: no, unless TYCHO_ASSUME_YES=1", async () => {
      const never = () => {
         throw new Error("must not ask");
      };
      expect(await makeConfirm(prod, {}, false, never)("Delete")).toBe(false);
      expect(await makeConfirm(prod, { TYCHO_ASSUME_YES: "1" }, false, never)("Delete")).toBe(true);
      expect(await makeConfirm(prod, { TYCHO_ASSUME_YES: "true" }, false, never)("Delete")).toBe(false);
   });
});
